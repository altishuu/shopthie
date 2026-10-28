# Backend implementation progress

Implementation is authorized area-by-area. Email-sender setup, Stripe/payments, public signup activation and the unresolved teen policy remain deferred.

## Area 1 / B1 — complete locally and verified

Implemented:

- Typed module registry: required identity/access/audit, explicit optional dependencies and unknown-module rejection.
- Central Owner/Admin/Customer grants; active membership, MFA, ownership, target restrictions, disabled modules, support-read audit obligations and scoped Admin audit checks. Missing/malformed assurance fails closed, matching SQL.
- Safe optional public configuration and blank `.env.example`: modern publishable keys only, no secret echoing and no public-signup enable override.
- Transactional migration `supabase/migrations/202610280001_authority_foundation.sql`: private authority tables, default-deny RLS, minimal function grants, fixed Customer provisioning, current membership/module/MFA checks and self-only actor-context RPC.
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

Read-only discovery found no Shopthie project in the connected account. The `Personal` organization is on the Free plan and has two active unrelated projects. Supabase's current Free allowance is two active projects (official pricing reference in the blueprint), so a separate active free backend needs an available slot. Do not pause, repurpose or alter another app without a specific user decision. No project creation, pause, upgrade, hosted migration, key retrieval, commits, pushes or deployment occurred.

Select a backend target before live account integration. A new dedicated project is only acceptable if genuinely free; never pause another app or upgrade to make room without a separate user decision.

No Docker/PostgreSQL/Supabase CLI was installed locally; the tests do not claim a full local Supabase stack.

## Later areas — not implemented

- B2: actual Supabase SDK/session integration, controlled account forms, profiles and addresses.
- B3: MFA enrollment/challenge UI, Owner-only staff management and audited support-data operations.
- B4: email delivery, age/teen safeguards, privacy/retention and public-account readiness.

The storefront and local cart/wishlist remain unchanged. No login/signup page or live account backend is claimed by Area 1.
