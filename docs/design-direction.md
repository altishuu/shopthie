# Shopthie — Phase 1 art direction

## Concept: Better things. Closer.

A light editorial flagship for carefully chosen technology. The homepage is a Decide/Learn surface: one considered product moment per section. Catalog pages are Explore surfaces, prioritizing usable search, controls, and comparison.

Shopthie is a retailer, not a manufacturer. Tell a story about considered selection and daily use, not imaginary proprietary engineering. Use original copy. Never imply authorized reseller status or live inventory.

## Visual identity

- Wordmark: lowercase `shopthie` with tight but readable tracking and a tiny geometric terminal dot; use live text, not an inaccessible image.
- Primary display face: Manrope variable, large, slightly compressed tracking, weights 400–650.
- Interface/body face: DM Sans variable, weights 400–600; keep body readable, not fashionably tiny.
- Both fonts are self-hosted from their Fontsource packages, with license files preserved.
- Paper `#f5f4f0`, clean surface `#ffffff`, graphite `#20211f`, muted ink `#686961`, hairline `#d8d9d1`.
- Dark stage `#20231f`, secondary dark `#30352e`, pale stage text `#f5f4f0`.
- Muted citron `#d9e77b` as a sparing interaction accent, always with graphite text; not a default purple/blue technology gradient.
- Functional danger/success colors are separate from branding and must pass text contrast checks.
- Glass limited to floating navigation and modal/control surfaces where underlying content actually exists; provide an opaque fallback.

## Geometry and composition

- Desktop: 12-column implied grid, max content width around 1440px, fluid gutters 24–64px.
- Hero: asymmetric typography on the left, a dominant real headphone product photograph on the right, small product metadata at the bottom. Avoid a centered stack of title/subtitle/three cards.
- Major type: fluid 64–144px; section headings 40–80px; body 16–18px; metadata 12–14px.
- Tight headline leading; open body leading. Cap line lengths for descriptions.
- Small controls use 10–14px radii; navigation can be pill-like, but product layouts stay mostly borderless and rectangular.
- Large breathing room around product imagery; category/editorial grids deliberately vary scale.

## Homepage storyboard

1. Quiet demo notice + floating wordmark/navigation.
2. Headphone hero: masked headline, image art direction, clear Explore action.
3. Short curatorial statement and a category index.
4. Best sellers: product-led, usable grid with prices explicitly marked as demo when commerce is implemented.
5. Dark audio interlude: larger image and short sound/material story; one potential pinned sequence on desktop only.
6. New arrivals: staggered editorial proportions instead of another identical product row.
7. Considered selection: original brand philosophy with no invented claims or fake reviews.
8. Collection imagery and a closing shopping CTA.
9. Quiet footer, demo boundary, and visible image credits.

## Mobile storyboard

- Keep the headline and primary action visible before the image; show enough product silhouette to establish context.
- Mobile navigation is a genuinely operable dialog/disclosure, not a decorative menu icon.
- Product imagery receives intentional crops; never crop identifying details or use an unrelated colorway.
- Replace pinned sequences with ordinary stacked scenes. Native touch scroll remains primary.
- Minimum 44px touch targets; test down to 360px; no horizontal overflow.

## Motion vocabulary (implementation in Phase 3)

- Control feedback: 160–240ms.
- Short entrances: 450–650ms.
- Scene transitions: 700–1000ms; do not force waits between navigations.
- Easing: controlled cubic/power curves, not bouncing/springy toy behavior.
- Signatures: horizontal image-mask reveals, typographic line wipes, product scale continuity, and one scroll-linked audio scene.
- Motion is enhancement: visible static content if JavaScript fails; reduced-motion has no pinning, parallax, magnetic displacement, or long preloader.
- Initial introduction is first-session only, driven by critical-asset readiness, bounded by a fail-open path. No artificial loading percentages.

## Content and schema contract

Every real product needs `id`, `slug`, `brand`, `name`, `category`, original `description`, `priceMinor`, `currency`, gallery assets with descriptive alt text and source IDs, valid variants, mock-stock flag, and source-checked specification fields.

Asset records need author, source page, license name/version, license URL, local filename, intrinsic dimensions, transformation notes, identity, and attribution text. Public availability is not a license. Keep credits accessible from the website.

The proposed 16-product target is conditional on sourcing enough permitted, matching imagery. Do not duplicate one photo under multiple model identities to meet a count. No fake product or review data.

## Phase 1 verification gate

- Branded design specimen and hero are rendered in Next.js.
- All Phase 1 links lead to real sections/pages; future commerce is not presented as functional yet.
- Product assets are local, source matched, licensed, and credited.
- Desktop/mobile browser screenshots reviewed, no viewport overflow.
- Metadata and self-hosted fonts configured; no starter template copy.
- TypeScript, ESLint, production build, accessibility smoke checks pass.
- Record incomplete sourcing honestly before moving to a full catalog.
