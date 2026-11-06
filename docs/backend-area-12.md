# Area 12 — Owner bootstrap/recovery design and local proof

**Scope: design and synthetic local testing complete and handed off. Feasibility: PARTIAL. Production readiness: NO. Independent bounded correction review: PASS (`deleg_20663be6`).**

## User-approved choices

- One dedicated Owner identity, to be designated later.
- Exactly one initial Owner, not an automatic first-user rule.
- Consider both lost-authenticator recovery for the same identity and replacement of an unavailable Owner account.
- No production implementation/DDL, actual identity or role/status/factor/session operation, credential handling, frontend deployment, commit or push.

## Delivered artifacts

- `backend-owner-bootstrap-contract.md`: scope and stopping rules.
- `backend-owner-bootstrap-design.md`: bootstrap gates, trusted-operator approval/proof, atomic cutover hypothesis, recovery procedure and native acceptance limits.
- `../spikes/012-owner-bootstrap/README.md`: reproducible local experiment and PARTIAL verdict.
- Fixture-only `prototype.sql` / `runner.py`: private Unix-socket PostgreSQL, signed binary verification, exact installed migrations read in place; no hosted connection arguments or provider credentials.
- `test_runner_cleanup.py`: deterministic local lifecycle regressions without starting PostgreSQL.
- `backend-area-12-results.json` and spike `results.json`: actual execution and deferred gates.

## Verified execution

- **43 local assertions passed, 0 failed**, corrected-run complete, local PostgreSQL18.6, signed runtime verified, server stopped. Some assertions explicitly confirm unsafe comparison cases and the limitation below; this is not43 universal security guarantees.
- **5 lifecycle regressions passed** after observed RED→GREEN: startup nonzero, startup timeout, client-cleanup race, data retention when shutdown is unconfirmed, and interruption reporting. An explicit experiment-success flag prevents interrupted runs from reporting completion. Cleanup is armed before startup and the runner never deletes potentially active owned cluster data when shutdown cannot be established.
- **15 existing MFA policy/service checks passed**. These are synthetic/service safety tests, not native recovery or OTP proof.
- Application source, installed migration files and existing tests are unchanged. No production build/browser/motion matrix was repeated for this docs/isolated-fixture slice.

The earlier review ended after a rate limit without a verdict. Its partial startup-cleanup finding was reproduced and corrected. A temporarily absent scratch dependency blocked one attempted rerun before any cluster start; the exact packages were restored and signatures verified, then all43 local assertions passed again. Neither interruption is represented as a security-review PASS.

## Findings and activation blockers

The tested narrow bootstrap/replacement protocol preserves exactly one frozen Owner, rolls back on audit/eligibility/busy/replay failures, denies stale guarded writes after renewing the marker, and preserves fresh Customer operations. The unsafe marker comparisons confirm why an ordinary marker update is insufficient.

**Lost-authenticator recovery is not production-ready:** a synthetic already-open Repeatable Read transaction retained old factor visibility and successfully used the actual private-read RPC after factor deletion, although fresh transactions denied. This is a measured local scenario, not proof of an exposed production exploit. Account replacement's tested locking private-read path serialized on the changed/suspended old actor tuple; that does not certify every old read path.

Keep the deployed freeze intact. Before any production implementation or activation, separately review native target-bound consent/AAL2, attributable operator/audit integration, native provider/locking/timeout behavior, and in-flight transaction/session containment. Do not replace these with test claims, email-only recovery, staff self-unenrollment, invented codes or a permanent public bootstrap endpoint. No account has been designated or activated by this work.

## Stopping point

The bounded independent correction review passed (`deleg_20663be6`), including all five lifecycle regressions, with no remaining findings in the local evidence/lifecycle scope. **Stopped after this approved design/testing area.** This is not production security approval or Owner activation. Follow-on implementation, recovery-control design or live activation requires a separate decision.
