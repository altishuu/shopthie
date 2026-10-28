# Shopthie — implementation plan

Status: PHASE 4 VERIFIED — full editorial reading order, About/product storytelling, and responsive refinements are integrated with the working shopping/motion flow. Production build, 46 unit tests, 86 desktop/mobile browser tests, lint, TypeScript, and formatting pass. The Phase 4 checkpoint covered 49 full-motion scenes across eight sizes and nine additional accessibility scans. Subsequent startup and entrance-continuity corrections are documented in `docs/first-paint-fix.md` and `docs/animation-continuity-fix.md`. Catalog remains seven verified models and ten variants, not the proposed sixteen-product target. Phase 5 final profiling/broader browser-device review/handoff remains. See `docs/phase-4-report.md`.

## 1. Locked requirements

- Project location: `/home/ivanadcan35/Projects/Ishuu/shopthie/`.
- Initialize Next.js before writing custom application code: completed with create-next-app.
- App Router, TypeScript, Tailwind CSS, GSAP, ScrollTrigger, Flip, Lenis, and Lucide icons.
- Frontend-only: local mock product data, client-side interactions, no authentication server, database, payment gateway, or backend commerce implementation.
- Deliver Home, Shop/Collections, Product Details, Cart, and About/Brand Story.
- Premium editorial art direction, cinematic motion, restrained glass navigation, and fully usable shopping interactions.
- Responsive layouts, reduced motion, keyboard accessibility, performance checks, and build verification.
- Plan and obtain direction before beginning the custom storefront.

## 2. Creative direction — first-round decisions confirmed

Primary homepage surface: **Decide / Learn** — one product idea per scene, with cinematic storytelling. Catalog surface: **Explore** — clear filters and browsing take priority over theatrical animation.

Confirmed: **Shopthie** is the public brand, selling premium technology and audio to quality-conscious shoppers. Product categories include smartphones, speakers, earbuds, and headphones. The interface language is English.

Confirmed visual direction: **light flagship** — off-white, graphite typography, sculptural product photography, and dark immersive interludes. Eight licensed, identity-matched photographs are selected and publicly credited; source and specification provenance is recorded in `docs/`.

The Shopify reference is a request for familiar shopping usability with a more impactful original presentation, not a stack change or a request to clone a particular site. Keep the agreed frontend-only Next.js architecture.

Use **USD with a dollar sign** initially through centralized configurable currency formatting. Keep currency code, locale, display behavior, and product-price currency explicit; distinguish changing a display symbol from converting product prices. A possible future dashboard must be able to supply the configuration, but no dashboard is in the current scope. Delivery is local-only for now.

Confirmed: Shopthie is a **multi-brand retailer of real products**, and **over-ear headphones** lead the homepage hero. Proposed catalog: 16 products across smartphones, headphones, earbuds, and speakers. Exact manufacturers/models follow imagery-rights and factual-specification checks; do not invent or relabel real products.

Confirmed extras: **wishlist, quick view, and a clearly labeled checkout demo**. The full cinematic introduction plays only on the first visit per session, with an abbreviated repeat experience and reduced-motion alternative.

Use Apple's restraint and clarity as principles, not a copied brand identity. Phase 1 established Manrope/DM Sans, off-white/graphite with a restrained citron accent, the Shopthie wordmark, and an AirPods Max photographic hero; the user approved moving forward with that direction. Do not compensate for weak imagery with effects. See `docs/decisions.md` for the decision record.

## 3. Delivery phases and approval gates

### Phase 0 — scaffold and discovery

- Initialize Next.js with npm, TypeScript, Tailwind, ESLint, App Router, src directory, and @/* alias.
- Run the starter production build, ESLint, and TypeScript validation.
- Preserve the original brief in `docs/project-brief.md`.
- Confirm category, storefront name, visual direction, asset sourcing, audience, currency, and optional features.
- No custom UI implementation before these decisions are settled.

**Gate:** approved creative brief and feature scope.

### Phase 1 — art direction and content system

- Establish wordmark, font pairing, color roles, spacing, responsive typography, component geometry, and motion tokens.
- Create a section storyboard for desktop and mobile; approve the hero composition first.
- Proposed dataset: 16 real products across smartphones, headphones, earbuds, and speakers, each with stable IDs, slugs, source-checked specifications, gallery images, supported variants, and explicitly simulated prices/availability.
- Do not claim Shopthie is an authorized reseller, imply manufacturer affiliation, or present mock prices/stock as live inventory. Keep editorial copy original and factual specifications traceable.
- Record asset source, usage permission, product association, crop, and alt text. Prefer local optimized assets and self-hosted licensed fonts; avoid hotlink-dependent composition.
- Define a small set of strong motion signatures rather than one repeated reveal.

**Gate passed:** Phase 1 visual foundation implemented and verified; the user approved proceeding to Phase 2. See `docs/phase-1-report.md`. Seven model identities and eight licensed photographs are verified; the proposed sixteen-product catalog remains a sourcing follow-up, not a completed count.

### Phase 2 — functional commerce baseline

- Build semantic responsive layouts and reusable navigation, controls, product cards, dialogs, and footer.
- Implement Shop search, category filters, sorting, result counts, clear-filter action, and no-results state.
- Keep catalog state in query parameters for shareable links and browser history.
- Implement product galleries, valid variant selection, quantity limits, price/availability, related products, and invalid-product handling.
- Implement cart drawer plus cart page: add, remove, update quantities, variant-aware line items, subtotal, and empty states.
- Use a typed React reducer/context for cart state; persist a versioned, validated subset to localStorage after hydration. Recover safely from corrupt/unavailable storage.
- Store prices as integer minor units and format them using centralized USD/en-US configuration initially. Provide a single configuration adapter for future currency/settings changes; do not add live exchange rates or a dashboard now.
- Include a persisted wishlist page and card/detail toggles, an accessible product quick-view dialog linking to the full product page, and a clearly labeled checkout-demo route. The demo provides an order summary and simulated completion only, collects no payment details or real delivery information, and makes no real purchase claims.

**Gate passed:** browse → product → select variant → add → edit/remove/persist cart → wishlist → demo checkout is verified before motion polish. All seeded product/collection deep links, keyboard dialogs, blocked/corrupt storage, and cross-tab synchronization pass. See `docs/phase-2-report.md`.

### Phase 3 — cinematic motion layer

- Install GSAP, @gsap/react, and Lenis; lucide-react is already in use.
- Centralize motion tokens, plugin registration, reduced-motion handling, and scoped animation lifecycle cleanup.
- Use one GSAP ticker to drive Lenis; disable a separate automatic RAF loop. Feed scroll updates to ScrollTrigger and remove ticker/listener subscriptions on teardown.
- Use native touch scrolling by default; simplify pinned storytelling and omit magnetic effects on coarse pointers.
- Build a first-visit/session preloader tied to critical hero-image/font readiness. Per the user's post-review correction, include readable first/repeat brand holds without fabricating loading progress; retain skip, reduced motion, asset-error handling, and a four-second safety timer.
- Choreograph logo → mask transition → hero typography/product/navigation reveal as one sequence; keep content accessible if animation initialization fails.
- Add at most one major pinned desktop story initially; use an unpinned mobile equivalent.
- Use Flip where it helps explain catalog layout changes, with a stable focus strategy and a reduced-motion fallback.
- Make route transitions interruptible: exit → bridge → navigate → enter. Support modified clicks, external links, direct URLs, rapid repeated navigation, back/forward, and scroll restoration.
- Do not depend on private Next.js router APIs or freeze routing internals to preserve an exiting page. Prototype the transition boundary first; use a persistent overlay bridge when outgoing DOM cannot safely be retained.
- Manage cart/menu scroll locking, dialog focus trapping/restoration, announcements, and page-focus handoff.

**Gate passed:** bounded/skippable intro, interruptible route bridge, native back/forward with nonzero scroll restoration, route-local hydration guards, one ticker adapter, scoped pin teardown/recreation, live reduced-motion changes, and the original commerce flows are verified. See `docs/phase-3-report.md`; final performance/heap and broader real-device sign-off remains Phase 5.

### Phase 4 — full storytelling and responsive refinement

Homepage sequence:

1. Full-viewport flagship hero.
2. Featured product story.
3. The considered edit — curated, not an unsupported sales ranking.
4. A fresh perspective — photographed existing models, not a new-release claim.
5. Immersive showcase.
6. Craftsmanship/brand philosophy.
7. Editorial promotion.
8. Featured collections.
9. Closing CTA and minimalist footer.

Each section has its own compositional purpose. Vary scale, alignment, color rhythm, and motion rather than rendering nine identical full-screen sections.

Complete About, product storytelling, navigation behavior, gallery transitions, and responsive art direction. Keep purchase actions and product information readily accessible without finishing scroll sequences.

**Gate passed:** nine semantic homepage chapters in the intended reading order, distinct light/warm/dark photographic treatments, expanded About principles/demo disclosure, canonical SSR product stories with direct purchase anchors, short-landscape internal navigation, and compact mobile gallery behavior. The original commerce/motion suite remains green. See `docs/phase-4-report.md` for 64 browser tests and 49 checked scenes across eight viewport sizes. No unsupported sales/newness/discount claims were added to fill the original storyboard labels.

### Phase 5 — verification and handoff

- Unit/component tests: filtering/sorting, price arithmetic, cart reducer, variant identity, persistence recovery, and quantity constraints.
- Browser tests: every route, search/filter URLs, galleries, variants, cart reload persistence, empty states, invalid products, rapid navigation, back/forward, direct deep links, and missing assets.
- Accessibility: automated checks plus manual keyboard navigation, dialog focus, labels, announcements, text contrast, and reduced-motion behavior.
- Visual review: narrow mobile, tablet, desktop, and wide desktop; test overflow, touch targets, media crops, content readability, and layered navigation.
- Profile representative scroll/navigation sequences; target smooth motion on capable devices without presenting 60 FPS as a universal guarantee.
- Run production build, lint, TypeScript, and production-server smoke tests. Do not run dev and build concurrently against the same .next output.
- Document install/run/build commands, implementation decisions, mock-data limits, asset provenance, and known limitations.

**Gate:** acceptance checklist below passes, with any unverified browser/device explicitly noted.

## 4. Proposed structure

```text
src/
  app/
    layout.tsx
    page.tsx
    shop/page.tsx
    collections/[slug]/page.tsx
    products/[slug]/page.tsx
    cart/page.tsx
    wishlist/page.tsx
    checkout/page.tsx    # explicitly non-transactional demonstration
    about/page.tsx
    not-found.tsx
  components/
    ui/
    layout/
    home/
    catalog/
    product/
    cart/
    motion/
  data/                 # typed mock products and collections
  lib/                  # money, filtering, persistence, motion tokens
  providers/            # scoped cart and motion coordination
  types/
public/
  images/
  fonts/
docs/
  project-brief.md
  decisions.md
  asset-manifest.md
tests/
  unit/
  e2e/
```

Keep routes/content server-rendered where possible and scope client boundaries to motion and interaction. No external commerce services are needed. Development hosting or a later preview deployment does not introduce a commerce backend.

## 5. Acceptance checklist

- [x] Next.js initialized at the requested path before custom coding.
- [x] Starter production build, lint, and TypeScript checks pass.
- [x] User confirms brand, category, visual direction, audience, language, USD, hero category, extras, preloader behavior, and local-only scope.
- [x] User approves moving from this plan into custom implementation.
- [x] All required pages and linked collections/products resolve.
- [x] All visible controls perform a real frontend action or clearly indicate an unavailable action.
- [x] Cart calculations, variants, quantity edits, removal, and reload persistence work.
- [x] Wishlist persistence, quick-view focus behavior, and clearly labeled non-transactional checkout demo work.
- [x] Preloader releases on pending/failed assets; skip and route/overlay cancellation work in checked flows.
- [x] Scoped scroll/animation lifecycle cleanup passes remount, preference-change, and repeated-navigation checks.
- [x] Current mobile and reduced-motion shopping flows remain usable in Chromium emulation.
- [ ] Final all-phase production sign-off after Phase 5 profiling/broader device review. Current Phase 4 build, lint, types, interaction tests, and responsive visual checks pass.
- [x] Run instructions and mock/demo boundaries are documented.

## 6. Established content direction and remaining sourcing

- Select the exact hero headphone model and catalog products after checking product-image usage rights and specification sources. Publicly downloadable manufacturer imagery does not automatically establish commercial-use permission. If suitable assets cannot be verified, flag the blocker and request permitted assets or approval for a different imagery approach; do not substitute a mismatched image for a named product.
- Develop the original Shopthie wordmark, type pairing, and restrained accent. Keep the selected off-white/graphite direction; the user did not request an Apple or Shopify clone.
- Draft a hero built around oversized typography and a large headphone silhouette, flowing into a darker sound/material story. Show meaningful Shop and Explore Product actions immediately.
- Source enough permitted images for coherent galleries and real variant presentation. Do not imply a photo depicts an unsupported colorway.
- Treat premium pricing as simulated USD catalog content, with an explicit demo notice rather than live market-price claims.

No further foundational questionnaire is required. Phases 1–4 are implemented and verified; Phase 4 is ready for review. Phase 5 handles final profiling, broader browser/device coverage, and handoff. The sixteen-product sourcing target remains open. No GitHub push, dashboard, backend, or remote deployment is authorized.
