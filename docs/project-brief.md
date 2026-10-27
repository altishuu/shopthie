# PROJECT: Premium Cinematic E-Commerce Website

## ROLE & OBJECTIVE

Act as an **award-winning Senior UI/UX Designer, Creative Director, Motion Designer, and Senior Frontend Engineer** specializing in high-end, interactive digital experiences.

Your task is to **design and develop a fully functional, visually breathtaking, exceptionally animated e-commerce website** using Next.js, GSAP, and Lenis.

The website should feel like an award-winning digital experience from Awwwards, with the visual refinement, simplicity, and sophisticated interactions associated with Apple's product websites.

This must not look or feel like a generic e-commerce template.

**The primary goal is to create a memorable, cinematic, visually impressive experience that makes visitors think "WOW" from the moment the website loads.**

Prioritize exceptional visual design, animation craftsmanship, interaction quality, usability, and attention to detail.

---

## 1. TECHNOLOGY STACK

Use the following technologies:

- **Next.js** — App Router architecture.
- **TypeScript** — Clean, maintainable, type-safe code.
- **Tailwind CSS** — Custom styling and responsive design.
- **GSAP** — Primary animation engine.
- **GSAP ScrollTrigger** — Advanced scroll-driven animations.
- **GSAP Flip** — Sophisticated layout and element transitions where appropriate.
- **Lenis** — Smooth, momentum-based scrolling.
- **Lucide Icons** — Minimal, consistent iconography.

Synchronize Lenis and GSAP correctly using a unified animation loop.

Build the entire experience as a **frontend-only application**. Do not implement a backend, authentication server, database, or payment gateway.

Use realistic mock product data and local frontend state for interactive features.

---

## 2. VISUAL DIRECTION — APPLE-INSPIRED MINIMALISM

The visual language should be inspired by Apple's premium product presentations, iOS interface refinement, and modern editorial design.

### Core aesthetic

- Sophisticated, minimalist, futuristic, and luxurious.
- Exceptional typography, generous negative space, and carefully balanced layouts.
- Elegant off-white backgrounds, soft grays, charcoal, and occasional dark cinematic sections.
- Tasteful gradients, subtle lighting, and refined atmospheric depth.
- Beautiful, high-resolution product imagery presented with editorial art direction.
- Carefully considered spacing, alignment, hierarchy, and composition.
- Every section should feel intentionally art-directed rather than automatically assembled.

### Subtle Liquid Glass styling

Introduce a **restrained interpretation of Apple's Liquid Glass aesthetic**.

Use:

- Delicate translucency and backdrop blur.
- Soft luminous edges.
- Subtle surface reflections and highlights.
- Layered glass-like panels.
- Smooth rounded corners.
- Elegant shadows and ambient depth.
- Refined glass-inspired navigation components.

**Important:** Do not overuse glassmorphism. The website should not resemble a collection of transparent floating cards.

Maintain excellent readability and strong visual contrast. Glass effects should be used selectively for navigation, overlays, controls, and visually significant interactive elements.

The overall presentation must feel premium and timeless, not excessively flashy or gimmicky.

---

## 3. CINEMATIC INITIAL LOADING EXPERIENCE

Create a **fully custom, carefully choreographed animated loading experience** that immediately establishes the visual identity of the website.

### Loading animation sequence

1. Begin with a refined fullscreen loading screen.
2. Reveal the brand logo using a custom GSAP animation.
3. Introduce elegant typographic motion, masked reveals, or subtle abstract shapes.
4. Show a minimalist loading indicator reflecting actual initial asset readiness where practical.
5. Transition smoothly from the loading composition into the homepage.
6. Reveal the hero image, headline, navigation, and CTA through synchronized, staggered animations.

The transition between the preloader and the website must feel like **one continuous cinematic sequence**.

Do not abruptly remove the loading screen or simply fade everything in simultaneously.

Use creative techniques such as layered masking, clipping, scale transformations, image reveals, and coordinated motion.

The preloader must never trap users or unnecessarily delay the website.

---

## 4. EXTRAORDINARY LANDING PAGE

The landing page is the centerpiece of the project.

It should immediately capture attention through outstanding visual composition, storytelling, and motion design.

### Hero section

Create a breathtaking, full-viewport hero with:

- Oversized editorial typography.
- A prominently featured product or premium lifestyle visual.
- Sophisticated, carefully balanced composition.
- Subtle atmospheric effects and depth.
- Distinctive, animated product presentation.
- Elegant call-to-action buttons.
- Beautiful entrance choreography.
- Interactive hover and pointer-responsive details where appropriate.

Possible animation concepts include:

- Text entering through staggered masked reveals.
- Product imagery emerging through creative clipping transitions.
- Subtle perspective-based product movement.
- Scroll-responsive transformations.
- Layered parallax movement.
- Beautifully coordinated transformations between typography and imagery.

Avoid generic animations where every element simply fades upward.

**Every major motion sequence should have a clear artistic purpose.**

### Scroll-driven storytelling

Design multiple visually distinct sections that progressively showcase the products and brand.

Include:

1. Featured product storytelling.
2. Best-selling products.
3. New arrivals.
4. Immersive product showcase.
5. Brand philosophy or craftsmanship.
6. Editorial promotional section.
7. Featured collections.
8. High-impact closing call-to-action.
9. Premium minimalist footer.

Give each major section a different animation identity while preserving consistency across the experience.

For example:

- A featured product scales from an immersive presentation into a refined product card.
- Product imagery transitions between overlapping editorial compositions.
- A pinned section introduces products through choreographed scroll progress.
- A collection section reveals imagery through staggered masks.
- Text and visuals transition together rather than animating independently.
- A horizontally moving showcase introduces multiple featured items.

Animations must remain smooth, coherent, and responsive to scrolling.

Avoid excessive pinned sections or animations that prevent visitors from browsing naturally.

---

## 5. UNIQUE ANIMATION & MOTION SYSTEM

Create a consistent, carefully designed motion language throughout the entire website.

Use GSAP to implement sophisticated animations rather than relying exclusively on CSS transitions.

### Motion requirements

**Micro-interactions**
- Buttons with subtle magnetic attraction on desktop.
- Elegant hover movement and depth.
- Animated icon transitions.
- Refined border and background transitions.
- Interactive product cards.
- Smooth image scaling and masking.

**Typography**
- Staggered word or line reveals.
- Masked text entrances.
- Carefully controlled text transitions.
- Beautifully animated headings.
- Dynamic typography that responds to relevant scroll sequences.

**Product presentation**
- Image reveal transitions.
- Smooth product card interactions.
- Subtle 3D-inspired motion.
- Animated product variant switching.
- Sophisticated image gallery transitions.
- Add-to-cart animations with clear visual feedback.

**Scroll interactions**
- ScrollTrigger timelines.
- Parallax layers.
- Pinned visual storytelling where justified.
- Progressive section reveals.
- Smooth scroll-linked transformations.
- Coordinated transitions between sections.

### Motion principles

All motion should feel:

- Natural.
- Fluid.
- Precise.
- Deliberate.
- Elegant.
- Physically believable.
- Visually satisfying.

Create a coherent system of easing curves, durations, stagger intervals, and motion intensities.

**Animation quality is more important than animation quantity.**

No excessive bouncing, chaotic movement, unnecessary spinning, or distracting effects.

---

## 6. ANIMATED NAVIGATION & PAGE TRANSITIONS

Navigation must be visually beautiful and feel seamless.

### Navigation design

Create a premium floating navigation bar inspired by Apple's modern interface language.

Features should include:

- Restrained frosted-glass appearance.
- Soft rounded geometry.
- Subtle borders and highlights.
- Smooth appearance when the site loads.
- Intelligent behavior while scrolling.
- Animated active navigation indicator.
- Beautiful hover and focus states.

### Page transitions

When visitors navigate between pages, **do not immediately replace the content**.

Implement coordinated GSAP transitions between routes.

The transition should follow a structured sequence:

1. A navigation item is selected.
2. The current page performs a sophisticated exit animation.
3. A branded transition layer, mask, or shared visual bridges both views.
4. The next page is revealed through a complementary entrance animation.
5. Navigation indicators update smoothly.
6. Scroll position and interaction states are handled appropriately.

Possible techniques include cinematic overlays, horizontal masks, layered reveals, or shared-element-inspired transformations.

These transitions should feel cohesive, intentional, and comparable to a premium native application.

Also animate transitions between product categories, tabs, filters, and galleries.

Ensure Next.js App Router navigation works reliably with GSAP, including browser back/forward navigation and rapidly repeated clicks.

---

## 7. E-COMMERCE PAGES & FRONTEND FUNCTIONALITY

Design and implement the following pages:

### Home

A highly cinematic landing page showcasing the brand, featured products, and collections.

### Shop / Collections

A beautiful product catalog with:

- Premium product grid.
- Animated filtering.
- Category selection.
- Sorting controls.
- Search functionality.
- Refined product-card interactions.
- Smooth transitions between grid states.

### Product Details

An immersive product page containing:

- Large, beautifully presented product imagery.
- Interactive product gallery.
- Product description and specifications.
- Variant selection.
- Quantity selection.
- Price and availability indicators.
- Animated add-to-cart button.
- Related products.
- Scroll-driven product storytelling.

### Shopping Cart

A polished cart experience with:

- Animated cart drawer or dedicated cart page.
- Add and remove product interactions.
- Quantity management.
- Subtotal calculations.
- Empty-cart animation.
- Clear, responsive feedback.

### About / Brand Story

An editorial, visually rich brand page featuring beautiful storytelling and animated imagery.

### Frontend behavior

All major interactions must work using mock data and client-side state.

A user should genuinely be able to browse products, filter items, open product details, select options, manage a cart, and navigate through the website.

Cart and wishlist state may persist using localStorage.

Any checkout screen must clearly be a nonfunctional demonstration, not a real payment flow.

**Do not create buttons or interactive elements that appear functional but do nothing.**

---

## 8. RESPONSIVENESS & MOBILE EXPERIENCE

The website must be carefully designed for desktop, tablet, and mobile.

Do not simply compress desktop layouts for smaller screens.

Create responsive compositions that maintain the premium visual identity.

On mobile:

- Use a beautifully animated navigation menu.
- Adapt typography and spacing.
- Optimize hero imagery and cropping.
- Simplify complex scroll sequences when appropriate.
- Preserve high-quality motion without affecting touch interaction.
- Ensure buttons and controls are comfortably tappable.
- Avoid horizontal overflow.

The mobile experience should feel like a beautifully designed premium app.

---

## 9. PERFORMANCE, ACCESSIBILITY & CODE QUALITY

The website must be visually ambitious **without sacrificing performance, stability, accessibility, or usability**.

Requirements:

- Target smooth 60 FPS motion on capable devices.
- Prefer transform and opacity animation properties.
- Avoid unnecessary layout-triggering animations.
- Optimize large images and preload critical assets.
- Use appropriate Next.js image optimization.
- Avoid unnecessary re-renders.
- Clean up GSAP timelines, event listeners, and ScrollTriggers.
- Properly manage Lenis lifecycle and animation synchronization.
- Handle React Strict Mode correctly.
- Keep client components scoped to interactive regions where possible.
- Support `prefers-reduced-motion` with an accessible reduced-motion experience.
- Preserve keyboard navigation and visible focus states.
- Use semantic HTML and accessible controls.
- Maintain readable text contrast on glass surfaces.
- Avoid hydration errors and memory leaks.
- Ensure transitions do not block interaction or cause inconsistent browser history behavior.

Keep the architecture modular, reusable, and maintainable.

Use reusable components for navigation, buttons, sections, product cards, animation wrappers, loading sequences, and page transitions.

---

## 10. DESIGN QUALITY & CREATIVE FREEDOM

You have full creative freedom to establish a cohesive fictional premium e-commerce brand, including its name, visual identity, product direction, typography, and imagery.

Choose a product category that provides strong opportunities for premium visual storytelling, such as high-end technology, luxury accessories, design objects, or contemporary lifestyle products.

Use coherent product imagery and realistic mock data rather than random placeholder content.

The resulting website must feel like a real brand with a distinct identity.

Make bold, sophisticated creative decisions where they improve the presentation.

However, maintain the discipline of high-end minimalist design.

### Strictly avoid

- Generic SaaS or e-commerce templates.
- Unnecessary dashboard-like cards.
- Excessively rounded, bubble-like interfaces.
- Overuse of glassmorphism.
- Random gradient backgrounds.
- Cheap-looking shadows or glow effects.
- Generic repetitive fade-in animations.
- Inconsistent transitions.
- Broken responsive layouts.
- Unnecessary loading delays.
- Placeholder interactions.
- Excessive animation libraries.

---

## 11. EXPECTED DELIVERABLE

**Build the actual working Next.js frontend, not just a design description, static mockup, or partial demonstration.**

Deliver a complete, organized project featuring:

- A cohesive design system.
- Reusable, polished components.
- Fully animated loading screen.
- Cinematic landing page.
- Functional frontend e-commerce pages.
- GSAP-powered interactions.
- Lenis smooth scrolling.
- Seamless animated navigation and route transitions.
- Responsive layouts.
- Realistic mock data.
- Clean TypeScript architecture.
- Appropriate loading, empty, and error states.
- Instructions to install, run, and build the project.

Ensure the implementation is complete, with no unresolved imports, missing components, or nonfunctional navigation.

Before considering the work complete, verify that the application builds, that routes and interactions work, that animations clean up properly, and that desktop and mobile layouts remain usable.

---

## FINAL CREATIVE DIRECTION

Imagine combining:

**Apple's visual refinement + Awwwards-level creative interaction + luxury editorial art direction + cinematic product storytelling + exceptionally polished native-app motion.**

The result should feel like a premium digital flagship store rather than an ordinary shopping website.

Every detail matters: typography, negative space, image treatment, lighting, easing, transitions, scrolling, interaction feedback, and responsive behavior.

The loading screen should make a strong first impression.

The hero should immediately capture attention.

Scrolling should feel like progressing through a beautifully directed product film.

Navigation should feel fluid and carefully choreographed.

Product interactions should feel tactile and satisfying.

The overall experience should remain intuitive, fast, and genuinely usable.

**Do not settle for a conventional design. Create something distinctive, memorable, visually stunning, and technically polished—an e-commerce experience worthy of an Awwwards showcase.**

Start by establishing the creative direction and architecture, then implement the complete functioning frontend.

Prioritize execution and working implementation over lengthy explanations.