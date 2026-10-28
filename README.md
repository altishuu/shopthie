# Shopthie

A light editorial storefront for a multi-brand premium technology retailer. Next.js App Router, TypeScript, Tailwind CSS, local product data, and client-side shopping state.

## Current milestone

**Backend implementation has started, area-by-area.** Area 1's modular access/configuration and SQL authority foundation are implemented and locally verified; focused security review passed. See `docs/backend-progress.md`. The authority schema is applied to a dedicated free Supabase project. The current Area 2 login/session slice is implemented and verified with a real controlled Supabase user: Customer authority, full-reload persistence, anonymous isolation and logout/denial passed. Work stopped here as requested; this is not completion of the broader B2 profile/address/MFA roadmap. Public signup and recovery remain explicitly gated. Existing commerce remains frontend/demo behavior. See `docs/backend-area-2.md`.

**Phases 1–4 implemented: design foundation, frontend commerce, cinematic motion, and editorial/responsive refinement.**

- Home, Shop, four Collection routes, seven Product Detail routes, About, Cart, Wishlist, and Checkout Demo.
- Search, category/brand filtering, sorting, result counts, shareable query strings, browser-history restoration, and empty states.
- Real, identity-matched product photography; galleries; manufacturer-confirmed phone storage options; simulated prices and stock.
- Variant-aware cart drawer and page, quantity controls, removal, subtotal calculations, persisted wishlist, and quick view.
- Versioned localStorage persistence, corruption recovery, in-memory fallback when storage is blocked, and cross-tab synchronization.
- Clearly labeled checkout demonstration: no payment fields, delivery information, real orders, or personal data collection. Completing the demo leaves the bag unchanged.
- Responsive navigation, native modal dialogs with explicit keyboard wrapping, focus restoration, visible focus, and reduced-motion CSS.

- First-session branded intro with real essential-asset readiness, skip/Escape, a bounded release, and abbreviated repeat visits.
- GSAP/ScrollTrigger/Flip motion; one GSAP-driven Lenis loop on fine pointers; native touch/reduced-motion scrolling.
- Hydration-safe route bridge, rapid-click cancellation, native back/forward restoration, floating navigation, gallery/option/dialog feedback, and catalog layout motion.
- Curated audio shelf, a single eligible desktop listening pin, and an earlier-model phone diptych; mobile and reduced motion stay unpinned.

- Nine-chapter homepage reading order, an image-led AirPods Pro feature, and a warm JBL speaker editorial feature—no fabricated sales rankings, new-release claims, or discounts.
- Expanded About spread/principles and canonical product-story chapters with direct links back to existing purchase controls.
- Internally scrollable short-landscape navigation, header-aware anchors, and width/height-adaptive mobile galleries.
- Post-review motion corrections: readable first/repeat intros (about 3.1s / 2.4s in checked runs), plus incoming-card entrances for category-to-category and empty-to-populated filtering. See `docs/motion-fixes.md`.
- First-paint correction: critical server-delivered CSS covers the storefront before app hydration, with no-JavaScript/reduced-motion bypass, stalled-startup release, and no late intro replay after fallback. See `docs/first-paint-fix.md`.
- Entrance continuity: independent page/overlay scopes, prepared-but-paused entrances released after the loader or route bridge, and gallery reveals using the same surface handoff. Later scroll reveals survive loader cleanup. See `docs/animation-continuity-fix.md`.

**Phase 5 local handoff ready under the user's focused verification scope:** production build, lint/types/formatting, 89 unit tests, and 16 affected desktop/mobile shopping/focus checks pass on the latest code. An earlier complete run passed 138 browser tests before the final small focus correction. Extended browser/performance cycles were deliberately not repeated. Cross-tab transactions, native listener cleanup, stable catalog hydration, and delayed focus/announcement behavior are corrected. See `docs/phase-5-report.md`, `docs/phase-5-acceptance-results.json`, and `docs/HANDOFF.md`. The catalog remains seven source-verified models, not the proposed sixteen.

No authentication server, commerce backend, database, payment gateway, dashboard, remote repository, or deployment has been added.

## Install and run

Use Node.js 22.18+ and npm. Native TypeScript unit tests require Node’s type-stripping support. This environment was verified using Node 26.

```bash
npm ci
npm run dev
```

Open the local address reported by Next.js (port 3000 by default).

For a production preview:

```bash
npm run build
npm run start -- --hostname 127.0.0.1 --port 3100
```

Stop running development/preview servers before rebuilding the same project; they share `.next` artifacts. The current local handoff preview uses port 3100.

## Verification

```bash
npm test                         # 89 unit tests
npm run lint
npm run typecheck
npm run format:check
npx playwright install chromium --only-shell
npm run test:e2e                 # build + complete browser suite on 3101 (optional extended rerun)
npm run test:report
```

Browser tests cover every seeded product and collection, the browse → option → bag → checkout path, wishlist/reload persistence, filtering/history, quick-view gallery and keyboard focus, stock limits/removal, corrupt/blocked storage, cross-tab sync, empty/invalid states, reduced motion, and automated WCAG A/AA checks.

With a production preview running on port 3100:

```bash
npm run test:visual
npm run test:performance          # run sequentially, on an otherwise idle machine
npm run test:browsers             # requires Chromium, Firefox, WebKit runtimes
```

The `test:visual` command checks 49 full-motion scenes across 320, 360, 390, 568, 834, 1024, 1440, and 1920px widths, including 568×320 landscape navigation. It waits for visible image pixels, checks overflow/runtime and console errors, performs nine additional accessibility scans, and exercises product-story → option → bag → close at every size. Screenshots are in `docs/screenshots/phase-4/`; incremental structured results are in `docs/phase-4-browser-results.json`. Set `SHOPTHIE_URL` to test another address. Earlier focused verifiers remain as `npm run test:visual:motion` and `npm run test:visual:commerce`; earlier phase reports/media are historical checkpoints.

The new 12-execution desktop/mobile storytelling suite checks chapter order and honest copy, About principles, canonical product details and return-to-purchase anchors, narrow/short accessibility, compact gallery geometry/photo switching, and internally scrolling mobile navigation. Run it separately with `npm run test:storytelling` after a production build.

The motion regression suite additionally checks first/repeat visits, pending/failed assets and skip, rapid navigation, nonzero history restoration, pin teardown/recreation, modal scroll isolation, live reduced-motion changes, and the no-JavaScript homepage fallback. After a production build, run it alone with `npm run test:motion`.

For a separate development/Strict Mode check, stop the production server, run `npm run dev -- --hostname 127.0.0.1 --port 3102`, then run `npm run test:dev:motion` in another terminal. It checks hydration/runtime console errors and the Home → Shop → Pixel 8 → bag flow, saving `docs/phase-3-dev-results.json`. Stop development before rebuilding the shared `.next` output.

The primary regression suite uses Chromium desktop/mobile emulation. The separate Phase 5 verifier adds Firefox/WebKit coverage with explicit engine availability, axe results, and limitations in `docs/phase-5-browser-results.json`; it is not real-device Safari/Android or assistive-technology certification. This host's WebKit needs the verified isolated compatibility launcher selected with `SHOPTHIE_WEBKIT_EXECUTABLE`; see `docs/HANDOFF.md`. Phase 1–4 reports remain historical checkpoints.

## Architecture

- `src/app/`: server-rendered route shells/content, metadata, loading/error/not-found states, design tokens, and commerce CSS.
- `src/components/catalog/`: search/filter/sort, reusable product cards, wishlist.
- `src/components/product/`: gallery, verified option selection, quantity/add-to-bag controls, and server-rendered canonical product storytelling.
- `src/components/cart/`: line management, cart/quick-view overlays, checkout demonstration.
- `src/components/ui/`: modal, quantity control, empty states.
- `src/providers/commerce-provider.tsx`: hydration, persistence, cross-tab events, announcements, and single-overlay coordination.
- `src/providers/motion-experience.tsx` / `motion-ready.tsx`: persistent motion coordination and explicit intro/control readiness.
- `src/components/motion/`: editorial scenes and route-local hydration signals.
- `src/lib/gsap.ts`: plugin registration and shared motion tokens; `experience.ts`: scoped intro/route/scroll orchestration; `motion-driver.ts`: tested ticker lifecycle adapter.
- `src/lib/cart.ts`: pure validated reducer, persistence parser, canonical-price totals, stock limits, safe-integer guards.
- `src/lib/commerce-persistence.ts`: FIFO local-intent read/reduce/write transactions, cooperative Web Locks, remote current-read/no-echo synchronization, and bounded best-effort fallback.
- `src/lib/media-lifecycle.ts`: explicit native media subscriptions and idempotent scene teardown; `motion-context.ts`: independent GSAP ownership across callbacks.
- `src/lib/catalog.ts`: nonmutating filtering/sorting and product/collection lookup.
- `src/lib/money.ts`: centralized currency configuration and minor-unit formatting, not currency conversion.
- `src/data/products.ts`: seven real model identities and ten valid demo variants.
- `src/data/asset-credits.ts`: public photograph attribution records.
- `public/images/products/`: eight local photographs.
- `public/fonts/`: self-hosted Manrope and DM Sans with license files.
- `docs/`: plan, decisions, sources, phase reports, and screenshots.

Known Product and Collection URL parameters resolve before their main server content, preserving no-script headings/details instead of hiding them behind a script-dependent streaming reveal. Those segments explicitly use `instant = false` for this scoped navigation trade-off. The catalog keeps one server/client ProductCard tree, with native links preserved through hydration; a client-only null observer synchronizes URL queries/history before JS-only controls enable. Route-local client leaves signal hydration before global motion touches route DOM. Lenis is the only smoothing driver; CSS native scrolling remains automatic so history is not animated or interrupted by a second smoothing system. ScrollTrigger refreshes only active scenes with fresh scroll memory.

## Content, currency, and licensing

The proposed sixteen-product target has **not** been reached: the working catalog uses seven verified models. Expand only with permitted, matching photography and source-checked facts. Older photographed models are demo selections, not current-stock offers.

**All prices and stock are simulated.** Phone storage options share one model-level demo price; no upgrade premium or live availability is implied. See `docs/specification-sources.md` for the selected technical facts and source limitations.

Initial demo prices use USD with `$`. Configure the formatter’s locale, code, and optional symbol override in `src/lib/money.ts`. Changing a symbol does not convert underlying USD prices: a future currency conversion/settings feature must explicitly provide correctly denominated data. No dashboard or live FX service is included.

Photography retains its documented CC BY/CC BY-SA licenses, not a proprietary Shopthie image license. The shared footer provides attribution, source/license links, change notices, local source JPEGs, and font licenses on every route. See `docs/asset-manifest.md` and `docs/catalog-sources.json`. Image permissions do not imply manufacturer endorsement or blanket clearance of third-party rights.
