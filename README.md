# Shopthie

A light editorial storefront for a multi-brand premium technology retailer. Next.js App Router, TypeScript, Tailwind CSS, local product data, and client-side shopping state.

## Current milestone

**Phases 1 and 2 implemented: design foundation + working frontend commerce.**

- Home, Shop, four Collection routes, seven Product Detail routes, About, Cart, Wishlist, and Checkout Demo.
- Search, category/brand filtering, sorting, result counts, shareable query strings, browser-history restoration, and empty states.
- Real, identity-matched product photography; galleries; manufacturer-confirmed phone storage options; simulated prices and stock.
- Variant-aware cart drawer and page, quantity controls, removal, subtotal calculations, persisted wishlist, and quick view.
- Versioned localStorage persistence, corruption recovery, in-memory fallback when storage is blocked, and cross-tab synchronization.
- Clearly labeled checkout demonstration: no payment fields, delivery information, real orders, or personal data collection. Completing the demo leaves the bag unchanged.
- Responsive navigation, native modal dialogs with explicit keyboard wrapping, focus restoration, visible focus, and reduced-motion CSS.

**Not implemented yet:** GSAP/ScrollTrigger/Flip/Lenis cinematic motion, the first-session preloader, animated route transitions, and the remaining full-homepage storytelling/refinement. Those remain in Phases 3–5.

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
npm test                         # 40 unit tests
npm run lint
npm run typecheck
npm run format:check
npx playwright install chromium --only-shell
npm run test:e2e                 # build + 26 production-server browser tests on 3101
npm run test:report
```

Browser tests cover every seeded product and collection, the browse → option → bag → checkout path, wishlist/reload persistence, filtering/history, quick-view gallery and keyboard focus, stock limits/removal, corrupt/blocked storage, cross-tab sync, empty/invalid states, reduced motion, and automated WCAG A/AA checks.

With a production preview running on port 3100:

```bash
npm run test:visual
```

This checks 45 scenes across 360, 390, 834, 1440, and 1920px viewport widths, validates loaded images and absence of horizontal overflow/runtime page errors, and saves screenshots to `docs/screenshots/phase-2/`. Its structured results are saved to `docs/phase-2-browser-results.json`. Set `SHOPTHIE_URL` to test another address.

Browser coverage is Chromium desktop/mobile emulation, not real-device Safari/Firefox certification. See `docs/phase-2-report.md` for verification scope and remaining work.

## Architecture

- `src/app/`: server-rendered route shells/content, metadata, loading/error/not-found states, design tokens, and commerce CSS.
- `src/components/catalog/`: search/filter/sort, reusable product cards, wishlist.
- `src/components/product/`: gallery, verified option selection, quantity and add-to-bag controls.
- `src/components/cart/`: line management, cart/quick-view overlays, checkout demonstration.
- `src/components/ui/`: modal, quantity control, empty states.
- `src/providers/commerce-provider.tsx`: hydration, persistence, cross-tab events, announcements, and single-overlay coordination.
- `src/lib/cart.ts`: pure validated reducer, persistence parser, canonical-price totals, stock limits, safe-integer guards.
- `src/lib/catalog.ts`: nonmutating filtering/sorting and product/collection lookup.
- `src/lib/money.ts`: centralized currency configuration and minor-unit formatting, not currency conversion.
- `src/data/products.ts`: seven real model identities and ten valid demo variants.
- `src/data/asset-credits.ts`: public photograph attribution records.
- `public/images/products/`: eight local photographs.
- `public/fonts/`: self-hosted Manrope and DM Sans with license files.
- `docs/`: plan, decisions, sources, phase reports, and screenshots.

Product and Collection URL promises are consumed inside scoped Suspense boundaries, leaving useful static navigation outside them. The root’s smooth-scroll hint allows Next.js to coordinate native route scroll handling.

## Content, currency, and licensing

The proposed sixteen-product target has **not** been reached: the working catalog uses seven verified models. Expand only with permitted, matching photography and source-checked facts. Older photographed models are demo selections, not current-stock offers.

**All prices and stock are simulated.** Phone storage options share one model-level demo price; no upgrade premium or live availability is implied. See `docs/specification-sources.md` for the selected technical facts and source limitations.

Initial demo prices use USD with `$`. Configure the formatter’s locale, code, and optional symbol override in `src/lib/money.ts`. Changing a symbol does not convert underlying USD prices: a future currency conversion/settings feature must explicitly provide correctly denominated data. No dashboard or live FX service is included.

Photography retains its documented CC BY/CC BY-SA licenses, not a proprietary Shopthie image license. The shared footer provides attribution, source/license links, change notices, local source JPEGs, and font licenses on every route. See `docs/asset-manifest.md` and `docs/catalog-sources.json`. Image permissions do not imply manufacturer endorsement or blanket clearance of third-party rights.
