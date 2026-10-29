import { PGlite } from "@electric-sql/pglite";

// TEST FIXTURE ONLY: a tiny auth schema, not Supabase Auth/GoTrue.
// Claims are injected by trusted test code; no JWT verification or login occurs.
export async function createAuthFixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role supabase_auth_admin nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      raw_user_meta_data jsonb not null default '{}',
      raw_app_meta_data jsonb not null default '{}'
    );
    create table auth.mfa_factors (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      -- TEST schema: native Supabase uses enums; this synthetic text field is not GoTrue.
      factor_type text not null default 'totp',
      status text not null check (status in ('unverified', 'verified'))
    );
    create function auth.jwt() returns jsonb language sql stable
      as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable
      as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
    grant usage on schema auth to supabase_auth_admin;
    grant insert on auth.users to supabase_auth_admin;
  `);
  return db;
}

export const customerId = "00000000-0000-4000-8000-000000000001";
export const otherId = "00000000-0000-4000-8000-000000000002";

export async function asActor(
  db: PGlite,
  role: "anon" | "authenticated" | "supabase_auth_admin",
  claims: Record<string, unknown> = {},
) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
  await db.exec(`set local role ${role}`);
}

export async function provision(db: PGlite, id = customerId) {
  await db.query("insert into auth.users (id) values ($1)", [id]);
}
