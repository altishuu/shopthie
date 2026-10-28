# Shopthie — Phase 5 verification and handoff

Date: October 28, 2026.

Status: **local handoff ready under the user's requested focused verification scope**. The last focus correction is implemented and its affected shopping flows pass. Additional broad test/review/profile cycles were intentionally stopped, not represented as passed. This covers the existing seven-model frontend demonstration, not live commerce or the proposed sixteen-model expansion.

## Verified acceptance

| Gate                                        | Actual result                                                                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production build                            | Passed; static known product/collection routes and partial unknown-route shells generated                                                                                                                    |
| Unit tests                                  | Final candidate: 89 passed                                                                                                                                                                                   |
| Production browser regressions              | Latest: 16 targeted desktop/mobile checks passed. Earlier complete run: 138 passed before the final small focus correction; not rerun.                                                                       |
| Lint / TypeScript / formatting / whitespace | Passed                                                                                                                                                                                                       |
| Development Strict Mode smoke               | Fresh-process Home → Collection → Shop → Pixel 8 → bag and preference changes passed before the final two focus guards; not repeated afterward                                                               |
| Dependency audit                            | Recorded npm audit found zero advisories; not an audit of OS/browser compatibility libraries or a guarantee against unknown vulnerabilities                                                                  |
| Broader engines and axe                     | Baseline: 22 scenarios / 12 axe scans across Chromium, Firefox, WebKit; all passed, 49 screenshots, zero runtime/console errors. Historical checkpoint; latest-source repeat deferred at the user's request. |
| Independent source review                   | Broad current-source static review passed (deleg_268104de). A separate delayed-focus finding was corrected and its focused regressions pass; no additional review cycle was run.                             |

The earlier complete browser run exercised readable intros, first-paint cover, uninterrupted entrances, category transitions, history, modal isolation, pins, and narrow/short layouts. Final checks were limited to the affected removal/focus behavior and essential browse → product → bag → wishlist/demo-checkout flow, plus a fresh production build and static/unit checks.

## Issues found and corrected

### 1. Native media-query listeners accumulated on page restoration

The initial profile retained nine extra listeners on each return to Home, despite the GSAP scenes being reverted. Across six measured five-route cycles after warmup, the listener delta was +54. A separate native-CDP browser regression reproduced +27 across three Home → Shop → Home cycles.

The installed GSAP matchMedia implementation registered legacy query listeners while its context revert did not explicitly remove those native subscriptions. `media-lifecycle.ts` now owns the query subscriptions and each independently scoped GSAP scene. It removes the exact listeners, reverts before rebuilding on changed conditions, avoids duplicate rebuilds for unchanged snapshots, and disposes idempotently. The established responsive pin and reduced-motion behavior remain.

Both desktop and mobile native-counter regressions now retain zero additional listeners or DOM nodes after their repeated-route sequence. The longer final profile also reports zero listener/DOM growth.

### 2. Cross-tab persistence could echo stale state indefinitely

Independent review found that a received storage snapshot was hydrated and automatically written back by the persistence effect. Overlapping tabs could bounce older snapshots between themselves.

The corrected persistence controller queues local intents and performs canonical read/reduce/write transactions under the origin's Web Lock. Remote events only re-read current storage; they never write back an event payload. Queued local work is not discarded. The original version-1 identifier-only payload and storage key remain unchanged. Unsupported/rejected/stalled locks have a bounded two-second best-effort fallback; blocked storage retains visit-local state. This is not a claim of atomic synchronization when cooperative Web Locks are unavailable.

Seventeen persistence tests include actual-provider lifecycle reproduction, six controlled interleavings, stale notifications, blocked storage, corrupt data, lock failure/timeout, FIFO, and stock clamping. The browser regression holds the real lock while both tabs queue changes, checks convergence, then verifies writes stop and remove/clear events do not echo. The drawer opens after the add transaction commits.

### 3. A disabled purchase opener could lose keyboard focus

Adding all five demo units disables the opener before the bag closes. Dialog cleanup now rejects unavailable focus targets and falls back to enabled contextual purchase controls, the purchase anchor, or the visible main. Keyboard-only quantity-five → Enter → Escape cases passed with normal and reduced motion; ordinary quick-view trapping and opener restoration still pass.

### 4. No-JavaScript browsing exposed indefinite loading placeholders

An initial read-only server fallback removed indefinite loading, but a later held-pointer test showed that replacing it during hydration could discard an early native link gesture. The final catalog instead server-renders one persistent ProductCard tree. Its null URL observer mounts only after matching hydration readiness, synchronizes query/history state, and enables JS-only filters afterward. Native link DOM remains connected through hydration. Known product/collection parameters resolve before their main content instead of leaving headings/details behind a script-dependent streaming reveal.

A new no-script browser regression verifies all seven Shop models, the four category counts, and a native product-detail link. Interactive filtering, bag, wishlist, gallery switching, and checkout still require JavaScript; no no-script commerce is implied. Cache Components and partial prefetching remain enabled, and the production build passes.

The known product/collection segments explicitly allow blocking URL-dependent content (`instant = false`) rather than promising an instant shared URL-agnostic shell. This is a scoped navigation trade-off, not a global caching disable. A fresh development smoke originally reproduced the framework's URL-data/Suspense error; the corrected Home → Collection → Shop → Product flow passes without console/runtime errors.

### 5. Deferred transactions needed intent-safe UI continuations

Held-lock browser regressions reproduced repeated quantity clicks collapsing to a single absolute target and a delayed add reopening the bag after dismissal or navigation. Quantity buttons now send relative intents against committed canonical state; direct numeric input remains absolute. Bounds remain one through canonical stock, missing lines are not resurrected, and absolute zero still removes a line. Interaction generations invalidate stale modal continuations while retaining accepted cart mutations.

The shared `send` command remains void but accepts a typed optional current-interaction continuation. Announcements derive from canonical committed state; UI callbacks run only after the React render and one owned frame, checked against controller identity, overlay/navigation generation, and a separate latest-focus ticket. Dismissal, navigation, newer local actions, and teardown cancel pending/scheduled UI effects without cancelling accepted mutations. Actual removals announce success once; duplicate no-op removals stay silent but can repair focus for the now-absent row. Wishlist removal callbacks use canonical transitions rather than a captured rendered boolean.

All 18 focused cases passed on desktop and mobile after rebuild, covering queued/mixed quantities, stale overlays, committed notices, actual/no-op removals, cancellation, and canonical wishlist focus. Additional actual-provider unit checks cover pending, scheduled, and already-dequeued cancellation plus cleanup. Combined with existing checks, 89 units pass. The earlier combined production run passed 138 cases; the last focus-only correction received 16 targeted checks instead of another full rerun.

The last targeted correction also preserves an intervening focus choice: bag and wishlist callbacks capture the focused control at activation and do not move focus away from a different control selected while the mutation waits. Both regressions failed before the guard and passed afterward on desktop/mobile. Normal committed-removal heading repair and duplicate removal remained green in the 16-check final run.

### 6. A nonvisual URL observer left an aborted server boundary

Integration tests caught React 419 during delayed-script first paint and repeated intros. The production response placed a pending boundary directly before the commerce live region and later aborted it. The request-only search-parameter observer now mounts after matching initial readiness; essential server page content is not gated. All four failing desktop/mobile startup cases passed after the correction, without suppressing recoverable errors or console assertions.

### 7. A native catalog gesture could be lost during hydration

The trace showed a click beginning on the read-only preview while that anchor was replaced by the interactive catalog. New regressions held app scripts, began a real mouse-down on a server product link, released scripts, waited for hydration, then released the same pointer without repositioning. Both Shop and smartphone collection failed on the original compiled app and passed after the persistent-tree correction, on desktop and mobile. Filtering/Flip, URL/history, no-script counts/native product links, and fresh development navigation were rechecked. Transaction fixtures separately await their interactive surface so their setup does not accidentally test a different hydration behavior.

## Performance and retention measurements

The numbers in this section are an earlier profiling checkpoint, not a rerun of the latest source. Further profiling was deferred under the user's focused handoff scope.

These are sequential local-production Chromium lab observations, not field Core Web Vitals, a real-phone benchmark, or universal frame-rate certification. The readable intro intentionally remains; browser paint/LCP observations must not be presented as the time when the storefront is uncovered.

- Three cold desktop surface handoffs: **3501.4 / 3350.4 / 3369.3 ms** from document timing.
- Phone-viewport handoff: **3346.2 ms**.
- Phone-viewport 4× CPU + 150 ms network latency / 200,000 bytes/s downstream emulation: **5420.7 ms**.
- Reduced-motion handoff: **251.4 ms**.
- Observed startup CLS: **0** in each of the six lab scenarios.
- Sequential wheel scrolling: **16.7 ms median and p95** frame interval in this run.
- Initial desktop JavaScript resource encoded bytes: **231,281**; phone: **227,470**. Resource totals exclude the navigation document; these are not total application-on-disk sizes.
- After two bounded-route warmup cycles, six more five-route cycles with forced GC: **+522,232 bytes JS heap, zero DOM-node growth, zero event-listener growth**. Heap investigation thresholds were not crossed. A short bounded sample cannot prove that no leak exists under every workload.
- Live-allocation sampling profile is preserved in `phase-5-heap-sampling.json`.

Before/after raw outputs are `phase-5-performance-before.json` and `phase-5-performance-results.json`. Parsed production-suite and native listener evidence are in `phase-5-acceptance-results.json`.

## Browser environment and interpretation

The normal Playwright Chromium headless shell and downloaded Firefox launch on this Linux host. WebKit's official Ubuntu fallback needed ABI-compatible libraries unavailable on the host. A test-only isolated launcher uses checksum-verified packages from Ubuntu's official archive; no system package, vendor executable, or vendor launcher was modified. Chromium 156.0.8078.4, Firefox 157.0, and WebKit 27.2 each passed the baseline matrix. These are historical baseline results; repeat runs were deferred under the final focused scope. Compatibility files were also copied to a version-keyed user cache, all 31 regular files and symlinks verified, and the permanent launcher passed HTTP/title smoke. These libraries are isolated local-app QA dependencies, not approved for general web browsing or covered by npm audit.

Firefox with page scripting disabled can leave a page-world Promise callback undelivered. The browser verifier polls synchronous font status for that case and bounds whole scenarios; this changes the test harness, not application JavaScript settings or a failed app assertion.

Screenshots are stage/geometry evidence, not pixel-baseline approval. Axe and keyboard checks do not certify screen-reader conformance or all WCAG requirements. Real iPhone/iPad Safari, Android hardware, assistive technology, long-session battery/thermal behavior, and deployment-network field data remain unverified.

## Scope and remaining decisions

- Frontend-only. No authentication server, commerce backend, database, real order, payment handling, or personal-data checkout collection.
- Seven verified product models, ten demo variants, eight licensed photographs. The proposed sixteen-model catalog is not complete.
- All prices and stock are simulated; older models are not claimed as current inventory.
- No repository push or deployment was performed. Local source changes remain available for the user's review.
- See `HANDOFF.md` for run commands, maintenance entry points, known limitations, and licensing references.
