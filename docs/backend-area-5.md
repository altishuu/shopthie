# Area 5 — authenticator MFA

**Status: bounded implementation handed off with independent source-review PASS. The user chose to keep the controlled account unchanged; live MFA activation acceptance is explicitly deferred and not certified.** Stopped after this area; no later area started.

## Implemented

- `/account/security`: optional Customer TOTP setup with explicit backup/lockout acknowledgment, transient QR/manual key, current-code verification, explicit cancellation of unfinished setup and current-code-confirmed removal.
- Existing staff authenticators may challenge a session, but staff enrollment/removal/tooling remains outside this area.
- Password login routes MFA-required sessions to security regardless of a supplied private return path. Ordinary account/profile/address guards remain unchanged. Security has its own Sign out action so restricted users need not pass through the redirecting account page.
- Request-scoped server-only provider calls with verified claims, current provider user/email, current active database membership and owned factor matching. AAL1 carveout is only for minimal self security metadata and MFA intrinsics, not private application data.
- Successful verify requires fresh AAL2/verified-factor proof. Removal re-verifies the selected factor, rechecks subject/role/AAL2, unenrolls, refreshes cookies and reads back the final factor state/assurance. Native Auth remains authoritative; app current-code removal is not claimed as a global native-API recency policy.
- Uncertain writes never fabricate success or automatically retry. UI blocks until hard reload. No new persistent tables, migration, browser-token client, service key, animation driver or global production listener.
- Codes are erased from the DOM immediately on submit and never returned in state. Setup QR/key are explicit transient enrollment data only, not URLs, logs, localStorage, shared caches or previous action state. QR rendered as encoded SVG image, not raw HTML.
- No Shopthie recovery/reset UI, SMS, public signup or email activation. Enrollment warns about lockout and secure authenticator backup. Provider capabilities are not inferred from older SDK knowledge; unused recovery APIs are not advertised as implemented.

## Essential checks on current candidate

- **167 unit tests**, **125 overlapping backend checks**, including the unchanged **47 embedded SQL tests**. Counts overlap; do not add them. TypeScript, ESLint, formatting, whitespace and production build passed.
- **22 targeted desktop/mobile guest and identity browser checks** passed across identity/address/security and the separate profile-route check. Server prerender diagnostic guard passed for the combined run. Expected SDK invalid-cookie warnings came from explicit negative cookie fixtures; they are not native MFA acceptance.
- Official SSR/Auth SDK exercised with fetch-backed, explicitly synthetic provider/PostgREST fixtures: signin cookie policy, pending setup binding, AAL2 persistence visible to an independent cookie-hydrated client, safe rejected OTP, removal/refresh back to AAL1. These prove adapter/cookie integration, not real OTP cryptography, native JWT trust, provider transitions/quotas or browser cookie delivery after real MFA.
- UI tests exercise actual handlers/JSX with a test React scheduler and a 320px static Chromium layout. Parent added RED→GREEN regressions for direct Sign out and valid downgrade after removing one of multiple factors. App data guards remain tested with injected TEST claims in SQL fixtures.
- Native read-only preflight: exact Shopthie project ACTIVE_HEALTHY, one controlled Auth user/active account, zero verified factors and zero pending factors.
- Real saved-vault Customer login passed against the fresh production preview. Account/security navigation and minimal security context rendered correctly. Backup acknowledgment is required; unchecked setup did not start. No setup QR/key was created or captured. Cookie-free no-store request exposed neither subject nor setup fields and redirected to login.
- Direct Sign out from the security page was exercised after real sign-in: app auth cookies cleared to zero; a subsequent protected security navigation returned to login without controls. Browser left signed out. One harness reset to about:blank was recovered before the check; it was not diagnosed as an app defect.
- Narrow native viewport 320×740 had no horizontal overflow; acknowledgment target ~87px high and setup action 49px. Desktop security context also rendered without overflow. This is emulated browser evidence, not a real-device or full motion/retention matrix. The preexisting intro was dismissed through its Skip intro control before visual inspection.

## Review and explicitly deferred native acceptance

- Focused independent source review **PASS**, no security concerns or logic errors (`backend-area-5-review.json`, `deleg_fa3681c9`); reviewer independently ran the 31 focused MFA tests. One nonblocking suggestion—an extra synthetic cookie-write failure injection test—was deferred under the essential-only scope; no broader QA/review loop was added.
- **Deferred by explicit user decision:** native authenticator enrollment, real code/AAL2 verification, password-only re-login/challenge and removal/refresh. The user selected “Keep the account unchanged; hand off with live MFA verification pending.” Do not initiate enrollment or request codes to complete this area. These flows remain uncertified against native Auth; synthetic fixture evidence is not a substitute.
- Do not silently enable MFA on the controlled account or claim the synthetic SDK fixture as native proof. If the user declines a security change, retain this explicit acceptance limitation.

## Boundaries

Existing controlled account remains unmodified by enrollment/removal work so far. No new Auth settings, data migration, staff role, privileged dashboard, public signup, SMTP, payments, commit, push or deployment. Vercel production public configuration from Area 4 remains separate from deployment. Local production preview was restarted for this candidate on port 3100.

Provider references checked 2026-10-29: official Supabase MFA/TOTP/enroll/unenroll documentation and pricing, plus installed official SDK source. Basic TOTP only; no paid service adopted. See `backend-mfa-contract.md` for the precise boundary.
