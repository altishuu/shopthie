# Area 7 — audited exact Customer lookup

Status: bounded implementation handed off after Area 6 authorization; review PASS, hosted `20261029121812_customer_lookup` applied/read back. Native privileged acceptance deferred; stopped here, no general B3 expansion.

## Scope

- Active confirmed Owner/Admin with AAL2 AND current verified TOTP may look up one Customer by exact username (ASCII 3–32, case-insensitive matching the profiles C-locale unique index). No substring/wildcard/list/pagination/export/email search.
- Return only `{subject: UUID, username: string, status: 'active'|'suspended'}` or null. Targets MUST currently have Customer membership; staff/nonexistent/unprofiled targets are indistinguishable no-match. No email, phone, address, age, timestamps, factors or auth metadata.
- Require a fixed reason category: `account_access`, `profile_help`, `address_help`. No free-text reason. A read and its audit insert MUST be one native database operation/transaction; audit failure returns no result. Record actor/target UUIDs, event_type `customer.lookup`, reason_category, outcome `found`/`not_found`; never copy the searched username or private fields into audit logs.
- No account mutation, suspension, role change, Owner bootstrap, recovery, MFA change, private support read or audit-list UI. Existing staff/support modules remain disabled.
- Split the existing `customer.lookup` capability into a dedicated optional `customer_lookup` module (dependencies profiles/access/audit). Explicitly preserve reviewed Owner/Admin grants, no Customer grant. Enable only this new module in the migration. `customer.status.manage`, `staff.manage`, support remain disabled. No other authority/helper/actor-context contract change.
- Database readiness must drive whether the form/link is available; module disabled must block UI, action and direct database operation. `authorize` directory scope now requires an approved reason and returns `requiresAudit: true`. Never raw-read private tables or audit storage from the client.

## Fixed integration interfaces

Parent owns `src/modules/customer-lookup/{types,policy,service,server,actions}.ts`, registry/access changes and their tests.

Types:

- `LookupReason = 'account_access'|'profile_help'|'address_help'`.
- `CustomerLookupRecord = {subject:string;username:string;status:'active'|'suspended'}`.
- `LookupPageState = {status:'ready';subject:string} | {status:'guest'} | {status:'mfa_required'} | {status:'denied'|'unavailable';message:string}`.
- `LookupActionResult = {status:'found'|'not_found'|'error';message:string;customer:CustomerLookupRecord|null}`. Error/missing must contain null customer. No raw provider details.
- `getCustomerLookupPageState():Promise<LookupPageState>` exported from server.ts. Verified request-scoped identity, application permission/module check then readiness RPC; require exact boolean true. No shared cache.
- `lookupCustomerAction(data:FormData):Promise<LookupActionResult>` exported from actions.ts. Accept exactly one each `expected_subject`, `username`, `reason` plus framework `$ACTION_` bookkeeping. No hidden actor/role/target selector. expected_subject only binds the current verified caller, never chooses the caller. Strict input and current verified actor before RPC; recheck native authority in SQL. DTO strictly decoded and case-folded returned username must match the requested name.

SQL worker owns one new `*_customer_lookup.sql`, `tests/backend/database-customer-lookup.test.ts`, docs/backend-customer-lookup-database.md. May narrow Area6 database-staff-entry fixture to migrations through staff_entry (it asserts historical pre-tool defaults); do not weaken assertions. Do not modify prior deployed migrations.

Native RPC contracts:

- `public.shopthie_customer_lookup_ready()` -> boolean, invoker over private `customer_lookup_ready()` definer; true only when live `has_permission('customer.lookup')` grants access.
- `public.shopthie_customer_lookup(p_username text,p_reason text)` -> jsonb null or EXACT `{subject,username,status}`, invoker over private `customer_lookup(text,text)` definer. Authorization before any target read; permission live TOTP+AAL2 and current role/status/module required. Validate ASCII exact username/reason server-side. VOLATILE (audit write), fixed empty search path. Authenticated execute only, no anon/PUBLIC execute, no raw-table grants. No public/private helper bypass without audit. Audit failure must abort the read result.

UI worker owns `src/modules/customer-lookup/components/customer-lookup-manager.tsx`, `src/app/(staff)/admin/customers/page.tsx`, `src/app/staff.css`, src/app/(staff)/admin/page.tsx and affected UI/e2e tests. Do not modify parent service/types/server/actions files.

- Component export `CustomerLookupManager({subject}:{subject:string})`, imports lookupCustomerAction/types. Controlled exact username and required reason select; form method post, in-flight guard, no automatic lookup/prefetch or retries, no local/sessionStorage. Clear old result immediately on edited input/reason; ignore late response after edits/unmount. Render text, no HTML; no raw exception messages. Only valid result matching the submitted username can render; no result on error. Accessible status, labels, 16px inputs/selects, >=44px buttons, 320px usability.
- Protected noindex request-scoped Suspense route `/admin/customers`, IdentityShell/RouteMotionReady, guest -> login, MFA -> security, no form when denied/unavailable. Direct sign-out and account/staff/security links. Explain each submitted lookup is audited and private support fields are not available.
- Staff entry gets the lookup link only after readiness; keep old self-entry DTO contract unchanged. Update tools-disabled copy honestly: customer lookup may be available, account management/private support are not. Existing denied/guest behavior unchanged.

## Verification and native boundaries

Use vertical RED→GREEN, real PostgreSQL role/ACL/audit failure execution with clearly labeled TEST claims, exact/no-match/mixed-case matching, staff exclusion, forged claims, module/grant revocation, stale AAL2/no current TOTP, suspended actor and no raw read. One focused independent review before any hosted apply; read back exact functions/history/ACL/modules and align filename after success. Build/static/unit/backend and small affected desktop/mobile checks, no broad storefront matrix or second animation loop.

No staff account exists at last handoff. Do not create/promote one, mutate account roles/MFA, enroll/cancel the existing pending factor, request new secrets, bootstrap Owner or bypass the user's unchanged-account decision merely to close acceptance. Real Customer denial and guest isolation are allowed read-only checks; privileged native acceptance remains unverified without separately authorized staff participation. Existing source-copy prohibition, no commits/staging/push/deployment, free-only, signup/email/privacy gates remain.

Repository start: clean main at user commit `6c6b93c added totp`. Native read-only preflight: dedicated Shopthie ACTIVE_HEALTHY; zero staff memberships, zero verified factors, one pre-existing pending factor, zero audit rows; profiles enabled, staff/support disabled; customer_lookup module/RPC absent. No account/security changes performed.
