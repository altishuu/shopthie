# Area 6 — staff MFA and protected entry database

Applied migration: `supabase/migrations/20261029113028_staff_entry.sql`; hosted version/name read back exactly. Local filename aligned without SQL changes; all 52 SQL checks passed afterward.

## Changes

- Replaces `shopthie_private.has_permission(text)` without changing its OID, signature, owner, grants, stable volatility or empty search path. Existing Customer optional-MFA behavior and recursive module/permission gates remain intact.
- Owner/Admin capabilities now require both `aal2` and a current verified native `auth.mfa_factors` row whose `factor_type` is `totp`. Stale AAL2 alone after the last TOTP deletion is insufficient.
- Adds `staff.enter` in the always-on identity module, granted only to Owner/Admin. Does not enable the optional staff/support modules or assign any account role.
- Adds zero-argument self projection `public.shopthie_staff_entry()` (invoker) → `shopthie_private.staff_entry()` (definer), both fixed empty search path and authenticated-only execution; no anonymous/PUBLIC execute. Output is only the verified caller's `{user_id, role}`.
- No new table, raw-table grant, Owner bootstrap, directory, audit reader, support read or account mutation. Original actor-context shape and ACL remain unchanged.

## Actual checks

`node --test tests/backend/*.test.ts`: **52 passed**, zero failures/skips: 5 new staff-entry checks plus all 47 prior SQL checks.

New tests execute real embedded PostgreSQL roles/functions/grants with explicitly injected TEST claims and synthetic factor rows. They verify: Owner/Admin current verified TOTP+AAL2; foreign/pending/non-TOTP/no-factor/malformed-assurance denial; last-factor deletion with unchanged stale AAL2; self-only output and no target parameter; anonymous/Customer/forged-metadata/no-membership/suspension denial; current grant/role revocation; fixed invoker/definer paths/ACLs; no raw private access; disabled optional tools; unchanged old permission/actor contracts.

Prior suites explicitly load the latest staff-authority migration. The foundation fixture keeps its original optional-module defaults; profile and address fixtures retain their respective data-module setup. Positive staff cases now explicitly seed verified TOTP instead of assuming an AAL2 fixture proves enrollment. Existing address conflict/ownership assertions remain unchanged.

## Evidence limits and native safety

This is not a native Supabase stack, real JWT trust or TOTP cryptographic proof. The test Auth factor_type field is synthetic text with default `totp`; the real project's factor_type/status enum columns were separately inspected read-only.

Before apply: dedicated Shopthie is ACTIVE_HEALTHY, migration/function absent, zero staff memberships, zero verified MFA and one pre-existing pending setup. Native account/role/factor changes are not authorized and were not performed. Preserve that unfinished setup. Live Owner/Admin MFA acceptance remains deferred, not inferred from SQL fixtures.

## Hosted installation readback

Applied once after independent correction re-review passed. Hosted history: `20261029113028`, `staff_entry`. Exact function metadata confirms public zero-argument invoker and private zero-argument definer return only `TABLE(user_id uuid, role text)`; empty search paths; authenticated execute; anon/PUBLIC execution denied. Existing `has_permission(text)` remains a fixed-path definer with authenticated-only execute; current TOTP condition installed. `staff.enter` maps to identity and grants only Admin/Owner. Raw private-table client DML denied; optional staff/support false. Account/security counts unchanged after apply: zero staff memberships, zero verified factors, one pre-existing pending factor. Native staff OTP/AAL2 acceptance is still unverified, not fabricated.
