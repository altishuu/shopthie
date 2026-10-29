-- Area 6: self-session staff entry only. No role assignment or optional tools.
begin;

-- CREATE OR REPLACE preserves the existing signature, owner and function ACL.
-- Customers retain the existing optional-MFA policy (any verified factor).
-- Staff require BOTH AAL2 and a currently verified native TOTP factor.
create or replace function shopthie_private.has_permission(requested_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  with recursive required_modules(id) as (
    select permission.module_id from shopthie_private.app_permissions permission
    where permission.id = requested_permission
    union
    select dependency.depends_on
    from shopthie_private.app_module_dependencies dependency
    join required_modules required on required.id = dependency.module_id
  )
  select exists (
    select 1 from shopthie_private.app_user_roles membership
    join shopthie_private.app_accounts account on account.user_id = membership.user_id and account.status = 'active'
    join shopthie_private.app_role_permissions grants on grants.role_id = membership.role_id
    join shopthie_private.app_permissions permission on permission.id = grants.permission_id
    join shopthie_private.app_modules module on module.id = permission.module_id
    where membership.user_id = auth.uid()
      and permission.id = requested_permission and module.enabled
      and not exists (
        select 1 from required_modules required
        join shopthie_private.app_modules dependency on dependency.id = required.id
        where not dependency.enabled
      )
      and auth.jwt()->>'aal' in ('aal1', 'aal2')
      and (
        (membership.role_id = 'customer' and (
          auth.jwt()->>'aal' = 'aal2'
          or not exists (
            select 1 from auth.mfa_factors factor
            where factor.user_id = auth.uid() and factor.status = 'verified'
          )
        ))
        or (membership.role_id in ('owner', 'admin')
          and auth.jwt()->>'aal' = 'aal2'
          and exists (
            select 1 from auth.mfa_factors factor
            where factor.user_id = auth.uid()
              and factor.status = 'verified' and factor.factor_type = 'totp'
          )
        )
      )
  );
$$;

-- Authentication entry belongs to the always-on identity module, not staff tools.
insert into shopthie_private.app_permissions (id, module_id) values ('staff.enter', 'identity');
insert into shopthie_private.app_role_permissions (role_id, permission_id)
values ('owner', 'staff.enter'), ('admin', 'staff.enter');

-- Self-only projection; never accepts a target or returns account/profile/factor data.
create function shopthie_private.staff_entry()
returns table (user_id uuid, role text)
language sql stable security definer set search_path = '' as $$
  select account.user_id, membership.role_id
  from shopthie_private.app_accounts account
  join shopthie_private.app_user_roles membership on membership.user_id = account.user_id
  where account.user_id = auth.uid() and account.status = 'active'
    and membership.role_id in ('owner', 'admin')
    and shopthie_private.has_permission('staff.enter');
$$;
revoke all on function shopthie_private.staff_entry() from public, anon, authenticated;
grant execute on function shopthie_private.staff_entry() to authenticated;

create function public.shopthie_staff_entry()
returns table (user_id uuid, role text)
language sql stable security invoker set search_path = '' as $$
  select * from shopthie_private.staff_entry();
$$;
revoke all on function public.shopthie_staff_entry() from public, anon, authenticated;
grant execute on function public.shopthie_staff_entry() to authenticated;

commit;
