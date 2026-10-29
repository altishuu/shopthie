# Area 8 — Customer application-access status

Status: bounded implementation handed off; independent correction review PASS, hosted `20261029165555_customer_status` installed/read back, native privileged/multi-session acceptance deferred. Stopped after this area. Repository start: clean user commit `626c68f added audited customer lookup`.

## Scope

Active confirmed Owner/Admin with AAL2 and current verified TOTP can review and suspend/reactivate a currently Customer account's **application access**. Never change Owner/Admin status, self, roles, MFA, provider bans/passwords/sessions, account creation/deletion or contact fields. This is NOT a Supabase Auth ban or JWT/session revocation. Existing native/app active-account guards deny suspended accounts on protected app data paths; public storefront stays public.

Use a dedicated optional `customer_status` module (dependencies customer_lookup/access/audit; profiles transitively). Move only `customer.status.manage` to it, preserve existing Owner/Admin grants, no Customer grant. Enable only this module in addition to existing lookup. Staff/support modules remain OFF. No Owner bootstrap/transfer/last-owner management or private support/audit-list UI.

Persist `app_accounts.status_revision integer not null default 0`, nonnegative/bounded. A fixed-path trigger must bump revision on every status transition, including trusted direct operator writes; reject caller revision tampering and exhausted revision. Existing account IDs immutable. Do not change actor-context or Area7 lookup DTO contracts. Customer status record is exactly `{subject:UUID,status:'active'|'suspended',revision:integer 0..2147483647}`.

## Lifecycle/serialization prerequisites (same bounded area)

Lookup must not rely on a single permission precheck or only edit/unmount clearing:

- Adopt consistent per-subject locking using existing account rows. Lookup locks actor/candidate account rows FOR SHARE in UUID order, status operations FOR UPDATE in UUID order; recheck authority after waits. Membership/profile writers must participate by acquiring parent account FOR UPDATE via fixed-path private triggers. Existing status/profile/address operations already lock accounts; account deletion holds its row lock and cascades must remain usable. Do not lock child role/profile rows from read/status RPCs (avoid reverse lock ordering). Reject owner-ID reassignment on membership/profile updates. Trusted administrative writers MUST lock every affected parent account in UUID order BEFORE issuing role/profile child DML. BEFORE ROW triggers are a fallback: PostgreSQL may already have locked a child tuple, so arbitrary direct writers can deadlock with parent-first writers/cascades. Such transactions must fail/roll back rather than be described as deadlock-free. Bulk administrative operations and genuine multi-session acceptance remain out of scope.
- Lookup initially authorizes before candidate access, discovers a candidate UUID, then locks actor/candidate together and reloads the Customer-only exact-username projection. Recheck actor authority AND target membership/current projection AFTER mandatory audit insert as well, to fail closed on deterministic same-transaction audit-hook transitions. Error/rollback rather than returning a now-staff DTO. Add actor/target transition regressions, lock-order/cascade tests. Native MFA tables remain provider-owned; no direct Auth writes/triggers.
- Client must discard sensitive results and invalidate outstanding requests on navigation/Activity preservation, pagehide/pageshow/focus/session changes and changed actor props, not only edit/unmount. Clear before restoration can show an old DTO; revalidate current readiness/subject before enabling a restored form. Do not automatically re-run any Customer lookup/read/mutation. Real React Activity/preserved-component and account-change regression fixtures required. Browser lifecycle clearing/listeners need scoped cleanup.

Do NOT edit deployed migration `20261029121812_customer_lookup.sql`; replace affected functions and add guards in ONE new `*_customer_status.sql`. Preserve history. Fixture transitions/claims are local TEST evidence, not native multi-session/JWT/OTP proof. If real multi-session testing is unavailable, state the limitation plainly.

## Interfaces (freeze before parallel work)

Parent owns `src/modules/customer-status/{types,policy,service,adapter,server,actions}.ts`, registry/access changes, and lookup/actions.ts session-check export; parent tests backend-customer-status*.test.ts except UI. SQL worker owns new migration, database-customer-status.test.ts/database docs; may update old full-current parity fixture historical cutoff without weakening assertions; must add latest complete-registry parity in new suite.

Types/exports:

- `StatusReason = 'account_security'|'customer_request'|'account_review'` (fixed categories, no free text).
- `CustomerStatusRecord = {subject:string;status:'active'|'suspended';revision:number}`.
- `CustomerStatusPageState = {status:'ready';subject:string}|{status:'guest'|'mfa_required'}|{status:'denied'|'unavailable';message:string}`.
- `CustomerStatusResult = {status:'ready'|'success'|'conflict'|'error';message:string;record:CustomerStatusRecord|null}`. Only ready/success may carry a validated record; conflict/error must null it.
- `getCustomerStatusPageState():Promise<CustomerStatusPageState>` from customer-status/server.ts; current identity/capability readiness, no target read.
- `loadCustomerStatusAction(FormData):Promise<CustomerStatusResult>` and `changeCustomerStatusAction(FormData):Promise<CustomerStatusResult>` from customer-status/actions.ts. Both accept exactly `expected_subject`, `target_subject`, `reason`; change additionally `revision`,`desired_status`,`confirm_change='yes'`. Canonical lower UUIDs, unique fields, no role/actor override. expected_subject asserts current caller only; target_subject legitimately chooses a Customer resource, never actor authority. Current verified staff before transport; all target facts native-loaded, not form authority.
- `checkCustomerLookupSessionAction():Promise<LookupPageState>` added by parent to lookup/actions.ts. No arguments/Customer read/audit: verify current readiness and subject. UI compares current subject with its SSR subject; fail closed on mismatch/error. No raw exception messages.

SQL RPCs (public invoker → private definer, all empty search_path, auth-only execute, no PUBLIC/anon/raw-table grants):

- `shopthie_customer_status_ready()` -> boolean, stable, `has_permission('customer.status.manage')`.
- `shopthie_customer_status_read(p_target uuid,p_reason text)` -> jsonb exact record. VOLATILE due to mandatory audit `customer.status.read`, outcome `read`, fixed reason. Lock/recheck current Customer, not self/staff, active verified staff. Error indistinguishably for missing/staff target. Audit failure returns nothing; post-audit authority/target recheck.
- `shopthie_customer_status_change(p_target uuid,p_status text,p_revision integer,p_reason text)` -> jsonb exact record. Lock actor/target in UUID order, recheck live authority and target Customer. CAS revision (P0001/message `customer_status_conflict` on stale); status must actually change, no false no-op success. Update+minimal audit `customer.status.change` outcome desired status in same transaction, post-write/audit authority/Customer/status/revision checks; failures roll back both. No target field grant or status change for staff/self even with forged claims.

Service change should first reload current Customer status through the audited read RPC (not trust client role/status), compare revision, authorize using trusted returned Customer facts, then call native change which rechecks atomically. Readiness is self-capability only. Validate matching target/revision+1/desired status postcondition and exact DTO keys, sanitize all failures; ambiguous write must return error/null, never fabricated success or automatic retry.

UI worker owns customer-status/components/customer-status-manager.tsx; lookup/components/customer-lookup-manager.tsx and affected UI tests; lookup page.tsx and staff.css; may update staff page readiness/copy and own tests only if needed. No new full management dashboard.

- `CustomerStatusManager({actorSubject,customerSubject}:{actorSubject:string;customerSubject:string})`; import action/types above. Explicit reason + Check current access button (audited read), then desired status opposite current, explicit confirmation and change button. No automatic target reads, mutations or retries. Show app-access-only semantics, not provider ban/revocation. Clear record on edits/session/navigation and conflicts/errors; block ambiguous updates until deliberate fresh check. Duplicate/in-flight/stale/unmounted response guards. Accessible controls >=44px/16px, 320px usable.
- Lookup manager new optional prop `statusEnabled?:boolean` default false; show status manager only under a valid found result when enabled. RSC lookup page obtains status readiness only after lookup ready and passes true only same verified subject. Subject-key the manager. Broader lookup module/page disabled behavior unchanged. Existing test fixtures must mock the new status import/session action explicitly; don't create production fake providers.
- Revalidate readiness on restored component via checkCustomerLookupSessionAction; clear/discard old records before any rendering. Native capability checks still authorize every server operation regardless of client lease. New status manager inherits same session safety; outer clearing/unmount must invalidate pending status writes' rendering too. No local/session storage, querystring PII, cached records or auto target fetch.

## Native/delivery boundaries

No real staff account exists at prior readback. Do NOT promote/create one, mutate the controlled Customer's actual status, change roles/MFA, clear its pending factor or bootstrap Owner for acceptance. Use explicitly labeled local PostgreSQL/SDK/React fixtures; native guest/Customer denial/readback are allowed. Keep real write/privileged/MFA/multi-session acceptance deferred when unavailable, not simulated as native success. One focused independent review before one hosted apply; read back exact history/signatures/ACLs/modules/data invariants and align local filename. Essential build/static/unit/backend/affected desktop/mobile checks only; preserve motion architecture, user index, source-copy prohibition, free-only, signup/email/privacy gates and no commit/push/frontend deployment.
