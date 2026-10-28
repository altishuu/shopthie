# Global entrance continuity correction

Status: **implemented and verified**. Production build, lint, TypeScript, formatting, and diff checks passed; all **86 browser tests** and **46 unit tests** passed. The development/Strict Mode smoke completed without runtime/console errors. Actual start/middle/completed desktop and phone frames were captured; the desktop intermediate and mobile completed captures were visually inspected.

## Reproduced cause

The intro exit timeline called the page entrance before the cover was gone. That callback ran within the intro's GSAP context. Calling `pageContext.add()` there registered the page context as a child of the intro context. `finishIntro()` then reverted the intro, which also reverted the still-running page entrance and its later ScrollTriggers. The visible result was a partial entrance jumping to CSS's final appearance.

An isolated probe against the installed GSAP reproduced this ownership problem with a plain object: progress 0.4 produced x=40, but reverting the loader returned x to 0 and marked the unrelated page context reverted. Browser regressions also failed for early hero/heading playback and missing offscreen collection reveals.

## Shared correction

- `src/lib/motion-context.ts` uses the public `Context.ignore()` boundary for independent lifecycle registration. Page scope construction and entrance registration cannot be adopted by a loader callback. Callback errors are rethrown only after GSAP restores the caller's context.
- `src/lib/experience.ts` prepares a paused, page-owned entrance under the cover and plays it only after the intro or route bridge finishes. No arbitrary delay, shortened animation duration, global kill-all, or early progress-to-one was introduced.
- The same lifecycle applies to homepage hero typography/photography/details and the shared heading entrance across other routes. Incoming route headings no longer spend their animation beneath the route veil.
- Loader cleanup cannot discard the page's later collection/editorial ScrollTriggers. Page teardown still reverts page-owned animations.
- Product galleries wait for decoded pixels and the shared `shopthie:surface-ready` handoff. Modal galleries remain independent of the underlying route cover. Gallery listeners/tweens are removed on cleanup.
- Hero detail reveals use geometry/masks instead of reducing text opacity. Magnetic hover cannot overwrite a still-running page entrance's transform/mask.
- Skip and cancellation release the prepared entrance; reduced-motion changes reveal/reset rather than replay already-presented content. A startup watchdog bypass also avoids replaying the initial entrance over already-visible content.

The first-paint cover, readable first/repeat loading-screen holds, real asset readiness, four-second active-intro cap, five-second bootstrap fail-open, native scrolling/history, and frontend-only shopping scope remain intact.

## Regression coverage

`tests/e2e/animation-continuity.spec.ts` samples actual computed geometry on animation frames for:

- first and repeat homepage entrances, starting after the intro and retaining the full visible reveal;
- direct Shop and incoming About headings, including route-bridge completion;
- later offscreen collection reveals surviving intro cleanup;
- direct and route-entered product gallery reveals;
- Skip followed by hover without interrupting the entrance or leaving a partial mask.

`tests/unit/motion-context.test.ts` checks real GSAP ownership, later animation progress, proper page teardown, scope construction from a foreign callback, and context restoration after a registration error. Existing first-paint, commerce, navigation, accessibility, reduced-motion, and storytelling suites remain part of acceptance.

Frame probes assert meaningful intermediate geometry, motion after the handoff, and no premature terminal reset—not an assumed FPS or the span between two potentially missed sampled frames. Exploratory four-worker runs dropped short gallery samples; the established two-worker configuration remains the acceptance setting. Probe corrections retain the start-after-cover/post-handoff checks, verify the endpoint, and reject a large mask-to-final jump across neighboring frames. The final full two-worker run passed with no failures, retries/flaky results, or skips. This is lifecycle verification, not universal frame-rate certification.

See the generated `animation-continuity-results.json`, `animation-continuity-visual-results.json`, screenshots under `screenshots/animation-continuity/`, and the development smoke result in `phase-3-dev-results.json` for actual outputs. Broader browser/real-device performance and heap profiling are still Phase 5 work, not claimed here.
