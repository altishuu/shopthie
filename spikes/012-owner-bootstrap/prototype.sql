-- NON-DEPLOYABLE, SYNTHETIC FIXTURE ONLY. Not an application migration.
-- All installed application SQL is read in place by runner.py, never copied here.
-- Run as the trusted, non-superuser BYPASSRLS fixture_owner.
create schema fixture_cutover;
revoke all on schema fixture_cutover from public;
create table fixture_cutover.approvals (
  request_id text primary key,
  kind text not null check (kind in ('bootstrap','replacement')),
  target uuid not null,
  old_owner uuid,
  expires_at timestamptz not null,
  -- Injected by TEST ADMIN, NOT a JWT verifier or caller assertion.
  test_only_verified_auth_claims jsonb,
  consumed boolean not null default false,
  check ((kind='bootstrap' and old_owner is null) or
         (kind='replacement' and old_owner is not null))
);
create table fixture_cutover.transition_audit (
  request_id text primary key references fixture_cutover.approvals(request_id),
  operator_class text not null check (operator_class='TEST_ONLY_TRUSTED_OPERATOR'),
  kind text not null,
  old_owner uuid,
  target uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
revoke all on all tables in schema fixture_cutover from public,anon,authenticated,service_role;

create function fixture_cutover.transition(
  p_request text, p_target uuid, p_expected_old uuid,
  p_rotation text default 'truncate'
) returns void language plpgsql volatile security definer set search_path='' as $$
declare
  approval fixture_cutover.approvals%rowtype;
  owners uuid[];
  claims jsonb;
  proof_time timestamptz;
begin
  -- Limit the operator protocol to fresh VOLATILE READ COMMITTED statements.
  -- This is independent of app transactions, which are exercised at all levels.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'fixture_operator_requires_read_committed';
  end if;
  if p_rotation is null or p_rotation not in ('truncate','none','delete') then
    raise exception 'fixture_invalid_comparator';
  end if;
  lock table shopthie_private.app_accounts,
    shopthie_private.app_user_roles, shopthie_private.owner_freeze_cutover
    in access exclusive mode nowait;
  -- A provider factor deletion must not race the eligibility check/commit.
  -- This synthetic table lock does NOT establish a native provider protocol.
  lock table auth.mfa_factors in share mode nowait;
  select * into approval from fixture_cutover.approvals
    where request_id=p_request for update;
  if not found or approval.consumed or approval.expires_at<=clock_timestamp() then
    raise exception 'fixture_approval_denied';
  end if;
  if p_target is distinct from approval.target or
     p_expected_old is distinct from approval.old_owner then
    raise exception 'fixture_binding_denied';
  end if;
  select array_agg(user_id order by user_id) into owners
    from shopthie_private.app_user_roles where role_id='owner';
  if (approval.kind='bootstrap' and coalesce(cardinality(owners),0)<>0)
    or (approval.kind='replacement' and
      (coalesce(cardinality(owners),0)<>1 or owners[1] is distinct from p_expected_old
       or p_target=p_expected_old)) then
    raise exception 'fixture_owner_set_denied';
  end if;
  perform 1 from auth.users where id=p_target and email_confirmed_at is not null for share;
  if not found or not exists (
    select 1 from shopthie_private.app_accounts a
    join shopthie_private.app_user_roles r using(user_id)
    where a.user_id=p_target and a.status='active' and r.role_id='customer'
  ) or not exists (
    select 1 from auth.mfa_factors where user_id=p_target
      and status='verified' and factor_type='totp'
  ) then raise exception 'fixture_eligibility_denied'; end if;
  claims:=approval.test_only_verified_auth_claims;
  if claims is null or claims->>'sub' is distinct from p_target::text
     or claims->>'aal' is distinct from 'aal2'
     or claims->>'test_only_verified_for_request' is distinct from p_request
     or claims->>'auth_time' is null then
    raise exception 'fixture_proof_denied';
  end if;
  proof_time:=to_timestamp((claims->>'auth_time')::double precision);
  if proof_time>clock_timestamp() or proof_time<clock_timestamp()-interval '5 minutes' then
    raise exception 'fixture_proof_denied';
  end if;

  -- Disable ONLY the membership row freeze, never account/status/truncate guards.
  alter table shopthie_private.app_user_roles disable trigger owner_freeze_guard;
  if approval.kind='replacement' then
    update shopthie_private.app_user_roles set role_id='customer' where user_id=p_expected_old;
    -- Now a Customer, so the still-ALWAYS account freeze permits revocation.
    update shopthie_private.app_accounts set status='suspended' where user_id=p_expected_old;
  end if;
  update shopthie_private.app_user_roles set role_id='owner' where user_id=p_target;
  if p_rotation='truncate' then
    truncate table shopthie_private.owner_freeze_cutover;
    insert into shopthie_private.owner_freeze_cutover(singleton) values(true);
  elsif p_rotation='delete' then
    -- Deliberately unsafe comparator: old snapshots can retain the old tuple.
    delete from shopthie_private.owner_freeze_cutover;
    insert into shopthie_private.owner_freeze_cutover(singleton) values(true);
  end if;
  alter table shopthie_private.app_user_roles enable always trigger owner_freeze_guard;
  update fixture_cutover.approvals set consumed=true where request_id=p_request;
  insert into fixture_cutover.transition_audit(request_id,operator_class,kind,old_owner,target)
    values(p_request,'TEST_ONLY_TRUSTED_OPERATOR',approval.kind,p_expected_old,p_target);
  -- No exception swallowing: DDL, marker, role, status, approval and audit roll back together.
end;
$$;
revoke all on function fixture_cutover.transition(text,uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant usage on schema fixture_cutover to fixture_operator;
grant execute on function fixture_cutover.transition(text,uuid,uuid,text) to fixture_operator;
