# Area 9 audit-view database

## Installation boundary

`supabase/migrations/20261030012105_audit_view.sql` is the only new migration. It adds the optional enabled `audit_view` module with direct dependencies `access` and `audit`, remaps **only** `audit.read`, and installs four functions. Reviewed Owner/Admin grants are unchanged; Customer has no audit grant. Broad `staff` and `support` remain disabled. No new tables, triggers, raw grants, RLS policies, account/role mutations, or timeline indexes are installed.

Required `identity`, `access`, and `audit` remain non-disableable. The lookup/status writers and their existing permissions/dependencies are untouched. Disabling `audit_view` prevents history access, not mandatory recording.

## Exact RPC boundary

| Public invoker                                               | Private definer                                     | Result  | Volatility |
| ------------------------------------------------------------ | --------------------------------------------------- | ------- | ---------- |
| `shopthie_audit_view_ready()`                                | `audit_view_ready()`                                | boolean | STABLE     |
| `shopthie_audit_events(p_before_time text,p_before_id uuid)` | `audit_events(p_before_time text,p_before_id uuid)` | jsonb   | VOLATILE   |

All four functions use an empty search path, revoke PUBLIC/anon execution, and grant execution only to `authenticated` among client roles. Private table ACLs and RLS remain exactly unchanged. No event writer is exposed. Function ownership remains the migration executor's normal ownership, consistent with the existing migrations.

Readiness checks the existing current `has_permission('audit.read')` gate plus current Owner/Admin membership. That gate requires an active app account, current grant and enabled dependencies, AAL2 and a currently verified TOTP for staff. Editable claim metadata is not authority. Request identity/confirmation remains the existing server/Auth boundary; the fixture is not an Auth verifier.

The reader:

1. Denies before event reads or timestamp validation.
2. Acquires `FOR SHARE` on **only the actual actor's existing parent account**. Existing role writers already participate through parent UPDATE locks. There are no target/child locks or ownership mutations.
3. Rechecks current actor/capability and derives current membership: Admin `own`, Owner `all`. There are no actor/scope/role/limit arguments.
4. Validates the cursor, filters eligible records and applies the exclusive `(created_at,id)` boundary, descending with fixed `LIMIT 21`.
5. Returns at most 20 events; only a 21st eligible row permits `nextCursor`, exactly the last visible tuple.
6. Rechecks actor/capability, then current role equality before returning. A late scope change is denied rather than returning the saved projection.

VOLATILE permits fresh statement-level authority checks and the parent SHARE lock; there are no reader DML effects. No event is inserted for readiness or viewing history.

## Projection and cursor

Exact page keys: `{scope,events,nextCursor}`. Exact event keys: `{id,actorSubject,targetSubject,eventType,reason,outcome,createdAt}`. UUID output is PostgreSQL's canonical lowercase UUID text. History is projected without any account/profile/contact join; opaque historical actor/target UUIDs need not still have an account.

Eligible combinations are exactly:

- `customer.lookup`: `account_access|profile_help|address_help`, with `found` and nonnull target or `not_found` and null target.
- `customer.status.read`: `account_security|customer_request|account_review`, `read`, nonnull target.
- `customer.status.change`: the same status reasons, `active|suspended`, nonnull target.

Actor must be nonnull. Unknown event types, arbitrary reasons/outcomes, incoherent null targets, nonfinite timestamps and timestamps outside AD years 0001–9999 are excluded **before pagination**, not merely rejected after reading 21 arbitrary rows. No metadata, reason text, usernames, phone, email, addresses or future columns enter the projection.

Null/null is the first page. A partial pair is invalid. Timestamp text must be exactly 27 characters, `YYYY-MM-DDTHH:mm:ss.ffffffZ`, with a real PostgreSQL-validated calendar date and an identical six-microsecond UTC formatting roundtrip. This rejects rollover/normalization, alternate offsets/case, leap-second rollover, impossible dates, precision changes and surrounding whitespace. Cursor timestamps are never converted through JavaScript `Date` or millisecond ISO formatting. PostgreSQL preserves the microsecond timestamp comparison.

The required `uuid` parameter type rejects invalid UUID syntax before function entry; PostgreSQL has already parsed a valid UUID when the function receives it, so original UUID spelling cannot be recovered at this SQL interface. Literal canonical UUID validation belongs to the server/action boundary. All returned UUIDs are canonical. A syntactically valid arbitrary cursor is only a time/ID bound, not authority and not a proof that a row exists; it cannot widen Admin scope.

Errors inside the reader are fixed `42501/audit_view_denied` or `22023/audit_view_invalid_cursor`. The server must continue sanitizing errors, including PostgreSQL argument-conversion errors such as invalid UUID `22P02`.

## Verification and RED → GREEN

`tests/backend/database-audit-view.test.ts` exercises actual migrated PGlite PostgreSQL SQL, roles, catalogs, ACLs, and synthetic TEST claims. Each fixture transaction rolls back. Before/after comparisons use in-memory database catalog results, not persisted source snapshots.

Observed vertical tracers:

1. Readiness/module installation: **0/2 → 2/2**; RED was missing readiness RPC and unchanged `audit.read` owner module.
2. Reader scope/safe event envelope: **2/4 → 4/4**; RED was missing reader RPC. GREEN also corrected an observed PL/pgSQL ambiguous actor-column reference.
3. Canonical cursor/keyset: **5/7 → 7/7**; RED was valid subsequent cursors rejected. GREEN added real-calendar validation, exact microseconds and exclusive tuple bounds.
4. Return-boundary authority: **11/13 → 13/13**; TEST-only gate interception exposed a late role comparison ordering gap. GREEN moved the final role read after final capability verification. A separate structural assertion was corrected to inspect executable SQL rather than comment words.

Final focused command:

```sh
node --test tests/backend/database-audit-view.test.ts tests/backend/database-customer-status.test.ts
```

Result: **28 passed, 0 failed** (15 audit-view, 13 historical status). Coverage includes own/all scope, forged metadata and unsupported extra actors, current role/status/MFA/module/dependency/grant denial, unknown/future data and extra private columns, nullable no-match targets, lowercase historical UUIDs, empty/exact-20/lookahead pages, Admin 45-record and Owner 80-record tied/microsecond paging without duplicates, malformed calendars/cursors, forbidden raw DML, no reader audit writes, and disabled viewer with all three existing operation types still recording.

Final TEST fixture counts: users 0, staff memberships 0, verified factors 0, pending factors 0, audit events 0; enabled audit viewer 1, enabled broad staff/support 0; audit staff grants 2, Customer audit grants 0. These are **local fixture counts, not native provider counts**.

`database-customer-status.test.ts` is explicitly frozen at `20261029165555_customer_status.sql`. Its complete historical assertions exclude only Area 9's module/dependency additions and reverse only the `audit.read` remap in the expected historical mapping; reviewed grants and every existing assertion remain. The new suite independently asserts **complete latest** registry, dependencies, permission ownership and role-grant parity.

Scoped Prettier and ESLint pass; `git diff --check` passes. During parallel integration work, the full backend run returned **240/242**, with only parent-owned historical foundation/lookup parity expectations failing on the new module. Whole-project typecheck was blocked by then-unwritten parent `audit-view/server`, `actions` and `adapter` modules; no SQL-suite TypeScript error was reported. Parent subsequently resolved those integration gaps: 245 unit tests, 251 overlapping backend checks including95 SQL checks and22 affected browser checks passed, plus build/static gates. See backend-area-9.md.

## Limits / native handoff

No provider/native call, secret/environment inspection, hosted migration apply, staff creation/promotion, actual account/role/MFA mutation, index/staging operation, commit, push or deployment was performed by this worker. Gate interception is a rolled-back TEST-only deterministic probe, not genuine native concurrency. Positive native staff/MFA reads and true multi-session revocation/locking acceptance remain unverified. Subsequent parent handoff: independent review deleg_b1ca74bd PASS36 focused checks; hosted migration20261030012105 applied once after explicit approval re-prompt and read back. Four exact signatures/ACLs/paths/volatility, optional/required module separation, preserved grants, raw denial, actor lock/lookahead/final role checks and existing primary-key-only index confirmed. Unidentified readinessfalse/read denied without injected claims/writes; native counts unchanged (staff0,verified0,pending1,changed accounts0,audits0). Local filename aligned without SQL edits; all95 SQL checks pass. Native privileged/MFA and multi-session acceptance remain deferred. See backend-area-9.md and results/review records.
