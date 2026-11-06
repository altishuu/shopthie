-- Area 13: FIRST OWNER BOOTSTRAP ONLY. Installation designates nobody.
-- Operator calls require a caller-side statement_timeout set BEFORE SELECT.
begin;
set local lock_timeout='1s';
set local statement_timeout='15s';
lock table shopthie_private.app_accounts, shopthie_private.app_user_roles,
  shopthie_private.owner_freeze_cutover in access exclusive mode nowait;
do $$
begin
  if exists(select 1 from shopthie_private.app_user_roles where role_id='owner') then
    raise exception using errcode='42501',message='owner_bootstrap_requires_zero_owners';
  end if;
end;
$$;

insert into shopthie_private.app_modules(id,enabled) values ('owner_setup',true);
insert into shopthie_private.app_module_dependencies(module_id,depends_on)
values ('owner_setup','identity'),('owner_setup','access'),('owner_setup','audit');
insert into shopthie_private.app_permissions(id,module_id)
values ('owner.bootstrap.request_own','owner_setup');
insert into shopthie_private.app_role_permissions(role_id,permission_id)
values ('customer','owner.bootstrap.request_own');

-- No provider foreign keys: these private UUIDs are durable approval evidence,
-- never a second Auth authority or a provider-owned DDL/cascade requirement.
create table shopthie_private.owner_bootstrap_control (
  singleton boolean primary key default true check(singleton),
  designation uuid unique,
  subject uuid,
  approval_ref uuid,
  used_approval_refs uuid[] not null default array[]::uuid[],
  designated_by name,
  designated_at timestamptz,
  completed_at timestamptz,
  activated_by name,
  activated_intent uuid,
  check ((designation is null and subject is null and approval_ref is null and designated_by is null and designated_at is null)
    or (designation is not null and subject is not null and approval_ref is not null and designated_by is not null and designated_at is not null)),
  check ((completed_at is null and activated_by is null and activated_intent is null)
    or (completed_at is not null and activated_by is not null and activated_intent is not null and designation is not null))
);
create table shopthie_private.owner_bootstrap_intents (
  id uuid primary key default gen_random_uuid(),
  designation uuid not null unique,
  subject uuid not null,
  session_id uuid not null,
  factor_id uuid not null,
  proof_at timestamptz not null,
  token_expires_at timestamptz not null,
  expires_at timestamptz not null,
  consented_at timestamptz not null default clock_timestamp(),
  consumed_at timestamptz,
  check(expires_at <= proof_at+interval '5 minutes' and expires_at <= token_expires_at)
);
alter table shopthie_private.owner_bootstrap_control enable row level security;
alter table shopthie_private.owner_bootstrap_intents enable row level security;
revoke all on table shopthie_private.owner_bootstrap_control,
  shopthie_private.owner_bootstrap_intents from public,anon,authenticated,service_role;
insert into shopthie_private.owner_bootstrap_control(singleton) values(true);

create function shopthie_private.owner_bootstrap_modules() returns boolean
language sql volatile security invoker set search_path='' as $$
  select (select count(*)=4 and bool_and(enabled) from shopthie_private.app_modules
    where id in ('owner_setup','identity','access','audit'))
    and exists(select 1 from shopthie_private.app_permissions where id='owner.bootstrap.request_own' and module_id='owner_setup')
    and (select count(*)=3 and bool_and(depends_on in ('identity','access','audit'))
      from shopthie_private.app_module_dependencies where module_id='owner_setup')
    and (select count(*)=1 and bool_and(role_id='customer') from shopthie_private.app_role_permissions
      where permission_id='owner.bootstrap.request_own');
$$;

create function shopthie_private.owner_bootstrap_eligible(p_subject uuid,p_role text) returns boolean
language sql volatile security invoker set search_path='' as $$
  select shopthie_private.owner_bootstrap_modules() and exists (
    select 1 from auth.users u
    join shopthie_private.app_accounts a on a.user_id=u.id and a.status='active'
    join shopthie_private.app_user_roles r on r.user_id=u.id and r.role_id=p_role
    where u.id=p_subject and u.email_confirmed_at is not null
      and u.email_confirmed_at <= clock_timestamp() and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= clock_timestamp())
  );
$$;

-- Every promotion/consent lock is NOWAIT. Provider row order is user, session,
-- factor; app parent locks precede them. Conflicting provider cascades deny,
-- rather than waiting while holding a reversed child/parent lock dependency.
create function shopthie_private.owner_bootstrap_lock_native(p_subject uuid,p_session uuid,p_factor uuid) returns void
language plpgsql volatile security invoker set search_path='' as $$
begin
  perform id from auth.users where id=p_subject for share nowait;
  if not found then raise exception using errcode='42501',message='owner_bootstrap_denied'; end if;
  if p_session is not null then
    perform id from auth.sessions where id=p_session and user_id=p_subject for share nowait;
    if not found then raise exception using errcode='42501',message='owner_bootstrap_denied'; end if;
  end if;
  if p_factor is not null then
    perform id from auth.mfa_factors where id=p_factor and user_id=p_subject for share nowait;
    if not found then raise exception using errcode='42501',message='owner_bootstrap_denied'; end if;
  end if;
end;
$$;

create function shopthie_private.owner_bootstrap_live(p_subject uuid,p_session uuid,p_factor uuid,
  p_proof timestamptz,p_expiry timestamptz,p_role text) returns boolean
language sql volatile security invoker set search_path='' as $$
  select shopthie_private.owner_bootstrap_eligible(p_subject,p_role)
    and p_proof <= clock_timestamp() and p_proof+interval '5 minutes' > clock_timestamp()
    and p_expiry > clock_timestamp() and pg_catalog.isfinite(p_proof) and pg_catalog.isfinite(p_expiry)
    and exists (
      select 1 from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id and f.user_id=s.user_id
      where s.id=p_session and s.user_id=p_subject and s.factor_id=p_factor
        and s.aal::text='aal2' and f.factor_type::text='totp' and f.status::text='verified'
        and (s.not_after is null or s.not_after > clock_timestamp())
        and s.created_at is not null and s.created_at <= p_proof+interval '1 second'
        and s.created_at <= clock_timestamp()
        and (s.refreshed_at is null or s.refreshed_at <= clock_timestamp())
    );
$$;

-- Provider-verified claims are read, not supplied through RPC parameters.
-- A verified factor alone, or JWT aal2 alone, is never sufficient.
create function shopthie_private.owner_bootstrap_proof(p_subject uuid)
returns table(session_id uuid,factor_id uuid,proof_at timestamptz,token_expires_at timestamptz,expires_at timestamptz)
language plpgsql volatile security invoker set search_path='' as $$
declare claims jsonb:=auth.jwt(); item jsonb; stamp numeric; newest numeric; expiration numeric; cutoff timestamptz;
begin
  if auth.uid() is distinct from p_subject or claims->>'aal' is distinct from 'aal2'
    or jsonb_typeof(claims->'session_id') is distinct from 'string'
    or (claims->>'session_id') collate "C" !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or jsonb_typeof(claims->'exp') is distinct from 'number'
    or (claims->>'exp') collate "C" !~ '^[0-9]{1,12}$'
    or jsonb_typeof(claims->'amr') is distinct from 'array' then return; end if;
  expiration:=(claims->>'exp')::numeric;
  if expiration <= extract(epoch from clock_timestamp()) or expiration>253402300799 then return; end if;
  for item in select value from jsonb_array_elements(claims->'amr') loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'method') is distinct from 'string' or length(item->>'method')=0
      or jsonb_typeof(item->'timestamp') is distinct from 'number'
      or (item->>'timestamp') collate "C" !~ '^[0-9]{1,12}$' then return; end if;
    stamp:=(item->>'timestamp')::numeric;
    if stamp>extract(epoch from clock_timestamp()) or stamp=0 then return; end if;
    if item->>'method'='totp' then newest:=greatest(newest,stamp); end if;
  end loop;
  if newest is null or newest <= extract(epoch from clock_timestamp())-300 then return; end if;
  session_id:=(claims->>'session_id')::uuid;
  select s.factor_id,s.not_after into factor_id,cutoff from auth.sessions s where s.id=session_id and s.user_id=p_subject;
  proof_at:=to_timestamp(newest::double precision);
  token_expires_at:=to_timestamp(expiration::double precision);
  expires_at:=least(proof_at+interval '5 minutes',token_expires_at,cutoff);
  if factor_id is null or not shopthie_private.owner_bootstrap_live(p_subject,session_id,factor_id,proof_at,expires_at,'customer') then return; end if;
  return next;
end;
$$;

create function shopthie_private.owner_bootstrap_audit(p_actor uuid,p_subject uuid,p_event text) returns uuid
language plpgsql volatile security invoker set search_path='' as $$
declare event_id uuid;
begin
  lock table shopthie_private.audit_events in row exclusive mode nowait;
  insert into shopthie_private.audit_events(actor_id,target_id,event_type,reason_category,outcome)
  values(p_actor,p_subject,p_event,'initial_owner_setup','success') returning id into event_id;
  if event_id is null or not exists(select 1 from shopthie_private.audit_events
    where id=event_id and actor_id is not distinct from p_actor and target_id=p_subject
      and event_type=p_event and reason_category='initial_owner_setup' and outcome='success') then
    raise exception using errcode='42501',message='owner_bootstrap_audit_required';
  end if;
  return event_id;
end;
$$;

-- Invoker so a private function never confers operator powers. Ownership, full
-- effective ACLs (including inherited/default grants), RLS visibility, trigger
-- definitions and ALWAYS modes are revalidated on every trusted transition.
create function shopthie_private.owner_bootstrap_assert_environment() returns void
language plpgsql volatile security invoker set search_path='' as $$
declare trusted oid; caller oid; obj regclass; func regprocedure; r record;
begin
  select relowner into strict trusted from pg_catalog.pg_class where oid='shopthie_private.owner_freeze_cutover'::regclass;
  select oid into strict caller from pg_catalog.pg_roles where rolname=current_user;
  if caller<>trusted and not (select rolsuper from pg_catalog.pg_roles where oid=caller) then
    raise exception using errcode='42501',message='owner_bootstrap_operator_denied';
  end if;
  if not exists(select 1 from pg_catalog.pg_roles where oid=trusted and (rolsuper or rolbypassrls)) then
    raise exception using errcode='42501',message='owner_bootstrap_unsafe_visibility';
  end if;
  if exists(select 1 from pg_catalog.pg_namespace n join pg_catalog.pg_roles u on u.oid=n.nspowner
      where n.nspname='shopthie_private' and n.nspowner<>trusted and not u.rolsuper) then
    raise exception using errcode='42501',message='owner_bootstrap_unsafe_owner';
  end if;
  -- Ownership alone cannot protect overloaded operator resolution: an
  -- untrusted creator can supply a preferred text overload before our UUID
  -- entry point runs. Check effective CREATE only on the private namespace,
  -- including PUBLIC/inherited grants. NOLOGIN is not a trust boundary; the
  -- grant-bearing role is checked even for a NOINHERIT member's SET ROLE path.
  if exists(select 1 from pg_catalog.pg_namespace n,pg_catalog.pg_roles u
      where n.nspname='shopthie_private' and u.oid<>trusted and not u.rolsuper
        and pg_catalog.has_schema_privilege(u.oid,n.oid,'CREATE')) then
    raise exception using errcode='42501',message='owner_bootstrap_unsafe_schema_acl';
  end if;
  -- A NOINHERIT member can still SET ROLE; reject member paths, not only USAGE.
  if exists(select 1 from pg_catalog.pg_roles u where u.oid<>trusted and not u.rolsuper and (
    pg_catalog.pg_has_role(u.oid,trusted,'MEMBER') or exists(select 1 from pg_catalog.pg_roles x
      where (x.rolsuper or x.rolname in ('pg_write_all_data','pg_read_all_data')) and x.oid<>u.oid
        and pg_catalog.pg_has_role(u.oid,x.oid,'MEMBER'))
    or pg_catalog.has_parameter_privilege(u.oid,'session_replication_role','SET')
    or pg_catalog.has_parameter_privilege(u.oid,'session_replication_role','ALTER SYSTEM'))) then
    raise exception using errcode='42501',message='owner_bootstrap_unsafe_role';
  end if;
  foreach obj in array array[
    'shopthie_private.app_accounts'::regclass,'shopthie_private.app_user_roles'::regclass,
    'shopthie_private.owner_freeze_cutover'::regclass,'shopthie_private.owner_bootstrap_control'::regclass,
    'shopthie_private.owner_bootstrap_intents'::regclass,'shopthie_private.audit_events'::regclass,
    'shopthie_private.app_modules'::regclass,'shopthie_private.app_module_dependencies'::regclass,
    'shopthie_private.app_permissions'::regclass,'shopthie_private.app_role_permissions'::regclass] loop
    if not exists(select 1 from pg_catalog.pg_class c where c.oid=obj and c.relowner=trusted
      and c.relkind='r' and (obj='shopthie_private.owner_freeze_cutover'::regclass or c.relrowsecurity)) then
      raise exception using errcode='42501',message='owner_bootstrap_unsafe_owner';
    end if;
    if exists(select 1 from pg_catalog.pg_roles u where u.oid<>trusted and not u.rolsuper
      and u.rolname not in ('pg_read_all_data','pg_write_all_data') and (
        pg_catalog.has_table_privilege(u.oid,obj,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
        or pg_catalog.has_any_column_privilege(u.oid,obj,'SELECT,INSERT,UPDATE,REFERENCES')))
      or exists(select 1 from pg_catalog.pg_class c, lateral pg_catalog.aclexplode(c.relacl) a where c.oid=obj and a.grantee=0) then
      raise exception using errcode='42501',message='owner_bootstrap_unsafe_table_acl';
    end if;
  end loop;
  for r in select p.oid,p.proowner,p.prosecdef,p.proconfig,p.proname,p.prosrc,p.provolatile,p.prolang
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='shopthie_private' and (p.proname like 'owner_bootstrap_%'
      or p.proname in ('designate_first_owner','activate_first_owner','owner_freeze_guard','owner_freeze_truncate_guard')) loop
    -- RESET of the only setting produces NULL, not an empty array. A required
    -- match must be explicitly true; SQL UNKNOWN must never skip rejection.
    if r.proowner<>trusted or not coalesce('search_path=""'=any(r.proconfig),false) then
      raise exception using errcode='42501',message='owner_bootstrap_unsafe_function';
    end if;
    if r.proname in ('designate_first_owner','activate_first_owner') and r.prosecdef then
      raise exception using errcode='42501',message='owner_bootstrap_unsafe_function';
    end if;
    if exists(select 1 from pg_catalog.pg_roles u where u.oid<>trusted and not u.rolsuper
      and (u.rolname<>'authenticated' or r.proname not in ('owner_bootstrap_state','owner_bootstrap_consent'))
      and pg_catalog.has_function_privilege(u.oid,r.oid,'EXECUTE'))
      or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(p.proacl) a where p.oid=r.oid and a.grantee=0) then
      raise exception using errcode='42501',message='owner_bootstrap_unsafe_function_acl';
    end if;
    if r.proname in ('owner_freeze_guard','owner_freeze_truncate_guard') and (
      not r.prosecdef or r.provolatile<>'v' or r.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
      or r.proconfig is distinct from array['search_path=""']
      or md5(r.prosrc)<>case r.proname when 'owner_freeze_guard' then '34e7f432147a9aaebf513a61ffaf9e96'
        else 'ba0e0610e62bc4a6dcb2f9adc15ad457' end) then
      raise exception using errcode='42501',message='owner_bootstrap_unsafe_guard';
    end if;
  end loop;
  for r in select p.oid,p.proowner,p.prosecdef,p.proconfig from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('shopthie_owner_bootstrap_state','shopthie_owner_bootstrap_consent') loop
    if r.proowner<>trusted or r.prosecdef or r.proconfig is distinct from array['search_path=""']
      or exists(select 1 from pg_catalog.pg_roles u where u.oid<>trusted and not u.rolsuper
        and u.rolname<>'authenticated' and pg_catalog.has_function_privilege(u.oid,r.oid,'EXECUTE'))
      or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(p.proacl) a where p.oid=r.oid and a.grantee=0) then
      raise exception using errcode='42501',message='owner_bootstrap_unsafe_function_acl';
    end if;
  end loop;
  if (select count(*) from pg_catalog.pg_trigger t where t.tgrelid in (
    'shopthie_private.app_accounts'::regclass,'shopthie_private.app_user_roles'::regclass)
    and t.tgname in ('owner_freeze_guard','owner_freeze_truncate_guard') and t.tgenabled='A'
    and not t.tgisinternal and not t.tgdeferrable and not t.tginitdeferred and t.tgqual is null
    and t.tgnargs=0 and t.tgattr=''::int2vector
    and t.tgfoid=case t.tgname when 'owner_freeze_guard' then 'shopthie_private.owner_freeze_guard()'::regprocedure
      else 'shopthie_private.owner_freeze_truncate_guard()'::regprocedure end
    and t.tgtype=case when t.tgname='owner_freeze_truncate_guard' then 34
      when t.tgrelid='shopthie_private.app_accounts'::regclass then 27 else 31 end)<>4 then
    raise exception using errcode='42501',message='owner_bootstrap_unsafe_guard';
  end if;
  if (select count(*) from shopthie_private.owner_freeze_cutover)<>1
    or (select count(*) from shopthie_private.owner_bootstrap_control)<>1
    or not shopthie_private.owner_bootstrap_modules() then
    raise exception using errcode='42501',message='owner_bootstrap_unsafe_control';
  end if;
  -- Fail closed on unsupported provider catalogs, without provider Auth DDL.
  if exists(select 1 from (values
    ('auth.users'::regclass,'id','uuid'::regtype),
    ('auth.users'::regclass,'email_confirmed_at','timestamptz'::regtype),
    ('auth.users'::regclass,'banned_until','timestamptz'::regtype),
    ('auth.users'::regclass,'deleted_at','timestamptz'::regtype),
    ('auth.sessions'::regclass,'id','uuid'::regtype),
    ('auth.sessions'::regclass,'user_id','uuid'::regtype),
    ('auth.sessions'::regclass,'factor_id','uuid'::regtype),
    ('auth.sessions'::regclass,'aal','auth.aal_level'::regtype),
    ('auth.sessions'::regclass,'not_after','timestamptz'::regtype),
    ('auth.sessions'::regclass,'created_at','timestamptz'::regtype),
    ('auth.sessions'::regclass,'refreshed_at','timestamptz'::regtype),
    ('auth.mfa_factors'::regclass,'id','uuid'::regtype),
    ('auth.mfa_factors'::regclass,'user_id','uuid'::regtype)
  ) expected(table_id,column_name,type_id) where not exists(select 1 from pg_catalog.pg_attribute a
    where a.attrelid=expected.table_id and a.attname=expected.column_name and a.atttypid=expected.type_id
      and a.attnum>0 and not a.attisdropped)) or
    (select typtype<>'e' from pg_catalog.pg_type where oid='auth.aal_level'::regtype) then
    raise exception using errcode='42501',message='owner_bootstrap_unsafe_native_catalog';
  end if;
  foreach obj in array array['auth.users'::regclass,'auth.sessions'::regclass,'auth.mfa_factors'::regclass] loop
    if not pg_catalog.has_table_privilege(trusted,obj,'SELECT') or not pg_catalog.has_table_privilege(trusted,obj,'UPDATE') then
      raise exception using errcode='42501',message='owner_bootstrap_unsafe_native_acl';
    end if;
  end loop;
end;
$$;

create function shopthie_private.designate_first_owner(p_subject uuid,p_approval_ref uuid) returns uuid
language plpgsql volatile security invoker set search_path='' set lock_timeout='1s' set statement_timeout='15s' as $$
declare designation_id uuid:=gen_random_uuid(); saved shopthie_private.owner_bootstrap_control;
begin
  if current_setting('transaction_isolation')<>'read committed' or p_subject is null or p_approval_ref is null then
    raise exception using errcode='42501',message='owner_bootstrap_denied';
  end if;
  lock table shopthie_private.app_accounts,shopthie_private.app_user_roles,
    shopthie_private.owner_freeze_cutover in access exclusive mode nowait;
  lock table shopthie_private.owner_bootstrap_control in exclusive mode nowait;
  lock table shopthie_private.owner_bootstrap_intents in row exclusive mode nowait;
  perform shopthie_private.owner_bootstrap_assert_environment();
  select * into strict saved from shopthie_private.owner_bootstrap_control where singleton for update nowait;
  if saved.completed_at is not null or p_approval_ref=any(saved.used_approval_refs)
    or exists(select 1 from shopthie_private.app_user_roles where role_id='owner') then
    raise exception using errcode='42501',message='owner_bootstrap_denied';
  end if;
  perform shopthie_private.owner_bootstrap_lock_native(p_subject,null,null);
  if not shopthie_private.owner_bootstrap_eligible(p_subject,'customer') then
    raise exception using errcode='42501',message='owner_bootstrap_denied';
  end if;
  saved.designation:=designation_id;
  saved.subject:=p_subject;
  saved.approval_ref:=p_approval_ref;
  saved.used_approval_refs:=array_append(saved.used_approval_refs,p_approval_ref);
  saved.designated_by:=current_user;
  saved.designated_at:=clock_timestamp();
  update shopthie_private.owner_bootstrap_control set designation=saved.designation,subject=saved.subject,
    approval_ref=saved.approval_ref,used_approval_refs=saved.used_approval_refs,
    designated_by=saved.designated_by,designated_at=saved.designated_at where singleton;
  perform shopthie_private.owner_bootstrap_audit(null,p_subject,'owner.bootstrap.designate');
  perform shopthie_private.owner_bootstrap_assert_environment();
  if not shopthie_private.owner_bootstrap_eligible(p_subject,'customer')
    or not exists(select 1 from shopthie_private.owner_bootstrap_control c where c=saved)
    or not exists(select 1 from shopthie_private.owner_bootstrap_control where singleton
      and designation=designation_id and subject=p_subject and approval_ref=p_approval_ref
      and designated_by=current_user and completed_at is null)
    or exists(select 1 from shopthie_private.app_user_roles where role_id='owner') then
    raise exception using errcode='42501',message='owner_bootstrap_denied';
  end if;
  return designation_id;
end;
$$;

create function shopthie_private.owner_bootstrap_state() returns jsonb
language plpgsql volatile security definer set search_path='' set lock_timeout='1s' set statement_timeout='15s' as $$
declare actor uuid:=auth.uid(); control shopthie_private.owner_bootstrap_control;
  intent shopthie_private.owner_bootstrap_intents; proof record; result jsonb;
begin
  if actor is null then raise exception using errcode='42501',message='owner_bootstrap_denied'; end if;
  result:=jsonb_build_object('subject',actor,'status','unavailable','designation',null);
  select * into control from shopthie_private.owner_bootstrap_control where singleton and subject=actor;
  if control.subject is null then return result; end if;
  if control.completed_at is not null then
    if shopthie_private.owner_bootstrap_eligible(actor,'owner') then
      return jsonb_build_object('subject',actor,'status','completed','designation',control.designation);
    end if;
    return result;
  end if;
  if not shopthie_private.owner_bootstrap_eligible(actor,'customer') then return result; end if;
  result:=jsonb_build_object('subject',actor,'status','mfa_required','designation',control.designation);
  if coalesce(auth.jwt()->>'aal','') not in ('aal1','aal2') then
    return jsonb_build_object('subject',actor,'status','unavailable','designation',null);
  end if;
  select * into proof from shopthie_private.owner_bootstrap_proof(actor);
  if proof.session_id is null then return result; end if;
  select * into intent from shopthie_private.owner_bootstrap_intents where designation=control.designation
    and subject=actor and consumed_at is null and expires_at>clock_timestamp();
  if intent.id is not null and intent.session_id=proof.session_id and intent.factor_id=proof.factor_id
    and shopthie_private.owner_bootstrap_live(actor,intent.session_id,intent.factor_id,intent.proof_at,intent.expires_at,'customer') then
    return result || jsonb_build_object('status','consented','intent',jsonb_build_object('id',intent.id,'expiresAt',
      to_char(intent.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
  end if;
  return result || jsonb_build_object('status','ready');
end;
$$;

create function shopthie_private.owner_bootstrap_consent(p_designation uuid) returns jsonb
language plpgsql volatile security definer set search_path='' set lock_timeout='1s' set statement_timeout='15s' as $$
declare actor uuid:=auth.uid(); control shopthie_private.owner_bootstrap_control;
  intent shopthie_private.owner_bootstrap_intents; proof record; checked record;
begin
  if actor is null or p_designation is null or current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='42501',message='owner_bootstrap_denied';
  end if;
  lock table shopthie_private.app_accounts,shopthie_private.app_user_roles in row share mode nowait;
  lock table shopthie_private.owner_bootstrap_control,shopthie_private.owner_bootstrap_intents
    in row exclusive mode nowait;
  perform user_id from shopthie_private.app_accounts where user_id=actor for share nowait;
  if not found then raise exception using errcode='42501',message='owner_bootstrap_denied'; end if;
  select * into control from shopthie_private.owner_bootstrap_control where singleton for update nowait;
  if control.subject is distinct from actor or control.designation is distinct from p_designation or control.completed_at is not null then
    raise exception using errcode='42501',message='owner_bootstrap_denied';
  end if;
  select * into proof from shopthie_private.owner_bootstrap_proof(actor);
  if proof.session_id is null or not shopthie_private.has_permission('owner.bootstrap.request_own') then
    raise exception using errcode='42501',message='owner_bootstrap_denied';
  end if;
  perform shopthie_private.owner_bootstrap_lock_native(actor,proof.session_id,proof.factor_id);
  select * into checked from shopthie_private.owner_bootstrap_proof(actor);
  if checked is distinct from proof then raise exception using errcode='42501',message='owner_bootstrap_denied'; end if;
  select * into intent from shopthie_private.owner_bootstrap_intents where designation=p_designation for update nowait;
  if intent.id is not null then
    if intent.subject<>actor or intent.session_id<>proof.session_id or intent.factor_id<>proof.factor_id
      or intent.consumed_at is not null or not shopthie_private.owner_bootstrap_live(actor,intent.session_id,intent.factor_id,intent.proof_at,intent.expires_at,'customer') then
      raise exception using errcode='42501',message='owner_bootstrap_denied';
    end if;
  else
    insert into shopthie_private.owner_bootstrap_intents(designation,subject,session_id,factor_id,proof_at,token_expires_at,expires_at)
    values(p_designation,actor,proof.session_id,proof.factor_id,proof.proof_at,proof.token_expires_at,proof.expires_at) returning * into intent;
    perform shopthie_private.owner_bootstrap_audit(actor,actor,'owner.bootstrap.consent');
  end if;
  select * into checked from shopthie_private.owner_bootstrap_proof(actor);
  if checked is distinct from proof or not shopthie_private.has_permission('owner.bootstrap.request_own')
    or not shopthie_private.owner_bootstrap_live(actor,intent.session_id,intent.factor_id,intent.proof_at,intent.expires_at,'customer')
    or not exists(select 1 from shopthie_private.owner_bootstrap_control where singleton and designation=p_designation
      and subject=actor and completed_at is null)
    or not exists(select 1 from shopthie_private.owner_bootstrap_intents i where i.id=intent.id and i=intent) then
    raise exception using errcode='42501',message='owner_bootstrap_denied';
  end if;
  return jsonb_build_object('subject',actor,'status','consented','designation',p_designation,
    'intent',jsonb_build_object('id',intent.id,'expiresAt',to_char(intent.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
end;
$$;

create function shopthie_private.activate_first_owner(p_designation uuid,p_intent uuid,p_approval_ref uuid) returns void
language plpgsql volatile security invoker set search_path='' set lock_timeout='1s' set statement_timeout='15s' as $$
declare control shopthie_private.owner_bootstrap_control; intent shopthie_private.owner_bootstrap_intents;
  changed integer;
begin
  if current_setting('transaction_isolation')<>'read committed'
    or p_designation is null or p_intent is null or p_approval_ref is null then
    raise exception using errcode='42501',message='owner_bootstrap_denied';
  end if;
  lock table shopthie_private.app_accounts,shopthie_private.app_user_roles,
    shopthie_private.owner_freeze_cutover in access exclusive mode nowait;
  lock table shopthie_private.owner_bootstrap_control in exclusive mode nowait;
  lock table shopthie_private.owner_bootstrap_intents in row exclusive mode nowait;
  perform shopthie_private.owner_bootstrap_assert_environment();
  select * into control from shopthie_private.owner_bootstrap_control where singleton for update nowait;
  if control.designation is distinct from p_designation or control.approval_ref is distinct from p_approval_ref
    or control.completed_at is not null or control.subject is null
    or exists(select 1 from shopthie_private.app_user_roles where role_id='owner') then
    raise exception using errcode='42501',message='owner_bootstrap_denied';
  end if;
  select * into intent from shopthie_private.owner_bootstrap_intents where id=p_intent for update nowait;
  if intent.id is null or intent.designation<>p_designation or intent.subject<>control.subject
    or intent.consumed_at is not null or intent.expires_at<=clock_timestamp()
    or intent.token_expires_at<=clock_timestamp() then
    raise exception using errcode='42501',message='owner_bootstrap_denied';
  end if;
  perform shopthie_private.owner_bootstrap_lock_native(control.subject,intent.session_id,intent.factor_id);
  if not shopthie_private.owner_bootstrap_live(control.subject,intent.session_id,intent.factor_id,
    intent.proof_at,intent.expires_at,'customer') then
    raise exception using errcode='42501',message='owner_bootstrap_denied';
  end if;
  -- No app setting bypass; no other trigger is disabled, even transiently.
  alter table shopthie_private.app_user_roles disable trigger owner_freeze_guard;
  update shopthie_private.app_user_roles set role_id='owner',assigned_at=clock_timestamp()
    where user_id=control.subject and role_id='customer';
  get diagnostics changed=row_count;
  if changed<>1 then raise exception using errcode='42501',message='owner_bootstrap_denied'; end if;
  truncate table shopthie_private.owner_freeze_cutover;
  insert into shopthie_private.owner_freeze_cutover(singleton) values(true);
  alter table shopthie_private.app_user_roles enable always trigger owner_freeze_guard;
  control.completed_at:=clock_timestamp();
  control.activated_by:=current_user;
  control.activated_intent:=p_intent;
  intent.consumed_at:=control.completed_at;
  update shopthie_private.owner_bootstrap_control set completed_at=control.completed_at,
    activated_by=control.activated_by,activated_intent=control.activated_intent where singleton;
  update shopthie_private.owner_bootstrap_intents set consumed_at=intent.consumed_at where id=p_intent;
  perform shopthie_private.owner_bootstrap_audit(null,control.subject,'owner.bootstrap.activate');
  -- Audit hooks may mutate in this transaction: recheck native and private state,
  -- exact consumed binding, sole Owner, marker and all restored safeguards.
  perform shopthie_private.owner_bootstrap_assert_environment();
  if not shopthie_private.owner_bootstrap_live(control.subject,intent.session_id,intent.factor_id,
    intent.proof_at,intent.expires_at,'owner')
    or control.completed_at is null or intent.consumed_at is null
    or control.designation is distinct from p_designation or control.approval_ref is distinct from p_approval_ref
    or control.activated_by is distinct from current_user or control.activated_intent is distinct from p_intent
    or intent.id is distinct from p_intent or intent.subject is distinct from control.subject
    or not exists(select 1 from shopthie_private.owner_bootstrap_control c where c=control)
    or not exists(select 1 from shopthie_private.owner_bootstrap_intents i where i=intent)
    or (select count(*) from shopthie_private.app_user_roles where role_id='owner')<>1 then
    raise exception using errcode='42501',message='owner_bootstrap_denied';
  end if;
end;
$$;

-- No application endpoint reaches an operator function.
create function public.shopthie_owner_bootstrap_state() returns jsonb
language sql volatile security invoker set search_path='' as $$ select shopthie_private.owner_bootstrap_state(); $$;
create function public.shopthie_owner_bootstrap_consent(p_designation uuid) returns jsonb
language sql volatile security invoker set search_path='' as $$ select shopthie_private.owner_bootstrap_consent(p_designation); $$;

revoke all on function shopthie_private.owner_bootstrap_modules(),shopthie_private.owner_bootstrap_eligible(uuid,text),
  shopthie_private.owner_bootstrap_lock_native(uuid,uuid,uuid),shopthie_private.owner_bootstrap_live(uuid,uuid,uuid,timestamptz,timestamptz,text),
  shopthie_private.owner_bootstrap_proof(uuid),shopthie_private.owner_bootstrap_audit(uuid,uuid,text),
  shopthie_private.owner_bootstrap_assert_environment(),shopthie_private.designate_first_owner(uuid,uuid),
  shopthie_private.activate_first_owner(uuid,uuid,uuid),
  shopthie_private.owner_bootstrap_state(),shopthie_private.owner_bootstrap_consent(uuid),
  public.shopthie_owner_bootstrap_state(),public.shopthie_owner_bootstrap_consent(uuid)
  from public,anon,authenticated,service_role;
grant execute on function shopthie_private.owner_bootstrap_state(),shopthie_private.owner_bootstrap_consent(uuid),
  public.shopthie_owner_bootstrap_state(),public.shopthie_owner_bootstrap_consent(uuid) to authenticated;
select shopthie_private.owner_bootstrap_assert_environment();
commit;
