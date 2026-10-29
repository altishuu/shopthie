# Backend implementation progress

Implementation is authorized area-by-area. Email-sender setup, Stripe/payments, public signup activation and the unresolved teen policy remain deferred.

## Area 1 / B1 — complete; local checks and hosted schema readback verified

Implemented:

- Typed module registry: required identity/access/audit, explicit optional dependencies and unknown-module rejection.
- Central Owner/Admin/Customer grants; active membership, MFA, ownership, target restrictions, disabled modules, support-read audit obligations and scoped Admin audit checks. Missing/malformed assurance fails closed, matching SQL.
- Safe optional public configuration and blank `.env.example`: modern publishable keys only, no secret echoing and no public-signup enable override.
- Transactional migration `supabase/migrations/20261028145618_authority_foundation.sql`: private authority tables, default-deny RLS, minimal function grants, fixed Customer provisioning, current membership/module/MFA checks and self-only actor-context RPC.
- Always-rejecting registration-hook function. Installing it is NOT provider-hook attachment; no live signup protection is claimed until provider configuration is applied and tested.
- `test:backend` and dev-only PGlite for actual isolated embedded PostgreSQL execution.

Parent verification on the integrated source:

- `npm run test:backend`: **25 passed**, no failures/skips.
- `npm test`: **98 passed**, no failures/skips. This suite overlaps the TypeScript subset of the backend command; counts are not additive.
- Production build, lint (no warnings), TypeScript, formatting and whitespace checks pass.
- Earlier same-area Home/Shop/Pixel preview HTTP checks returned 200; no storefront components or routes were changed.

Focused read-only security review passed (`deleg_3c38b858`): no concrete security or logic defects found within the bounded B1 scope. The reviewer did not run tests or verify hosted/provider behavior. Parent executed the checks above; see `backend-area-1-review.json`.

### What those checks do NOT prove

PGlite executes real PostgreSQL SQL/roles/RLS. The minimal Supabase auth schema and injected claims are explicitly TEST fixtures, not GoTrue integration, JWT verification, real MFA enrollment or live email delivery. See `backend-database-foundation.md` for exact contracts and limitations.

Authority/audit storage and capability checks are not customer-data CRUD, real audited support views or staff-management mutations. Owner bootstrap/transfer/last-owner safeguards are later work, not silently completed by this migration.

## Hosted state and next prerequisite

The user authorized pausing `neomessage`; project `zpyplkyoodizqvpjoegg` was read back as INACTIVE. A dedicated `shopthie` project (`sjqpfsjgfzmcsshkdrmc`) was created in Personal/Singapore on the quoted $0/month Free plan and read back ACTIVE_HEALTHY. A real SELECT 1 succeeded. The reviewed authority migration was applied and its roles, module defaults, RLS, grants, trigger and history entry were read back. See `backend-supabase-setup.md`. No other existing project, billing plan, email sender, payment integration, commit, push or frontend deployment was changed.

The user saved native Auth settings in their dashboard. The real project `/settings` API independently confirmed public signup/anonymous users OFF and email/confirmation ON. Area 2 identity/session integration is now implemented and verified with a real controlled Supabase user; see `backend-area-2.md` and `backend-area-2-results.json`. The modern public key is in the ignored local environment only; no service key or management token was retrieved. Provider hook attachment remains pending, not claimed as protection.

No Docker/PostgreSQL/Supabase CLI was installed locally; the tests do not claim a full local Supabase stack.

## Area 2 — identity/session slice complete; earlier stopping point

Real controlled-account login displayed the verified test identity with the current database Customer role. A full reload retained the session. A simultaneous cookie-free request did not inherit that session or receive private identity data, and its response was no-store. HttpOnly/SameSite=Lax cookies were invisible to page JavaScript. Logout removed the app auth cookie; a subsequent protected-route request returned to login. The browser was left signed out.

Current acceptance: 110 unit tests, 37 backend checks (overlapping unit subset plus 16 embedded PostgreSQL checks), 16 desktop/mobile browser checks, build/static gates, a focused independent source-review PASS, and the separately recorded live-provider checks. No extra app-wide frontend QA cycle was added.

At its handoff the user-directed Area 2 stop was honored. The subsequent explicit authorization below reopened only one next profiles area; it did not authorize the entire B2 roadmap in `backend-blueprint.md`.

## Area 3 — customer profiles complete; stopped

After the Area 2 handoff, the user explicitly authorized one next bounded area and stopping afterward. The selected scope is customer-owned username/optional-phone profiles only, with no age collection. See `backend-profile-contract.md` and `backend-area-3.md`.

Implemented and accepted: self-only profile UI/services/RPCs, unique username, optional unverified phone/clearing, strict inputs/DTOs, current authority guards, revision conflicts and stale-editor identity assertions. Integrated acceptance: **119 unit tests, 60 overlapping backend checks including 30 real embedded SQL tests, 18 targeted desktop/mobile browser checks**, build/static gates and focused independent review PASS. Hosted migration `20261028181746_profiles` applied/read back; only optional profiles enabled. Real controlled-account save/reload/edit/phone-clear/conflict/draft/isolation/logout checks and desktop/mobile layout inspection passed. One synthetic profile remains, phone cleared; browser signed out. See `backend-area-3-results.json` for evidence and limits.

**Stopped after Area 3 as requested. No subsequent area is implicitly authorized.**

## Area 4 — saved addresses and geography complete; stopped

The user explicitly authorized the next bounded area after the Area 3 stop. Scope is the self-owned address book plus its geography reference—not MFA, staff, public signup or commerce. See `backend-address-contract.md` and `backend-area-4.md`.

Accepted: own address CRUD/default handling, cap 10, global revision/stale-editor protection, country/subdivision reference and manual fallback. **136 unit tests, 94 overlapping backend checks including 47 embedded SQL tests, 20 targeted desktop/mobile browser checks**, production build/static gates and focused source review PASS. Hosted `20261029031614_addresses` history/schema/permissions/reference fingerprint read back. Real controlled-account create/reload/edit/default/clear/delete/conflict/draft/isolation/logout and narrow mobile save passed. Synthetic addresses removed; retained book revision 6; browser signed out. See `backend-area-4-results.json`.

Separately authorized Vercel production public Supabase variables were saved and individually verified, without redeployment or uploading uncommitted code. See `backend-vercel-setup.md`. **At the Area 4 handoff, work stopped after addresses. The user subsequently authorized Area 5 below.**

## Area 5 — customer authenticator MFA implementation handed off; native activation verification deferred

The user explicitly authorized the next bounded area. Implemented self TOTP enrollment/challenge, pending cancellation and current-code removal under existing identity guards, plus private account-security UI and MFA-required login routing. No new SQL schema or provider configuration required. **167 unit tests, 125 overlapping backend checks including 47 embedded SQL tests, 22 targeted desktop/mobile browser checks**, production build and static gates passed. Official SDK cookie/session transitions are tested with explicitly synthetic provider fixtures, not claimed as native OTP/JWT acceptance.

Native read-only checks: real saved-vault login, account/security navigation, required backup acknowledgment, no unchecked setup mutation, cookie-free no-store isolation and narrow-mobile reachability passed. Hosted readback still has **zero verified and zero pending factors**. No native MFA activation/removal has been performed. The user explicitly chose to keep the controlled login unchanged and hand off with live MFA verification pending; do not initiate enrollment to close this area. Focused independent source review PASS, no blocking findings (`backend-area-5-review.json`). **Bounded implementation handed off; stopped after Area 5. Native activation/removal remains explicitly uncertified.** See `backend-area-5.md`, `backend-area-5-results.json` and `backend-mfa-contract.md`.

At the Area 5 handoff no staff work had started. The user subsequently authorized Area 6 below; signup, SMTP, commits, pushes and deployment remain untouched.

## Area 6 — staff authenticator readiness and protected entry handed off; native privileged verification deferred

The user explicitly authorized this next bounded area. Active Owner/Admin can set up/challenge their own TOTP; shared application and native SQL authority both require AAL2 plus a current verified TOTP. `/admin` exposes only self role/readiness, not customer data, role management or an operational dashboard. `staff.enter` is identity-only; staff/support tools remain disabled.

Initial independent review found a cancellation/verification race and acceptance of empty factor_type in mixed evidence. Both corrected with observed RED→GREEN regressions; the safe scope deliberately excludes **all staff unenrollment, including pending cancellation/restart**, rather than relying on another non-atomic check. Customer Area 5 behavior unchanged. Independent targeted re-review `deleg_bfd708a7` PASS, no remaining findings.

**185 unit tests, 148 overlapping backend checks including 52 embedded SQL tests, 24 targeted desktop/mobile browser checks**, build/types/lint/format/whitespace passed. After native history alignment, all 52 SQL checks passed again. Native Customer denial/no staff link/no private role output, cookie-free no-store isolation, mobile reachability and logout passed. These do not prove native staff OTP/JWT behavior.

Hosted migration **`20261029113028_staff_entry`** applied once and read back: self-only zero-argument RPC, invoker/definer boundary, empty search paths, authenticated-only execution, no raw private-table access, Owner/Admin-only identity capability, live TOTP condition installed. Zero staff memberships, zero verified and **one pre-existing pending factor** remain unchanged. Browser left signed out; no real MFA enrollment/removal, role promotion, Owner bootstrap, source commit/push or frontend deployment. See `backend-area-6.md`, `backend-area-6-results.json`, `backend-area-6-review.json` and `backend-staff-entry-database.md`.

**At the Area 6 handoff work stopped. The user subsequently authorized Area 7 below. Native Customer activation/removal and privileged staff MFA acceptance remain deferred, not inferred from fixtures.**

## Area 7 — audited exact Customer lookup handed off; privileged native acceptance deferred

The user explicitly authorized the next bounded area. Active Owner/Admin with AAL2 and current verified TOTP can submit an exact username and fixed reason to `/admin/customers`. Only Customer ID/username/status or no-match can return; staff targets excluded. Read and minimal audit insert are one native operation; audit failure returns no DTO. No email/phone/address, listing/export, account status mutation, staff management, private support or audit-list UI.

Only dedicated `customer_lookup` module enabled (profiles/access/audit dependencies); existing Owner/Admin capability grants preserved and `customer.lookup` remapped to it. Broader staff/support modules remain disabled. Native readiness gates the form/link; no private client caches, automatic lookups or stale-result retention. Independent read-only source review `deleg_3a9c53f3` PASS with no blocking findings; optional permanent enum-fixture suggestion recorded, not a release blocker.

**203 unit tests, 181 overlapping backend checks including 67 SQL checks, 26 targeted desktop/mobile browser checks**, build/types/lint/format/whitespace passed. Historical foundation fixture expectations remain pre-lookup; added full-current registry/SQL parity instead of weakening checks. All 67 SQL checks passed again after hosted history alignment.

Hosted **`20261029121812_customer_lookup`** applied once and read back: four exact RPC/helper signatures, invoker/definer boundaries, fixed empty search paths, stable readiness/volatile audited lookup, authenticated-only execute, Owner/Admin grants, no raw private table client DML, dedicated module only. Native unidentified-role calls fail without injected claims or audit rows. Real unchanged-Customer denial/no form/no DTO, cookie-free no-store, 320px reachability and logout/zero cookies passed. Privileged source/SQL/UI fixture results are not native staff acceptance.

Post-apply native counts unchanged: zero staff memberships, zero verified, one pre-existing pending factor and zero audits. No account role/MFA changes or Owner bootstrap. Browser left signed out. No staging/commit/push, paid service, signup/email activation, frontend deployment or later area. See `backend-area-7.md`, `backend-area-7-results.json`, `backend-area-7-review.json` and `backend-customer-lookup-database.md`.

**Stopped after Area 7. Privileged native lookup/MFA acceptance remains deferred; no next area is implicitly authorized.**

## Remaining roadmap — not accepted / not implemented

- Remaining B2 acceptance: native customer MFA enrollment/challenge/removal with secure user participation; implementation candidate exists but this acceptance is not yet claimed. Profiles and addresses remain accepted within their bounded contracts; public launch remains gated.
- Remaining B3: native privileged lookup/MFA acceptance, staff pending-setup cleanup/recovery, Owner bootstrap/transfer/last-owner safeguards, staff management, customer-status changes and audited private support-data tools. Minimal self-entry and exact audited metadata lookup exist; those broader capabilities do not.
- B4: email delivery, age/teen safeguards, privacy/retention and public-account readiness.

Public signup and recovery remain gated. No SMTP sender, provider-hook attachment, payments, account role promotion, account-management/private-support tools, commits, pushes or production frontend deployment were added. The core public storefront and local cart/wishlist behavior remain intact; navigation now includes a stable Account link.
