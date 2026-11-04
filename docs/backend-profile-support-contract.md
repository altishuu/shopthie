# Area 10 — audited Customer profile-support read

Implemented and installed as bounded Area10; native privileged staff/MFA and true multi-session acceptance remain deferred. Clean user HEAD `89f7082 added audit history`. Complete this slice, review before native install, hand off and stop. No source copies/snapshots/manifests, staging/stash/reset/commit/push/deploy, paid services or actual role/status/MFA/Owner changes. Existing unchanged-account/native acceptance deferrals persist; do not enroll/remove factors or create staff merely for testing. Public signup/privacy/email gates unchanged.

## Scope and authority

Selected current Customer only, never self or current Owner/Admin. Read-only minimal projection `{subject,username,phone}`: phone optional/null, supplied by Customer and UNVERIFIED, never identity proof. No age/email/addresses/provider Auth fields, revisions, bulk directory/export/editing/contact links or other support capabilities. Current active confirmed Owner/Admin plus AAL2 and current verified TOTP, module/grant checks at app/native boundaries. A suspended Customer remains supportable; actor must be active.

A separate optional `profile_support` module depends on `customer_lookup`, `profiles`, `access`, `audit`. Add ONLY specific `support.profile.read` permission/scope, explicit reviewed Owner/Admin grants; Customer none. Leave generic `support.private.read` owned by broad support and OFF, and broad staff OFF. New pure authorize scope requires nonself Customer target and EXACT profile_help reason. Service eligibility uses trusted staff identity/ready RPC; do not fabricate loaded target-role facts from form input. Native operation is authoritative for actual target and atomic read+audit.

## Inputs/DTO/fixed RPCs

Exact form fields, each once: `expected_subject`, `target_subject`, `username`, `reason` (+framework bookkeeping only). Caller assertion actual current identity only; target UUID not actor selector. Canonical lower UUIDs; username existing strict ASCII3–32, preserve spelling, case-insensitive comparison; no whitespace repair. Reason only `profile_help`, explicitly chosen for THIS disclosure (do not auto-carry lookup reason). No phone/role/scope/actor/limit form fields.

UI selected target ID AND username bind this request to the current lookup context. If username no longer matches target, reject and require fresh lookup; no silent reinterpretation. Native p_username raw preserves input; compares ASCII case-insensitively.

Native fixed signatures (public invoker -> private definer, empty paths; authenticated client execution only, PUBLIC/anon/raw tables denied):

- `shopthie_profile_support_ready()` boolean STABLE, only self capability, no data/read audit.
- `shopthie_profile_support_read(p_target uuid,p_username text,p_reason text)` jsonb VOLATILE. No actor parameter. Require real current support.profile.read and Owner/Admin, validate canonical username/reason/target+self restriction. UUID-sort SHARE-lock actor+target parent accounts; recheck current actor/capability and target Customer/profile/username. Do not lock child role/profile rows. Project EXACT3 keys (phone null or existing canonical allowed phone). INSERT mandatory audit `support.profile.read`, category profile_help, outcome read, actor/target IDs only; never phone/username/free text. After audit recheck current actor/authority, target still Customer/nonself, current username matches original and exact projection unchanged. Failure/role or phone/username change/audit failure rolls back; no DTO. Existing parent-before-child trusted writer discipline/true concurrency caveat unchanged. Do not modify deployed migrations.

## Interface ownership

Backend worker owns `src/modules/profile-support/{types,policy,service,adapter,server,actions}.ts`, registry/access mappings/role grants and `tests/unit/backend-profile-support{,-adapter,-server}.test.ts` plus access-unit tests as necessary. SQL worker owns one new `supabase/migrations/20261104120706_profile_support.sql`, `tests/backend/database-profile-support.test.ts`, `docs/backend-profile-support-database.md`, and historical Area9 SQL fixture cutoff/parity expectation. Parent owns UI/integration, audit decoder/UI labels and historical foundation/lookup/status expectations. No overlapping edits; ask/report exact interfaces, no production stubs.

Types/exports:

- `ProfileSupportRecord={subject:string;username:string;phone:string|null}`.
- `ProfileSupportPageState={status:'ready';subject:string}|{status:'guest'}|{status:'mfa_required'}|{status:'denied'|'unavailable';message:string}`.
- `ProfileSupportResult={status:'ready'|'error';message:string;profile:ProfileSupportRecord|null}`; errors ALWAYS profile null, sanitized diagnostics.
- `ProfileSupportInput={valid:false}|{valid:true;expectedSubject:string;targetSubject:string;username:string;reason:'profile_help'}`.
- `validateProfileSupportInput(FormData):ProfileSupportInput`.
- `decodeProfileSupportRecord(value:unknown,targetSubject:string,username:string):{valid:true;profile:ProfileSupportRecord}|{valid:false}`. Exact own keys, strict UUID/username/phone; subject+username bound, no added fields. Username comparison case-insensitive only after original grammar validated, do not normalize input/output.
- `readProfileSupportPage(port):Promise<ProfileSupportPageState>` and `readProfileSupport(port,FormData):Promise<ProfileSupportResult>`.
- `createProfileSupportTransport(client,identity):ProfileSupportTransport`: actual installed user-scoped SDK, fixed rpc ready/read with only p_target,p_username,p_reason. Factory request-scoped; NO admin/service-role or raw profile query. EnabledModules injection for tests allowed, no client-selectable module input.
- server `getProfileSupportPageState()`.
- actions `checkProfileSupportSessionAction():Promise<ProfileSupportPageState>` ZERO args/self-only readiness; `loadProfileSupportAction(FormData):Promise<ProfileSupportResult>`, writable request client only for cookie lifecycle, no account-data edits.

## UI parent

`ProfileSupportManager({subject,customerSubject,username})` under valid lookup result only when current profile-support readiness matches current lookup actor. Key includes caller+target+username; optional profileSupportEnabled defaultfalse. Update page/staff copy honestly, role/MFA/private addresses remain absent. Only explicit reason select (placeholder then profile_help) and View profile support action may disclose; no automatic private read, retry or carryover. Phone plain text with unverified/customer-supplied warning, null Not provided; no tel/copy/export links. Runtime exact action+record decoding using real policy; ignore raw provider messages. Source state empty+disabled; StrictMode setup/Activity restoration renew only exact current same-subject profile-support capability; clear number/reason/pending/messages, invalidate late responses across subject/target/username/account/scope/browser lifecycle. No persistence/shared cache/logging. Scoped listeners cleanup; native pagehide clears before restore, revalidate on focus/show/visible.320px >=44px controls/>=16px text/long IDs usable, no global motion changes. No public storefront auth calls.

## History extension

SQL worker may replace ONLY current private audit_events reader in NEW migration to add one reviewed eligible combination: eventType `support.profile.read`, reason profile_help, outcome read, nonnull target. Preserve actual actor scope, cursor precision/lookahead/filters/ACL/path/locks/final checks and zero read writes. Parent extends AuditEvent union, pure decoder and fixed label for that combination ONLY; generic support.private.read/other types stay excluded. Audit viewer must never show phone/username. Keep historical Area9 tests at `20261030012105_audit_view.sql` with explicit historical permission/module/grant expectations; latest full parity and support-history tests in new SQL suite. Existing history public wrapper signature unchanged.

## Essential verification/delivery

Vertical observed RED→GREEN for each tracer. SQL actual-role TEST-claim fixtures cover current staff/MFA/module/grant authority, Customer/nonself restriction, binding failures, exact minimal data, reason/unknown input/no raw grants, audit failure rollback/no data, actor revocation and target role/phone/username changes during audit fail closed, unchanged actor scope/cursors/history projection, disabled profile_support leaves lookup/status/history/required recording functional, complete latest registry/dependency/permission/grants parity. No native positive claims from fixtures; independent review before hosted apply once, exact history/schema/ACL/module/count readback and canonical filename alignment. Native controlled Customer/guest denial/logout only; no real privileged phone read or real role/MFA/status edits for acceptance. Affected build/static/unit/backend and tiny desktop/mobile protected-route checks, not broad repeated storefront matrices. Stop after Area10; addresses/email/private-support expansion and Owner work NOT authorized by this slice.
