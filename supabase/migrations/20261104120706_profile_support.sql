-- Area 10 only: selected Customer profile support; no broad private support.
begin;

insert into shopthie_private.app_modules(id,enabled) values ('profile_support',true);
insert into shopthie_private.app_module_dependencies(module_id,depends_on)
values ('profile_support','customer_lookup'),('profile_support','profiles'),
  ('profile_support','access'),('profile_support','audit');
insert into shopthie_private.app_permissions(id,module_id)
values ('support.profile.read','profile_support');
-- Explicit reviewed grants, never a cross-join over every permission or role.
insert into shopthie_private.app_role_permissions(role_id,permission_id)
values ('owner','support.profile.read'),('admin','support.profile.read');

create function shopthie_private.profile_support_ready() returns boolean
language sql stable security definer set search_path='' as $$
  select shopthie_private.has_permission('support.profile.read') and exists (
    select 1 from shopthie_private.app_user_roles
    where user_id=auth.uid() and role_id in ('owner','admin')
  );
$$;
revoke all on function shopthie_private.profile_support_ready() from public,anon,authenticated;
grant execute on function shopthie_private.profile_support_ready() to authenticated;
create function public.shopthie_profile_support_ready() returns boolean
language sql stable security invoker set search_path='' as $$
  select shopthie_private.profile_support_ready();
$$;
revoke all on function public.shopthie_profile_support_ready() from public,anon,authenticated;
grant execute on function public.shopthie_profile_support_ready() to authenticated;

create function shopthie_private.profile_support_read(p_target uuid,p_username text,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  actor_id uuid := auth.uid();
  result jsonb;
  checked jsonb;
begin
  if not shopthie_private.profile_support_ready() then
    raise exception using errcode='42501',message='profile_support_denied';
  end if;
  if p_target is null or p_target=actor_id then
    raise exception using errcode='42501',message='profile_support_denied';
  end if;
  if p_username is null or p_username collate "C" !~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$' then
    raise exception using errcode='22023',message='profile_support_invalid_username';
  end if;
  if p_reason is distinct from 'profile_help' then
    raise exception using errcode='22023',message='profile_support_invalid_reason';
  end if;

  -- Same parent-before-child trusted writer protocol as lookup/status/profile.
  -- UUID ordering and SHARE locks only: never acquire a child role/profile lock.
  perform account.user_id from shopthie_private.app_accounts account
  where account.user_id in (actor_id,p_target) order by account.user_id for share;
  if auth.uid() is distinct from actor_id or not shopthie_private.profile_support_ready() then
    raise exception using errcode='42501',message='profile_support_denied';
  end if;
  select pg_catalog.jsonb_build_object('subject',a.user_id,'username',p.username,'phone',p.phone)
  into result
  from shopthie_private.app_accounts a
  join shopthie_private.app_user_roles r on r.user_id=a.user_id and r.role_id='customer'
  join shopthie_private.profiles p on p.user_id=a.user_id
  where a.user_id=p_target and a.user_id<>actor_id
    and pg_catalog.lower(p.username collate "C")=pg_catalog.lower(p_username collate "C");
  if result is null then
    raise exception using errcode='42501',message='profile_support_denied';
  end if;
  -- Mandatory transactional record: opaque IDs + fixed categories only.
  insert into shopthie_private.audit_events(actor_id,target_id,event_type,reason_category,outcome)
  values(actor_id,p_target,'support.profile.read','profile_help','read');
  if not found then
    raise exception using errcode='42501',message='profile_support_denied';
  end if;

  -- Audit hooks run in this transaction too. Fresh VOLATILE statement snapshots
  -- recheck current identity/capability, current Customer/username binding and
  -- the exact saved projection before any disclosure. Exceptions roll back audit.
  if auth.uid() is distinct from actor_id or not shopthie_private.profile_support_ready() then
    raise exception using errcode='42501',message='profile_support_denied';
  end if;
  select pg_catalog.jsonb_build_object('subject',a.user_id,'username',p.username,'phone',p.phone)
  into checked
  from shopthie_private.app_accounts a
  join shopthie_private.app_user_roles r on r.user_id=a.user_id and r.role_id='customer'
  join shopthie_private.profiles p on p.user_id=a.user_id
  where a.user_id=p_target and a.user_id<>actor_id
    and pg_catalog.lower(p.username collate "C")=pg_catalog.lower(p_username collate "C");
  if checked is null or checked is distinct from result then
    raise exception using errcode='42501',message='profile_support_denied';
  end if;
  return result;
end;
$$;
revoke all on function shopthie_private.profile_support_read(uuid,text,text) from public,anon,authenticated;
grant execute on function shopthie_private.profile_support_read(uuid,text,text) to authenticated;
create function public.shopthie_profile_support_read(p_target uuid,p_username text,p_reason text) returns jsonb
language sql volatile security invoker set search_path='' as $$
  select shopthie_private.profile_support_read(p_target,p_username,p_reason);
$$;
revoke all on function public.shopthie_profile_support_read(uuid,text,text) from public,anon,authenticated;
grant execute on function public.shopthie_profile_support_read(uuid,text,text) to authenticated;

-- Preserve the complete Area 9 reader; only the supported envelope gains
-- support.profile.read/profile_help/read with a nonnull target. ACL is retained.
create or replace function shopthie_private.audit_events(p_before_time text,p_before_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor_id uuid := auth.uid();
  actor_role text;
  checked_role text;
  event record;
  events jsonb := '[]'::jsonb;
  next_cursor jsonb := 'null'::jsonb;
  last_cursor jsonb;
  seen integer := 0;
  before_time timestamptz;
begin
  -- Deny before cursor validation or any event read.
  if not shopthie_private.audit_view_ready() then
    raise exception using errcode='42501',message='audit_view_denied';
  end if;
  perform account.user_id from shopthie_private.app_accounts account
  where account.user_id=v_actor_id for share;
  if not found or auth.uid() is distinct from v_actor_id or not shopthie_private.audit_view_ready() then
    raise exception using errcode='42501',message='audit_view_denied';
  end if;
  select role_id into actor_role from shopthie_private.app_user_roles where user_id=v_actor_id;
  if actor_role is null or actor_role not in ('owner','admin') then
    raise exception using errcode='42501',message='audit_view_denied';
  end if;
  if (p_before_time is null) <> (p_before_id is null) then
    raise exception using errcode='22023',message='audit_view_invalid_cursor';
  end if;
  if p_before_time is not null then
    -- Text is never normalized. Reject noncanonical grammar before conversion;
    -- PostgreSQL validates the real calendar, then exact UTC roundtrip rejects
    -- accepted normalizations such as 24:00 and leap-second rollover.
    if pg_catalog.length(p_before_time) <> 27 or p_before_time collate "C" !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$' then
      raise exception using errcode='22023',message='audit_view_invalid_cursor';
    end if;
    begin
      before_time := p_before_time::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode='22023',message='audit_view_invalid_cursor';
    end;
    if pg_catalog.to_char(before_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') <> p_before_time then
      raise exception using errcode='22023',message='audit_view_invalid_cursor';
    end if;
  end if;

  for event in
    select e.id,e.actor_id,e.target_id,e.event_type,e.reason_category,e.outcome,e.created_at
    from shopthie_private.audit_events e
    where e.actor_id is not null and (actor_role='owner' or e.actor_id=v_actor_id)
      and (before_time is null or (e.created_at,e.id) < (before_time,p_before_id))
      -- Exact supported envelope, before the fixed lookahead. Unsafe legacy and
      -- unknown future events cannot consume slots or leak arbitrary strings.
      and pg_catalog.isfinite(e.created_at)
      and e.created_at >= timestamptz '0001-01-01 00:00:00+00'
      and e.created_at < timestamptz '10000-01-01 00:00:00+00'
      and (
        (e.event_type='customer.lookup'
          and e.reason_category in ('account_access','profile_help','address_help')
          and ((e.outcome='found' and e.target_id is not null)
            or (e.outcome='not_found' and e.target_id is null)))
        or (e.event_type='customer.status.read' and e.target_id is not null
          and e.reason_category in ('account_security','customer_request','account_review') and e.outcome='read')
        or (e.event_type='customer.status.change' and e.target_id is not null
          and e.reason_category in ('account_security','customer_request','account_review')
          and e.outcome in ('active','suspended'))
        or (e.event_type='support.profile.read' and e.target_id is not null
          and e.reason_category='profile_help' and e.outcome='read')
      )
    order by e.created_at desc,e.id desc limit 21
  loop
    seen := seen+1;
    if seen=21 then
      next_cursor := last_cursor;
      exit;
    end if;
    last_cursor := pg_catalog.jsonb_build_object('createdAt',
      pg_catalog.to_char(event.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'id',event.id);
    events := events || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id',event.id,'actorSubject',event.actor_id,'targetSubject',event.target_id,
      'eventType',event.event_type,'reason',event.reason_category,'outcome',event.outcome,
      'createdAt',last_cursor->>'createdAt'));
  end loop;

  -- VOLATILE statements get a fresh current-authority check. No read-side audit
  -- write/trigger, target/child locks, profiles or contact fields are involved.
  if auth.uid() is distinct from v_actor_id or not shopthie_private.audit_view_ready() then
    raise exception using errcode='42501',message='audit_view_denied';
  end if;
  select role_id into checked_role from shopthie_private.app_user_roles where user_id=v_actor_id;
  if checked_role is distinct from actor_role then
    raise exception using errcode='42501',message='audit_view_denied';
  end if;
  return pg_catalog.jsonb_build_object('scope',case when actor_role='owner' then 'all' else 'own' end,
    'events',events,'nextCursor',next_cursor);
end;
$$;

commit;
