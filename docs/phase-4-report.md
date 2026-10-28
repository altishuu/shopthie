# Phase 4 — storytelling and responsive refinement

Status: **implemented and verified**. The user authorized continuation into this phase. This checkpoint completes the planned storytelling/responsive pass; Phase 5 final profiling, broader browser/device review, and all-phase handoff remain.

## Delivered

### A coherent nine-chapter homepage

The reading order is now deliberate rather than placing all added scenes in one block:

1. **Flagship** — existing AirPods Max photographic hero, with an immediate product-page link as well as the collection shortcut.
2. **Featured story** — the original “Not more technology” statement flows into a light, image-led second-generation AirPods Pro chapter.
3. **The considered edit** — asymmetric curated audio shelf; explicitly not a sales ranking.
4. **A fresh perspective** — Pixel 8/iPhone 15 diptych; no new-release/current-model claim.
5. **Listening interlude** — existing finite desktop-only pinned AirPods Max scene, with a continue link to the following philosophy chapter.
6. **Perspective** — the existing Shopthie philosophy and About link.
7. **A change of scene** — a warm JBL Flip 3 photographic feature, with real product/collection links and an earlier-model/demo disclosure; not a fabricated discount promotion.
8. **Featured collections** — four working category routes.
9. **Closing** — the Shop CTA, followed by the shared minimalist footer and credits.

The existing client scene was split into independently mountable `ConsideredEdit`, `NewPerspective`, and `ListeningInterlude` components. Each keeps its own scoped effects/media cleanup; no second pin, independent RAF, extra animation dependency, or new scroll-interception system was introduced. The intro, hero, route bridge, native history, and reduced-motion behavior are preserved by the original regression suite.

### About as an editorial spread

- Asymmetric existing photograph/essay composition, with accurate photographer/license attribution and a working credit anchor.
- Three numbered principles in a semantic ordered list, not generic icon cards.
- Distinct graphite demo disclosure: real products, simulated prices/stock, browser-only state, no payments/orders or manufacturer affiliation.
- Existing h1, collection CTA, metadata, and route-local hydration signal retained.
- Route-scoped responsive CSS; no new scroll animation needed to read the page.

### Product storytelling without hiding the purchase flow

- Every seeded product now has an SSR-visible **“A closer look.”** chapter below its purchase grid.
- Category-specific original editorial copy, an actual supplied model photograph, matching credit anchor, and a definition list rendered directly from canonical `product.specifications`.
- Second photograph used only when it exists; otherwise the existing first photograph is reused. No invented angles, finishes, connector versions, benefits, specifications, stock, or generations.
- **“Choose your configuration”** returns to the existing focusable `#product-purchase` area. No duplicate cart/options state or mandatory scroll sequence.
- Below-fold photography remains lazy-loaded and responsive. Existing native gallery transitions and keyboard controls remain unchanged.

### Responsive refinements

- Fixed mobile disclosure navigation is bounded by the dynamic viewport/safe area, scrolls internally, and is excluded from Lenis interception. Its last link remains reachable in a **568×320** landscape viewport without moving the background page.
- Narrow header spacing is less cramped; existing 44px controls remain.
- Native anchor scroll padding accounts for the floating mobile header.
- Main mobile gallery height responds to both width and available height instead of a large fixed stage. Existing contain-fit photography, credit link, 44px arrows, thumbnails, and gallery status remain usable.

## Executed verification

| Gate                                       | Result                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Production build                           | Pass; all 22 generated pages completed                                                                                                    |
| Unit tests                                 | **43 passed**, no failures/skips                                                                                                          |
| Full production browser suite              | **64 passed**, no failures, flaky cases, or skips                                                                                         |
| New storytelling suite                     | **12 desktop/mobile project executions** included in the full suite                                                                       |
| Lint / TypeScript / Prettier               | Pass                                                                                                                                      |
| Visual verifier                            | **49 full-motion scenes across eight viewport sizes**                                                                                     |
| Checked widths                             | **320, 360, 390, 568, 834, 1024, 1440, 1920px**                                                                                           |
| Short landscape                            | **568×320**, including internally scrolled navigation                                                                                     |
| Additional full-motion accessibility scans | **9 scans, zero reported violations**                                                                                                     |
| Captured scenes                            | No document horizontal overflow, browser runtime errors, or console errors                                                                |
| Images                                     | Visible image pixels loaded before captures; all screenshot files exist                                                                   |
| Product action after story                 | Return to purchase area → select actual 256 GB option → add → correct option in bag → close, exercised across the eight verifier contexts |

The full 64-test run retains all prior shopping and motion checks: all seeded routes; filters/search/sort/history; gallery/options; quantities/stock; persisted cart/wishlist; keyboard dialogs; blocked/corrupt storage and cross-tab sync; demo checkout; bounded/skippable intro; rapid routes; nonzero history restoration; pin teardown/recreation; live reduced motion; modal wheel isolation; and the no-JavaScript homepage.

The expanded reduced-motion browser suite also scans Home, About, and Product at narrow portrait and short landscape sizes. Extra full-motion scans cover Home/About/Product at 320, 834, and 1440px, including an unscrolled-home scan before all offscreen reveals.

### Visual inspection

Actual captures inspected include:

- `screenshots/phase-4/narrow-featured-story.png`
- `screenshots/phase-4/desktop-editorial-feature.png`
- `screenshots/phase-4/desktop-about-principles.png`
- `screenshots/phase-4/phone-product-story.png`
- `screenshots/phase-4/landscape-scrollable-navigation.png`

The composition preserves off-white/graphite/citron, Manrope/DM Sans, clear photo/copy hierarchy, restrained glass only for existing elevated controls, and varied chapter scale/alignment. Subjective design self-audit: **0/10 listed template-trope flags** in these reviewed compositions (not an external rating or award claim).

## Responsive findings resolved

**Two findings resolved: one Medium, one Low.** The new feature-missing RED tests were acceptance setup, not additional production defects.

| Severity | Reproduction / prior behavior                                                                                                                                                                                        | Correction and evidence                                                                                                                                                                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium   | At `/`, set 568×320, open mobile navigation, then reach Image credits. The fixed menu extended below the viewport; its initial viewport intersection was less than one.                                              | Bounded, internally scrollable disclosure. The complete panel and focused last link now fit; the background remains at scrollY 0, and Enter closes the menu/navigates. Before: `screenshots/phase-4/landscape-navigation-before.png`. After: `screenshots/phase-4/landscape-scrollable-navigation.png`. |
| Low      | At `/products/apple-airpods-max`, the gallery stage was 370px tall at 390px width, exceeding the new width/height-based compact-gallery budget. Short viewports spent too much space before the product information. | Responsive width/height clamp with a useful minimum; size-budget and next-photo/status tests pass at 390×844, 320×740, and 568×320. Before: `screenshots/phase-4/mobile-gallery-before.png`.                                                                                                            |

Tests were observed failing before the corresponding implementations. During integration, test-harness assumptions were corrected to use the actual native product-option combobox, the actual “Close your bag” accessible name, and an explicit visible-gallery condition before reading its streamed layout. Those fixes did not weaken the geometry, variant, or cart assertions.

## Reproduce

Stop the preview/dev server before rebuilding the shared `.next` output:

```bash
npm run test:e2e
npm test
npm run lint
npm run typecheck
npm run format:check
```

Then start a production preview and run the responsive verifier in another terminal:

```bash
npm run start -- --hostname 127.0.0.1 --port 3100
npm run test:visual
```

- `npm run test:storytelling`: just the new browser suite against an existing production build.
- `scripts/verify-phase4.mjs`: current visual/interaction verifier, with incremental `docs/phase-4-browser-results.json` output and screenshots under `docs/screenshots/phase-4/`.
- `npm run test:visual:motion` / `test:visual:commerce`: retained earlier focused verifiers. Earlier phase reports are historical checkpoints.

## Remaining boundaries

- **Phase 5 remains:** representative performance/heap profiling, final keyboard/accessibility review, broader browser/real-device coverage, and consolidated handoff. Chromium emulation is not real-device Safari/Firefox certification. No universal frame-rate or zero-leak claim is made.
- Catalog remains **seven source-verified products, ten variants, eight licensed photographs**. Sixteen products remains a sourcing target, not an achieved count; expanding it requires coherent permitted imagery and verified facts.
- No new photography or technical specifications were introduced in Phase 4; existing source/license/change notices remain available through the shared footer.
- Frontend/local-only scope remains unchanged. No backend, authentication server, database, dashboard, real orders/payments, GitHub push, or deployment was added.

**Phase 4 gate passed:** the complete editorial reading order, About/product storytelling, compact-gallery behavior, and short-viewport navigation work alongside the original commerce and cinematic layers.
