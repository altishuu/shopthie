# Area 6 — staff MFA and protected entry

**Status: bounded implementation handed off; source corrections independently reviewed, hosted migration applied/read back. Native privileged MFA acceptance remains deferred. Stopped after this area.**

## Implemented

- Protected `/admin` self-session entry: noindex/request-scoped Suspense, own-account/security links and direct sign-out. Guests return to login; Customers see a safe denial; incomplete staff MFA routes to security. Ready staff see only their own role and an honest tools-disabled notice.
- Active Owner/Admin can set up/verify their own TOTP. **All staff unenrollment, including pending cancellation/restart, is unavailable.** No verified-factor removal or recovery bypass. Current transient setup can still be verified; after losing the setup details the app directs the user to the project operator without promising recovery.
- App identity/access guards require both AAL2 and current verified TOTP for staff. A stale AAL2 claim is insufficient. Malformed mixed factor evidence fails closed. Customer optional-MFA/cancellation/removal behavior is unchanged.
- Native capability helper enforces the same live TOTP rule. Minimal zero-argument self RPC returns only user_id/role. `staff.enter` belongs to identity and is granted only to Owner/Admin. Optional staff/support tools stay disabled. No directory, role-management mutation, Owner bootstrap, support-data or audit-listing UI.

## Executed checks

- Production build, TypeScript, ESLint, source/test formatting and whitespace passed.
- **185 unit tests**, **148 overlapping backend checks**, including **52 embedded SQL checks**. Counts overlap; do not add them. No failures/skips.
- **24 targeted desktop/mobile browser checks** passed on the corrected production build: identity/profile/address/security/staff guest paths with the server prerender diagnostic guard. No unstable-value/prerender diagnostics. Deliberately invalid-cookie fixtures may emit expected SDK rejection warnings.
- After matching the local migration filename to hosted history, all **52 SQL checks passed again**.
- Native controlled-Customer login and `/admin` denial passed: no staff link, private role or MFA inputs, horizontal overflow or captured runtime/console errors. Cookie-free no-store request returned to login without a verified-staff message. At 320px, logout target was 49px. Direct logout cleared app auth cookies to zero; browser left signed out.

The PostgreSQL role/ACL tests use injected TEST claims and synthetic factors, not native JWT/TOTP proof. SDK tests use the actual installed SDK with a synthetic provider. Native privileged acceptance is not inferred from those tests. No motion/storefront implementation changed; no second animation loop or global teardown was introduced.

## Review findings and safe scope correction

Initial full bounded review `deleg_fddd71a0` withheld approval on two findings: pending cancellation could race with verification before unconditional unenroll, and empty factor_type in mixed evidence could be accepted. No migration was applied before correction. The first review otherwise checked SQL/native enum compatibility, self-only projection/ACLs and optional-tool boundaries.

Fix worker `deleg_2ed66b79` observed RED→GREEN for service, response guard, UI and factor evidence. The safe correction removes all staff unenroll paths, not another non-atomic check or JWT workaround. Customer Area 5 behavior retained. Independent re-review `deleg_bfd708a7` passed, no remaining findings: 34 relevant tests plus in-memory staff-denial/malformed-evidence probes. It reviewed the fixes, not native account behavior; prior unchanged SQL findings and hosted readback are separate evidence. See `backend-area-6-review.json`.

## Hosted result and unchanged account

Migration **`20261029113028_staff_entry`** applied once and history/schema/ACLs read back. Local file `supabase/migrations/20261029113028_staff_entry.sql` matches the hosted version, SQL unchanged by renaming. Public invoker/private definer are zero-argument, fixed empty search path, authenticated-only, with only `(user_id uuid, role text)` output. Native live TOTP condition installed; no raw private-table client DML. Identity entry grants only Owner/Admin; optional staff/support remain false.

Before and after installation: **zero staff memberships, zero verified factors, one pre-existing pending setup**. That setup was preserved. No native role promotion, Owner creation, enrollment, verification, cancellation, removal or reset was performed. Native Owner/Admin MFA acceptance and customer activation/removal remain deferred under the user's unchanged-account decision.

## Delivery boundary

Two implementation workers hit a provider usage limit after partial writes. Parent inspected actual files, recovered the missing route/navigation/SQL regression coverage and ran integrated checks; worker failure was not treated as absence of changes.

Final post-apply preview checks: Home/Shop/Login HTTP 200; protected admin/security no-store streamed login redirects with no private staff message. A 200 streamed redirect is expected for Suspense; a plain HTTP final-URL-only assertion was corrected, not the app.

No staging change, commit, push, frontend deployment, paid service, signup/email activation, commerce feature or subsequent backend area. Existing user-staged Area 5 work preserved. Current production preview uses port 3100. See `backend-area-6-results.json`, `backend-staff-entry-contract.md` and `backend-staff-entry-database.md`.
