# B1 / Area 1 — local database authority foundation

**Implemented locally, not deployed or public-account ready.** This is one foundation area, not completion of the backend blueprint. No hosted project, provider configuration, credentials, email sender, payments or public age policy is installed by this work.

## What the migration provides

`supabase/migrations/202610280001_authority_foundation.sql` is a transactional, one-time migration. It assumes Supabase-managed `auth.users`, `auth.mfa_factors`, `auth.uid()`, `auth.jwt()` and the `anon`, `authenticated`, `supabase_auth_admin` roles already exist. It does not create or replace provider-owned auth objects.

All eight authority/storage tables live in `shopthie_private`: `app_modules`, `app_module_dependencies`, `app_roles`, `app_permissions`, `app_role_permissions`, `app_accounts`, `app_user_roles`, `audit_events`. Raw client privileges are revoked; every table has default-deny RLS and no client-access policies. There is no client audit writer or reader, even for a caller with the `audit.read` capability. No global/public default privileges or unrelated objects are changed.

**Keep `shopthie_private` outside exposed API schemas.** Schema usage is granted only as needed for the authenticated self-context/permission helpers and the auth-admin hook. Usage is not raw table access. A later provider setup must verify exposed schemas; this migration cannot configure PostgREST's exposed-schema list.

New `auth.users` inserts provision an active `customer` account and one application membership. Both user/app role metadata are ignored. This trigger is for new identities only; no existing-identity backfill or Owner bootstrap is provided. There is no first-user-becomes-Owner path. Area 1 stores `active`/`suspended` account status only; other lifecycle states need a later migration/flow.

### Reviewed seeds and TypeScript parity

- Required/enabled: `identity`, `access`, `audit`. The required flags cannot be set false.
- Known optional/disabled: `profiles`, `geography`, `addresses`, `staff`, `support`.
- Module dependencies match `src/modules/registry.ts`; permission ownership and complete role grants match `src/modules/access/permissions.ts`. A live-SQL-to-imported-TypeScript assertion checks these seeds, not SQL source strings.
- Roles are lowercase `owner`, `admin`, `customer`; Manager/Cashier are not seeded.

| Permission | Owning module | Customer | Admin | Owner |
| --- | --- | --- | --- | --- |
| `profile.read_own` | profiles | yes | yes | yes |
| `profile.update_own` | profiles | yes | yes | yes |
| `address.manage_own` | addresses | yes | yes | yes |
| `customer.lookup` | staff | no | yes | yes |
| `customer.status.manage` | staff | no | yes | yes |
| `support.private.read` | support | no | yes | yes |
| `audit.read` | audit | no | yes | yes |
| `staff.manage` | staff | no | no | yes |

A seeded grant is a capability definition, not an implemented feature or a data-access grant. Optional feature services/data tables do not exist.

### Narrow function contracts

- `shopthie_private.has_permission(text) → boolean`: fixed actor `auth.uid()`, current membership and active status, reviewed permission grant, enabled owning module and enabled transitive dependencies. Unknown/null permission, absent actor/membership and missing/unrecognized AAL deny. Owner/Admin require `aal2` for **all** application capabilities, including own-account permissions. Customers with any verified `auth.mfa_factors` row also require `aal2`; unverified/other-user factors do not count. No role/MFA decision is taken from editable metadata. Intended for later RLS composition; it is not a data reader or complete resource authorization check.
- `public.shopthie_actor_context()`: read-only invoker wrapper of a private, narrowly granted definer helper. Returns zero or one caller-only row: `user_id`, `status`, `role`, `aal`, `mfa_required`. No ID parameter, email, profile, permissions list or other-user information. Suspended actors may read their own minimal status but cannot gain capabilities. Missing identity/membership gives no rows. `mfa_required` is a policy requirement, not a claim that a staff member already enrolled MFA.
- `shopthie_private.before_user_created(jsonb) → jsonb`: constant 403 hook error for **every** payload, including forged approval/age/role metadata and null input. Only `supabase_auth_admin` is granted execute; this function needs no definer privileges. There is no registration-enable switch.
- The provisioning trigger and authority-reading definer helpers have empty/locked `search_path` and fully qualified object references. No public security-definer RPC exists.

**Installing the hook function does not attach the provider hook.** No provider hook or signup setting was changed or exercised. In any future provisioned environment, public signup must remain disabled; the Before User Created hook must be explicitly attached and tested through the real provider before any claim of direct-signup protection. The local trigger alone does not reject privileged direct `auth.users` inserts; it safely provisions them as Customers.

## Real local SQL verification

Run from the repository root:

```sh
node --test tests/backend/*.test.ts
```

`@electric-sql/pglite@0.5.13` executes the actual migration and PostgreSQL queries in an isolated, in-memory embedded PostgreSQL engine. No Docker, `psql`, network database or Supabase credentials are required.

`tests/backend/auth-fixture.ts` is explicitly a **local TEST fixture**, not GoTrue/Supabase Auth integration. It creates only the minimal auth tables/functions/roles used by the migration. Trusted test code injects session claims using PostgreSQL settings and `SET LOCAL ROLE`. It does not verify/sign JWTs, issue sessions, enroll MFA through the provider, send email or exercise provider hooks.

Production behaviors were added in executed red→green TDD slices. The foundation file contains 16 tests covering migration/seeds, metadata-resistant provisioning, the complete role/AAL/module matrix, immediate membership/status changes, verified-factor MFA, raw ACL denial under real database roles, default-deny RLS despite deliberately added SELECT/DML grants, self-only context, the rejecting hook, required-module/role constraints, installed function security, dependency gates and TS seed parity. A transaction-local **TEST-only** probe table/policy additionally exercises permission-helper composition with ownership checks through actual RLS; it is not a shipped customer-data feature. Each stateful test rolls back and the engine closes after the suite.

RLS does not protect against trusted database owners, bypass-RLS service credentials or newly granted TRUNCATE privileges. Client TRUNCATE is explicitly denied by the installed grants. Privileged fixture SQL that changes membership/flags is test setup, not a management API.

## Later areas — explicitly not done

- Provider/GoTrue integration, real token verification, sessions, MFA enrollment/recovery, signup-hook attachment and provider configuration.
- Approved public email delivery, verification/recovery delivery and age/under-18 eligibility policy. Public registration remains closed.
- Profiles, usernames, phone/age/address schemas, geography data, customer CRUD and resource-specific ownership/target policies.
- Staff lookup/status/assignment mutation RPCs, Owner bootstrap/transfer/recovery and transactional last-Owner safeguards.
- Actual scoped support-data reads coupled transactionally to audit writes; audit review APIs, retention/redaction and deletion/export flows.
- Hosted migrations/deployment and payments/Stripe.

No protection or audited access to customer data is claimed: those tables and operations are absent.
