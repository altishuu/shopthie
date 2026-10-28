# First-paint intro correction

Status: **implemented and verified**. The user's report was a glimpse of the storefront before the loading screen appeared.

## Cause and correction

The server-rendered page was visible while the intro remained `hidden` until a React effect ran. Slower JavaScript delivery exposed that interval. Adjusting the later GSAP animation alone cannot cover a frame rendered before it starts.

- `src/lib/boot-veil.ts` supplies small critical CSS rendered inline in the document head, before the body/storefront markup.
- With normal motion, a matching graphite cover is present immediately and the experience is initially hidden. The existing `data-intro-state` handoff removes these bootstrap rules as the actual intro takes over in the same synchronous setup.
- No pre-hydration script changes React-owned attributes; no hydration-warning suppression was added.
- Reduced motion does not activate the bootstrap cover. A static `noscript` stylesheet preserves the existing immediately readable no-JavaScript page.
- A CSS-only five-second startup watchdog releases the content if app scripts stall. If JavaScript finally arrives after that release, the controller bypasses the intro rather than covering the page again.
- The existing readable first/repeat intro durations, Skip/Escape, four-second active-intro safety timer, shopping flow, and category animations remain unchanged. The startup watchdog and active-intro timer are separate safeguards.

## Verification

- Reproduced RED by holding app scripts: the old `#experience` remained visible.
- New cold-load tests hold app scripts, assert the initial hidden experience/opaque cover, capture the actual frame, then release scripts and check the handoff for uncovered gaps.
- A separate stalled-startup test waits for the CSS fallback and verifies late hydration does not replay an overlay.
- Reduced-motion and no-JavaScript cases retain visible server content.
- All **76 production browser tests passed**, no failures/flaky cases/skips; **43 unit tests passed**.
- Production build, lint, TypeScript, formatting, and diff whitespace checks passed.
- Development Strict Mode smoke passed Home → Shop → Pixel 8 → quantity two → bag, pin cleanup, and live reduced motion, with no runtime/console errors.
- The live production HTML was read back to verify the critical style appears before the body/experience.

Regression source: `tests/e2e/first-paint.spec.ts`. Actual run summary: `docs/first-paint-results.json`. Captures: `docs/screenshots/first-paint/desktop-before-hydration.png` and `mobile-before-hydration.png`; the desktop capture was visually inspected and shows no storefront text/navigation/photography.

`npm run test:motion` now includes the first-paint and earlier motion regression suites. Earlier phase checkpoints and motion timing measurements remain documented in their own reports. Phase 5 broader browser/real-device profiling is still separate.
