# Shopthie — modular backend blueprint

**Status: implementation authorized area-by-area.** The user approved starting this blueprint. See `backend-progress.md` for verified implementation status rather than treating the whole blueprint as completed. Public signup/teen policy and email delivery remain deferred; free-only limits, project selection, no Stripe, no unsolicited commits/pushes or deployment remain unchanged.

## 1. Agreed first-release scope

- Supabase-backed email/password accounts; required signup fields are email, password and username.
- Owner, Admin and Customer roles, with reusable permissions rather than scattered role-name checks. Manager/Cashier are future roles.
- Customer-owned profiles and saved addresses. Optional age range, phone and addresses; no DOB.
- Worldwide country/territory and country-dependent province/state/region selection, with dataset coverage and licensing reviewed before adoption.
- A minimal staff dashboard for user lookup, customer status and restricted, audited support views. Only Owner manages staff access.
- Authenticator-app MFA required for Owner/Admin; optional for customers.
- Philippines operator, intended teenage/adult audience, real personal information, free services only.
- Developer-managed feature modules/configuration; no runtime Owner feature-toggle dashboard at launch.

**Deferred by decision:** exact signup-age cutoff and under-18 safeguards; email-sender implementation. Public teen signup stays gated. Public account launch also requires functioning verification/recovery delivery. No silent verification bypass.

**Not in this release:** live product/inventory administration, cloud cart/wishlist synchronization, real orders, Stripe, any other payment gateway, POS, custom-role editing, public customer profiles, uploads or SMS verification. Existing frontend commerce remains a clearly labeled demo.

## 2. Architecture: one backend, separated feature modules

Use the existing Next.js application with Supabase Auth/Postgres, not a new microservice fleet. Keep provider-specific code at a small integration boundary. UI/routes call module services; services apply validation and authorization and use narrowly scoped repositories/RPCs.

```text
Existing storefront ─────────── remains independently usable
Account/staff UI → route/action → module service → user-scoped Supabase/RPC
                                      ↓
                             identity + access policy
                                      ↓
                        database constraints / RLS / audit
```

### Suggested layout — directories are proposals, not created files

```text
src/
  app/
    (auth)/       login, signup, confirmation, recovery, MFA
    (account)/    account/profile, addresses, security
    (staff)/      admin/users, support lookup, staff management
  modules/
    identity/     login/session/MFA/provider-facing account lifecycle
    access/       actor context, permissions, target restrictions
    profiles/     customer profile rules and forms
    addresses/    address-book rules and forms
    geography/    country/subdivision reference data
    support/      authorized private-data lookup
    audit/        protected security/support event recording
  platform/
    supabase/     browser/server clients and session-refresh adapter
    config/       validated environment and module configuration
  proxy.ts        session refresh only; not the sole authorization boundary
supabase/
  migrations/     only after implementation approval
```

The actual project currently uses Next.js 16.4.3, React 19.3.0, App Router and Cache Components, based on its manifest/configuration. Supabase's current SSR guidance uses separate browser/server clients and Next.js 16 `proxy.ts` for refreshing cookies. It warns against trusting an unverified `getSession()` result for server authorization.[11] Exact package versions and integration details must be rechecked when implementation is approved.

### Module contracts

Each feature declares its ID, dependencies, public service interface, validation/DTOs, UI/API entry points, permissions, database changes, configuration and enable/disable behavior.

- Do not import another module's internal repository or scatter raw SDK queries through UI components.
- Add a feature through its own module, permission definitions, wiring and migrations; avoid a generic runtime plugin framework.
- Disabling a feature must cover UI and server operations, plus database/API entry points where applicable. A hidden link is not a disabled backend.
- Distinguish hiding a feature, disabling writes, retiring API access and permanently deleting data. Destructive removal needs separate approval.
- Identity/access enforcement and required audit controls cannot be disabled as optional features.
- No automatic permission grants for a newly added module; review its role grants explicitly.
- Future provider replacement should be localized, but database/auth migrations may still be necessary; it is not promised to be a configuration-only switch.

## 3. Proposed permission and ownership model

Start with one active application role per account. Owner/Admin also receive ordinary own-account capabilities, so they can use the storefront without a second Customer role. Multi-role assignment and editable roles are not launch requirements. Application roles are distinct from Supabase platform/team access.

| Capability                                       | Customer                        | Admin                           | Owner                                 |
| ------------------------------------------------ | ------------------------------- | ------------------------------- | ------------------------------------- |
| Browse existing storefront                       | Yes                             | Yes                             | Yes                                   |
| Read/update own allowed profile fields           | Own only                        | Own only                        | Own only                              |
| Manage saved addresses                           | Own only                        | Own only                        | Own only                              |
| Use account export/deletion controls             | Own; protected reauthentication | Own; protected reauthentication | Own; transfer/last-owner rules first  |
| Search minimal customer account metadata         | No                              | Yes, staff MFA                  | Yes, staff MFA                        |
| Suspend/reactivate Customer accounts             | No                              | Yes, customers only             | Yes                                   |
| View private support fields                      | No                              | Scoped, reasoned and audited    | Scoped, reasoned and audited          |
| Assign/revoke Admin access                       | No                              | No                              | Yes, verified target and staff MFA    |
| Manage other privileged accounts                 | No                              | No                              | Owner safeguards apply                |
| Review staff audit events                        | No                              | Proposed: own actions           | Proposed: all authorized staff events |
| Edit role definitions or runtime feature toggles | No                              | No                              | Not a launch capability               |
| Process payments or modify live inventory        | Not implemented                 | Not implemented                 | Not implemented                       |

Suggested capability names include `profile.read_own`, `profile.update_own`, `address.manage_own`, `customer.lookup`, `customer.status.manage`, `support.private.read`, `staff.manage` and `audit.read`. These names are proposed application identifiers, not installed provider roles.

Enforcement requirements:

1. Verify identity and active account status on protected server/data paths.
2. Resolve current application membership/permissions from trusted data; deny unknown permissions by default.
3. Enforce ownership and target restrictions, not just a global permission. Admin cannot suspend Owner/Admin accounts through a customer-status endpoint.
4. Enforce required MFA on privileged backend/RPC/data operations, not only when displaying the dashboard. Supabase documents MFA enforcement through backend/RLS assurance-level checks.[12]
5. Apply database RLS/constraints as additional protection. Prefer user-scoped access that preserves RLS; tightly isolate privileged administrative APIs.
6. Never accept roles, account status, email-verification state or permissions from customer profile updates. Supabase warns that user-editable metadata is not an authorization authority.[1]
7. Default new accounts to Customer through trusted provisioning; a signup form cannot grant staff privileges.
8. Keep role changes and suspension effective in application/database checks without relying solely on potentially stale role claims in a token. Define/test provider session-revocation timing rather than promise instantaneous JWT invalidation.

Owner bootstrap, transfer and recovery need an explicit trusted administrative procedure. No public first-user-becomes-Owner shortcut. Protect the last active Owner transactionally against concurrent role removal, suspension and deletion. MFA recovery must not become an email-only privilege-escalation bypass; do not promise provider recovery features that have not been verified.

## 4. Proposed data model

These are logical tables and constraints, not SQL migrations. Final schema placement, provider grants and policy SQL require review.

| Table                                           | Purpose and key constraints                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase-managed `auth.users`                   | Identity/password/session integration; never duplicate password hashes in application tables or expose this table to browser queries                    |
| `app_accounts`                                  | `user_id`, account status, lifecycle timestamps; status changes through authorized administrative operations only                                       |
| `profiles`                                      | `user_id`, username, normalized unique username, optional age-band code, optional international phone, timestamps; allowlisted own-field updates        |
| `addresses`                                     | Stable address ID, owner ID, country/subdivision reference, address lines, locality, applicable postal code, optional label, default marker, timestamps |
| `app_roles`                                     | Seeded Owner/Admin/Customer definitions; system-managed definitions initially                                                                           |
| `app_permissions`                               | Versioned capability definitions contributed by enabled modules                                                                                         |
| `app_role_permissions`                          | Reviewed role grants; customers and staff cannot directly edit definitions/grants                                                                       |
| `app_user_roles`                                | Trusted membership, assigner and timestamps; one active role per account initially                                                                      |
| `audit_events`                                  | Actor, target reference, event type, reason category, timestamp and outcome; no copied age/phone/address/password/token payloads                        |
| `reference_countries`, `reference_subdivisions` | Versioned, licensed geography reference data, or equivalent separately served reference files if more practical                                         |

Important constraints:

- Foreign keys, server validation, username uniqueness enforced in the database, useful owner/list indexes and bounded inputs.
- Country/subdivision relationship validated server-side; country-aware locality/postal requirements.
- If multiple saved addresses are approved, enforce at most one default per customer and update it transactionally. Do not share address ownership or expose other customers' address IDs/data.
- No payment-card, card-token, banking, DOB or identity-document columns.
- Username uniqueness/case handling, edit limits and address defaults are proposed defaults awaiting review.
- Privacy-basis/notice-version records may be needed for optional sensitive fields. Their exact representation follows the approved policy; do not preemptively add guardian records or invent a consent mechanism.
- Minimal public/reference data may be cached globally. Private profiles, roles, addresses and support responses must not enter shared cross-user caches.

## 5. Restricted support access and auditing

Owner/Admin can look up necessary private information for support, not browse or export a complete personal-data directory.

Proposed flow: locate an account using minimal metadata → choose an approved support reason → check active staff role and MFA → retrieve only required fields through an audited server/database operation → render the restricted result.

The audit write and authorized read must be coupled so a failed audit cannot return private data. Deny direct staff raw-table reads that would bypass this workflow. Do not assume a normal database write trigger audits SELECT queries. Keep underlying RPC/function permissions narrow and validate actor/target inside the trusted operation.

Prefer a controlled reason category over a free-text field that invites copying personal data into logs. Audit access itself is restricted. Final retention/redaction rules need approval; do not imply that deleting an account instantly erases provider backups or all lawful security records.

## 6. Registration, sessions and MFA

### Signup target flow — not enabled yet

1. Check authoritative registration policy and rate/abuse controls before creating an identity.
2. Validate required email/password/username; return safe errors without advertising whether an email account exists.
3. Create only a Customer identity; do not process privileged role metadata.
4. Verify email using a configured sender and controlled redirect allowlist.
5. Enter the private account area; optionally complete age range, phone and addresses after appropriate notices/basis.

**Provider bypass matters:** a Next.js signup form/route gate is insufficient if direct Supabase signup remains open. Supabase exposes an actual signup-enable setting and email-confirmation setting.[14] Until launch prerequisites are approved, provider-level public signup must remain disabled in any provisioned environment.

When approved public registration is enabled, any required eligibility/consent gate must also survive direct provider/API calls. Supabase currently lists a Before User Created hook on its Free plan.[13] A candidate design is a provider-side check against a trusted server-issued registration decision, not a user-editable `age_ok` metadata flag. Exact hook configuration, proof format, data minimization, abuse controls and free-tier compatibility need a scoped implementation spike. This is not a completed age-verification or guardian-consent design.

### Other account flows

- Login/logout with verified sessions; clear private UI/cache state on identity changes. Browsing remains public.
- Password recovery, email changes and verification require honest delivery/error states and safe internal redirects. Do not claim an email was delivered when no sender exists.
- Owner/Admin enroll and complete authenticator MFA before privileged operations. Customers may opt in.
- Customer self-service export/deletion needs appropriate reauthentication and a defined retention policy. Protected Owner transfer/recovery rules apply before Owner deletion.
- Generic recovery responses, throttling, CSRF/origin protections for state changes, secure session handling and no credentials/tokens in logs.
- Use provider-supported session/recovery behavior; do not invent recovery codes, automatic expiry guarantees or SMS fallback.

## 7. Privacy and worldwide addresses

Philippines operation supplies the initial operator-side privacy baseline. The Data Privacy Act explicitly lists age as sensitive personal information; treat an optional age range conservatively rather than assuming it removes that sensitivity.[8] Define its purpose and appropriate basis, limit access and allow deletion. An optional field is not automatic consent.

Teenagers remain in the intended audience, but the exact cutoff stays pending. NPC child-oriented transparency guidance includes under-18 participants; its FAQ does not establish an age of digital consent.[9][10] Do not import a foreign 13/16 threshold or use optional profile age bands as signup eligibility proof. Teen launch stays gated until the applicable notices and safeguards are reviewed.

Before accepting real data publicly, settle the privacy notice/contact, data inventory and processors, purpose/basis, retention, access/export/deletion handling, incident process, hosting/transfers and relevant regulatory obligations. Determine any additional requirements from actual overseas targeting; a global address dropdown does not itself settle legal applicability. This blueprint is not legal certification.

For addresses, use country/territory selection with country-dependent subdivision labels and choices. Handle countries without a province or mandatory postal code and provide a sensible fallback for reference-data gaps. Cities/localities can remain text fields; no worldwide city-selector download is needed. Geographic selection is not deliverability validation or a promise of global shipping.

A versioned reference dataset is preferable to a paid maps dependency for this scope. Countries States Cities Database is one candidate, not a committed choice; review its ODbL attribution/share-alike obligations and coverage before adoption.[3]

## 8. Preserve the existing frontend

- Keep the static catalog, product storytelling, guest cart/wishlist and demo checkout working without backend availability.
- Do not migrate catalog or local commerce persistence as an incidental auth change. No automatic guest/account cart merge or cloud synchronization in this release.
- Proposed UI: dedicated auth/account/staff pages and a stable Account link in the existing header. Avoid replacing a server-rendered navigation target during hydration.
- Do not make the global intro/first paint wait for auth-network requests. Reuse existing route/motion readiness boundaries without rebuilding the animation system.
- Review private dynamic routes against the existing Cache Components/partial-prefetch setup; do not disable those features globally just to add sessions.
- Show bounded, accessible errors when Supabase is unavailable. No endless loader or fabricated successful sign-in/save.
- Report profile/address success only after committed server results; preserve the existing cancellation/focus-intent lessons when requests finish after navigation or a new user action.

## 9. Payments and other future modules

Define future payment responsibilities separately from identity/profiles: payment initiation, provider references/status and verified webhook processing. Future orders/prices must come from trusted server data, not cart/localStorage totals. These are contracts to design later, not launch code.

No Stripe dependency, gateway credentials, card collection or fake successful payment adapter is part of this proposal. Keep the current checkout explicitly demonstrational. Orders, inventory, manager/cashier permissions and payment-provider choice each need their own approved feature scope and migrations.

## 10. Proposed implementation milestones

These are a roadmap, not instructions to execute now.

| Milestone                 | Deliverable                                                                                                         | Exit condition                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1 — foundation           | Approved module contracts, schema/policy design, safe configuration and migrations; isolated development/test setup | Ownership, grants and privileged provisioning reviewed; existing frontend preserved                                                                    |
| B2 — controlled accounts  | Identity/profile/address flows, session isolation, reference-data approach, optional customer MFA                   | Isolated test users complete core flows; direct unauthorized API/database operations fail; public signup remains gated where prerequisites are missing |
| B3 — privileged tools     | Staff MFA, minimal dashboard, Owner-only staff management, transactional safeguards and audited support views       | Role boundaries, staff data path and last-owner invariants verified                                                                                    |
| B4 — public readiness     | Approved email delivery, eligibility/teen safeguards, privacy/retention procedures, region/quota/abuse plan         | Verification/recovery and applicable policy requirements actually exercised before real public accounts                                                |
| Later — optional commerce | Individually approved catalog, stock, orders, payments or POS modules                                               | Separate scope/permissions/data migration approval, not automatic continuation                                                                         |

Free-tier only. Recheck current provider limits, hook/MFA availability, project pausing, email/domain requirements, hosting terms and recovery/backup capabilities before claiming public readiness. If a requirement cannot be satisfied free, explain the conflict and revise scope with the user rather than enable billing. Supabase's default SMTP is restricted to project-team recipients, so it is not an arbitrary-public email solution.[2][4] Sender implementation remains deferred.

## 11. Focused essential verification — after implementation approval

No new application tests were run for this document-only planning task. Future verification should stay bounded, matching the user's request to avoid nonessential test cycles.

- Build, lint/types and relevant fast unit tests.
- Core signup/login/recovery when delivery is configured, profile edits, address CRUD and username/default-address conflict handling.
- Actual API/RLS attempts as Guest, Customer A, Customer B, Admin and Owner: cross-user reads/writes, forged role metadata, suspended accounts and missing staff MFA must fail.
- Direct provider signup cannot bypass an enabled eligibility gate; unconfigured policy fails closed.
- Support reads create audit events; an audit failure/direct-table path cannot bypass the restriction.
- Session/private-cache isolation across users; MFA/role changes and transaction-safe last-owner protection.
- A small desktop/mobile pass for account forms and existing storefront/navigation/intro integration. No repeated broad browser/performance matrix unless a demonstrated regression warrants it.
- Isolated test identities/data only; no global deletes, overwriting frontend changes, source-copy snapshots, unsolicited commits/pushes or tests against real customer records.

## 12. Review status and open gates

The requirements round is complete enough for this technical draft. No further general questionnaire is necessary before reviewing the proposal.

Still intentionally open: exact signup age/under-18 process; suitable free email delivery; concrete privacy/retention and regulatory review; geography dataset/license coverage; final hosting/free-tier constraints; approved Owner bootstrap/recovery procedure and proposed UI/schema defaults.

Review/approval of the design is separate from permission to implement it. All application files and external infrastructure remain unchanged by this planning task.

## Sources

[1] https://supabase.com/docs/guides/database/postgres/row-level-security
[2] https://supabase.com/docs/guides/auth/auth-smtp
[3] https://github.com/dr5hn/countries-states-cities-database
[4] https://supabase.com/pricing
[8] https://privacy.gov.ph/data-privacy-act — Philippines NPC — Data Privacy Act, Republic Act 10173
[9] https://privacy.gov.ph/wp-content/uploads/2024/12/Advisory-2024.12.17-Guidelines-on-Child-Oriented-Transparency-w-SGD.pdf — Philippines NPC — Advisory 2024-03, Child-Oriented Transparency
[10] https://privacy.gov.ph/wp-content/uploads/2024/12/FAQs-Advisory-on-Guidelines-on-Child-Oriented-Transparency.pdf — Philippines NPC — Child-Oriented Transparency FAQ
[11] https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs — Supabase — SSR client and Next.js Proxy
[12] https://supabase.com/docs/guides/auth/auth-mfa?campaign=next-auth&medium=referral — Supabase — MFA enforcement
[13] https://supabase.com/docs/guides/auth/auth-hooks — Supabase — Auth hook availability
[14] https://supabase.com/docs/guides/auth/general-configuration — Supabase — Signup and email confirmation settings
