# Area 8 — Customer access-status database

Status: hosted migration `supabase/migrations/20261029165555_customer_status.sql` applied once after correction re-review PASS. Exact provider history/schema/ACL/module/count readback verified; local filename aligned without SQL changes; all 80 SQL checks passed afterward.

## Authority and data

Only current active Owner/Admin with current verified TOTP plus AAL2 and the live customer.status.manage grant/module may operate. Never self, Owner/Admin targets or arbitrary provider accounts. Missing/non-Customer targets deny identically. Optional customer_status depends on customer_lookup/access/audit; only the existing status permission is remapped, existing Owner/Admin grants preserved. Broader staff/support remain disabled. No raw client grants, new roles, private support fields or provider Auth writes.

Exact result is subject/status/revision. Readiness is boolean and reads no target. Status read and change are VOLATILE audited operations with public invoker/private definer, empty search_path and authenticated-only execution. Audit insert failure aborts the statement before returning a result. Reasons are account_security/customer_request/account_review, no free text or copied profile/contact data. Changes enforce expected integer revision, actual opposite-state transition and a post-write/audit check. No-op is an error, not fabricated success.

Existing app_accounts gets nonnegative integer status_revision default0. A private trigger increments on every actual status transition (including trusted direct writes), rejects revision tampering, exhausted counters and account-ID reassignment. Only application access changes; no native Auth ban, password/MFA/session mutation or immediate JWT-invalidation claim.

## Serialization and limits

Reads/status functions lock relevant parent account rows in UUID order and recheck authority after waits. Lookup locks SHARE; status operations UPDATE. Role/profile writer triggers participate through parent UPDATE locks; child owner IDs are immutable. Readers/status RPCs do not lock role/profile children. Current profile/address write RPCs already prelock the account. Cascades are exercised in a single-connection fixture; new triggers tolerate an already-deleted parent on cascading child deletion.

**Trusted administrative writers must lock affected parent account rows in UUID order before issuing child DML.** A BEFORE ROW child trigger may run after PostgreSQL locked that child tuple. Trigger-only arbitrary direct role/profile writers can therefore deadlock with parent-first writers or a cascade. PostgreSQL may abort/roll back such a transaction; this implementation is not certification of concurrent deadlock freedom. Future administrative/Owner operations must obey the prelock discipline and obtain separate multi-session acceptance. No native provider-owned Auth table triggers were added.

Lookup and status operations recheck actor authority and the exact current Customer projection AFTER mandatory audit. Deterministic audit-hook tests change actor/target state mid-operation and prove no stale DTO or partial change returns. These single-connection hooks and lock-shape checks are not equivalent to independent PostgreSQL-session concurrency testing.

## Actual local execution

Observed RED→GREEN: interrupted worker left missing writer guards (0 instead of2 triggers); parent completed guard participation/cascade tests. Missing revision column/module/readiness/read/change RPCs each produced expected failing tests before implementation. Current status suite also checks CAS/no-op, audit-failure rollback for public/private paths, target promotion/actor revocation, stale assurance/grant/module/status denial, own-data suspension/reactivation, fixed-path ACLs/raw denial and complete latest registry/schema/dependency/grant parity.

All statements execute actual embedded PostgreSQL roles/functions with synthetic fixture users/factors and explicitly injected TEST claims. No native JWT signature/OTP/real privileged mutation is proved. Historical foundation/lookup fixtures keep their pre-feature defaults explicitly; the latest status fixture loads the full migration chain.

## Native safety

Configured-client preflight read Shopthie ACTIVE_HEALTHY, new status RPC/migration absent, zero staff memberships, zero verified factors, one pre-existing pending factor, zero suspended accounts and zero audits. No real Customer status, roles or MFA changed. Preserve the pending setup and do not create/promote staff merely to obtain a positive native test. Hosted history `20261029165555`, customer_status, and exact signatures/volatility/invoker-definer/empty-path ACLs read back. Six status functions authenticated-only, trigger functions not client-executable; three guards installed, integer notnull revision default0. Dedicated status enabled, broader staff/support false, grants only Owner/Admin, no raw client DML. Post-apply counts unchanged and every existing revision0. Unidentified native read/change rejected without injected claims or writes; positive privileged native/multi-session acceptance remains deferred.
