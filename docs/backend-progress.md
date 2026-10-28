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

## Current Area 2 — identity/session slice complete; stopped

Real controlled-account login displayed the verified test identity with the current database Customer role. A full reload retained the session. A simultaneous cookie-free request did not inherit that session or receive private identity data, and its response was no-store. HttpOnly/SameSite=Lax cookies were invisible to page JavaScript. Logout removed the app auth cookie; a subsequent protected-route request returned to login. The browser was left signed out.

Current acceptance: 110 unit tests, 37 backend checks (overlapping unit subset plus 16 embedded PostgreSQL checks), 16 desktop/mobile browser checks, build/static gates, a focused independent source-review PASS, and the separately recorded live-provider checks. No extra app-wide frontend QA cycle was added.

**The user directed stopping after this current login/session area. Work has stopped; no later implementation is implicitly authorized.** This is not completion of the whole B2 roadmap in `backend-blueprint.md`.

## Remaining roadmap — not implemented

- Remaining B2 controlled-account work: profiles, addresses, geography/reference data and optional customer MFA enrollment/challenge UI.
- B3: staff MFA/tooling, Owner-only staff management and audited support-data operations.
- B4: email delivery, age/teen safeguards, privacy/retention and public-account readiness.

Public signup and recovery remain gated. No SMTP sender, provider-hook attachment, payments, new staff privileges, commits, pushes or production deployment were added. The core public storefront and local cart/wishlist behavior remain intact; navigation now includes a stable Account link.
