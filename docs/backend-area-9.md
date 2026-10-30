# Area 9 — restricted operational audit history handed off

Bounded implementation, independent review and hosted installation are complete. **Positive native staff/MFA reads and true multi-session concurrency remain deferred.** Stop after this area.

## Delivered boundary

- Protected noindex `/admin/audit`, linked only after current same-subject staff readiness. Explicit recent/older pages, fixed20 with an eligible21st-row lookahead. Admin sees only its actual actor's recorded actions; Owner sees supported events across actors. Current active confirmed staff, verified TOTP and AAL2 remain required in app and SQL.
- Only implemented Customer lookup/status-read/status-change combinations appear, with fixed labels, opaque actor/target IDs and UTC timestamps. No profile/contact joins or arbitrary reasons/metadata, export, editing, deletion, retention controls, role management or private support fields. **Not a complete security/compliance log.**
- Optional audit_view remaps only existing audit.read, preserves reviewed Owner/Admin grants and leaves mandatory audit recording active. Broader staff/support remain off. Four fixed-path authenticated-only functions; raw table ACL/RLS and existing writers unchanged. Actor-only SHARE lock and final authority/role rechecks; viewing inserts no event.
- Exclusive `(created_at,id)` cursors preserve exact six-fraction UTC strings, never roundtrip through millisecond formatting. Strict decoding validates scope/actors, exact fields/allowed combinations, descending order and last-visible next cursors. Arbitrary valid input cursors are bounds only, not authority or proof of row existence.
- Installed development StrictMode and prod/dev Activity/browser/account/scope fixtures discard old records/cursors/pending/late results. Only current same-subject/scope capability renews automatically; no automatic event reads, pagination or retries. Controls/long IDs work at320px.

## Verified execution

- **245 unit tests; 251 overlapping backend checks including 95 SQL checks; 22 affected desktop/mobile browser checks** (identity + staff/lookup/audit). Build, typecheck, lint, format and whitespace passed. All95 SQL checks passed again after migration filename alignment. Counts overlap; do not add them.
- Independent in-place review **deleg_b1ca74bd PASS**,36 focused tests, no security concerns or logic errors. Prior deleg_62bd00ad was blocked by HTTP429 and produced no approval. The worker's earlier new-route404 was an old preview, resolved by parent build/22-browser pass. Deliberately malformed-cookie fixtures generate expected SDK warnings; no prerender diagnostic.
- Actual unchanged controlled Customer signed in, had no staff link, saw a safe `/admin/audit` denial with zero history controls/events/provider diagnostics/runtime errors. At320px: no overflow and49px signout target. Logout confirmed; app auth cookies0. Fresh controlled browser, not the user's personal default profile. Separate cookie-free requests verify HTTP200 streamed login redirect/no-store/no private controls.

## Hosted installation/readback — 2026-10-30

Reviewed migration **20261030012105_audit_view.sql** applied once through configured Supabase MCP after user explicitly requested the approval prompt again. The first approval prompt timed out **without execution**; it was not retried through another route. Native history version/name read back; local file renamed without SQL changes and current SQL suite passed.

Read back all four signatures/returns/volatility/invoker-definer flags/empty search paths/authenticated-only client execution; optional module/dependencies access+audit, audit.read ownership and preserved Admin/Owner grants. Raw anon/authenticated table DML remains denied. Actor-only lock/fixed21-lookahead/final-role-check definitions confirmed. No timeline index added; existing audit primary key unchanged. This is not production-volume/performance certification.

Native unidentified authenticated-role readinessfalse/read denied in a rolled-back probe, with no injected claims. Final counts remain **zero staff memberships, verified factors, changed/suspended/revised accounts and audits; one pre-existing pending factor**. Required recording and viewer on; broad staff/support off. No actual account status/role/MFA change, staff creation/promotion, Owner bootstrap or pending-factor cleanup for testing. SQL claims/privileged UI/SDK fixtures are synthetic, not native JWT/OTP or independent-session proof.

See backend-area-9-results.json, backend-area-9-review.json, backend-audit-view-contract.md and backend-audit-view-database.md. Local preview port3100; no staging/commit/push/frontend deployment, source-copy workaround, signup/email activation, paid service or next-area work.
