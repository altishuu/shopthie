# Area 6 — staff MFA and protected entry contract

Status: implemented and handed off after the Area 5 authorization. Hosted staff-entry authority installed/read back; native privileged MFA acceptance deferred. Staff authenticator readiness and protected self-only `/admin` entry only; stopped afterward.

## Scope and boundaries

- Extend self TOTP setup/verification to current active, confirmed Owner/Admin identities. **No staff unenrollment operation is enabled, including pending cancellation.** Native Auth does not provide a proved atomic unverified-only delete; check-then-unenroll could delete a concurrently verified factor. Staff pending cancellation/restart is deferred rather than weakening the no-verified-removal boundary. Customer behavior remains unchanged; no recovery/reset bypass.
- Staff data access requires BOTH a verified AAL2 session AND a currently verified TOTP factor. An old AAL2 token after the last authenticator is removed is not sufficient. Enforce in the shared application identity/permission guards and database capability helper, not only the UI.
- Customer MFA behavior remains optional and unchanged. User-editable metadata is never role/enrollment authority. Missing/malformed assurance and live factor evidence fail closed.
- `/admin` shows only the signed-in staff user's own readiness/role. No customer directory, private support reads, suspension, role assignment, audit listing, Owner bootstrap/transfer or last-owner management is implemented.
- `staff.enter` is a minimal **identity-module** self-session permission granted explicitly to Owner/Admin only. This allows a staff authentication entry page without enabling the optional staff/support tool modules or their capabilities. These modules stay disabled.
- SQL RPC `public.shopthie_staff_entry()` (zero arguments), invoker wrapper over narrowly granted fixed-search-path private definer helper: return only `{user_id, role}` for the current active Owner/Admin who satisfies `staff.enter`, AAL2 and live verified TOTP checks. No caller-supplied owner/target selector or client raw-table access.
- Preserve existing `shopthie_actor_context()` shape; do not alter old deployed migrations. Add one new reviewed migration; keep all existing module/grant/default-deny behavior except explicit staff-entry grant and stricter staff MFA gate.
- Application `ProviderUser` may include authoritative fresh `getUser().factors`; a shared strict `hasVerifiedTotpFactor(unknown): boolean` verifies current TOTP evidence for staff. Customer enrollment remains proven by the existing current actor RPC. Staff actors expose truthful `hasVerifiedMfa=true` only when current verified TOTP is present. SQL independently rechecks native Auth factor rows.

## Staff service/UI contract

Parent owns `src/modules/staff/{types,service,server}.ts`:

- `StaffEntry = {subject:string;role:'owner'|'admin'}`.
- `StaffPageState = {status:'ready';entry:StaffEntry} | {status:'guest'} | {status:'mfa_required'} | {status:'denied'|'unavailable';message:string}`.
- `getStaffPageState(): Promise<StaffPageState>` verifies current ordinary identity, requires trusted Owner/Admin + AAL2 + verified authenticator, calls the self RPC and strictly decodes exactly one matching minimal row. Never infer access from a frontend role label. No shared cache.
- `src/app/(staff)/admin/page.tsx`: noindex, request-scoped Suspense and existing IdentityShell/RouteMotionReady. Guests -> `/login`; MFA-required -> `/account/security`; Customer/unsupported states denied with no staff controls; ready shows self role and a clear statement that staff tools are not enabled. Direct Sign out and own-account/security links; no fake dashboard statistics or customer data.
- Account navigation includes `/admin` only for currently active trusted staff. Keep safe login return paths internal and unchanged; no need to add arbitrary admin redirects.
- Existing security manager must now allow Owner/Admin enrollment when there is no factor, pending verification, but not cancellation/unenrollment. Preserve explicit backup acknowledgment, secret/code handling, subject guards, uncertainty locking and >44px/16px responsive controls. Continue to forbid staff verified-factor removal. Explain staff MFA requirement instead of saying staff setup is unavailable.
- New protected route is already covered by `/admin/:path*` proxy matcher. Retain private no-store responses and do not put auth work into public storefront rendering.

## Native safety and evidence

The user explicitly chose to keep the controlled login's MFA unchanged. Do NOT enroll/verify/unenroll, promote that Customer, create staff users or bootstrap Owner for acceptance. Test privileged paths using clearly labeled SQL/SDK/UI fixtures; real Guest/Customer denial and hosted schema/ACL readback are appropriate native checks. Native privileged staff/TOTP acceptance remains unverified and must be stated, not inferred from fixtures.

Preflight on 2026-10-29: native auth.mfa_factors columns id/user_id uuid, factor_type and status native enums. Zero verified factors, **one pre-existing unfinished setup**, zero Owner/Admin memberships. Preserve the existing setup; do not silently clean it up. Prior Area 5 evidence of zero factors is historical, not current state.

Working tree initially contains user-staged Area 5 changes. Preserve the index, staged source and user work; do not stash/reset/stage/commit/push. No source copies/snapshots/manifests/archives; reviews in place. No paid services, signup, SMTP, commerce or frontend deployment.
