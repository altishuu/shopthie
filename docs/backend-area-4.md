# Area 4 — saved addresses and geography

**Status: accepted bounded address-book area; stopped after this area.** This is not completion of MFA, staff/support, public signup/readiness or real commerce.

## Delivered

- Account → Manage saved addresses → `/account/addresses`. Private subject-keyed manager, scoped Suspense and existing identity styling.
- Up to 10 self-owned saved addresses: recipient, label, address lines, country, coded/manual area, locality and postal code. Country changes clear dependent region/locality/postal fields. Optional values can be removed.
- Add/edit, two-step delete/cancel, an optional default with atomic switching, and no automatic replacement after default deletion. Demo checkout is not connected.
- Whole-book revision survives an empty book; stale saves fail without overwrite and keep the typed draft with reload lock. Current verified identity/subject, strict inputs/DTOs, SQL ownership and module/MFA/status guards apply on data paths.
- Real pinned public geography data: 250 country/territory entries, 3847 selectable country-scoped GeoNames IDs. Google country-required presence flags, explicit manual fallback, data credits and coverage caveats. IDs are not labeled ISO3166-2; HK uses manual postal area instead of misleading ADM1 districts. See `backend-geography.md`.
- No private global cache/localStorage, new animation loop, global listener or new motion ownership. Existing storefront/cart/wishlist/demo checkout remain unchanged.

## Verified

- **136 unit tests**, **94 overlapping backend checks** including **47 embedded SQL tests** (17 new address tests plus 30 prior foundation/profile tests). Zero failures/skips; backend checks passed again after migration filename alignment.
- Production build, TypeScript, ESLint, formatting and whitespace gates passed. Application code did not change after that accepted build; later changes were migration filename and documentation only.
- **20 targeted desktop/mobile identity/profile/address guest browser checks** passed with the server-log prerender guard. Wider frontend/motion/cross-engine matrices were deliberately not repeated.
- One focused independent source review PASS with no findings: `backend-area-4-review.json`.
- Hosted migration `20261029031614_addresses.sql` applied to dedicated Shopthie only. History, four tables' RLS/raw ACLs, fixed search paths and public-invoker/private-definer RPC boundaries were read back. Anon execution denied; authenticated execution is limited to the scoped RPC/helper boundary. Text helper is not client executable.
- Native reference count and canonical SHA-256 exactly match local data: `25c9eb03fa97715fbdb0cc311535fd525872be4e20687a73b81fb2e0ce632859`. Only geography/addresses were newly enabled; staff/support remain disabled.
- Real controlled-account checks passed: empty book; US create with coded region; full reload; SG country-change resets and country-specific required/optional fields; atomic default switch; edit/manual fallback; optional-line clearing on mobile; stale revision rejection and typed-draft retention; cancel-delete; deleting a default without replacement; deleting the final entry and full-reload retained revision.
- Cookie-free request while browser signed in remained no-store and did not receive private data. Logout removed all app auth cookies; protected address navigation returned to login without controls.
- Actual authenticated layouts inspected at desktop 1280×577 and narrow mobile 320×740: no horizontal overflow, enabled editor and reachable 49px save action. Mobile save succeeded. These are emulated viewports, not real-device certification.
- Cleanup readback: **zero saved-address rows**, one bookkeeping book at revision **6**, existing synthetic profile retained with phone NULL. Browser left signed out. Native Auth rechecked: public signup/anonymous OFF, email ON and confirmation required.

## Native apply delay and recovery

The apply delegation stalled waiting for a model response before calling the migration API; it was cancelled. Native readback confirmed no write had happened. Parent then used the existing configured MCP client with bounded timeouts to pass the actual SQL file directly, without model regeneration of its large data literal or exporting credentials. Apply succeeded and was independently read back. The draft filename was aligned to the provider-generated history version without SQL changes.

One native browser sequence initially clicked Edit before pending had fully settled. Waiting for complete action readiness resolved the harness failure; no application patch or repeated successful write was substituted.

## Boundaries and handoff

PGlite uses real SQL/roles but injected TEST claims, not native JWT/MFA integration. A/B, forged metadata, raw-access, cap and authority denials are SQL fixture evidence; native application flow used one controlled Customer plus anonymous requests. Stale revision rejection is not true multi-session lock-wait certification. No forced-expiration, production HTTPS or full retention matrix was added.

All address details were synthetic and removed. No age/DOB, staff/support/MFA UI, SMTP, signup activation, shipping/delivery validation, payments, source-review snapshots, commit/push or frontend deployment was added. No later area started.

Separately authorized Vercel work saved/read back the two public Supabase variables for production only. No redeployment occurred; uncommitted address code is not automatically uploaded. See `backend-vercel-setup.md`.

Evidence: `backend-area-4-results.json`, `backend-addresses-database.md`, `backend-address-contract.md`.
