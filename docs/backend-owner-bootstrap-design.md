# Area 12 — first-Owner bootstrap and recovery proposal

**Status: design and synthetic local validation only; not deployable and not activated.** User selected one dedicated Owner identity, designated later, exactly one initial Owner, and coverage of lost-authenticator recovery plus Owner-account replacement. Installed Area11 SQL, production account roles/statuses/factors, public signup settings and frontend stay unchanged. See `backend-owner-bootstrap-contract.md`.

## 1. Bootstrap gates

1. Identify the exact Shopthie project and separately approve the specific operation and dedicated Auth subject. No account is selected in this document. Do not infer an Owner from registration order, email domain, username, editable metadata or possession of a recovery email.
2. Prepare the dedicated identity through an approved provider flow with real email confirmation. Public signup is still closed and sender/recovery delivery is not accepted; do not silently set an administrative email-confirmed flag to evade that prerequisite.
3. The target must be an active current Customer with a confirmed email, current verified TOTP and fresh target-bound AAL2 proof. Future native integration must validate provider identity/claims and current factor evidence through the official request-scoped SDK/provider path. Typed assurance fields or test JWT claims are not a production proof. Require explicit target consent and operation binding, short validity and single use; replay after success must fail.
4. The initial procedure requires exactly zero Owners and establishes exactly one. If any Owner already exists, abort rather than overwrite, add another or turn bootstrap into an unrestricted transfer tool.
5. Execution is trusted-project-operator-only, outside normal app permissions, with separate approval and attributable protected operational evidence. No browser/service key, public bootstrap RPC, application Admin shortcut or permanent bypass token. A proposed SQL audit with null app actor must be understood as an operator event, not fabricated attribution to an app user; the approving operator needs separate protected evidence.

## 2. Candidate atomic database transition

The prototype evaluates this hypothesis; it is **not production authorization**:

- Explicit short READ COMMITTED transaction and bounded lock/statement timeouts. Acquire access-exclusive NOWAIT locks on application accounts, memberships and the existing cutover marker. Abort if busy; do not retry an ambiguous write automatically. Lock/check exact relevant Auth/factor rows without waiting on conflicting provider work where necessary; provider race integration still requires native review.
- Verify the actual table/schema/guard owners, effective ACL/role memberships, definer RLS visibility, four ALWAYS guards, marker shape and exact current Owner/target state. Never use a table-owner session as evidence that an ordinary caller could run this.
- While the whole-table cutover locks exclude application writers, temporarily disable only the membership freeze guard; perform the exact operator-authorized transition; record minimal mandatory transactional audit; restore ENABLE ALWAYS before commit. Account/revision/provisioning and other existing protections stay intact. A prototype-only function must not become a client-executable SECURITY DEFINER bypass.
- Reusing the old marker can let a pre-transition snapshot see the target's former Customer membership. A normal DELETE/INSERT is also not assumed to revoke old row versions. The experiment compares that unsafe case against transactional TRUNCATE of the private marker followed by reinsertion. PostgreSQL documents that TRUNCATE makes the table empty to older snapshots; a transaction that already touched it holds a conflicting lock. This property is being evaluated as a renewed snapshot barrier, not as general data-deletion advice. Never truncate account/membership tables.
- Any failed eligibility check, missing audit, stale expected Owner, duplicate request, busy lock or simulated failure must roll back memberships, account revisions/status, marker and trigger mode together. After success, the fixed new Owner set remains frozen. Stale guarded writes must abort; a fresh ordinary Customer transaction must remain usable.

## 3. Replacing an unavailable or compromised Owner identity

Require the exact sole old Owner, a distinct eligible dedicated replacement, explicit identity-bound approval and renewed native target MFA proof. In one future reviewed database cutover, revoke the old account's application access, remove its Owner membership and establish exactly one new Owner, with a renewed barrier and mandatory minimal audit. Concurrent observers must never receive an intentionally unfrozen interval. Wrong expected Owner, self-replacement, multiple/missing Owners, suspended/unconfirmed/unverified targets and replay abort.

The prototype tests database invariants only. Provider bans, deletion, factor reset and session revocation are separate operations and cannot be made atomic with a PostgreSQL transaction by assertion. Do not delete the old Auth identity or its data merely to replace ownership. Old access tokens may remain cryptographically valid; new application authorization must consult current account/role/MFA state. Long-running snapshot/private-read behavior must be measured and explicitly bounded, not advertised as immediate universal revocation.

## 4. Lost authenticator: same Owner identity

Preferred outcome is restoration of the same identity without changing Owner membership. No automatic promotion, email-only takeover, staff self-unenrollment or invented recovery code is introduced.

Future operator runbook:

1. Stop on suspected takeover; obtain attributable operator approval and independent identity evidence. Access to an email inbox alone is not sufficient proof for privileged recovery. Agree an application-specific maintenance/drain plan before changing factors; do not claim in-flight database snapshots are universally revoked.
2. Inventory exact current native factors/sessions through authorized provider tooling. Never collect passwords, TOTP seeds, QR images, OTPs, recovery codes, cookies or private keys in chat, repository files or ordinary tool logs. No current account inventory or provider action is performed in this area.
3. If a verified factor must be reset, use a separately approved official provider admin operation, not direct Auth-table SQL and not the application's prohibited staff-unenroll route. Supabase documents `auth.admin.mfa.deleteFactor` and says deleting a verified factor ends active sessions. Its separate signout documentation warns that already-issued access JWTs remain valid until expiry: session cleanup is not instantaneous token invalidation.
4. Preserve fail-closed application MFA checks. In a fresh transaction, stale AAL2 evidence without a current verified TOTP must not authorize staff. Restoring possession of the same identity still needs enrollment/challenge of a new authenticator and current AAL2; no role upgrade or verification bypass. Native reset/re-enrollment/session-expiry behavior remains untested until separately authorized user participation.
5. Read back provider and app state before declaring recovery. Record attempted/uncertain/completed steps separately; an external provider failure cannot be rolled back by undoing a SQL audit. Do not replay an ambiguous factor deletion blindly. Keep privileged use disabled until native proof is current and outstanding in-flight/session risks are resolved.

### Official recovery-code capability — researched, not enabled

Current official JavaScript documentation and installed `@supabase/auth-js` source expose `auth.mfa.recoveryCodes.*` behind the experimental opt-in, disabled by default. Generation reveals secret codes once; verification can raise the session to AAL2. This is not evidence that the hosted project's Auth configuration enables it, nor approval to generate or view secrets. Some other SDK guidance still says recovery codes are unsupported; use the exact JavaScript/installed-provider evidence rather than transferring a claim across SDKs. No experimental flag, factor policy or account is changed here. Existing Shopthie privileged checks continue requiring a current verified **TOTP**, not AAL2 alone. A future code-based recovery path therefore needs separate provider-availability/policy/security review and must not silently weaken that rule.

## 5. Measured feasibility verdict: PARTIAL

The recovered prototype and a completed parent rerun report **43 local assertions passed, 0 failed**, PostgreSQL18.6, signed runtime verified and server stopped. The15 existing MFA policy/service tests also passed. These counts include explicit observations of unsafe comparison cases and a recovery limitation; they do not mean all recovery properties are safe. See `spikes/012-owner-bootstrap/{README.md,results.json,runner.py,prototype.sql}`.

The tested marker TRUNCATE/reinsert protocol rejected stale guarded writes after bootstrap/replacement, while omitting renewal or merely deleting/reinserting the marker permitted the corresponding stale Owner status mutation in isolated rolled-back comparison transactions. Fresh Customer RPCs and stale-session fresh retries passed. These are local synthetic evidence, not authorization or instructions to alter hosted ownership.

**Blocking recovery finding:** an already-open Repeatable Read transaction retained old verified-factor visibility and successfully performed the actual private profile-support read after synthetic factor deletion. Fresh transactions denied. For tested account replacement, stable permission/context still observed old authority, but the actual locking private read serialized on the old actor's changed/suspended account tuple. This is not a universal read-path revocation guarantee.

Do not activate same-account factor recovery based on a claim that logout or factor deletion immediately closes every private-read snapshot. A reviewed in-flight transaction/session containment procedure and native provider/proof acceptance remain unresolved. No live account was used to demonstrate this; synthetic returned data remained inside local tests and rolled back.

The proof intentionally uses a fixture audit table and injected TEST claims rather than installed operator-audit integration or real consent/JWT verification. Its whole synthetic-factor-table lock, potentially waiting Auth/approval locks, absent SQL-native lock/statement timeouts and missing per-transition production catalog revalidation are **not production patterns certified here**. They remain future requirements. No production RPC, migration, provider factor operation or automatic Owner activation is delivered.

## 6. Evidence and acceptance boundaries

The bounded fixture runner under `spikes/012-owner-bootstrap` must create only a private local Unix-socket PostgreSQL cluster, read the nine installed migrations in place, verify downloaded binary provenance, use synthetic Auth/MFA/claims and always stop the server. No hosted connection option, credentials, source snapshot or native login is needed. Record exact passed/failed checks and surprising outcomes rather than assuming the marker hypothesis works. Production source/migrations are unchanged, so broad storefront/browser/motion matrices are intentionally excluded.

This area may complete with a PARTIAL feasibility verdict and explicit native/proof/session gates. Production implementation, new migration, real identity creation/selection, email setup, factor/session operations, Owner activation and frontend deployment each remain separately unapproved.

## Primary sources consulted

- PostgreSQL MVCC caveats: `https://www.postgresql.org/docs/17/mvcc-caveats.html` (search also returned the current-version primary page; exact local engine is recorded by the runner).
- Supabase admin factor removal: `https://supabase.com/docs/reference/javascript/auth-admin-deletefactor`.
- Supabase signout/session-token caveat: `https://supabase.com/docs/guides/auth/signout`.
- Supabase experimental JavaScript recovery-code generation/status/verification: `https://supabase.com/docs/reference/javascript/auth-mfa-recovery-codes-generate`, `https://supabase.com/docs/reference/javascript/auth-mfa-recovery-codes-getstatus`, `https://supabase.com/docs/reference/javascript/auth-mfa-recovery-codes-verify`.
- Local installed SDK: `node_modules/@supabase/auth-js/src/lib/types.ts` ExperimentalFeatureFlags; `src/lib/helpers.ts` experimental-recovery-code guard. Local application: `src/modules/identity/mfa/{adapter,service,factors}.ts`, current SQL permission helpers and existing factor-loss fixtures. These are read-only source observations, not live recovery acceptance.
