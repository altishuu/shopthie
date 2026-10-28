# Area 3 — customer profiles

**Status: accepted bounded profiles area; stopped as requested.** This completes private username/optional-phone profiles, not the broader address/MFA/staff/public-account roadmap.

## Delivered

- Account → Edit your profile → `/account/profile`, using the existing identity shell and request-scoped, server-only Supabase clients.
- Required 3–32 character ASCII username with display case preserved and deterministic case-insensitive uniqueness. Optional international phone is syntax-only, explicitly unverified, and can be removed.
- Strict allowlisted input and minimal `{username,phone,revision}` DTOs. Unknown/duplicate/authority/age fields and malformed/noncanonical values fail closed. A stale editor's expected subject must match the current verified identity; it never selects a SQL target.
- Current identity/status/membership/MFA/module guards, self-only RPCs, private fixed-search-path definers, authenticated-only execution, revoked raw client privileges and default-deny RLS.
- Account-row serialization and revision conflicts. The UI reports success only from validated committed data; a conflicted typed draft remains visible and cannot be resubmitted until reload.
- No new animation loop, global cleanup, listener or motion ownership was introduced; existing scoped route/motion architecture is reused.

## Verification

- **119 unit tests; 60 backend checks**, all passing with zero failures/skips/cancellations after hosted-version filename alignment. Counts overlap. Backend coverage includes **30 real embedded SQL tests**: 14 profiles plus 16 unchanged foundation checks.
- Production build, TypeScript, ESLint, formatting and whitespace gates passed. App code did not change after that build; subsequent changes were SQL filename alignment/documentation only.
- **18 targeted desktop/mobile identity/profile guest browser checks** passed, including the server-log prerender guard. No extra app-wide motion/commerce matrix was added.
- Focused independent source review **PASS**, no findings: `backend-area-3-review.json`. Reviewer did not certify native deployment or concurrency.
- Dedicated Shopthie hosted migration `20261028181746_profiles.sql` applied and its history/schema/grants/RLS/module settings read back. Only optional `profiles` was enabled; geography/addresses/staff/support remain disabled. No raw anon/authenticated profile-table privileges; RPC execution is denied to anon.
- Real controlled-account browser checks passed: initial empty profile, save, full-reload persistence, edit and phone clearing, stale-revision rejection, typed-draft retention and unchanged committed data after conflict. The phone was confirmed SQL NULL afterward; one synthetic profile remains at revision 2.
- While the browser was signed in, a separate cookie-free request remained no-store and did not receive private profile data. Logout removed all app auth cookies; revisiting the profile redirected to login without profile controls/data. Browser left signed out.
- Visually inspected authenticated desktop 1280×577 and mobile 390×844: no horizontal overflow; enabled form; 49px primary action and 50px mobile username field. Mobile content, privacy copy and back navigation remain reachable.
- Native Auth settings rechecked: signup and anonymous sign-in OFF; email provider ON and confirmation required. No provider-hook attachment/email delivery is implied.

## Evidence boundaries

PGlite executes real SQL/roles with explicitly injected TEST claims, not GoTrue/JWT/MFA integration. Customer A/B isolation, forbidden metadata/target parameters and role/status/module/MFA denial are fixture checks; native application checks used one controlled Customer plus anonymous requests. Stale-save rejection was verified natively, but true concurrent multi-session lock-wait behavior was not certified. No forced-expiration refresh, production HTTPS, cross-engine or full frontend retention rerun was added.

Automation initially asserted feedback before useActionState settled and used a fill helper that did not update React controlled state. Investigation compared attached handlers with trusted CDP input, then the corrected real-input stale-save check passed. No application patch was made to hide those harness failures.

Only synthetic test details were used; the temporary phone was cleared. No secrets/credentials were stored in this report. No age/DOB, addresses/geography, MFA UI, staff/support tools, SMTP/public signup, payments, commit/push or frontend production deployment was added.

**Stopping boundary honored:** no later area started. See `backend-area-3-results.json`, `backend-profiles-database.md` and `backend-profile-contract.md`.
