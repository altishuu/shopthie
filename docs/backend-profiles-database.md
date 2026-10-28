# Area 3 profiles — local database evidence

## Scope and interface

`supabase/migrations/20261028181746_profiles.sql` follows the unchanged authority foundation. Its draft version was taken from local UTC tool output; after hosted application, the filename was aligned with the actual hosted history version `20261028181746`. SQL contents were unchanged. The test discovers the single `*_profiles.sql` file.

- Enables only `profiles`; identity/access/audit remain enabled and other optional modules remain disabled.
- Adds private account-FK-owned profile storage: username, optional phone, revision and timestamps. Phone is stored syntax, **not verification**. No email, age or authority fields.
- `public.shopthie_profile_read()` returns JSON null before setup or exactly `{username,phone,revision}` for the current actor.
- `public.shopthie_profile_save(p_username text,p_phone text,p_revision integer)` creates at revision 0, otherwise requires the exact stored revision and increments it. NULL clears phone; blank text is rejected, not repaired.
- Username uniqueness folds ASCII using C-locale lower while retaining the supplied display case.
- Denial is `42501`; malformed arguments are `22023`; stale/create-version mismatch is `P0001` / `profile_conflict`; username collision is `23505`. Storage CHECKs also protect privileged accidental invalid writes.
- No caller-selected account ID, raw client table grants or RLS policies. Public wrappers are invoker functions; private implementations are definer functions with empty fixed search paths. Only authenticated callers have execute privileges.
- Save checks the existing permission helper, locks the caller's existing app-account row, rechecks authority after the lock, then validates/compares revisions and mutates. Current role, membership, status, modules/dependencies and MFA come from the existing helper, not editable metadata.

## Executed checks

Core behavior was built as successive failing-test → minimal SQL → passing-test slices: missing migration/read; missing save/revision workflow; case-insensitive collisions; username validation; phone validation; invalid revision handling; explicit JSON null (distinct from SQL NULL). Additional focused security regressions exercise the already installed guards and defense-in-depth.

Final commands:

```sh
node --test tests/backend/database-foundation.test.ts tests/backend/database-profiles.test.ts
node node_modules/eslint/bin/eslint.js tests/backend/database-profiles.test.ts
```

Result: **30 tests passed, zero failures** (14 profiles, 16 foundation); targeted ESLint passed. The profile test file was formatted with the installed Prettier CLI. No build, installation, deployment, commits or app-source changes were performed by this database worker.

Coverage includes A/B isolation; forged metadata; public/private RPC anonymous denial; missing identity; live membership/status/grant/module/direct and transitive dependency changes; customer and privileged-role MFA; extra positional/named target-ID rejection; minimal DTO/storage; phone clear; uniqueness; conflicts preserving full stored rows; lifecycle/timestamps; real raw ACL rejection; default-deny RLS even after isolated accidental SELECT/DML grants; installed function security.

## Explicit limits / parent handoff

All identities, claims, MFA rows and role changes are **isolated TEST fixtures in real PGlite PostgreSQL**, rolled back between cases. There is no JWT signature verification, GoTrue/native login, hosted Supabase/PostgREST test or controlled live-account mutation here.

PGlite uses one connection. Sequential conflict/rollback behavior is executed; account-row lock and post-lock guard ordering are additionally checked against the installed function body. This is **not** a multi-session lock-wait/concurrency proof.

Parent owns SDK/UI integration, hosted review/application/readback and any live smoke. Baseline migration and shared fixtures were not edited. Stop boundary remains customer profiles only.
