# Area 12 — first-Owner bootstrap and recovery design/testing only

## User choices and boundary

The user selected a dedicated Owner identity to be designated later, exactly one initial Owner, and designs for both lost-authenticator recovery and Owner-account replacement. This authorizes design and synthetic local testing only: **no hosted migration, account creation/promotion/status change, factor/session change, credential retrieval, production UI/API, deployment or Git mutation**. Keep the installed Area11 Owner freeze unchanged. No target identity, email, password, factor secret, OTP, credential or real login identifier belongs in the proposal or tests. Free only; inspect existing source in place without snapshots/copies/archives/manifests.

## Proposed operator-only rules

- A normal app account, an Admin, metadata or an email-recovery response must never authorize Owner creation/replacement. No public first-user shortcut or permanent public bootstrap RPC.
- Future activation needs separate explicit approval, a trusted project operator, an exact dedicated identity, an active confirmed-email account, current verified TOTP and target-bound fresh AAL2 proof. Local injected claims are not that native proof. No actor/assurance string supplied by an untrusted caller counts as verification.
- Initial bootstrap must require zero current Owners, select exactly one eligible Customer, and leave the freeze enforcing that one Owner. Retry/replay must not add a second Owner.
- Account replacement must require the exact sole old Owner and a different eligible dedicated replacement. Old application access must be revoked atomically; no external visibility of an unfrozen or two-Owner intermediate state. Keep a minimal transactional audit without contact data or secrets; native provider session/JWT invalidation is a separate step, not an atomic PostgreSQL promise.
- Reusing Area11's old marker after changing the Owner set is not acceptable: an older snapshot can retain pre-transition membership. Prove a renewed snapshot barrier and fail-closed old-transaction behavior with genuine independent local sessions. Fresh Customer operations must continue after retry.
- Lost-authenticator recovery is a reviewed operator runbook, not staff self-unenrollment, an email-only bypass or invented recovery codes. Preserve mandatory current-factor/AAL2 authorization throughout. Verify official provider behavior but do not execute it; separate provider session handling from database role transitions and identify in-flight/stale-JWT limitations.

## Bounded feasibility questions

| Case                           | Given / when / expected result                                                                                                                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap and replacement      | Given the installed freeze and a synthetic eligible target, an operator-only atomic transition yields exactly one frozen Owner; missing eligibility, existing Owner, wrong expected target, replay and audit failure fail closed.                                             |
| Cutover and ordinary operation | Given old Repeatable Read/Serializable snapshots, queued writers and a busy guard/marker, cutover fails atomically or old writes deny; rollback/fresh Customer retry works without a blanket Customer freeze.                                                                 |
| Authenticator loss             | Given synthetic old AAL2 evidence but no current verified TOTP, new privileged checks deny; the same account needs renewed native MFA before privileged access, while account replacement requires the separately tested cutover. Native recovery itself remains unperformed. |

## Deliverables and stop gate

A proposal/runbook under docs, a clearly fixture-only reproducible local proof under spikes/012-owner-bootstrap, exact observed results and a bounded independent review. Do not add executable production migrations or weaken deployed guards. Use existing signature-verified local PostgreSQL packages/private Unix sockets; no hosted connection option in the fixture runner. Record local/hosted versions, synthetic Auth/claims, source/current-scope limits, failed hypotheses and deferred native acceptance explicitly. Keep testing focused; no unchanged storefront/motion/browser reruns or simultaneous duplicate heavy suites. Stop after this design/testing area and request separate approval before any production implementation or activation.
