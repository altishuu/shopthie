-- Area 9 only: optional restricted read-only operational audit history.
begin;

-- Recording remains the required audit foundation. Preserve every reviewed grant
-- and every existing writer: only the read capability moves to this module.
insert into shopthie_private.app_modules(id,enabled) values ('audit_view',true);
insert into shopthie_private.app_module_dependencies(module_id,depends_on)
values ('audit_view','access'),('audit_view','audit');
update shopthie_private.app_permissions set module_id='audit_view' where id='audit.read';

create function shopthie_private.audit_view_ready() returns boolean
language sql stable security definer set search_path='' as $$
  select shopthie_private.has_permission('audit.read') and exists (
    select 1 from shopthie_private.app_user_roles
    where user_id=auth.uid() and role_id in ('owner','admin')
  );
$$;
revoke all on function shopthie_private.audit_view_ready() from public,anon,authenticated;
grant execute on function shopthie_private.audit_view_ready() to authenticated;
create function public.shopthie_audit_view_ready() returns boolean
language sql stable security invoker set search_path='' as $$
  select shopthie_private.audit_view_ready();
$$;
revoke all on function public.shopthie_audit_view_ready() from public,anon,authenticated;
grant execute on function public.shopthie_audit_view_ready() to authenticated;

create function shopthie_private.audit_events(p_before_time text,p_before_id uuid) returns jsonb
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
revoke all on function shopthie_private.audit_events(text,uuid) from public,anon,authenticated;
grant execute on function shopthie_private.audit_events(text,uuid) to authenticated;
create function public.shopthie_audit_events(p_before_time text,p_before_id uuid) returns jsonb
language sql volatile security invoker set search_path='' as $$
  select shopthie_private.audit_events(p_before_time,p_before_id);
$$;
revoke all on function public.shopthie_audit_events(text,uuid) from public,anon,authenticated;
grant execute on function public.shopthie_audit_events(text,uuid) to authenticated;

commit;
