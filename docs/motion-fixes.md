# Motion corrections after Phase 4 review

Status: **implemented and verified**. These address the user's report that the intro was unreadably fast—especially on reload—and category-to-category transitions lacked motion.

## Intro pacing

Cause: the full intro released immediately after assets/logo settled. Repeat visits skipped both gates and started a 0.3-second wipe immediately.

Correction:

- Both versions now reveal the wordmark, hold a readable brand beat, then exit.
- First visit: approximately **3.1 seconds** in the checked active-browser runs; reload: approximately **2.4 seconds**. Repeats remain shorter without flashing away.
- The hold is a presentation/readability interval, not simulated asset progress. The first-visit counter still reflects the actual font/image readiness; repeat counters remain hidden.
- Skip/Escape, reduced-motion bypass/live changes, scoped teardown, and an active-browser **4-second safety timer** remain. Client-side route changes do not replay the intro.
- Pacing is centralized under `motion.intro` in `src/lib/gsap.ts`.

Actual frame-sampled results from the passing production suite:

| Context          | First total | Fully revealed before exit | Reload total | Fully revealed before exit |
| ---------------- | ----------: | -------------------------: | -----------: | -------------------------: |
| Desktop          |       3.11s |                      1.67s |        2.34s |                      1.30s |
| Mobile emulation |       3.13s |                      1.73s |        2.41s |                      1.35s |

The regression measures the interval after all letter transforms settle and before the mask begins removing the text—not merely total overlay duration. Before the fix, the desktop first-visit interval was about 207ms in the observed RED run.

## Category transitions

Cause: the catalog animated only DOM cards shared by the old and new result sets. Headphones → Earbuds (or another disjoint category) has no retained cards, so the effect returned without animating anything. Empty results also prevented a layout snapshot/transition transaction.

Correction:

- Retained cards keep their Flip layout movement.
- Newly entering cards have a scoped 0.45-second rise/settle and image-only mask reveal with a small stagger.
- Labels and interactive overlays are not faded, preserving their text contrast.
- Empty → populated transitions still capture a transaction and animate incoming products.
- Rapid changes finish/cancel the owned timeline before capturing the next layout; completed/reduced-motion paths remove the transient transforms/masks.
- Live reduced-motion preference disables the entrance/Flip choreography without breaking filtering or browser history.

Frame-sampled browser tests exercise Headphones → Earbuds → Speakers → Smartphones, empty → populated, rapid updates, and reduced-motion changes. They assert real intermediate movement and a clean final transform, rather than passing solely because a URL/product count changed.

## Verification

- Production build passed.
- **70 browser tests passed**, no failures/flaky cases/skips; this includes six new desktop/mobile regression executions.
- **43 unit tests passed**; lint, TypeScript, formatting, and diff whitespace passed.
- Existing skip, asset-fault safety, native history, pin lifecycle, keyboard dialogs, shopping/persistence, and responsive/accessibility cases remain green.
- The eleven-document deep-link sweep now has a scoped 60-second total budget because each reload intentionally plays the readable intro. Its individual assertion timeouts and all route/image/option assertions are unchanged. The sweep passed in both contexts.

Evidence: `docs/motion-fix-results.json` contains actual Playwright timing attachments and aggregate run statistics. Regression source: `tests/e2e/motion-regressions.spec.ts`. Run it alone after a production build with:

```bash
npx playwright test tests/e2e/motion-regressions.spec.ts
```

The earlier Phase 3/4 reports remain historical checkpoints; their old intro timing and browser totals are superseded by this correction note. Phase 5 final profiling/broader device review remains separate.
