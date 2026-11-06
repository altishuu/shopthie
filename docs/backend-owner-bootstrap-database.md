# Area 13 — first-Owner bootstrap database

## Delivery and stop gate

Candidate: `supabase/migrations/20261106020000_owner_bootstrap.sql`.

**Implemented; correction SQL suite locally verified; independent re-review outstanding; not installed or activated on hosted data.** Installation selects no identity. No hosted connection, real designation/promotion, account/status/role/factor/session change, Auth DDL, credential/environment change, Git mutation, application-source snapshot or SQL copy was used. Previous migrations and staged Area12 source/index were not edited by this database slice. Application/API/UI and historical fixture pinning are separate parent-owned work.

This is **first Owner only**, not replacement, recovery, factor removal, signup, or staff management. A consumed singleton remains a tombstone even after a later trusted operator removes Owners. There is no public/application Owner-grant endpoint and no setting-based bypass.

## Candidate interfaces (not installed)

| Interface | Security and result |
| --- | --- |
| `public.shopthie_owner_bootstrap_state()` | Authenticated self-only invoker wrapper; private definer returns exact minimal state. No selector or write. |
| `public.shopthie_owner_bootstrap_consent(p_designation uuid)` | Authenticated self-only invoker wrapper; private definer derives UID and native claim/session/factor evidence. Stores consent only, never changes a role. |
| `shopthie_private.designate_first_owner(p_subject uuid,p_approval_ref uuid)` | Private SECURITY INVOKER; trusted schema/marker owner or superuser only; returns fresh designation UUID. |
| `shopthie_private.activate_first_owner(p_designation uuid,p_intent uuid,p_approval_ref uuid)` | Private SECURITY INVOKER; same trusted boundary; returns void after the atomic one-time transition. |

All functions have empty search paths. PUBLIC, anon, authenticated and service_role explicitly lose all helper/operator execution and private-table privileges; authenticated receives only the two self entry points and their private implementations. Effective/default/inherited grants to other untrusted roles cause installation or a trusted transition to reject, not to repair the role environment. NOINHERIT membership paths into the trusted role, superusers, `pg_write_all_data` or `pg_read_all_data` are rejected. The unassigned predefined read/write roles themselves are not application principals.

Configuration validation fails closed when `RESET search_path` removes the last `proconfig` entry and PostgreSQL returns NULL: the private-function required match uses `COALESCE(...,false)`, and the freeze guards/public wrappers use `IS DISTINCT FROM` against the exact one-entry configuration. The freeze guards' exact bodies, language, volatility, definer status and four ALWAYS triggers remain unchanged; adding an unrelated setting still rejects the guards/wrappers. Operator timeouts are retained, not mistaken for a valid search path.

The same environment validator now rejects effective nontrusted **CREATE on `shopthie_private`**, at installation and on genuine trusted transitions. This includes direct, PUBLIC, inherited NOLOGIN and NOINHERIT/SET ROLE paths; USAGE alone remains supported. It does not revoke or constrain unrelated public/Auth grants, alter native catalogs, or infer application assumability merely from a predefined role's existence. A bounded pre-fix synthetic probe granted anon USAGE+CREATE before installation, installed the candidate, then created an anon-owned `activate_first_owner(text,text,text)` SECURITY INVOKER overload. Calling the root with untyped string literals selected that overload, whose harmless body returned the trusted caller's `current_user` before the genuine UUID function's environment check. The probe asserted unchanged roles, control/intents, audits, marker and trigger modes; it performed no privileged mutation. Installation rejection now prevents accepting that unsafe baseline; normal accepted installations deny overload creation by anon and a USAGE-only NOLOGIN role.

**Resolution limitation:** a runtime check inside the genuine UUID operator cannot intercept a different overload selected before entry. A later trusted grant of private CREATE followed by attacker DDL is outside the accepted baseline, not sandboxed by the runtime validator; genuine calls reject the drift, but a preferred attacker overload can bypass entry entirely. This correction does not claim safety after arbitrary trusted DDL/ACL changes or introduce a broader function-resolution redesign.

The optional, initially enabled `owner_setup` module depends exactly on identity/access/audit. `owner.bootstrap.request_own` belongs to it and is granted **only to Customer**. Existing staff/support module ownership, grants and audit viewer allowlist are unchanged. Readiness checks the exact module/grant catalog directly: a genuinely designated active Customer at AAL1 can receive `mfa_required` without calling a promotion path or weakening the consent permission/proof gate.

## Self DTO and proof

State returns exactly:

```text
{subject, status, designation}
```

`status` is `unavailable|mfa_required|ready|consented|completed`. Only current consented state includes `intent: {id, expiresAt}`. Expiry is canonical UTC with six fractional digits, `YYYY-MM-DDTHH:mm:ss.ffffffZ`. Null/no authenticated UID denies. Wrong/undesignated callers receive their own UUID with `unavailable`, null designation, and no intent; they learn nothing about another subject. Completed is reported only to the activated self while still an active Owner.

Consent requires all of:

- Current `auth.uid()`, exact current designation/target, active Customer, confirmed email not in the future, no deleted user and no current ban.
- Provider request claim `aal2`, valid UUID `session_id`, unexpired integer numeric `exp`, and an AMR array containing an integer numeric `totp` timestamp no more than five minutes old and not in the future. Malformed AMR siblings fail closed; a password entry or verified factor alone is insufficient.
- Exact live `auth.sessions` row for that user/session, native `auth.aal_level` AAL2, its exact factor ID, unexpired `not_after` when set, nonfuture session timestamps, and exact current self verified TOTP in `auth.mfa_factors`.
- Native user, session and factor rows locked in that order with **FOR SHARE NOWAIT**, then proof re-read/revalidated. An app-parent SHARE lock participates in the existing membership writer discipline.

Private intents retain only opaque UUID bindings, proof/expiry times and consumption time; they store no JWTs, passwords, OTPs or enrollment secrets. Expiry is bounded by AMR freshness, original token expiry and live session expiry. Repeat consent is idempotent without another audit or renewal; it must still have current valid self proof and the original intent must remain live. An expired intent cannot be silently refreshed. A separately approved operator must rotate the designation using a fresh approval-reference UUID before another consent can be issued. Historical approval-reference UUIDs are retained privately to prevent reference reuse.

Private control/intent tables have RLS, no client policies/raw grants and no provider foreign-key/cascade dependency. They are approval/consent evidence, not alternative Auth proof tables. Operator attribution uses the actual effective database executor and opaque approval UUID in private state; separate protected human approval evidence remains mandatory.

## Trusted transition and locking

Mutations require READ COMMITTED. The migration and mutation entry points configure SQL `lock_timeout='1s'` and `statement_timeout='15s'`; all explicit table/row acquisitions use NOWAIT. Implicit relation acquisition/DDL contention remains bounded by lock_timeout. No explicit provider table-wide lock or provider DDL is issued.

**The caller must set statement_timeout before invoking the root SQL statement.** A function-local setting alone is not a claim that the already-running outer SELECT is bounded. The local harness sets it before each operator SELECT. A later approved operation must use its own protected operator session, READ COMMITTED transaction and already-active caller-side deadline; never expose operator SQL through application transport, auto-retry it, or use an unbounded pooled transaction. No real operator invocation was performed here.

Designation locks the app tables/cutover marker and private control/intent relations NOWAIT, requires zero Owners and an unconsumed singleton, validates the live eligible native user under a row lock, and records a mandatory audit. Rotation invalidates earlier intents without deleting the evidence.

Activation:

1. AX-locks app_accounts, app_user_roles and the cutover marker NOWAIT; locks private control/intents NOWAIT.
2. Revalidates trusted ownership, absence of effective nontrusted private-schema CREATE, effective table/function/column ACLs, RLS visibility, native column types/SELECT+UPDATE rights, fixed freeze function bodies/NULL-safe configuration and all four exact ALWAYS trigger definitions/modes.
3. Binds the exact designation, intent, target and approval UUID; requires zero Owners, live unconsumed evidence and expiry. Locks the exact native user/session/factor rows FOR SHARE NOWAIT and revalidates active confirmed Customer/current AAL2 session/current verified TOTP.
4. Disables **only** the membership row `owner_freeze_guard`, promotes exactly one Customer, TRUNCATE/reinserts **only** the private cutover marker, and restores the membership guard ENABLE ALWAYS. Neither account nor membership tables are truncated. Other freeze/revision/writer/truncate guards remain enabled.
5. Marks the singleton and intent consumed, records `owner.bootstrap.activate`, then rechecks native eligibility, exact private records, the sole Owner, marker and restored safeguards. Expected immutable private fields are preserved independently of UPDATE RETURNING so a trigger cannot redefine the binding while consuming it.

The renewed marker keeps its OID but changes physical storage, making pre-activation RR/SERIALIZABLE snapshots fail closed rather than consult stale Customer membership. Fresh ordinary Customer operations continue to work at all three isolation levels. An old ordinary transaction must roll back and begin a fresh snapshot; tested retries use the same real session and persist exactly one status revision/audit.

Native deletion races are contained, not provider deletion semantics redefined: conflicting user/session/factor locks deny immediately; an activation holding exact SHARE locks blocks concurrent deletion until its transaction finishes. This is not a general claim of immediate factor/JWT revocation across every historical application snapshot.

## Mandatory audit and rollback

Only fixed event types `owner.bootstrap.designate`, `owner.bootstrap.consent`, `owner.bootstrap.activate`, reason `initial_owner_setup`, outcome `success`, and opaque actor/target IDs are written. Consent actor is current UID; operator actor is null, never a fabricated application actor. The existing staff audit reader does not expose these event types.

The installed `shopthie_private.audit_events` is mandatory. Its INSERT uses RETURNING plus an exact stored-record check: a suppressing BEFORE INSERT trigger, deleted audit row, raised audit error or post-audit loss of eligibility cannot result in success. Private record/proof/safeguard checks also run after auditing. Exceptions roll back role, marker storage, trigger modes, tombstone, intents and audit writes together. Approval replay-history erasure and intent rebinding during consumption have explicit regression tests.

Trusted later DDL/role/catalog changes are outside the application adversary boundary. Unsupported ACL/ownership/RLS/native catalogs reject activation rather than automatically broadening grants or replacing safeguards. A new migration/review would be needed for an incompatible provider or guard-definition change.

## Reproducible local evidence

Run from the repository root:

```sh
node --test --test-concurrency=1 tests/backend/database-owner-bootstrap.test.ts
npx --no-install eslint tests/backend/database-owner-bootstrap.test.ts
npx --no-install prettier --check tests/backend/database-owner-bootstrap.test.ts
npm run typecheck -- --incremental false
```

Correction-worker final exact-source execution (synthetic PGlite SQL only):

| Check | Actual final result |
| --- | --- |
| Entire candidate PGlite SQL suite | **55 tests, 55 pass, 0 fail, 0 skipped/cancelled** |
| Focused ESLint | Exit 0 |
| Focused Prettier check | Exit 0 |
| Project typecheck, incremental output disabled | Exit 0 |

Strict tests-first correction evidence:

| Exact focused command (same arguments for RED and GREEN) | RED before the corresponding SQL correction | GREEN |
| --- | --- | --- |
| `node --test --test-concurrency=1 --test-name-pattern='runtime RESET search_path' tests/backend/database-owner-bootstrap.test.ts` | **15 tests: 11 fail** with missing expected rejection, **4 pass** (timeout-bearing functions already rejected) | **15 pass, 0 fail** |
| `node --test --test-concurrency=1 --test-name-pattern='effective private-schema CREATE\|private-schema USAGE alone' tests/backend/database-owner-bootstrap.test.ts` | **9 tests: 8 fail** with missing expected rejection, **1 pass** (USAGE-only control) | **9 pass, 0 fail** |

The bounded overload investigation used a temporary in-file test selected by `node --test --test-concurrency=1 --test-name-pattern='bounded private-schema overload probe' tests/backend/database-owner-bootstrap.test.ts`: **1 pass**, proving harmless execution as the trusted invoker on the pre-CREATE-check candidate. That temporary positive exploit probe was replaced by the lasting installation/runtime prevention regressions; it is not a final-suite test name.

RESET variants cover both freeze guards, both public wrappers and every candidate private helper/entry point, including the validator and both operators. Each variant checks the environment assertion, designation and activation independently against an unchanged protected-state snapshot after **each rejection**, including no promotion, consumption, tombstone change, audit write, marker replacement or trigger-mode change. Four additional control tests preserve exact guard/wrapper configuration rejection when an extra setting is added. Private CREATE variants cover anon, inherited NOLOGIN, NOINHERIT membership and PUBLIC at installation and runtime; failed installation rolls back to the original membership/audit/marker/module/trigger state with no bootstrap control, intents or operator left installed.

The pre-correction parent/reviewer independent-session run reported **31/31 checks**, `complete=true`, `serverStopped=true`, and **5 passing lifecycle tests**. Those earlier runs alone do not verify corrected source. Subsequently, final independent reviewer `deleg_9b1c5470` executed the corrected exact-source harness once: **31/31 passed**, `complete=true`, `serverStopped=true`, plus **28 focused correction tests and5 lifecycle tests passed**. Bounded re-review passed with no outstanding findings. The parent independently ran the full corrected55-test SQL suite. `docs/backend-area-13-review.json` preserves the original failed review under priorReviews and records the separate final PASS; approval remains implementation-source scope only.

The newest SQL suite asserts **unfiltered full-chain parity** for every module/default enabled flag, every dependency, every permission/module mapping and every per-role grant against the current parent registry. Historical cutoffs are not used in that assertion. Coverage includes self/role ACLs, default/inherited execution/read grants, native catalog mismatch, missing/expired/mismatched session, AAL1, stale/future/fractional/malformed AMR, factor loss/type/status, deleted/banned/unconfirmed/suspended subject, designation/intent/approval replay, one-time tombstone, audit suppression/deletion/exception, post-audit factor loss, immutable intent binding, runtime guard/ACL/RLS drift, NULL search-path configuration, exact guard/wrapper configuration and effective private-schema CREATE.

Tracer RED→GREEN evidence was executed, not inferred: initial missing migration failed, then default-closed/readiness/consent passed; absent activation failed, then one-time activation passed. Focused tests caught approval-reference reuse, extra public-schema default execution grants, zero-Owner/native-enum preconditions, audit-time replay-history erasure and consumption-time intent rebinding before their fixes. The expanded real-session harness also caught an implicit intent-relation wait (lock_timeout rather than NOWAIT); explicit NOWAIT acquisition was added and the complete harness rerun passed. Earlier partial/failing runs did not count as completed evidence and still verified local shutdown.

### Independent sessions and executable provenance

The harness reads **the actual ten migration files in place**: the nine prior migrations plus this candidate. It imports only guarded Area12 runner infrastructure (provenance, local process/session helpers); it never executes the Area12 prototype/main and writes no Area12 report. It accepts no connection arguments, has no hosted fallback, disables TCP, uses a mode-0700 private Unix socket, and uses an allowlisted credential-free subprocess environment.

Before executing any downloaded PostgreSQL program, it verified the two restored CachyOS package signatures using the system trust database and compared **1,464 runtime regular files** against the signed archives, including the required executables. Runtime was **PostgreSQL 18.6**, not hosted PostgreSQL **17.11**. The 17.11/native catalog baseline is supplied by the implementation contract; this worker did not query or execute against that hosted database.

The fixture owns app objects using a **non-superuser BYPASSRLS role**, with explicit native SELECT+UPDATE grants. Auth enums/session columns are provider-shaped synthetic fixtures; request claims are injected synthetic JSON. No signed native JWT, native login, authenticator OTP, actual GoTrue session lifecycle or positive real-account activation was proven.

The real-session checks cover six busy relation cases with atomic rollback, exact native user/session/factor conflicting locks, deletion blocking by held native SHARE locks, suppressed installed-audit rollback, queued READ COMMITTED Owner denial, old RR/SERIALIZABLE marker rejection, same-session ordinary RPC recovery and fresh actual Customer status RPCs at READ COMMITTED/RR/SERIALIZABLE.

Cleanup is armed before pg_ctl startup; client cleanup cannot skip server shutdown; shutdown is independently checked; uncertain cluster data is retained; interruptions are recorded/re-raised and never count as complete. The five lifecycle regressions cover nonzero startup, startup timeout, client cleanup race, unconfirmed shutdown/data retention, and KeyboardInterrupt. The final real run explicitly reported verified shutdown and completion.

## Remaining gate

Independent implementation correction review passed. Separately approved hosted installation/readback and native positive MFA/self-consent/operator activation acceptance remain outstanding. Real identity designation, activation, native OTP participation and any recovery/replacement or account-security changes require separate authorization. Local SQL/session evidence is not permission to perform them. Runtime validation does not sandbox function resolution after later trusted CREATE grants and untrusted namespace DDL; revalidate such changes and use protected, schema-qualified, exactly typed operator calls.
