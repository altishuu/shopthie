-- Area 3 only: customer-owned profiles, never an authority or verification source.
begin;

create table shopthie_private.profiles (
  user_id uuid primary key references shopthie_private.app_accounts(user_id) on delete cascade,
  username text not null constraint profiles_username_format check (username collate "C" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$'),
  -- Stored syntax only: this column makes no claim of phone ownership/verification.
  phone text constraint profiles_phone_format check (phone is null or phone collate "C" ~ '^[+][1-9][0-9]{1,14}$'),
  revision integer not null default 1 constraint profiles_revision_positive check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Preserve display case; ASCII handles are compared with a deterministic C-locale fold.
create unique index profiles_username_unique on shopthie_private.profiles (pg_catalog.lower(username collate "C"));
alter table shopthie_private.profiles enable row level security;
revoke all on table shopthie_private.profiles from public, anon, authenticated;

create function shopthie_private.profile_read() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not shopthie_private.has_permission('profile.read_own') then
    raise exception using errcode = '42501', message = 'profile_denied';
  end if;
  return coalesce((
    select pg_catalog.jsonb_build_object('username', profile.username, 'phone', profile.phone, 'revision', profile.revision)
    from shopthie_private.profiles profile where profile.user_id = auth.uid()
  ), 'null'::jsonb);
end;
$$;
revoke all on function shopthie_private.profile_read() from public, anon, authenticated;
grant execute on function shopthie_private.profile_read() to authenticated;

create function public.shopthie_profile_read() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select shopthie_private.profile_read();
$$;
revoke all on function public.shopthie_profile_read() from public, anon, authenticated;
grant execute on function public.shopthie_profile_read() to authenticated;

create function shopthie_private.profile_save(p_username text, p_phone text, p_revision integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  saved shopthie_private.profiles%rowtype;
begin
  if not shopthie_private.has_permission('profile.update_own') then
    raise exception using errcode = '42501', message = 'profile_denied';
  end if;

  -- The account exists before first setup: serialize creates AND edits for this actor.
  -- Recheck live authority after any lock wait, before validation or mutation.
  perform 1 from shopthie_private.app_accounts where user_id = actor_id for update;
  if not found or not shopthie_private.has_permission('profile.update_own') then
    raise exception using errcode = '42501', message = 'profile_denied';
  end if;

  if p_revision is null or p_revision < 0 then
    raise exception using errcode = '22023', message = 'profile_invalid_revision';
  end if;
  if p_username is null or p_username collate "C" !~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$' then
    raise exception using errcode = '22023', message = 'profile_invalid_username';
  end if;
  if p_phone is not null and p_phone collate "C" !~ '^[+][1-9][0-9]{1,14}$' then
    raise exception using errcode = '22023', message = 'profile_invalid_phone';
  end if;

  select * into saved from shopthie_private.profiles where user_id = actor_id;
  if found then
    if p_revision is distinct from saved.revision then
      raise exception using errcode = 'P0001', message = 'profile_conflict';
    end if;
    update shopthie_private.profiles
    set username = p_username, phone = p_phone, revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where user_id = actor_id returning * into saved;
  else
    if p_revision is distinct from 0 then
      raise exception using errcode = 'P0001', message = 'profile_conflict';
    end if;
    insert into shopthie_private.profiles (user_id, username, phone)
    values (actor_id, p_username, p_phone) returning * into saved;
  end if;
  return pg_catalog.jsonb_build_object('username', saved.username, 'phone', saved.phone, 'revision', saved.revision);
end;
$$;
revoke all on function shopthie_private.profile_save(text, text, integer) from public, anon, authenticated;
grant execute on function shopthie_private.profile_save(text, text, integer) to authenticated;

create function public.shopthie_profile_save(p_username text, p_phone text, p_revision integer) returns jsonb
language sql security invoker set search_path = '' as $$
  select shopthie_private.profile_save(p_username, p_phone, p_revision);
$$;
revoke all on function public.shopthie_profile_save(text, text, integer) from public, anon, authenticated;
grant execute on function public.shopthie_profile_save(text, text, integer) to authenticated;

update shopthie_private.app_modules set enabled = true where id = 'profiles';

commit;
