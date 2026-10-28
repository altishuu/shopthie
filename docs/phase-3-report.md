# Phase 3 — cinematic motion checkpoint

Status: **implemented and verified**. The user explicitly approved Phase 3. This is the motion-layer checkpoint, not completion of the remaining art-direction and final profiling/handoff phases.

## Delivered

- GSAP, ScrollTrigger, Flip, `@gsap/react`, and Lenis installed. Plugin registration, easing, shared durations/staggers/intensities, and safety limits live in `src/lib/gsap.ts`.
- Exactly one GSAP ticker callback drives each active Lenis instance. The adapter converts seconds to milliseconds and removes its exact callback/listener before destroying the instance; its cleanup is idempotent. No independent application RAF loop.
- Lenis smooth-wheel behavior on fine pointers; native scrolling on touch/coarse pointers and in reduced motion. CSS smooth scrolling is disabled so native history restoration does not compete with another smoothing driver.
- Full first-tab-session introduction: staggered original wordmark, actual essential-font/hero-image readiness, coordinated mask wipe and hero entrance. Returning document loads use an abbreviated bridge; client route changes do not replay the introduction. Reduced motion skips it. Skip button, Escape, error settlement, and a three-second release bound prevent a trapped introduction.
- Persistent branded route bridge: mask exit → public `router.push` → hydrated incoming route → complementary entrance. No frozen trees or private router APIs. Same-path filters/hashes retain their native/local behavior; modified, external, download, and alternate-target links are excluded from interception.
- Rapid clicks replace pending exits; a click back to the current route cancels a pending departure. Back/forward stays native, including an exercised nonzero scroll-position restoration. Explicit new-page link navigation starts at the page top; hash navigation is not forcibly reset to zero.
- Fixed glass navigation with direction-aware hiding, focus/menu-aware reveal, animated active indicator, mobile menu reveal, and explicit reset after route completion/cancellation.
- Home masked typography/product entrance, restrained product parallax, collection-image masks, coordinated dark-story image/copy motion, and closing typography.
- Three additional home chapters: asymmetric curated audio shelf, finite pinned AirPods Max interlude, and Pixel 8/iPhone 15 diptych. They are editorial selections—not invented sales rankings or current-model/new-stock claims. The pin exists only at ≥1024px width and ≥700px height, without reduced motion; all other layouts stay in ordinary document flow.
- Flip layout changes for retained catalog cards, gallery motion after image decoding, option/add-button feedback, magnetic fine-pointer controls, and short native-dialog entrances. Dialog close remains immediate and keyboard/focus behavior is retained.
- Live reduced-motion changes dispose the owned scroll driver, clear transient transforms/overlays, remove pins through scoped media cleanup, and leave the store usable.

## Architecture and hydration boundary

`MotionExperience` owns persistent coordination, while the DOM controller in `src/lib/experience.ts` owns its listeners, contexts, timers, and timelines. React-owned readiness state disables shopping inputs until both persistence hydration and intro release are complete.

A route-local `RouteMotionReady` client leaf signals when its server-rendered route has hydrated. Global motion waits for that signal instead of assuming an outer layout effect means nested App Router content is ready. Product/collection signals live inside their resolved content boundaries. Client-owned wishlist/checkout headings are excluded from the global heading mutation. This corrected a real development hydration warning; no `suppressHydrationWarning`, arbitrary hydration delay, or router-internal workaround was added.

The former root `loading.tsx` boundary is replaced by scoped reusable loading content for streamed routes. This keeps the static homepage available without JavaScript instead of leaving it hidden behind a streaming fallback.

Only current, visible route elements are selected; retained hidden Next.js pages are not treated as the active page. ScrollTrigger measurements invalidate its public scroll cache and are skipped when no scroll scenes exist. That avoids reviving a previous page's cached position or interrupting native browser restoration.

## Executed verification

| Gate                                           | Result                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run test:e2e`                             | Production build + **52 browser tests passed**                                                                    |
| `npm test`                                     | **43 unit tests passed**                                                                                          |
| Lint / TypeScript / Prettier / diff whitespace | Pass                                                                                                              |
| `npm run test:visual`                          | **39 checked scenes**, seven viewport widths                                                                      |
| Checked widths                                 | **320, 360, 375, 390, 834, 1440, 1920px**                                                                         |
| Visual checks                                  | No horizontal overflow or runtime page errors; rendered image pixels loaded                                       |
| Additional full-motion axe scans               | **3 scans, zero reported violations**                                                                             |
| Development Strict Mode smoke                  | Home → Shop → Pixel 8 → quantity two → bag → close; live reduced-motion toggle; no browser console/runtime errors |
| Native history                                 | URL back/forward plus restoration near the exercised 400px catalog position                                       |
| Intro faults                                   | Delayed critical asset cannot keep the intro locked; skip works while the asset is pending                        |
| No-JavaScript fallback                         | Homepage remains visible; its Shop link reaches the catalog heading                                               |
| Pin ownership                                  | One eligible desktop pin, none on mobile/reduced motion, none left after route departure, one after restoration   |

The original commerce suite remains in the full run: catalog/query/history, every seeded product/collection, options, variant-aware bag, quantities/removal/stock, wishlist, storage corruption/blocking/cross-tab sync, keyboard dialogs, and the non-transactional checkout.

Artifacts:

- `docs/phase-3-browser-results.json`: incremental structured visual results.
- `docs/phase-3-dev-results.json`: development smoke result.
- `docs/screenshots/phase-3/`: viewport screenshots plus an actual intro frame.
- `docs/phase-3-media/`: browser recording and a short H.264 intro preview.
- `tests/e2e/motion.spec.ts`: persistent motion regression cases.

Actual intro, desktop hero/interlude, and narrow mobile navigation/catalog captures were visually inspected. Automated checks are not a substitute for final real-device testing.

## Resolved QA findings

**9 resolved findings:** 3 High, 5 Medium, 1 Low. No known blocking defect remains in the checked Phase 3 flows. These are findings observed during implementation, not outstanding bugs.

| Severity | Finding and reproduction                             | Prior actual behavior → correction / verification                                                                                                                                                                                                                                                                    |
| -------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | Open `/` with JavaScript disabled                    | Root loading fallback remained while the rendered homepage sat in a hidden streamed segment → removed the global boundary, retained scoped loading; no-JS browse test passes.                                                                                                                                        |
| High     | Cold development load of `/` with global motion      | Layout effect wrote GSAP styles before nested server-route hydration, producing attribute mismatch diagnostics → route-local hydration signal; repeat development smoke has no console/runtime errors.                                                                                                               |
| High     | Scan full-motion home before scrolling               | Whole editorial figure/header opacity reduced caption contrast to 3.08:1 and a large subheading to 2.5:1 → text-containing reveals retain their opacity/contrast; full-motion desktop/mobile regression and visual axe scans pass.                                                                                   |
| Medium   | Fill quantity immediately during initial loading     | Controls became enabled before the intro's inert boundary released; early automated input could be swallowed → readiness gates disabled state as well as inert/ARIA state; original quantity-two and stock-five tests pass unchanged.                                                                                |
| Medium   | Shop → product → browser back                        | Cached hidden route nodes were included in unscoped selectors (ten total cards versus seven visible catalog cards) → motion selects the visible main and tests count the actual visible catalog.                                                                                                                     |
| Medium   | Click About, then immediately the current Shop route | Older scheduled departure still navigated to About → same-route click cancels the pending exit; regression passes.                                                                                                                                                                                                   |
| Medium   | Leave a deeply scrolled home on mobile               | Header hide transform survived into the new route → explicit header/direction-baseline reset; navigation remains reachable.                                                                                                                                                                                          |
| Medium   | Navigate from a long page, then exercise history     | ScrollTrigger refresh could revive a stale saved scroll position; CSS smooth restoration could be interrupted partway → refresh only with active scenes, clear its public scroll memory, use one smoothing driver, and reset only explicit new-page pushes. Header/title and nonzero history-restoration tests pass. |
| Low      | Disable motion during a magnetic pointer-out return  | Killed return tween left a fractional transform → reset its actual owned targets, including after the pointer target reference clears; regression passes.                                                                                                                                                            |

Resolved-state visual evidence: `screenshots/phase-3/desktop-introduction.png`, `desktop-hero.png`, `desktop-listening.png`, `narrow-collection-after-transition.png`, and `narrow-mobile-navigation.png`.

## Remaining scope

- Phase 4: final homepage/About/product storytelling and responsive art-direction refinement, including compact-header/typography polish and more coherent licensed imagery where available.
- The catalog remains **seven verified models / ten variants / eight photographs**. Sixteen products is still a sourcing target, not an achieved count. No factual or licensing shortcuts were taken to inflate it.
- Phase 5: representative performance/heap profiling, wider browser/real-device coverage, final all-phase accessibility review, and handoff. No universal 60 FPS, zero-memory-leak certification, Safari/Firefox validation, or Awwwards result is claimed.
- Frontend/local-only boundaries remain unchanged: no authentication server, commerce backend, dashboard, database, real order, payment gateway, GitHub push, or remote deployment.

**Phase 3 gate passed:** the cinematic layer works without blocking the original shopping flow, with native history, bounded/reduced-motion fallbacks, and scoped cleanup covered by the checks above.
