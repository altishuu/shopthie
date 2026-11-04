# Area 10 — profile-support database boundary

## Installed and read back; native privileged acceptance deferred

Migration: `supabase/migrations/20261104120706_profile_support.sql`.
Predecessor: `20261030012105_audit_view.sql`. Earlier migrations are unchanged.
Independent review passed; hosted migration 20261104120706 was applied and read back on November 4, 2026. No native account, role, status, MFA, secret, frontend deployment, or signup-setting change was performed. Synthetic fixture role/status/factor
mutations described below are confined to ephemeral PGlite transactions.

## Narrow module and authority

- Optional `profile_support` is installed enabled, depending on exactly
  `customer_lookup`, `profiles`, `access`, `audit`. The only added permission is
  `support.profile.read`, explicitly granted to Owner/Admin, never Customer.
- Existing `staff` and broad `support` remain disabled. Generic
  `support.private.read` stays mapped to broad `support`, with its old grants and
  disabled behavior unchanged. No permission remapping or prior writer change.
- Current database Owner/Admin membership, active actor account, current verified
  native TOTP and AAL2 are required through the existing `has_permission` gate and
  an explicit Owner/Admin role check. Client metadata cannot supply authority.
- Target is the selected nonself, current Customer account with an existing
  profile. Current Owner/Admin targets, missing profiles/memberships/accounts and
  self targets are denied. A suspended Customer remains supportable.

## Fixed native interface

| Public invoker                                                               | Private definer                                                     | Returns | Volatility |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------- | ---------- |
| `shopthie_profile_support_ready()`                                           | `profile_support_ready()`                                           | boolean | STABLE     |
| `shopthie_profile_support_read(p_target uuid,p_username text,p_reason text)` | `profile_support_read(p_target uuid,p_username text,p_reason text)` | jsonb   | VOLATILE   |

Both layers use an empty `search_path`, revoke PUBLIC/anon execution, and grant
execution only to the authenticated client role. No actor parameter or extra
phone/scope/role input exists. Readiness is self-only, returns no target data and
writes no audit. Raw table grants, RLS/policies and all existing function ACLs
remain unchanged.

The username must satisfy raw ASCII `[A-Za-z0-9][A-Za-z0-9_-]{2,31}`. No trim,
normalization or reinterpretation occurs. Only `profile_help` is accepted. Input
UUID and username must match the same current profile; matching another account's
username never silently changes the selected UUID. Comparison is case-insensitive
using the C locale; the stored display spelling is returned unchanged. PostgreSQL
receives an already typed UUID: raw lowercase canonical UUID spelling must be
validated at the application boundary before RPC invocation, not reconstructed
from the typed SQL value.

Success returns exactly `{subject,username,phone}`. `phone` is null or the existing
canonical stored phone, customer-supplied and **unverified**, never identity proof.
No age, email, addresses, provider fields, revisions or editing operation is added.
Unauthorized reads fail with `42501`; invalid raw username/reason with `22023`.
The application must sanitize diagnostics and always clear the DTO on errors.

## Atomic disclosure and parent-writer discipline

1. Derive the actor from `auth.uid()` and check current capability before input
   validation/data access. Validate nonself target, raw username and exact reason.
2. Acquire actor and target **parent account SHARE locks in UUID order**, in one
   ordered acquisition. Never lock child role/profile tuples.
3. Recheck current actor/capability and select only a current Customer profile
   whose UUID and username both match. Save the exact three-key projection.
4. INSERT a mandatory transactional audit with only actor/target IDs and fixed
   `support.profile.read` / `profile_help` / `read` categories. Neither phone,
   username nor free text is copied. Reject an INSERT silently suppressed by a
   BEFORE trigger as well as ordinary audit failures.
5. After audit hooks, recheck current actor identity/capability and current
   Customer/nonself/username binding, then require the exact current projection to
   equal the saved projection. Phone, username (including case-only spelling),
   target role/profile, actor/MFA/module/grant or caller changes fail closed.
   An exception rolls back the statement's audit/hook changes; no DTO is returned.

The existing trusted-writer rule is unchanged: affected parent accounts must be
locked in deterministic order **before** child DML. Existing child guard triggers
participate but cannot by themselves establish parent-before-child ordering:
BEFORE ROW triggers may run after a child tuple has been locked. No new child lock
or trigger is introduced. Deterministic single-connection hooks test boundary
rechecks and rollback, **not** independent-session concurrency or native locking
acceptance.

## Exact history extension and historical isolation

Only `shopthie_private.audit_events(text,uuid)` is replaced. Its sole change is
one eligible OR clause for event `support.profile.read`, reason `profile_help`,
outcome `read`, and a nonnull target. Current Owner-all/Admin-own scope, actor
SHARE locking, every authority/final-role check, supported prior envelopes,
finite/range checks, strict UTC microsecond cursor validation, descending exclusive
keyset order, fixed 20+1 lookahead, exact safe event DTO and zero read-side writes
remain identical. Public history wrapper/signature/ACL are not replaced.

The new suite captures pre-migration catalogs **in memory** and proves the complete
history function definition differs by only that clause; every other prior
function definition/signature/ACL and every raw table ACL/RLS/policy must match.
No source snapshot or manifest is persisted. History never joins profiles or
returns phone/username, including when private columns are later added to audit
storage. Disabling profile support does not disable existing lookup/profile/status
writers, mandatory recording, or the independent history viewer.

`database-audit-view.test.ts` is explicitly historical: its migration cutoff is
`20261030012105_audit_view.sql`, with complete pinned Area 9 modules, dependencies,
permission mappings and reviewed role grants. The new module/permission/grants
are absent **only** in that historical fixture. The Area 10 suite loads the full
latest migration chain and compares **all** current registry modules, dependency
edges, permissions and every role grant against the actual source, without
filtering out new capabilities. Foundation/lookup/status historical fixtures are
owned separately and were not edited here.

## Observed vertical RED → GREEN and focused verification

Executed with the installed PGlite package and actual PostgreSQL client roles;
claims are trusted synthetic TEST data, not validated native JWTs or GoTrue.

- Readiness tracer: missing public RPC (`42883`) → 1 passing test.
- Bound nullable/synthetic-phone read + mandatory audit tracer: missing read RPC
  (`42883`) → 2 passing tests.
- Post-audit boundary tracer: all 12 deterministic hook cases returned the test
  sentinel `DISCLOSED` before rechecks → all 14 then passed after the rechecks.
- History tracer: missing exact clause and empty support history (2 failures) →
  all 16 then passed; definition equality limits the delta to that clause.
- Audit-failure tracer: rejecting trigger already denied; silently suppressed
  INSERT disclosed before the FOUND check → all 18 then passed.
- Historical isolation: 2 selected Area 9 parity/preservation failures when the
  new migration leaked into that fixture → historical cutoff/pinned parity green.

Final focused gates:

```sh
node --test tests/backend/database-profile-support.test.ts tests/backend/database-audit-view.test.ts
npx prettier --check tests/backend/database-profile-support.test.ts tests/backend/database-audit-view.test.ts
npx eslint tests/backend/database-profile-support.test.ts tests/backend/database-audit-view.test.ts
```

The combined database run passed **41 tests**: 26 Area 10 and 15 historical Area 9.
Coverage includes minimal null/synthetic phone, all current authority/input/target
bindings, audit error/suppression, hook-induced rollback, scope-safe history,
module-off preservation, exact catalog/ACL/lock properties and unfiltered latest
registry/dependency/permission/grant parity. No broad/performance test matrix or
native positive staff/concurrency claim is made.

Final Area 10 TEST fixture counts: users 0, staff memberships 0, verified factors
0, pending factors 0, audit rows 0, profiles 0; enabled profile_support 1, enabled
broad staff/support 0, specific staff grants 2, Customer grants 0. These are fixture
cleanup counts, not native project counts. Native privileged disclosure remains
deferred: do not create/promote staff or modify MFA merely to certify it.
