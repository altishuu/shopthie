# Shopthie — confirmed planning decisions

## Brand and audience

- Public-facing brand and project folder: **Shopthie** / `shopthie`.
- Multi-brand retailer of real premium technology and audio products from different manufacturers.
- Target shoppers: people buying high-quality smartphones, speakers, earbuds, and headphones.
- Interface language: English.
- Reference intent: familiar Shopify-style shopping usability, but original, more impactful art direction. Do not switch to Shopify or copy a particular storefront.

## Visual and motion direction

- Light flagship: off-white, graphite typography, sculptural product imagery, and dark cinematic interludes.
- Hero category: over-ear headphones.
- Assistant selects coherent, appropriately licensed assets. Phase 1 now includes eight photographs covering seven verified models, with linked public credits. See `asset-manifest.md` for license conditions and provenance.
- Full cinematic introduction on first visit per session; abbreviated repeat visits.
- Reduced-motion users receive a simplified experience regardless of preloader replay preference.
- Proposed visual system implemented for review: self-hosted Manrope display and DM Sans body, off-white/graphite, muted citron interaction accent, and Apple AirPods Max photographic hero. These are the assistant's design choices, not a claim of new user approvals.

## Functional scope

Required: Home, Shop/Collections, Product Details, Cart, and About, with search, filters, sorting, galleries, variants, quantity selection, and persistent cart management.

Confirmed additions:

- Persistent wishlist with its own page and product toggles.
- Accessible quick-view dialog with product options, add-to-cart, and link to full details.
- Clearly labeled checkout demonstration: order summary and simulated completion only. No payment details, real delivery information, or real order submission.

Frontend-only with typed local product data and client state. No authentication server, commerce backend, database, payment gateway, or dashboard.

## Currency architecture

Confirmed initial currency: **USD**, displayed with **$**. Proposed initial locale: `en-US`.

Use one centralized settings adapter and formatter, with explicit currency code, locale, display mode, optional symbol override, and price base currency. Derive currency decimal precision instead of assuming two decimal places for all currencies. Compute cart values using integer minor units.

A future dashboard can update the configuration without rewriting UI components. That dashboard and its settings backend are not part of this project stage.

Changing a symbol is not currency conversion. Future currency changes must provide correctly denominated prices or a separately specified conversion source. No live exchange-rate integration is in scope.

## Content integrity

- Proposed implementation dataset: 16 products across four categories, subject to permitted imagery availability.
- Real product identities/specifications must match their images and manufacturer sources.
- Prices and availability are simulated frontend data, not current market offers or inventory.
- Do not claim authorized reseller status, brand affiliation, fake reviews, or unsupported product capabilities.

## Delivery and implementation status

- Local-only delivery at `/home/ivanadcan35/Projects/Ishuu/shopthie/`.
- No remote repository, push, or deployment requested.
- Next.js scaffold initialized before custom code.
- User authorized phase-by-phase implementation after approving the plan.
- Phase 1 visual direction was accepted through the user's instruction to proceed to the next phase.
- Phase 2 is implemented and verified: working catalog/search/filter/sort, all seeded product/collection routes, galleries/options, cart drawer/page, persisted wishlist, quick view, About, and explicitly non-transactional demo checkout.
- The catalog currently contains seven real products, ten valid demo variants, and eight licensed photographs. Sixteen products remains a sourcing target, not an achieved count.
- Production build, lint, TypeScript, formatting, 43 unit tests, and 64 desktop/mobile browser tests pass. The Phase 4 visual verifier checked 49 full-motion scenes across eight viewport sizes, with no overflow/runtime/console errors and no reported violations in its nine additional accessibility scans.
- Catalog specs and stock/price simulation boundaries remain in `specification-sources.md`; historical Phase 2 results remain in `phase-2-report.md`.
- Phase 3 is implemented: first-session intro, shared GSAP/Lenis driver, hydration-safe route bridge, native history restoration, floating navigation, scoped interaction effects, and three editorial home chapters. See `phase-3-report.md`.
- Native touch/reduced-motion scrolling is retained; CSS smooth scrolling is not a second driver. ScrollTrigger refresh is limited to active scenes with fresh scroll memory.
- Phase 4 is implemented and verified: nine-chapter homepage, new featured/editorial photo treatments, expanded About principles, canonical product-story chapters with return-to-purchase anchors, short-landscape menu scrolling, and adaptive mobile galleries. See `phase-4-report.md`.
- The storyboard's best-seller/new-arrival roles use honest curated/fresh-perspective language, not unsupported sales rankings, current-release claims, or fabricated discounts.
- Phase 5 final profiling/broader browser-device sign-off and consolidated handoff remain. No new foundational design question blocks the planned final checks.
