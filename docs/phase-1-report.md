# Phase 1 — visual foundation checkpoint

## Delivered

- Original lowercase Shopthie wordmark and app icon.
- Off-white/graphite design tokens, muted citron interaction accent, self-hosted Manrope and DM Sans with preserved license files.
- Server-rendered headphone-led homepage: asymmetric hero, four category studies, dark audio story, brand perspective, closing navigation, and footer.
- Operable responsive navigation, keyboard Escape close/focus return, skip link, visible focus, reduced-motion CSS, and working section/credit links.
- Public photograph credits: author, source, license, change notice, and local source JPEG link.
- Typed product/asset/variant contract for Phase 2.
- Centralized USD currency formatter with configurable code/locale/symbol, currency-aware decimal precision, and safe-integer minor-unit validation. It does not perform currency conversion.
- Plan, decision record, design direction, source manifest, README, tests, and reproducible screenshot verifier.

## Asset outcome

- Eight local JPEG photographs, seven exact product identities, four categories, five brands.
- Total photo bytes: 2,361,984. All eight SHA-256 checksums, decoded dimensions, and JPEG signatures match `catalog-sources.json`.
- Parent verification also fetched the live Commons ImageInfo license metadata for all eight files: the documented CC BY / CC BY-SA licenses match.
- Hero is Apple AirPods Max, not a purported new generation or connector variant. Numeric suffixes in source filenames identify photographs, not hardware versions.
- Some models are older; the app explicitly describes them as editorial demo examples, not current-stock offers.
- The proposed sixteen-product target has **not** been reached. Expand from seven only when appropriate imagery and identity evidence are available; never relabel or duplicate models to manufacture the count.

## Executed verification

| Check | Result |
|---|---|
| `npm run build` | Pass; `/`, built-in not-found, and original `/icon.svg` generated |
| `npm run lint` | Pass; generated browser reports excluded from source linting |
| `npm run typecheck` | Pass |
| `npm test` | Four tests pass |
| `npm run test:e2e` | Six tests pass against a freshly built production server |
| Automated WCAG A/AA checks | No reported violations on tested desktop/mobile homepage states |
| Screenshot/geometry verifier | Pass at 360, 390, 834, 1440, and 1920px widths |
| Runtime page errors | None in the five tested viewport sessions |
| Main-section images | All six rendered image elements load in every tested viewport session |
| Credit records | Eight public credits present |
| JavaScript disabled | Mobile homepage headline remains visible |

Browser coverage is Chromium with desktop and mobile emulation, not a claim of real-device Safari/Firefox validation or complete accessibility certification. Motion performance/FPS and lifecycle testing belongs to the later GSAP/Lenis phase.

A cold development-server test run exhibited an unstyled image-overlay state; a warm development run passed. The underlying cold-dev cause was not conclusively isolated. Final acceptance therefore uses a fresh **production** server and explicit computed-style checks, rather than treating accessible DOM or a warm dev reload as proof of correct rendering. Production checks passed without the overlay. Revisit if it recurs during Phase 2 development.

## Visual review

Screenshots were inspected for desktop/mobile/tablet hero composition, category imagery, and the dark audio scene. The headphone photo is framed honestly as a dark photograph rather than processed as a fake transparent packshot. Product prominence and headline spacing were refined after the initial review.

Design-skill rubric: 0/10 flagged template tells in the reviewed scenes. No default tech gradient, icon-feature tile grid, fake statistics, decorative rails, or center-stacked catalog composition. This rubric is a subjective diagnostic, not a claim of award-level design or final completion.

## Deliberately not implemented yet

- Search/filter/sort, Shop/Collection routes, Product Details, gallery switching, variant selection, cart, wishlist, quick view, checkout demonstration.
- GSAP, ScrollTrigger, Flip, Lenis, preloader, route transitions, magnetic controls, and scroll-linked storytelling.
- Live prices/stock, authentication, backend, dashboard, payment integration, remote repository, or deployment.

The current page is explicitly a **Phase 01 design preview**. No false shopping controls are shown. Existing calls to action navigate to real sections; category disclosures and credits are operable.

## Review gate and next phase

Review the rendered hero and visual direction before Phase 2. The remaining sourcing gap does not prevent functional commerce work using the verified seed products, but the sixteen-product proposal must remain tracked as incomplete until honestly fulfilled.

Phase 2 sequence: catalog data/queries → product detail/gallery/options → cart reducer/persistence and drawer → wishlist/quick view → checkout demo → end-to-end shopping flow and error/empty-state tests.

Local production preview uses port 3100. The screenshot verifier lives at `scripts/verify-phase1.mjs`; screenshots are under `docs/screenshots/`.
