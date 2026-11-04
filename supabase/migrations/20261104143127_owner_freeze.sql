-- Area 11 candidate: restrictive Owner freeze, not Owner bootstrap or recovery.
begin;
-- Do not wait behind a live writer. Failure rolls back every following change.
lock table shopthie_private.app_accounts, shopthie_private.app_user_roles
  in access exclusive mode nowait;

-- Transactions holding an older snapshot cannot see this cutover marker and
-- therefore must fail closed rather than decide from stale membership data.
create table shopthie_private.owner_freeze_cutover (
  singleton boolean primary key default true check (singleton)
);
revoke all on table shopthie_private.owner_freeze_cutover from public, anon, authenticated;
insert into shopthie_private.owner_freeze_cutover(singleton) values (true);

create function shopthie_private.owner_freeze_guard() returns trigger
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (select 1 from shopthie_private.owner_freeze_cutover where singleton) then
    raise exception using errcode='42501', message='owner_freeze_cutover_not_visible';
  end if;
  if tg_table_name='app_accounts' then
    if (tg_op='DELETE' or new.user_id is distinct from old.user_id or new.status is distinct from old.status)
      and exists (select 1 from shopthie_private.app_user_roles r
        where r.user_id=old.user_id and r.role_id='owner') then
      raise exception using errcode='42501', message='owner_frozen';
    end if;
  elsif (tg_op <> 'INSERT' and old.role_id='owner')
     or (tg_op <> 'DELETE' and new.role_id='owner') then
    raise exception using errcode='42501', message='owner_frozen';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function shopthie_private.owner_freeze_guard() from public, anon, authenticated;

create function shopthie_private.owner_freeze_truncate_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception using errcode='42501', message='owner_freeze_truncate_denied';
end;
$$;
revoke all on function shopthie_private.owner_freeze_truncate_guard() from public, anon, authenticated;

-- Trusted boundary: the creating/guard-owning role and superusers only.
-- Reject membership in those roles; check effective privileges, including defaults.
do $$
declare
  guard_owner oid;
  membership_owner oid;
  row_security boolean;
  forced_security boolean;
  bypass boolean;
  unsafe_role name;
begin
  select p.proowner into strict guard_owner from pg_catalog.pg_proc p
    where p.oid = 'shopthie_private.owner_freeze_guard()'::regprocedure;
  select c.relowner, c.relrowsecurity, c.relforcerowsecurity
    into strict membership_owner, row_security, forced_security
    from pg_catalog.pg_class c where c.oid = 'shopthie_private.app_user_roles'::regclass;
  select r.rolsuper or r.rolbypassrls into strict bypass
    from pg_catalog.pg_roles r where r.oid = guard_owner;
  if guard_owner <> (select oid from pg_catalog.pg_roles where rolname = current_user)
     or guard_owner <> (select proowner from pg_catalog.pg_proc where oid = 'shopthie_private.owner_freeze_truncate_guard()'::regprocedure)
     or guard_owner <> (select relowner from pg_catalog.pg_class where oid = 'shopthie_private.owner_freeze_cutover'::regclass)
     or not pg_catalog.has_table_privilege(guard_owner, 'shopthie_private.app_user_roles', 'SELECT')
     or (row_security and not bypass and (membership_owner <> guard_owner or forced_security)) then
    raise exception using errcode='42501', message='owner_freeze_unsafe_role_visibility';
  end if;

  -- Table/schema owners can disable triggers or drop protected objects. The
  -- baseline must put these ownership powers inside the same trusted boundary.
  if exists (
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_roles r on r.oid=c.relowner
    where c.oid in ('shopthie_private.app_accounts'::regclass,
      'shopthie_private.app_user_roles'::regclass)
      and c.relowner<>guard_owner and not r.rolsuper
  ) or exists (
    select 1 from pg_catalog.pg_namespace n join pg_catalog.pg_roles r on r.oid=n.nspowner
    where n.nspname='shopthie_private' and n.nspowner<>guard_owner and not r.rolsuper
  ) then
    raise exception using errcode='42501', message='owner_freeze_unsafe_protected_owner';
  end if;

  if exists (
    select 1 from pg_catalog.pg_roles r
    where r.oid<>guard_owner and not r.rolsuper
      and (pg_catalog.has_parameter_privilege(r.oid,'session_replication_role','SET')
        or pg_catalog.has_parameter_privilege(r.oid,'session_replication_role','ALTER SYSTEM'))
  ) then
    raise exception using errcode='42501', message='owner_freeze_unsafe_replication_privilege';
  end if;

  select r.rolname into unsafe_role from pg_catalog.pg_roles r
    where r.oid <> guard_owner and not r.rolsuper
      and (pg_catalog.pg_has_role(r.oid, guard_owner, 'MEMBER')
        or exists (select 1 from pg_catalog.pg_roles s where (s.rolsuper or s.rolname = 'pg_write_all_data') and pg_catalog.pg_has_role(r.oid, s.oid, 'MEMBER') and r.oid <> s.oid))
    limit 1;
  if found then
    raise exception using errcode='42501', message='owner_freeze_unsafe_trusted_membership';
  end if;

  select r.rolname into unsafe_role from pg_catalog.pg_roles r
    where r.oid <> guard_owner and not r.rolsuper
      and not (r.rolname = 'pg_write_all_data' and not r.rolcanlogin)
      and (pg_catalog.has_table_privilege(r.oid, 'shopthie_private.owner_freeze_cutover', 'INSERT,UPDATE,DELETE,TRUNCATE')
        or pg_catalog.has_column_privilege(r.oid, 'shopthie_private.owner_freeze_cutover', 'singleton', 'INSERT,UPDATE'))
    limit 1;
  if found then
    raise exception using errcode='42501', message='owner_freeze_unsafe_marker_acl', detail=unsafe_role;
  end if;

  select r.rolname into unsafe_role from pg_catalog.pg_roles r
    where r.oid <> guard_owner and not r.rolsuper
      and (pg_catalog.has_function_privilege(r.oid, 'shopthie_private.owner_freeze_guard()', 'EXECUTE')
        or pg_catalog.has_function_privilege(r.oid, 'shopthie_private.owner_freeze_truncate_guard()', 'EXECUTE'))
    limit 1;
  if found then
    raise exception using errcode='42501', message='owner_freeze_unsafe_function_acl';
  end if;
end $$;

create trigger owner_freeze_guard before update or delete on shopthie_private.app_accounts
  for each row execute function shopthie_private.owner_freeze_guard();
create trigger owner_freeze_guard before insert or update or delete on shopthie_private.app_user_roles
  for each row execute function shopthie_private.owner_freeze_guard();
create trigger owner_freeze_truncate_guard before truncate on shopthie_private.app_accounts
  for each statement execute function shopthie_private.owner_freeze_truncate_guard();
create trigger owner_freeze_truncate_guard before truncate on shopthie_private.app_user_roles
  for each statement execute function shopthie_private.owner_freeze_truncate_guard();
-- A setting retained from before cutover must not suppress the freeze.
alter table shopthie_private.app_accounts enable always trigger owner_freeze_guard;
alter table shopthie_private.app_user_roles enable always trigger owner_freeze_guard;
alter table shopthie_private.app_accounts enable always trigger owner_freeze_truncate_guard;
alter table shopthie_private.app_user_roles enable always trigger owner_freeze_truncate_guard;
commit;
