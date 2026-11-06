# Area 13 — first-Owner setup implementation

**Status: implementation handed off; independent correction re-review PASS. Not installed, activated or deployed.**

## Delivered

- `/account/owner-setup`: protected self-only setup, optional challenge of an already enrolled authenticator, explicit unchecked consent and opaque intent/UTC expiry. Consent does **not** activate Owner access. No automatic consent, activation or mutation retry.
- Request-local server actions use current official self-MFA context. Forms cannot select another actor, factor, session, proof time or desired role. Strict shared wire decoding preserves canonical six-fractional-digit timestamps; malformed/foreign/uncertain results disclose no intent or provider diagnostics.
- Lifecycle cleanup clears transient inputs, confirmation, intent and pending responses. Installed React production/development StrictMode and Activity tests cover restoration and late work; scoped 320px/desktop controls remain usable. Shared motion architecture is unchanged.
- Candidate `20261106020000_owner_bootstrap.sql`: closed by default, no designated identity, narrowly enabled `owner_setup` and Customer-only audited self-request permission. Trusted database operator designation and separate exact-bound one-time activation; no application API grants ownership.
- Native-backed SQL proof uses current UID, current AAL2 session, current verified TOTP, recent integer AMR and bounded token/session/proof expiry. Mandatory audits and native row locks, durable consumed tombstone, exact restored freeze guards and marker storage renewal. Ordinary fresh Customer operations remain supported.

## Verification

| Check | Verified result |
| --- | --- |
| Application unit suite | 289 passed, 0 failed |
| Historical SQL fixtures | 131 passed, 0 failed; explicitly pinned to earlier areas |
| Corrected candidate SQL suite | 55 passed, 0 failed; complete unfiltered latest registry/grant parity |
| Runner lifecycle | 5 passed |
| Final corrected-source independent sessions | 31 passed, complete=true/serverStopped=true; exact ten-migration chain |
| Final independent correction review | PASS, no outstanding findings;28 focused correction tests passed (overlap candidate55) |
| Static gates | Project lint/typecheck and affected formatting passed after correction |
| Production application build | Passed; includes new protected route; application source unchanged by later SQL-only correction |
| Built guest routing | Desktop/mobile redirect to login, private no-store, no private controls, no overflow/runtime errors |
| Positive UI/action tests | Fictional DTO/SDK fixtures; not native JWT/TOTP acceptance |

Initial independent review found NULL function configuration could bypass a required metadata rejection. Tests-first correction makes required matches NULL-safe and retains exact guard/wrapper configuration checks. A bounded harmless fixture also demonstrated why private-schema ownership alone is insufficient; effective untrusted CREATE now rejects at installation/runtime, including PUBLIC and inherited roles. Rejections preserve membership, intent/control, audits, marker and trigger state. Final independent correction re-review `deleg_9b1c5470` passed with no outstanding findings. Original failed review is retained under priorReviews in `backend-area-13-review.json`, not silently relabeled as approval.

The correction worker's final report was unavailable after its edits had landed. Parent inspected those files and independently ran the entire corrected55-test SQL suite, project lint/typecheck and affected formatting successfully; no worker completion claim substitutes for execution or final review.

## Boundaries and next gate

No hosted migration, real designation/promotion, account/status/MFA/session change, provider Auth DDL, signup/email configuration, payment, source commit/push or frontend deployment was performed. User-staged Area12 work/index is preserved. Existing hosted freeze remains the baseline; this work does not activate its local bootstrap candidate.

Local independent sessions use authenticated executable packages, PostgreSQL18.6 and synthetic provider-shaped Auth/session data/claims under a non-superuser BYPASSRLS app owner. Hosted catalog17.11 and native JWT/OTP/GoTrue behavior are separate evidence; positive native acceptance remains deferred. Recovery, Owner replacement, staff management and universal immediate lost-factor revocation are not implemented here.

Implementation is handed off; work stops here before hosted installation. Hosted installation requires separate approval; selecting/activating a dedicated real Owner requires separate authorization and secure participation. Installing the candidate would itself select nobody and grant no Owner role. Review acceptance applies to implementation source, not public-launch readiness or native activation.

See `backend-owner-bootstrap-implementation-contract.md`, `backend-owner-bootstrap-database.md`, `backend-area-13-results.json` and `backend-area-13-browser-results.json`.
