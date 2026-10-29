# Area 8 — Customer application-access status

**Status: bounded implementation handed off; independent correction review passed, hosted migration applied/read back. Privileged native writes/MFA and true multi-session concurrency remain unverified. Stopped after this area.**

## Implemented

- Verified active Owner/Admin can explicitly check and suspend/reactivate a current Customer's **application access**, with a fixed reason, confirmation, fresh target facts and revision compare-and-swap. Never self, staff targets, roles, MFA or provider accounts. This is not a provider ban or immediate JWT/session invalidation.
- Dedicated customer_status module with lookup/access/audit dependencies, existing Owner/Admin grants preserved and only the status capability remapped. Broader staff/support modules remain off. Exact subject/status/revision DTO and strict forms/current-caller assertions; no browser role/status authority or raw table access.
- Status transition and minimal audit insertion are transactional; audit failure returns no result and rolls back change. Revisions increment for actual transitions, including trusted direct updates; tampering/no-op/exhaustion are rejected. Server reloads target facts before write, then native SQL locks/rechecks/CAS independently.
- Lookup now uses ordered parent account locks plus post-audit current-authority/Customer-projection checks. Role/profile writer triggers participate; deployed Area7 history unchanged. Public actor/permission contracts remain unchanged.
- Lookup/status UI clears retained context and late responses across Activity/browser/actor changes. Every status-panel setup/replay starts disabled/empty and verifies current same-subject status capability before enabling; no automatic Customer read/change or retry. Explicit current check required after conflicts or ambiguous responses. Accessible 320px controls, no persistence or global animation changes.

## Actual executed checks

- **223 unit tests, 214 overlapping backend checks including 80 embedded SQL checks**, zero failures/skips. Counts overlap, not additive.
- Production build and **26 targeted desktop/mobile browser checks** passed on the corrected source; no unstable-value/prerender diagnostic. Expected SDK warnings came from deliberate invalid-cookie fixtures.
- TypeScript, ESLint, source/test formatting and whitespace passed. After local/native history alignment, all **80 SQL checks passed again**.
- Tests use installed SDK with synthetic fetch, actual React/Chromium (including development StrictMode and Activity), and real embedded PostgreSQL roles/functions with explicit TEST claims/audit hooks. They are not native JWT/OTP or independent-session concurrency proof.
- Historical fixtures keep their pre-feature schema/defaults; the latest full chain separately checks complete module/dependency/permission/grant parity. No prior acceptance assertion was removed to hide drift.

## Review and correction

Initial bounded review `deleg_718703dc` found no authorization bypass but withheld approval: development StrictMode cleanup/replay permanently disabled each fresh status panel. Production-only fixtures missed it. Fix context `deleg_ffc83ce4` reproduced two RED tests and corrected renewal with current status-specific self-capability verification, clearing all old Customer context. No automatic target query was added.

Independent correction review **`deleg_515bf0a4` PASS**, no remaining security/logic findings; 25 focused checks, actual development StrictMode/Activity, types/lint/whitespace passed. Initial unchanged SQL review and later native readback are separate evidence. See `backend-area-8-review.json`.

**Concurrency limit:** trusted administrative writers must acquire affected parent account locks in UUID order BEFORE child DML. BEFORE ROW child triggers can run after a child tuple lock, so arbitrary direct child-first writers may deadlock with parent-first writers/cascades and must abort/roll back. Single-connection cascade/hook tests are not certification of concurrent deadlock freedom. Future privileged writer procedures need this prelock discipline and independent-session acceptance.

## Hosted installation and unchanged account

Reviewed SQL was read in place through the existing configured MCP client and applied once after correction review. Hosted history **`20261029165555_customer_status`** read back; local `supabase/migrations/20261029165555_customer_status.sql` aligned without SQL changes. No new integration/configuration or credentials printed.

Readback: six exact status RPC/helper signatures, stable readiness/volatile read/change, invoker/definer boundaries, empty search paths, authenticated-only execute; two trigger-only functions with no authenticated execute; three enabled guards; integer nonnull revision default0; module/dependency/grants correct and no raw anon/authenticated DML. Native lookup ordered SHARE lock and post-audit projection check confirmed.

Before/after: zero staff memberships, zero verified factors, **one pre-existing pending factor**, zero suspended accounts and zero audits. Every existing status revision remains0. Native authenticated-role calls without a subject correctly deny read/change and readiness without injected claims or data/audit changes. This is unidentified-denial proof, not a privileged native write.

Actual unchanged-Customer login/denial passed: no staff link, lookup/status inputs or result controls; 320px no overflow, 49px logout target. Direct logout cleared app auth cookies to zero; browser signed out. Final Home/Shop/Login HTTP200 and protected lookup no-store/streamed-login/no-private-controls checks passed on the corrected build.

No real Customer suspension/reactivation, role/MFA change, staff creation/promotion or Owner bootstrap for acceptance. No source snapshots/copies/manifests, staging/commit/push/frontend deployment, billing, signup/email/private-support/Owner tools or later area. Preview port3100. Contract: `backend-customer-status-contract.md`.
