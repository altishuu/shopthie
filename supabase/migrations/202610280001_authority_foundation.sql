-- Area 1 only. Assumes the provider-owned auth schema and API roles exist.
begin;

create schema shopthie_private;
revoke all on schema shopthie_private from public, anon, authenticated;

create table shopthie_private.app_modules (
  id text primary key,
  enabled boolean not null default false,
  constraint required_modules_enabled check (id not in ('identity', 'access', 'audit') or enabled)
);
create table shopthie_private.app_module_dependencies (
  module_id text not null references shopthie_private.app_modules(id),
  depends_on text not null references shopthie_private.app_modules(id),
  primary key (module_id, depends_on),
  check (module_id <> depends_on)
);
alter table shopthie_private.app_module_dependencies enable row level security;
create table shopthie_private.app_roles (id text primary key);
create table shopthie_private.app_permissions (
  id text primary key,
  module_id text not null references shopthie_private.app_modules(id)
);
create table shopthie_private.app_role_permissions (
  role_id text not null references shopthie_private.app_roles(id),
  permission_id text not null references shopthie_private.app_permissions(id),
  primary key (role_id, permission_id)
);

insert into shopthie_private.app_modules (id, enabled) values
  ('identity', true), ('access', true), ('audit', true),
  ('profiles', false), ('geography', false), ('addresses', false), ('staff', false), ('support', false);
insert into shopthie_private.app_module_dependencies (module_id, depends_on) values
  ('access', 'identity'), ('audit', 'identity'), ('audit', 'access'),
  ('profiles', 'identity'), ('profiles', 'access'),
  ('addresses', 'profiles'), ('addresses', 'geography'), ('addresses', 'access'),
  ('staff', 'profiles'), ('staff', 'access'), ('staff', 'audit'),
  ('support', 'staff'), ('support', 'profiles'), ('support', 'audit');
insert into shopthie_private.app_roles (id) values ('owner'), ('admin'), ('customer');
insert into shopthie_private.app_permissions (id, module_id) values
  ('profile.read_own', 'profiles'), ('profile.update_own', 'profiles'),
  ('address.manage_own', 'addresses'), ('customer.lookup', 'staff'),
  ('customer.status.manage', 'staff'), ('staff.manage', 'staff'),
  ('support.private.read', 'support'), ('audit.read', 'audit');
insert into shopthie_private.app_role_permissions (role_id, permission_id)
select role_id, permission_id from
  (values ('customer'), ('admin'), ('owner')) as roles(role_id)
cross join
  (values ('profile.read_own'), ('profile.update_own'), ('address.manage_own')) as permissions(permission_id);
insert into shopthie_private.app_role_permissions (role_id, permission_id)
select role_id, permission_id from
  (values ('admin'), ('owner')) as roles(role_id)
cross join
  (values ('customer.lookup'), ('customer.status.manage'), ('support.private.read'), ('audit.read')) as permissions(permission_id);
insert into shopthie_private.app_role_permissions values ('owner', 'staff.manage');

create table shopthie_private.app_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);
create table shopthie_private.app_user_roles (
  user_id uuid primary key references shopthie_private.app_accounts(user_id) on delete cascade,
  role_id text not null references shopthie_private.app_roles(id),
  assigned_at timestamptz not null default now()
);

-- No claimed role or profile metadata is read. No first-user Owner bootstrap.
create function shopthie_private.provision_customer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into shopthie_private.app_accounts (user_id) values (new.id);
  insert into shopthie_private.app_user_roles (user_id, role_id) values (new.id, 'customer');
  return new;
end;
$$;
revoke all on function shopthie_private.provision_customer() from public, anon, authenticated;
create trigger shopthie_provision_customer after insert on auth.users
for each row execute function shopthie_private.provision_customer();

-- Storage only. No support data or support-read/audit coupling exists in Area 1.
create table shopthie_private.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  target_id uuid,
  event_type text not null,
  reason_category text,
  outcome text not null,
  created_at timestamptz not null default now()
);
alter table shopthie_private.audit_events enable row level security;
alter table shopthie_private.app_accounts enable row level security;
alter table shopthie_private.app_user_roles enable row level security;
alter table shopthie_private.app_modules enable row level security;
alter table shopthie_private.app_roles enable row level security;
alter table shopthie_private.app_permissions enable row level security;
alter table shopthie_private.app_role_permissions enable row level security;
revoke all on all tables in schema shopthie_private from public, anon, authenticated;

-- Capability gate only; future data policies must ALSO enforce ownership/target rules.
-- The actor is always auth.uid(), never a caller-supplied user ID or metadata role.
create function shopthie_private.has_permission(requested_permission text) returns boolean
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
        auth.jwt()->>'aal' = 'aal2'
        or (membership.role_id = 'customer' and not exists (
          select 1 from auth.mfa_factors factor
          where factor.user_id = auth.uid() and factor.status = 'verified'
        ))
      )
  );
$$;
revoke all on function shopthie_private.has_permission(text) from public, anon, authenticated;
grant usage on schema shopthie_private to authenticated;
grant execute on function shopthie_private.has_permission(text) to authenticated;

create function shopthie_private.actor_context()
returns table (user_id uuid, status text, role text, aal text, mfa_required boolean)
language sql stable security definer set search_path = '' as $$
  select account.user_id, account.status, membership.role_id, auth.jwt()->>'aal',
    membership.role_id in ('owner', 'admin') or exists (
      select 1 from auth.mfa_factors factor
      where factor.user_id = auth.uid() and factor.status = 'verified'
    )
  from shopthie_private.app_accounts account
  join shopthie_private.app_user_roles membership on membership.user_id = account.user_id
  where account.user_id = auth.uid();
$$;
revoke all on function shopthie_private.actor_context() from public, anon, authenticated;
grant execute on function shopthie_private.actor_context() to authenticated;

-- Invoker wrapper: no privileged public-schema function and no caller-selected ID.
create function public.shopthie_actor_context()
returns table (user_id uuid, status text, role text, aal text, mfa_required boolean)
language sql stable security invoker set search_path = '' as $$
  select * from shopthie_private.actor_context();
$$;
revoke all on function public.shopthie_actor_context() from public, anon, authenticated;
grant execute on function public.shopthie_actor_context() to authenticated;

-- Function installation is NOT provider hook configuration. Public signup must
-- remain disabled; a future provider deployment must explicitly attach this hook.
-- No enable switch: approvals cannot be supplied in editable registration metadata.
create function shopthie_private.before_user_created(event jsonb) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select '{"error":{"http_code":403,"message":"Public registration is unavailable until email and eligibility policies are approved."}}'::jsonb;
$$;
revoke all on function shopthie_private.before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema shopthie_private to supabase_auth_admin;
grant execute on function shopthie_private.before_user_created(jsonb) to supabase_auth_admin;

commit;
