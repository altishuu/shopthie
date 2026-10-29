# Area 5 — bounded customer authenticator MFA

Status: implementation authorized, in progress. No staff tooling, signup activation, email setup, payment work, commit/push or deployment.

## Scope and authority

- `/account/security`: optional Customer TOTP enrollment, existing-factor challenge, explicit pending-setup cancellation and verified-factor removal with a current code. Existing staff factors may be challenged, but staff enrollment/removal/tools remain outside this area.
- Provider-native Auth factors/challenge/verify/unenroll using the existing request-scoped server-only SDK and HttpOnly cookies. No browser token SDK, privileged key, new table or replacement MFA implementation.
- AAL1 may access only minimal self security metadata and MFA intrinsics after verified claims + provider user/email + current matching active database membership. Existing identity/profile/address/data guards remain unchanged: enrolled Customers and staff still need AAL2.
- Subject assertions detect stale editors/account switches, never select an owner. Factor IDs must occur in the freshly read self-owned TOTP list. Cancellation only applies to unverified factors. No automatic pending-factor deletion.
- Enrollment only for Customers with no verified factor and no existing pending TOTP setup. Fixed provider friendly name `Shopthie authenticator`; native quotas/error handling remain authoritative.
- Verification must be followed by fresh verified claims/provider/actor/factor read proving AAL2 and target verified. Removal re-verifies a current code for the selected verified factor, rechecks live membership/subject/AAL2 before unenroll, refreshes the session, then reads back absence and downgraded AAL1 when no verified factor remains.
- The current-code removal check is an application UX/service safeguard. Native direct Auth API enforces its own AAL2 policy; do not claim a stronger globally unbypassable recent-code requirement.
- No recovery/reset codes or fallback method invented. No Shopthie recovery/reset UI in this area. Explain backup/lockout risk before enrollment. Unsupported factor types do not become a password-only bypass.

## Provider references checked 2026-10-29

Official Supabase: `/docs/guides/auth/auth-mfa`, `/docs/guides/auth/auth-mfa/totp`, `/docs/reference/javascript/auth-mfa-enroll`, `/docs/reference/javascript/auth-mfa-unenroll`, `/pricing`. Basic MFA is included in Free; no phone/SMS/paid option used. Installed official SDK source confirms challengeAndVerify persists the new session, listFactors calls getUser, and enroll returns SVG with a data URI prefix. Full source URLs will be retained in Area 5 evidence; no credentials in reports.

## UI/service contract

Files under `src/modules/identity/mfa/`. Types below are authoritative integration names:

- `MfaFactor = { id: string; status: 'verified' | 'unverified' }` (TOTP only; no secret metadata).
- `MfaContext = { status: 'ready'; subject: string; role: 'customer' | 'admin' | 'owner'; aal: 'aal1' | 'aal2'; factors: MfaFactor[]; otherVerifiedFactor: boolean }`.
- `MfaPageState = MfaContext | {status:'guest'} | {status:'denied'|'unavailable';message:string}`.
- `MfaEnrollment = {factorId:string;qrCode:string;secret:string}`. Transient sensitive setup result only; never log, persist, put in URLs, analytics, shared cache or previous action state. Render QR as an image, never raw HTML. Setup is unavailable after reload: explicitly cancel the pending factor and begin again.
- `MfaActionResult`: `{status:'success';message:string;context:MfaContext}`, `{status:'enrollment';message:string;context:MfaContext;enrollment:MfaEnrollment}` or `{status:'error';message:string;reloadRequired?:boolean}`. No OTP/token/session/raw provider error in returned state.
- Server `getMfaPageState(): Promise<MfaPageState>`.
- Action `mfaAction(data:FormData):Promise<MfaActionResult>`. Fields `operation` (`enroll|verify|remove|cancel`), `expected_subject` (all), `factor_id` (except enroll), `code` (verify/remove; exactly 6 ASCII digits, no trimming), `acknowledge_backup=yes` (enroll), `confirm_remove=yes` (remove). Reject duplicates/unknown fields rather than silently choose one.
- Client `SecurityManager({initialContext}:{initialContext:MfaContext})` keyed by subject. Disable concurrent submits, erase the code field after reading it, keep secrets out of React action-state round trips, retain setup only in transient local state, block uncertain responses until reload. Result state controls the rendered factor list; never fabricate success. Existing identity layout, reduced-motion/native document flow, 16px mobile inputs and >=44px controls; no new animation loop/listeners.

## Native acceptance safety

Do not silently activate MFA on the user's controlled login. Native activation/removal requires their participation/approval and secure authenticator entry through browser vault or their own browser, never codes/seeds in chat. Read-only inspection and guest/fixture checks can proceed without changing account security. If secure interaction is unavailable, report native acceptance as pending rather than fabricate AAL2 evidence.
