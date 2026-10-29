# Area 4 — address database handoff

## Delivered boundary

- `supabase/migrations/20261029031614_addresses.sql` is self-contained and transactional. It adds four private tables, three authenticated-only invoker/definer RPC pairs and an unexposed text-validation helper. It enables only `geography` and `addresses`; prior migrations and the shared TEST auth fixture are unchanged.
- The single embedded public JSON seed equals `src/modules/geography/data/database-reference.json`. Installed reference rows are compared against every normalized country, required-presence flag and country-scoped subdivision ID. Reference: 250 countries/territories and 3,847 selectable GeoNames ADM1 IDs; HK has no selectable coded areas. Attribution is in the migration and `src/modules/geography/data/NOTICE.md` / `provenance.json`.
- Read/save/delete return only `{revision,addresses}` with explicitly selected eleven-field address DTOs, UUID ordering, no owner IDs or timestamps. Save accepts exactly ten directly typed editable JSON fields. All actor selection is internal through `auth.uid()`.
- Mutations lock the existing account, recheck live permission, compare the persistent whole-book revision, then mutate atomically. The ten-address cap, partial-unique default index, optional absence of a default, generic foreign/unknown-ID conflicts and retained revision after final deletion are exercised.
- Text is preserved literally, bounded with PostgreSQL `char_length`, checked against the explicit ECMAScript trim set, and rejects C0/C1 controls plus U+2028/U+2029. Optional strings must be SQL/JSON null rather than empty strings. Geography rules require presence only, with manual area fallback allowed for every country; no postal deliverability validation.

## Executed evidence

```sh
node --test tests/backend/database-addresses.test.ts tests/backend/database-foundation.test.ts tests/backend/database-profiles.test.ts
node node_modules/prettier/bin/prettier.cjs --check tests/backend/database-addresses.test.ts
node node_modules/eslint/bin/eslint.js tests/backend/database-addresses.test.ts
```

The combined SQL run passes 47 tests: 17 new address tests and all 30 existing foundation/profile tests. Eight sequential RED→GREEN implementation slices were observed: missing embedded seed/read; missing save RPC; incorrect JSON validation errors; incorrect geography errors; accepted invalid text; multiple defaults; accepted eleventh address; missing delete RPC. Additional security/regression assertions exercise existing guarded behavior.

Coverage uses real PGlite PostgreSQL, actual `anon`/`authenticated` database roles, and the existing trusted TEST claims fixture. It includes A/B isolation, forged metadata, status/membership/grant/module/dependency/MFA denial, direct/private RPC denial, raw ACLs, default-deny RLS after accidental grants, function catalogs/signatures/search paths, account cascade, stale revisions and integer-ceiling behavior. Every country is exercised with its presence rules, manual fallback and available coded membership.

## Parent integration / hosted readback

The parent applied the unchanged SQL, aligned the draft filename with hosted history version `20261029031614`, and independently verified counts, exact reference fingerprint, private ACL/RLS and function/module boundaries. Real controlled-account CRUD/default/conflict/isolation/logout checks passed; synthetic address entries were removed. See `backend-area-4-results.json`. Worker-only limitations below remain explicit.

## Limits / worker-only verification

- No native/hosted database changes, provider login/JWT verification, app changes, installs, builds or commits were performed here.
- PGlite is single-connection. Account-lock/recheck ordering has a structural catalog assertion, not a multi-session wait/concurrency proof. Native apply/readback belongs to the parent.
- PostgreSQL rejects U+0000 in `jsonb`/`text` before RPC dispatch. Likewise malformed UUIDs or out-of-range integer parameters fail their PostgreSQL type parser before custom address validation. Duplicate JSON object keys cannot be recovered after `jsonb` parsing; the application must reject duplicate form fields before constructing JSON.
- This is own-book CRUD only, with no staff/support operations or connection to demo checkout.
