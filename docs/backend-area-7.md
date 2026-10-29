# Area 7 — audited exact Customer lookup

**Status: bounded implementation handed off; independent review passed and hosted migration applied/read back. Privileged native acceptance remains deferred. Stopped after this area.**

## Implemented scope

- Exact, case-insensitive username lookup for current active Owner/Admin with AAL2 and a current verified TOTP. No substring/wildcard/list/export/email search.
- One Customer result containing only subject/username/status, or no-match. Staff targets excluded. No private email, phone, addresses, age or Auth metadata.
- Required fixed reason category. Native SQL performs the read and mandatory audit insert in the same operation; audit failure prevents any DTO return. Audit stores actor/target UUIDs, reason/event/outcome only, never the searched username or contact fields.
- Dedicated optional `customer_lookup` module and explicit existing Owner/Admin grant preservation. Staff/support modules remain disabled; no account status, staff role, Owner, MFA, private support or audit-list management.
- Protected noindex `/admin/customers`; current database readiness gates form/link. User-scoped request-only SDK/RPCs, stale-caller assertion and strict minimal DTO decoding. Client clears results on edits and suppresses late/unmounted responses; no persistence or automatic queries.

## Executed verification

- **203 unit tests, 181 overlapping backend checks including 67 embedded SQL checks**, zero failures/skips. Counts overlap, not additive.
- **26 targeted desktop/mobile browser checks** passed on the production build, with no unstable-value/prerender diagnostic. Expected invalid-session SDK warnings are from explicit negative fixtures.
- Production build, types, ESLint, formatting and whitespace passed.
- Worker SQL: 14 new lookup checks plus 5 historical staff-entry checks passed; parent added full-current registry/schema/grant parity and repaired a historical foundation fixture mismatch. The foundation fixture deliberately remains pre-lookup; no assertion was removed, and current contracts are separately checked against the complete migration set.
- UI checks exercise actual React/Chromium with clearly labeled fixture identities and 320px layouts. SQL checks use real PostgreSQL roles/ACLs with TEST claims/factors; SDK tests use the installed SDK with synthetic fetch responses. None is native JWT/OTP or real privileged-read acceptance.

## Native read-only account checks

Dedicated Shopthie preflight ACTIVE_HEALTHY: zero staff memberships, zero verified factors, one pre-existing pending factor, zero audit rows; lookup module/RPC absent. Profiles enabled, staff/support disabled. Preserve pending setup.

Actual saved-vault Customer login then protected lookup denial passed: no staff link, query/reason fields or result DTO; no runtime/console errors or overflow. At 320px logout target was 49px. Independent cookie-free request was no-store, streamed to login and contained no private lookup fields. Direct logout cleared app auth cookies to zero and a subsequent protected visit returned to login; browser left signed out.

An initial login probe navigated away before the asynchronous sign-in outcome; the harness was corrected to await the completed account URL. No app/auth changes were made for this timing issue. No credential values/identifiers or vault handles are recorded here.

## Review and hosted installation

Independent bounded review `deleg_3a9c53f3` PASS, no security/logic findings. Reviewer ran 42 focused checks, an enum-shaped SQL compatibility probe and whitespace check; this is source/local-fixture proof, not native privileged acceptance. Nonblocking suggestion: retain a permanent enum-backed Auth regression fixture. No extra feature/test matrix was added for this suggestion.

Migration **`20261029121812_customer_lookup`** applied once, then exact history/signatures/volatility/ACL/search paths/module/dependencies/grants read back. Local `supabase/migrations/20261029121812_customer_lookup.sql` aligned without SQL changes; all **67 SQL checks passed again**. Public invoker/private definer wrappers, authenticated-only execute, no anon/PUBLIC execute or raw client private-table DML. Dedicated lookup enabled; staff/support remain off.

Post-apply counts match preflight: zero staff memberships, zero verified, one pre-existing pending factor, zero audit rows. Authenticated-role calls without a subject correctly deny both lookup paths, readiness false and no audit insert; no JWT claims were fabricated for this native check. This is not native privileged-read acceptance.

## Delivery boundary

No real staff identity exists; do not create/promote/enroll one to force acceptance. Privileged native lookup/MFA acceptance remains deferred under the unchanged-account decision. No account role/MFA mutation, Owner bootstrap, signup/email activation, source copies/snapshots, staging/commit/push/deployment, paid service or next area. Preview uses port 3100. Contract: `backend-customer-lookup-contract.md`.
