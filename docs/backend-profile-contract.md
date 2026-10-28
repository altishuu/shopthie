# Area 3 — customer profiles contract and stop boundary

User authorized the next bounded area and requested stopping afterward. This area is ONLY customer-owned profiles: required unique username and optional unverified international phone. No age collection (privacy basis/notice pending), DOB, addresses/geography, MFA UI, staff tools, email, signup opening, payments, commits/pushes or deployment.

## Ownership

SQL worker owns one new `supabase/migrations/*_profiles.sql`, `tests/backend/database-profiles.test.ts`, and optional `docs/backend-profiles-database.md`. Read actual files in place. No source copies/snapshots/manifests, hosted changes, packages, app/TS edits or baseline-migration edits.
Parent owns `src/modules/profiles/`, `/account/profile`, account navigation and targeted unit/browser checks, hosted application/readback, integration and handoff.

## Database interface

- `shopthie_private.profiles`: one row per existing app account, `username` required ASCII handle 3–32 chars (`^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$`); preserve display case, case-insensitive uniqueness using C-locale lower; optional `phone` NULL or `^[+][1-9][0-9]{1,14}$` (format only, not verification); integer `revision` starts 1/increments; created/updated timestamps. No authority/email/age columns. FK lifecycle managed by account FK.
- No raw anon/authenticated table privileges; enable default-deny RLS, no broad staff/customer table policy. Fixed-search-path definer PRIVATE functions; PUBLIC wrappers invoker, granted authenticated only, no anon/PUBLIC execute. Never accept caller-selected account IDs.
- `public.shopthie_profile_read()` returns JSON object `{username,phone,revision}` for auth.uid(), or JSON null when not yet set up. Require current `profile.read_own` via existing authority helper; unavailable module/status/MFA/membership or guest denies, not fake empty profile.
- `public.shopthie_profile_save(p_username text,p_phone text,p_revision integer)` returns same JSON after actual success. Require `profile.update_own`, self-bound auth.uid(), lock own app-account row then recheck current capability, validate inputs/revision. `p_revision=0` creates only if no profile; existing row requires exact revision. Stale revision -> SQLSTATE P0001 with message `profile_conflict`. Unique collision -> unique violation 23505, never overwrite or reveal other's data. Other invalid input -> 22023 or CHECK violation, auth/module denial ->42501.
- Serialize competing own-profile writes with the existing own app-account row lock; no lost updates/anonymous global writer. Preserve other customer's phone/profile and authority fields. Read/save return no extra private fields or target IDs.
- Enable ONLY the profiles module in this migration. Identity/access/audit remain required; geography/addresses/staff/support remain disabled. Database module flag is authoritative: disabling it denies direct RPCs as well as app access. A visible navigation link is not authority.
- SQL tests use existing real PGlite/auth TEST fixtures, not a fake hosted JWT environment. Each test cycle should be RED before the behavior exists; do not write all speculative tests and then the whole implementation. Keep scope bounded to schema/RPC/ownership/collision/revision/disabled/MFA/raw grants.

## Parent TypeScript/UI

`Profile={username:string;phone:string|null;revision:number}` (minimal self DTO).
`ProfilePageState`: `ready` with profile or null; `guest`; `denied` with safe message.
`ProfileFormState`: `idle|error|conflict|success`, message and authoritative profile (null on error).
Server reader/action use verified current identity and user-scoped SDK RPC, no service key and no unverified metadata role. Validate canonical fields/duplicate fields and reject extra user_id/role/status/email/age inputs; require an explicit expected_subject editor-context assertion matching the currently verified actor (not a data selector and never passed to SQL); ignore only React framework `$ACTION_...` controls. Blank optional phone becomes NULL, no silent phone/username repairs. Whitelist safe error text, no raw errors/PII in logs. Success only from validated committed server return.
UI: `/account/profile` scoped Suspense + existing IdentityShell/RouteMotionReady, no shared private cache/global motion changes. Accessible form, username/phone constraints/help, saved/conflict errors, pending controls, no age fields, clear phone supported. Retain draft on failed save; after success use returned canonical revision/profile. If load denied/unavailable, do not render editable form. Account page gains stable profile link; no global auth provider.

## Acceptance and stopping point

Build/static gates, relevant units/real embedded SQL checks, a bounded desktop/mobile guest/form pass, one focused security review. Apply only to dedicated Shopthie `sjqpfsjgfzmcsshkdrmc`, verify exact external target after migration and after profile mutation. Live smoke uses the user's controlled saved-vault test identity and synthetic profile data, no password/token access/logging. Verify real save/reload/edit/phone clear and guest isolation; state explicitly which cross-user checks use embedded TEST claims rather than native accounts.

Leave the browser signed out after checks. Update progress/evidence and STOP after this profiles area. Do not roll into addresses, MFA or staff tools.
