# Area 2 — identity/session integration

## Status

**Current Area 2 identity/session slice complete under the agreed essential checks; stopped at the user-directed boundary.** A real controlled Supabase user completed login, Customer account rendering, full-reload persistence, logout and post-logout denial. A simultaneous cookie-free request did not inherit the signed-in session. Evidence: `backend-area-2-results.json`. This slice is not completion of the broader B2 roadmap: profiles/addresses/reference data and optional customer MFA UI remain unimplemented. No public-account readiness is claimed.

**User-directed stopping point:** complete Area 2's essential checks and handoff, then stop. Do not start later backend areas without a new explicit request.

## Implemented

- Exact official dependencies: `@supabase/ssr@0.12.7`, `@supabase/supabase-js@2.118.0`, and `server-only`.
- Real password sign-in Server Action; input validation, bounded values, generic errors, a same-app account return-path allowlist, no password in action state/URLs/logs.
- Request-scoped SDK clients, SDK-verified claims plus current provider user/email confirmation, followed by fresh self-only `shopthie_actor_context` RPC. Cookie/session user metadata is never authority.
- No fallback role when membership/authority is missing, malformed, mismatched, unavailable, suspended or MFA-incomplete.
- Server-only HttpOnly, SameSite=Lax, host-only cookies named `shopthie-auth` (SDK chunk suffixes as necessary). Secure is the default; only an explicit validated loopback HTTP `SHOPTHIE_APP_ORIGIN` permits non-Secure cookies for local preview. No browser Supabase client depends on reading these cookies.
- Scoped proxy refresh/no-store headers on auth/account/staff paths, not a global auth provider. Proxy is not the authorization boundary; actual private reads independently validate identity and current authority.
- Local logout, private router-cache invalidation and cleanup limited to Shopthie cookie names, not other apps' sessions.
- `/login`, protected `/account`, stable desktop/mobile Account links, and honest gated `/signup` and `/forgot-password` pages. No signup/recovery placeholder form collects personal information.
- Existing public catalog/cart/wishlist remain demo/frontend behavior. No native signup reopening, email sends, service credentials, hosted schema writes, role promotions, commits or deployment in this slice.

## Essential verification performed

- `npm test`: **110/110** unit tests passed (includes the new identity/cookie/orchestration contract checks).
- `npm run test:backend`: **37/37**, including **16** real embedded-PostgreSQL tests. This overlaps the unit count, not 37 additional unique unit tests. Embedded auth fixtures are not GoTrue verification.
- Production build, lint, types, formatting and whitespace checks passed.
- `node scripts/verify-identity.mjs`: **16/16** desktop/mobile checks passed: labelled form/axe, 320px controls/navigation, guest redirect, malformed and forged-cookie denial, no-store header, generic rejected login, and non-collecting signup/recovery gates.
- The first route-only browser pass still logged SDK `Date.now()` prerender failures. A server-log gate reproduced the failure (RED even with route assertions passing). Explicit `await connection()` **before constructing the SDK** fixed it; final gated run has no prerender-clock failure. Cache Components stays enabled and private rendering remains inside scoped Suspense. Malformed-cookie tests intentionally trigger the SDK's invalid-cookie warning; that is not a successful session.
- Native Auth `/settings` independently confirmed signup and anonymous users disabled, email enabled and confirmation required. See `backend-supabase-setup.md`.
- Independent focused read-only security/logic review **PASS** (`deleg_4bc5af17`): no concrete security concerns, logic errors or suggestions. Saved in `backend-area-2-review.json`. This was source inspection, not hosted-login testing by the reviewer. Subsequent parent live-provider checks are recorded separately below.

## Controlled real-account acceptance — passed

The user created one test identity in the provider dashboard; native counts showed one Auth user and one automatically provisioned application account. The saved login was filled by the secure vault broker, not read into the conversation or stored in the repository.

Actual browser verification passed: verified identity and database Customer role rendered, a full reload retained the session, HttpOnly/SameSite=Lax cookies were inaccessible to page JavaScript, a simultaneous anonymous request redirected without private identity data and with no-store headers, logout removed the application auth cookie, and a later private-route attempt returned to login. The browser was left signed out.

The test email was administratively confirmed; this does NOT prove email delivery. Secure cookies on deployed HTTPS and forced-expiration refresh were not live-tested. No real password, user token or private project credential is included in the evidence file.

MFA enrollment/challenge UI is deferred; accounts requiring MFA remain denied rather than bypassed. Role/status mutations, privacy readiness, sender setup, eligibility policy, provider hook attachment and public registration remain later areas/gates.
