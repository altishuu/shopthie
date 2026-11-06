# Area 12 — isolated Owner bootstrap/replacement experiment

**NON-DEPLOYABLE, SYNTHETIC FIXTURE ONLY.** Do not paste `prototype.sql` into Supabase or promote a real account with it. The deployed Area11 freeze stays unchanged. No production migration, public endpoint, actual Owner identity, account/factor/session change, or activation is delivered here.

## Question and approach

| Given                                                              | When                                                                      | Observable expectation                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| The exact nine installed migrations and zero frozen Owners         | A synthetic trusted operator performs an approved, target-bound bootstrap | Exactly one frozen Owner, consumed fixture approval and transactional test audit; replay/invalid eligibility/audit failure abort. |
| A sole old Owner and a distinct eligible replacement               | The same bounded protocol replaces ownership                              | Old application account demoted and suspended, replacement sole Owner, guards restored; failures roll back.                       |
| Old Repeatable Read/Serializable snapshots or queued/busy sessions | The private marker is renewed transactionally                             | Stale guarded writes deny; busy cutover aborts; fresh Customer RPCs continue at all three isolation levels.                       |
| Synthetic old AAL2 but lost current TOTP                           | Fresh and already-open transactions read permissions/private data         | Fresh staff checks deny; explicitly measure any in-flight snapshot limitation instead of claiming instant revocation.             |

`runner.py` creates a private local PostgreSQL18.6 cluster, verifies the existing signed packages and runtime files before execution, reads application migrations in place, and uses non-superuser BYPASSRLS `fixture_owner` plus a narrowly granted synthetic operator. It accepts **no arguments, host, URL or credentials**; libpq connection settings are explicitly local and inherited provider connection variables are excluded. Synthetic Auth tables/claims are not native JWT, OTP or recovery evidence.

## Run

```bash
python spikes/012-owner-bootstrap/runner.py
```

This environment-specific runner needs Python3.12+ and the signed local PostgreSQL package installation under the Hermes scratch directory. It does not download packages or connect to hosted Supabase. Missing packages, signatures or migration-chain mismatch fail rather than switch connection targets. Cleanup is armed before startup, including a nonzero exit or timeout; an independent stop/status check must succeed before the runner removes its own temporary cluster directory. If shutdown is unconfirmed, the runner retains that directory and reports its location instead of deleting possibly active data.

```bash
python -B spikes/012-owner-bootstrap/test_runner_cleanup.py
```

Five subprocess-mocked lifecycle regressions pass: startup failure, startup timeout, client-cleanup race, retention on unconfirmed shutdown, and interruption during experiment execution. They do not start PostgreSQL. Each new regression was observed failing before its correction. An interrupted experiment is explicitly recorded as incomplete, even if server shutdown succeeds; interruption is re-raised, not swallowed.

## Actual result

Parent rerun completed with **43 passed, 0 failed, complete=true, serverStopped=true**, local version18.6. `results.json` enumerates all43 assertions; this is not43 independent production-security guarantees. Some assertions intentionally confirm unsafe comparison cases and the recovery limitation below. Another15 existing application MFA policy/service tests passed separately; those are not native recovery tests.

### What worked

- Zero-to-one bootstrap, exact sole-Owner replacement, target/proof bindings, missing/invalid eligibility and replay rejection.
- Mandatory fixture-audit failure rolls back memberships/status/revision, marker storage, consumed approval and ALWAYS trigger modes.
- Busy account/membership/marker NOWAIT denial; queued READ COMMITTED writer denial.
- Marker TRUNCATE/reinsert preserves its relation identity but renews storage: tested old RR/Serializable guarded writes deny after bootstrap/replacement. Fresh actual Customer status RPCs pass all three isolation levels, and stale Customer sessions roll back/retry successfully.
- Fresh factor-loss checks deny synthetic stale AAL2 when no current verified TOTP exists. The tested replacement private-read path rejects the old Owner through parent-row serialization, followed by fresh authorization denial.

### What did not work / surprises

- Reusing the marker, and ordinary DELETE/reinsert of it, each allowed the corresponding stale-snapshot Owner status mutation in the deliberately unsafe local comparison. Those test transactions were rolled back. Neither comparison is an approved strategy.
- **MFA loss is not globally safe for in-flight snapshots:** an already-open RR transaction retained old factor visibility and successfully used the actual profile-support private-read RPC after synthetic factor deletion. The test rolled back; no real private data was accessed. Fresh requests denied. Marker renewal for membership changes does not establish universal factor/session revocation.
- Plain stable permission/context reads can retain old authority after replacement. The one tested locking private-read RPC failed on the changed/suspended actor tuple; this does not certify every read path or isolation interleaving.

## Verdict: PARTIAL

The narrow local atomic Owner-set transition hypothesis is supported. **Production implementation and MFA recovery remain blocked** on native target-bound consent/AAL2 proof, attributable operator approval, actual provider behavior and an explicitly reviewed in-flight transaction/session containment procedure.

### Non-production shortcuts that remain

- TEST-admin injected Auth claims and fixture approvals stand in for real identity, consent and recent-authentication evidence; they are not a JWT verifier.
- The separate `fixture_cutover.transition_audit` tests transactional recording, not integration with the installed application's audit event schema/viewer or provider audit logs.
- The prototype locks the entire synthetic MFA table, and its Auth-row/approval locks are not a validated nonblocking native protocol. Python process timeouts are not a substitute for future SQL lock/statement timeouts. Per-transition production catalog/ACL revalidation and native race handling remain requirements, not completed checks.
- Its privileged fixture function and deliberate unsafe comparator modes must not become a production RPC or executable migration. They exist only inside the isolated experiment.
- Hosted PostgreSQL17.11 is the last recorded Area11 version, not an engine contacted by this runner. Local18.6 is not identical-engine hosted concurrency or provider acceptance.

### Recommendation for a real implementation

Keep the deployed freeze intact. Separately review native proof/consent and in-flight recovery containment first; then prepare a new narrowly scoped production design and independent review. Obtain explicit approval for any implementation, identity preparation, schema change or real activation. Never repair the recovery gap by silently dropping the verified-TOTP rule, enabling email-only takeover, or implementing staff self-unenrollment.
