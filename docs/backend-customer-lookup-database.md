# Area 7 — exact Customer lookup database

## Status and scope

Local and hosted installation are verified. Migration
`20261029121812_customer_lookup.sql` was applied once after independent source
review passed, then history/schema/ACL/module state were read back. Local filename
aligned to the server-generated version without changing SQL. No native account
role/MFA changes, secret reads, frontend deployment or commits were made.

This migration adds no tables and does not write the provider-owned auth schema.
It reuses `shopthie_private.audit_events`. Synthetic fixture users, roles, factors,
claims and failure triggers exist only inside local, rolled-back PostgreSQL tests.
No native JWT verification, OTP challenge or privileged hosted acceptance is claimed.

## Installed contract

| Public RPC                                                | Private implementation       | Result / volatility |
| --------------------------------------------------------- | ---------------------------- | ------------------- |
| `shopthie_customer_lookup_ready()`                        | `customer_lookup_ready()`    | boolean / STABLE    |
| `shopthie_customer_lookup(p_username text,p_reason text)` | `customer_lookup(text,text)` | jsonb / VOLATILE    |

All four functions have fixed empty `search_path`. Public wrappers are SECURITY
INVOKER; private implementations are SECURITY DEFINER. EXECUTE is explicitly
revoked from PUBLIC, anon and authenticated before granting only authenticated.
There are no new raw-table grants or unaudited target-reading helpers. Calling the
private lookup directly has the same authorization, validation and mandatory audit.

Readiness delegates to the unchanged live `has_permission('customer.lookup')`.
Lookup calls that helper before input validation or target access. Existing current
membership, active actor account, role grant, recursive module dependencies, AAL2
and current verified caller-owned TOTP requirements remain authoritative. The
migration neither replaces the permission helper nor changes actor-context contracts.
It introduces no auth enum/text comparison; the existing native-compatible helper
is preserved byte-for-byte, including its ACL, OID, volatility and configuration.

The optional `customer_lookup` module is enabled with direct dependencies
`profiles`, `access`, `audit`. Only `customer.lookup` is remapped to it. Existing
Owner/Admin grants are preserved exactly; no Customer grant is added. All other
modules, permission ownerships and grants are unchanged. `staff` and `support`
remain disabled, so account management and private support tools stay unavailable.

Username validation is exactly ASCII `[A-Za-z0-9][A-Za-z0-9_-]{2,31}` under `C`
collation, without trimming, normalization, wildcards or substring matching. Exact
case-insensitive comparison uses the same `lower(username COLLATE "C")` expression
as the profile unique index. Only current Customer memberships join the target
projection. Staff, missing membership, missing profile and nonexistent targets
return JSON null. Suspended Customers remain discoverable with suspended status.

The only found DTO keys are `subject`, `username`, `status`. No phone, email,
address, timestamps, factor data or metadata is selected into that DTO. Every valid,
authorized call writes actor UUID, matched Customer UUID or null, event type
`customer.lookup`, fixed reason and outcome `found`/`not_found` before returning.
Allowed reasons are `account_access`, `profile_help`, `address_help`; no free-text
reason or searched username is logged. Unauthorized calls raise SQLSTATE `42501`;
invalid usernames/reasons raise `22023`, without audit events.

Audit insertion and projection are one SQL operation. No exception handler swallows
an insertion failure. The failure test installs a TEST-only AFTER INSERT trigger
which changes a profile revision and then raises `23514`. Both found and no-match
calls through both public and private functions reject, return no DTO, leave zero
audit rows and roll back the trigger's revision change. Removing/renaming the target
profile table in another TEST transaction also proves denied callers are rejected
before target access or validation.

## Observed vertical RED → GREEN

Each production slice was preceded by execution of its new failing test; existing
slices stayed green while the next slice was added:

| Slice                               | Observed RED                                      | Observed GREEN |
| ----------------------------------- | ------------------------------------------------- | -------------- |
| Module/remap/readiness              | Missing readiness function (`42883`), 0/1 passing | 1/1            |
| Exact DTO + mandatory audit         | Missing lookup function (`42883`), 1/2            | 2/2            |
| C-locale case fold                  | Mixed-case request returned null, 2/3             | 3/3            |
| Current Customer target restriction | Staff DTO leaked instead of null, 3/4             | 4/4            |
| Fixed reason validation             | Missing expected rejection, 4/5                   | 5/5            |
| Exact ASCII input validation        | Missing expected rejection, 5/6                   | 6/6            |

Additional regression/security tests exercise existing guards, ACLs, audit failure,
raw paths and cleanup. They passed without replacing the shared authority helper.

## Verification results

- `node --test tests/backend/database-customer-lookup.test.ts tests/backend/database-staff-entry.test.ts`: **19 passed, 0 failed** (14 lookup, 5 historical staff-entry).
- Final `node --test tests/backend/*.test.ts`: **67 passed, 0 failed/skipped**, after native version alignment. An earlier worker checkpoint had 65/66 due to comparing a historical foundation fixture with the new registry. Parent kept the historical expectations explicit and added a separate full-current schema/module/dependency/permission/grant parity test; no assertion removed or deployed migration changed. Lookup suite now has 15 checks.
- Targeted ESLint: passed. Targeted Prettier: applied; existing staff-entry formatting unchanged. `git diff --check`: passed.
- The first combined CLI invocation was blocked by the lifecycle scan budget before execution. Direct `node` invocation of the installed formatter/linter succeeded; no installation or network workaround was needed.

The staff-entry fixture is narrowed to migrations through
`20261029113028_staff_entry.sql`, preserving every assertion of Area 6's historical
pre-tool defaults. The new lookup suite executes **all current migrations**.

Actual final **local TEST fixture** counts, read from SQL after transaction cleanup:

| Item                              | Count |
| --------------------------------- | ----: |
| Users                             |     0 |
| Staff memberships                 |     0 |
| Verified factors                  |     0 |
| Pending factors                   |     0 |
| Audit events                      |     0 |
| Enabled `customer_lookup` module  |     1 |
| Enabled `staff`/`support` modules |     0 |
| Owner/Admin lookup grants         |     2 |
| Customer lookup grants            |     0 |

These are local fixture counts, not hosted users/factors. Parent separately applied
and read back hosted history `20261029121812`, name `customer_lookup`. All four
function signatures/volatility, empty search paths, authenticated-only execute
and public-invoker/private-definer boundaries match the contract. The new module
is enabled with profiles/access/audit dependencies and only Owner/Admin lookup
grants; staff/support remain off and raw private-table client DML denied.

Actual hosted post-apply counts remain zero staff memberships, zero verified,
one pre-existing pending factor and zero audit rows. Authenticated-role calls with
no subject were denied through both public/private lookup paths; readiness false,
no fake JWT injected and no audit added. This is unidentified-denial proof, not
native privileged acceptance. Do not alter the account or pending factor to close
that deferred acceptance.
