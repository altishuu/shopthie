# Shopthie — local handoff

Project: `/home/ivanadcan35/Projects/Ishuu/shopthie`  
Date: October 28, 2026  
Delivery: local frontend demonstration; no deployment or repository push.

**Ready for local review under the agreed focused verification scope.** Latest code passes the production build, lint/types/formatting, 89 unit tests, and 16 targeted desktop/mobile checks covering the main shopping flow and final focus correction. The earlier full suite passed 138 tests before the final small change; it was not repeated. Broader-engine/profile outputs are historical checkpoints, not latest-source certification. See `phase-5-report.md` and `phase-5-acceptance-results.json` for scope and remaining limits.

## Start the application

Verified environment: Node 26.12.1, npm 12.2.1. Unit tests use native TypeScript stripping; use Node 22.18+ with that support, although this handoff was exercised on Node 26.

```bash
cd /home/ivanadcan35/Projects/Ishuu/shopthie
npm ci
npm run dev
```

For the production preview, stop this project's existing development/preview processes before rebuilding:

```bash
npm run build
npm run start -- --hostname 127.0.0.1 --port 3100
```

Open `http://127.0.0.1:3100`. Do not stop unrelated Node processes. No environment secrets or external commerce service are required.

## What works

- Nine-chapter Home, Shop, four collections, seven product pages, About, Cart, Wishlist, and Checkout Demo.
- Search/category/brand/sort query URLs; browser history; galleries; verified options; quantity limits; quick view; native bag dialog; persistence and cross-tab synchronization.
- USD demo prices, simulated stock, wishlist, and a checkout demonstration with no payment/delivery fields or real submission.
- Readable first/repeat intros, pre-hydration cover/fail-open, uninterrupted page entrances, route bridge, scroll scenes, responsive pinning, native touch scrolling, and reduced-motion alternatives.
- Native read-only browsing on Home, Shop, collections, and known product pages when JavaScript is disabled. Interactive shopping/filtering and photo switching still require JavaScript.
- Keyboard dialogs/trapping/restoration, including the purchase trigger becoming disabled after the last demo units are added.

## Verification commands

Stop project servers before `test:e2e` because it rebuilds `.next`; its production test server uses port 3101.

```bash
npm test
npm run lint
npm run typecheck
npm run format:check
npx playwright install chromium --only-shell
npm run test:e2e
```

With an already-built production preview on port 3100, run these **sequentially**, not alongside other performance-sensitive browser jobs:

```bash
npm run test:performance
npm run test:browsers
npm run test:commerce:browsers
```

The browser verifier needs Chromium, Firefox, and WebKit runtimes. On an officially supported OS, install the required Playwright browsers/dependencies using Playwright's supported installation procedure, for example `npx playwright install --with-deps firefox webkit` on supported Linux. This host's Linux distribution required an isolated, test-only compatibility launcher for WebKit; no system packages or vendor launchers were modified. `SHOPTHIE_WEBKIT_EXECUTABLE` selects a verified local launcher. Its actual path is recorded in `phase-5-browser-results.json`. A missing engine is blocked coverage, not a pass.

On this host, the verified version-keyed launcher is outside expiring scratch storage:

```bash
export SHOPTHIE_WEBKIT_EXECUTABLE=/home/ivanadcan35/.cache/shopthie/webkit-2370-compat/launch.sh
```

The adjacent manifest records three official package archive checksums. All 31 extracted regular files and symlinks were checked against the original extraction, and the cached launcher passed a real WebKit HTTP/title smoke. These compatibility libraries are for isolated local-app QA only, not general web browsing or a claim of current OS-library security support. Upgrading Playwright may require a new version-matched runtime. The focused commerce command uses `playwright.commerce.config.ts`, keeps the primary HTML report intact, and records its own per-engine JSON evidence.

`SHOPTHIE_URL` can select another preview origin. The cross-browser verifier blocks non-read and cross-origin browser requests and uses fresh browser contexts. It does not operate the user's existing browser account or shopping storage.

Additional focused commands:

```bash
npm run test:motion
npm run test:storytelling
npm run test:visual
```

The last command is the historical Phase 4 visual matrix, not a substitute for the newer lifecycle and broader-engine checks. Run development/Strict Mode separately on port 3102 with `npm run test:dev:motion`; do not build concurrently. Performance warnings need human investigation even if the profiling command itself exits zero.

## Evidence and interpretation

- `phase-5-report.md`: findings, corrections, results, limits.
- `phase-5-acceptance-results.json`: actual full regression counts and native listener measurements.
- `phase-5-performance-before.json` / `phase-5-performance-results.json`: before/after profiling.
- `phase-5-heap-sampling.json`: actual sampled allocations.
- `phase-5-browser-results.json`: incremental broader-engine scenarios, axe outputs, screenshot inventory, engine availability and limitations.
- `phase-5-commerce-browser-results.json`: focused real-lock interaction regressions on the three desktop engines.
- `phase-5-dependency-audit.json`: recorded npm advisory result, not a penetration test or OS-library audit.
- `screenshots/phase-5/`: current screenshots are the ones explicitly listed in the latest JSON report.

The intentional intro adds time before the storefront is uncovered. Do not use the early browser paint/LCP observation as proof that shopping content was already visible. The explicit surface-handoff metric records that separately. Lab frame intervals and bounded heap measurements are not universal FPS or leak-free guarantees.

## Maintenance map

| Change                                                         | Canonical location                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Catalog identities, demo prices, stock, verified variants      | `src/data/products.ts`                                             |
| Image provenance, licenses and required credit                 | `src/data/asset-credits.ts`, `docs/asset-manifest.md`              |
| Manufacturer fact sources                                      | `docs/specification-sources.md`                                    |
| Currency presentation                                          | `src/lib/money.ts` — changing a symbol does not convert USD values |
| Cart validation/reduction and schema                           | `src/lib/cart.ts`                                                  |
| Local-intent transactions and cross-tab coordination           | `src/lib/commerce-persistence.ts`                                  |
| Global intro/route coordination                                | `src/lib/experience.ts`                                            |
| Motion tokens and plugin setup                                 | `src/lib/gsap.ts`                                                  |
| Independent animation ownership and native media subscriptions | `src/lib/motion-context.ts`, `src/lib/media-lifecycle.ts`          |
| Editorial scenes                                               | `src/components/motion/home-scenes.tsx`                            |
| Stable native catalog tree and hydrated URL observer           | `src/components/catalog/catalog.tsx`                               |

Do not start another Lenis RAF loop, globally kill unrelated GSAP animations, animate beneath a covering surface, or revert a page scope from an overlay's context. Test actual intermediate states and route restoration, not only completed screenshots.

## Persistence and privacy

`shopthie-commerce-v1` contains version 1 and identifier/quantity-only cart/wishlist data. No credentials, personal information, or payment data are stored. New synchronization accepts the existing payload; no storage reset is required. Cooperative Web Locks serialize simultaneous local intents where available. Without usable locks, persistence is explicitly best-effort; blocked storage falls back to this visit's memory.

`shopthie-intro-v1` is the separate session intro marker. To review the full intro again, remove only that session marker rather than clearing the bag or all browser storage.

## Known limits / work not claimed

- Seven real models, ten variants, eight licensed photos; the proposed sixteen-model expansion remains incomplete. Source permitted matching photography and verified facts before adding products.
- All prices/stock are simulated, including older models. No live inventory, manufacturer endorsement, auth, backend, database, real checkout, or payment gateway.
- Desktop engines and viewport/touch emulation are not physical iPhone/iPad Safari, Android hardware, screen-reader certification, long-duration thermal testing, or deployment field measurements.
- In the local smoke, an initial streamed unknown product/collection response returned HTTP 200; subsequent requests returned 404 with `noindex`. Not-found UI is regression-tested. Agree strict first-response HTTP-status/indexing requirements before a public deployment.
- No deployment, GitHub push, or live business operation has been performed. Review local changes before any publication.
- Photograph CC BY/CC BY-SA and font licenses remain in force. Keep attribution, source/license links, change notices, and the local source files; image permissions do not imply brand affiliation or blanket third-party rights clearance.
