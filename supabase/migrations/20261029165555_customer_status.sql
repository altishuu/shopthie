-- Area 8 only. Correct Area 7 in place without editing deployed history.
begin;

alter table shopthie_private.app_accounts add column status_revision integer not null default 0
  constraint account_status_revision_nonnegative check (status_revision >= 0);
create function shopthie_private.account_status_revision_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.status_revision <> 0 then raise exception using errcode='22023',message='customer_status_invalid_revision'; end if;
    return new;
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception using errcode='22023',message='account_subject_immutable';
  end if;
  if new.status_revision is distinct from old.status_revision then
    raise exception using errcode='22023',message='customer_status_invalid_revision';
  end if;
  if new.status is distinct from old.status then
    if old.status_revision=2147483647 then
      raise exception using errcode='22023',message='customer_status_revision_exhausted';
    end if;
    new.status_revision := old.status_revision+1;
  end if;
  return new;
end;
$$;
revoke all on function shopthie_private.account_status_revision_guard() from public,anon,authenticated;
create trigger account_status_revision_guard before insert or update on shopthie_private.app_accounts
for each row execute function shopthie_private.account_status_revision_guard();

insert into shopthie_private.app_modules(id,enabled) values ('customer_status',true);
insert into shopthie_private.app_module_dependencies(module_id,depends_on)
values ('customer_status','customer_lookup'),('customer_status','access'),('customer_status','audit');
update shopthie_private.app_permissions set module_id='customer_status' where id='customer.status.manage';

create function shopthie_private.customer_subject_writer_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare subject_id uuid;
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception using errcode='22023', message='account_subject_immutable';
  end if;
  subject_id := case when tg_op='DELETE' then old.user_id else new.user_id end;
  -- Participate in the same parent-row discipline as reads/status changes. Child
  -- rows are never locked by readers; cascades may already have removed parent.
  perform account.user_id from shopthie_private.app_accounts account
  where account.user_id=subject_id for update;
  if not found and tg_op <> 'DELETE' then
    raise exception using errcode='23503', message='account_subject_missing';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function shopthie_private.customer_subject_writer_guard() from public,anon,authenticated;
create trigger customer_subject_writer_guard before insert or update or delete on shopthie_private.app_user_roles
for each row execute function shopthie_private.customer_subject_writer_guard();
create trigger customer_subject_writer_guard before insert or update or delete on shopthie_private.profiles
for each row execute function shopthie_private.customer_subject_writer_guard();

create or replace function shopthie_private.customer_lookup(p_username text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  candidate_id uuid;
  matched_subject uuid;
  result jsonb;
  checked jsonb;
begin
  if not shopthie_private.has_permission('customer.lookup') then
    raise exception using errcode = '42501', message = 'customer_lookup_denied';
  end if;
  if p_username is null or p_username collate "C" !~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$' then
    raise exception using errcode = '22023', message = 'customer_lookup_invalid_username';
  end if;
  if p_reason is null or p_reason not in ('account_access', 'profile_help', 'address_help') then
    raise exception using errcode = '22023', message = 'customer_lookup_invalid_reason';
  end if;

  select profile.user_id into candidate_id
  from shopthie_private.profiles profile
  join shopthie_private.app_user_roles membership on membership.user_id = profile.user_id and membership.role_id = 'customer'
  where pg_catalog.lower(profile.username collate "C") = pg_catalog.lower(p_username collate "C");

  -- Parent rows only, one UUID-ordered lock acquisition (never child row locks).
  perform account.user_id from shopthie_private.app_accounts account
  where account.user_id in (actor_id, candidate_id)
  order by account.user_id for share;
  if auth.uid() is distinct from actor_id or not shopthie_private.has_permission('customer.lookup') then
    raise exception using errcode = '42501', message = 'customer_lookup_denied';
  end if;

  select account.user_id,
    pg_catalog.jsonb_build_object('subject', account.user_id, 'username', profile.username, 'status', account.status)
  into matched_subject, result
  from shopthie_private.profiles profile
  join shopthie_private.app_accounts account on account.user_id = profile.user_id
  join shopthie_private.app_user_roles membership on membership.user_id = account.user_id and membership.role_id = 'customer'
  where account.user_id = candidate_id
    and pg_catalog.lower(profile.username collate "C") = pg_catalog.lower(p_username collate "C");

  insert into shopthie_private.audit_events (actor_id, target_id, event_type, reason_category, outcome)
  values (actor_id, matched_subject, 'customer.lookup', p_reason,
    case when matched_subject is null then 'not_found' else 'found' end);

  -- Mandatory audit hooks can change state even in this transaction. Never return
  -- the saved DTO until current authority AND the exact Customer projection agree.
  if auth.uid() is distinct from actor_id or not shopthie_private.has_permission('customer.lookup') then
    raise exception using errcode = '42501', message = 'customer_lookup_denied';
  end if;
  select pg_catalog.jsonb_build_object('subject', account.user_id, 'username', profile.username, 'status', account.status)
  into checked
  from shopthie_private.profiles profile
  join shopthie_private.app_accounts account on account.user_id = profile.user_id
  join shopthie_private.app_user_roles membership on membership.user_id = account.user_id and membership.role_id = 'customer'
  where pg_catalog.lower(profile.username collate "C") = pg_catalog.lower(p_username collate "C");
  if checked is distinct from result then
    raise exception using errcode = '42501', message = 'customer_lookup_denied';
  end if;
  return coalesce(result, 'null'::jsonb);
end;
$$;
revoke all on function shopthie_private.customer_lookup(text, text) from public, anon, authenticated;
grant execute on function shopthie_private.customer_lookup(text, text) to authenticated;

create function shopthie_private.customer_status_ready() returns boolean
language sql stable security definer set search_path='' as $$
  select shopthie_private.has_permission('customer.status.manage') and exists (
    select 1 from shopthie_private.app_user_roles where user_id=auth.uid() and role_id in ('owner','admin')
  );
$$;
revoke all on function shopthie_private.customer_status_ready() from public,anon,authenticated;
grant execute on function shopthie_private.customer_status_ready() to authenticated;
create function public.shopthie_customer_status_ready() returns boolean
language sql stable security invoker set search_path='' as $$
  select shopthie_private.customer_status_ready();
$$;
revoke all on function public.shopthie_customer_status_ready() from public,anon,authenticated;
grant execute on function public.shopthie_customer_status_ready() to authenticated;

create function shopthie_private.customer_status_read(p_target uuid,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); result jsonb; checked jsonb;
begin
  if not shopthie_private.customer_status_ready() then
    raise exception using errcode='42501',message='customer_status_denied';
  end if;
  if p_target is null or p_target=actor_id then
    raise exception using errcode='42501',message='customer_status_denied';
  end if;
  if p_reason is null or p_reason not in ('account_security','customer_request','account_review') then
    raise exception using errcode='22023',message='customer_status_invalid_reason';
  end if;
  perform account.user_id from shopthie_private.app_accounts account
  where account.user_id in (actor_id,p_target) order by account.user_id for update;
  if auth.uid() is distinct from actor_id or not shopthie_private.customer_status_ready() then
    raise exception using errcode='42501',message='customer_status_denied';
  end if;
  select pg_catalog.jsonb_build_object('subject',a.user_id,'status',a.status,'revision',a.status_revision)
  into result from shopthie_private.app_accounts a
  join shopthie_private.app_user_roles r on r.user_id=a.user_id and r.role_id='customer'
  where a.user_id=p_target;
  if result is null then raise exception using errcode='42501',message='customer_status_denied'; end if;
  insert into shopthie_private.audit_events(actor_id,target_id,event_type,reason_category,outcome)
  values(actor_id,p_target,'customer.status.read',p_reason,'read');
  if auth.uid() is distinct from actor_id or not shopthie_private.customer_status_ready() then
    raise exception using errcode='42501',message='customer_status_denied';
  end if;
  select pg_catalog.jsonb_build_object('subject',a.user_id,'status',a.status,'revision',a.status_revision)
  into checked from shopthie_private.app_accounts a
  join shopthie_private.app_user_roles r on r.user_id=a.user_id and r.role_id='customer'
  where a.user_id=p_target;
  if checked is distinct from result then raise exception using errcode='42501',message='customer_status_denied'; end if;
  return result;
end;
$$;
revoke all on function shopthie_private.customer_status_read(uuid,text) from public,anon,authenticated;
grant execute on function shopthie_private.customer_status_read(uuid,text) to authenticated;
create function public.shopthie_customer_status_read(p_target uuid,p_reason text) returns jsonb
language sql volatile security invoker set search_path='' as $$
  select shopthie_private.customer_status_read(p_target,p_reason);
$$;
revoke all on function public.shopthie_customer_status_read(uuid,text) from public,anon,authenticated;
grant execute on function public.shopthie_customer_status_read(uuid,text) to authenticated;

create function shopthie_private.customer_status_change(p_target uuid,p_status text,p_revision integer,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); previous jsonb; result jsonb; checked jsonb;
begin
  if not shopthie_private.customer_status_ready() then raise exception using errcode='42501',message='customer_status_denied'; end if;
  if p_target is null or p_target=actor_id then raise exception using errcode='42501',message='customer_status_denied'; end if;
  if p_status is null or p_status not in ('active','suspended') or p_revision is null or p_revision<0 or p_revision=2147483647 then
    raise exception using errcode='22023',message='customer_status_invalid_input';
  end if;
  if p_reason is null or p_reason not in ('account_security','customer_request','account_review') then
    raise exception using errcode='22023',message='customer_status_invalid_reason';
  end if;
  perform account.user_id from shopthie_private.app_accounts account
  where account.user_id in (actor_id,p_target) order by account.user_id for update;
  if auth.uid() is distinct from actor_id or not shopthie_private.customer_status_ready() then
    raise exception using errcode='42501',message='customer_status_denied';
  end if;
  select pg_catalog.jsonb_build_object('subject',a.user_id,'status',a.status,'revision',a.status_revision)
  into previous from shopthie_private.app_accounts a
  join shopthie_private.app_user_roles r on r.user_id=a.user_id and r.role_id='customer'
  where a.user_id=p_target;
  if previous is null then raise exception using errcode='42501',message='customer_status_denied'; end if;
  if (previous->>'revision')::integer<>p_revision then
    raise exception using errcode='P0001',message='customer_status_conflict';
  end if;
  if previous->>'status'=p_status then raise exception using errcode='22023',message='customer_status_unchanged'; end if;
  update shopthie_private.app_accounts as a set status=p_status where a.user_id=p_target
  returning pg_catalog.jsonb_build_object('subject',a.user_id,'status',a.status,'revision',a.status_revision) into result;
  insert into shopthie_private.audit_events(actor_id,target_id,event_type,reason_category,outcome)
  values(actor_id,p_target,'customer.status.change',p_reason,p_status);
  if auth.uid() is distinct from actor_id or not shopthie_private.customer_status_ready() then
    raise exception using errcode='42501',message='customer_status_denied';
  end if;
  select pg_catalog.jsonb_build_object('subject',a.user_id,'status',a.status,'revision',a.status_revision)
  into checked from shopthie_private.app_accounts a
  join shopthie_private.app_user_roles r on r.user_id=a.user_id and r.role_id='customer'
  where a.user_id=p_target and a.status=p_status and a.status_revision=p_revision+1;
  if checked is distinct from result or checked is null then
    raise exception using errcode='42501',message='customer_status_denied';
  end if;
  return result;
end;
$$;
revoke all on function shopthie_private.customer_status_change(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function shopthie_private.customer_status_change(uuid,text,integer,text) to authenticated;
create function public.shopthie_customer_status_change(p_target uuid,p_status text,p_revision integer,p_reason text) returns jsonb
language sql volatile security invoker set search_path='' as $$
  select shopthie_private.customer_status_change(p_target,p_status,p_revision,p_reason);
$$;
revoke all on function public.shopthie_customer_status_change(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.shopthie_customer_status_change(uuid,text,integer,text) to authenticated;

commit;
