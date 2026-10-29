-- Area 7 only: audited exact Customer lookup, not general staff/support tools.
begin;

insert into shopthie_private.app_modules (id, enabled) values ('customer_lookup', true);
insert into shopthie_private.app_module_dependencies (module_id, depends_on)
values ('customer_lookup', 'profiles'), ('customer_lookup', 'access'), ('customer_lookup', 'audit');
-- Preserve the existing reviewed Owner/Admin grants; change no other capability.
update shopthie_private.app_permissions set module_id = 'customer_lookup' where id = 'customer.lookup';

create function shopthie_private.customer_lookup_ready() returns boolean
language sql stable security definer set search_path = '' as $$
  select shopthie_private.has_permission('customer.lookup');
$$;
revoke all on function shopthie_private.customer_lookup_ready() from public, anon, authenticated;
grant execute on function shopthie_private.customer_lookup_ready() to authenticated;

create function public.shopthie_customer_lookup_ready() returns boolean
language sql stable security invoker set search_path = '' as $$
  select shopthie_private.customer_lookup_ready();
$$;
revoke all on function public.shopthie_customer_lookup_ready() from public, anon, authenticated;
grant execute on function public.shopthie_customer_lookup_ready() to authenticated;

create function shopthie_private.customer_lookup(p_username text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  matched_subject uuid;
  result jsonb;
begin
  -- No caller-selected actor, role or target; live authority precedes target access.
  if not shopthie_private.has_permission('customer.lookup') then
    raise exception using errcode = '42501', message = 'customer_lookup_denied';
  end if;

  if p_username is null or p_username collate "C" !~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$' then
    raise exception using errcode = '22023', message = 'customer_lookup_invalid_username';
  end if;
  if p_reason is null or p_reason not in ('account_access', 'profile_help', 'address_help') then
    raise exception using errcode = '22023', message = 'customer_lookup_invalid_reason';
  end if;

  select account.user_id,
    pg_catalog.jsonb_build_object('subject', account.user_id, 'username', profile.username, 'status', account.status)
  into matched_subject, result
  from shopthie_private.profiles profile
  join shopthie_private.app_accounts account on account.user_id = profile.user_id
  join shopthie_private.app_user_roles membership on membership.user_id = account.user_id and membership.role_id = 'customer'
  where pg_catalog.lower(profile.username collate "C") = pg_catalog.lower(p_username collate "C");

  -- Never log the searched handle or private fields. No exception handler may
  -- swallow an audit failure: it must abort the statement before any DTO returns.
  insert into shopthie_private.audit_events (actor_id, target_id, event_type, reason_category, outcome)
  values (auth.uid(), matched_subject, 'customer.lookup', p_reason,
    case when matched_subject is null then 'not_found' else 'found' end);
  return coalesce(result, 'null'::jsonb);
end;
$$;
revoke all on function shopthie_private.customer_lookup(text, text) from public, anon, authenticated;
grant execute on function shopthie_private.customer_lookup(text, text) to authenticated;

create function public.shopthie_customer_lookup(p_username text, p_reason text) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select shopthie_private.customer_lookup(p_username, p_reason);
$$;
revoke all on function public.shopthie_customer_lookup(text, text) from public, anon, authenticated;
grant execute on function public.shopthie_customer_lookup(text, text) to authenticated;

commit;
