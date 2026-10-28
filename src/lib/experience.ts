"use client";

import Lenis from "lenis";
import { gsap, ScrollTrigger, motion } from "@/lib/gsap";
import { attachScrollDriver } from "@/lib/motion-driver";

const INTRO_KEY = "shopthie-intro-v1";

/** DOM choreography owns no React data, router internals, or independent RAF. */
export function createExperience(
  root: HTMLElement,
  intro: HTMLElement,
  veil: HTMLElement,
  navigate: (href: string) => void,
  onIntroReady: () => void,
) {
  const html = document.documentElement;
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(pointer: fine)");
  const abort = new AbortController();
  let disposed = false;
  let modalOpen = false;
  let introDone = false;
  let introRunning = false;
  let lastCommittedPath = location.pathname;
  let phase: "idle" | "exiting" | "waiting" | "entering" = "idle";
  let destination: string | null = null;
  let routeTimer: ReturnType<typeof setTimeout> | undefined;
  let introTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let lenis: Lenis | null = null;
  let detachDriver: (() => void) | undefined;
  let pageContext: gsap.Context | undefined;
  let introContext: gsap.Context | undefined;
  let routeTimeline: gsap.core.Timeline | undefined;
  let navTween: gsap.core.Tween | undefined;
  let indicatorTween: gsap.core.Tween | undefined;
  let pointerTween: gsap.core.Tween | undefined;
  let pointerTarget: HTMLElement | null = null;
  let lastMain: HTMLElement | null = null;
  let enteredMain: HTMLElement | null = null;
  let shouldFocus = false;
  let previousY = scrollY;

  const mainElement = () =>
    [...root.querySelectorAll<HTMLElement>("main")].find(
      (element) => element.getClientRects().length > 0,
    ) ?? null;
  html.dataset.routeState = "idle";
  const pause = () => {
    if (introRunning || modalOpen || phase !== "idle") lenis?.stop();
    else lenis?.start();
  };
  const refresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (disposed) return;
      lenis?.resize();
      // Do not revive cached positions on routes with no scroll scenes.
      // Invalidate GSAP's scroll cache before measuring the current document.
      if (ScrollTrigger.getAll().length) {
        ScrollTrigger.clearScrollMemory();
        ScrollTrigger.refresh();
      }
    }, 80);
  };
  const updateIndicator = () => {
    const nav = root.querySelector<HTMLElement>(".desktop-nav");
    const indicator = nav?.querySelector<HTMLElement>(".nav-active-indicator");
    let active: HTMLElement | null = null;
    root.querySelectorAll<HTMLAnchorElement>(".desktop-nav a, .mobile-nav a").forEach((link) => {
      const path = new URL(link.href).pathname;
      const selected =
        path === location.pathname ||
        (path === "/shop" && location.pathname.startsWith("/products/")) ||
        (path === "/collections/headphones" &&
          /^\/collections\/(earbuds|speakers)$/.test(location.pathname));
      if (selected) {
        link.setAttribute("aria-current", path === location.pathname ? "page" : "true");
        if (nav?.contains(link)) active = link;
      } else link.removeAttribute("aria-current");
    });
    if (!indicator || !nav) return;
    const selected = active as HTMLElement | null;
    indicatorTween?.kill();
    indicatorTween = gsap.to(indicator, {
      x: selected ? selected.offsetLeft : 0,
      width: selected ? selected.offsetWidth : 0,
      opacity: selected ? 1 : 0,
      duration: preference.matches ? 0 : 0.35,
      ease: motion.ease.enter,
      overwrite: true,
    });
  };
  const entrance = () => {
    const main = mainElement();
    if (
      !main ||
      !pageContext ||
      main.dataset.motionReady !== "true" ||
      !main.querySelector("h1") ||
      enteredMain === main ||
      preference.matches
    )
      return;
    enteredMain = main;
    pageContext?.add(() => {
      if (main.querySelector(".hero")) {
        gsap
          .timeline({ defaults: { ease: motion.ease.enter } })
          .fromTo(
            main.querySelectorAll(".hero h1 > span"),
            { yPercent: 65, clipPath: "inset(0 0 100% 0)" },
            {
              yPercent: 0,
              clipPath: "inset(0 0 0% 0)",
              stagger: motion.stagger.lines,
              duration: motion.duration.hero,
            },
            0,
          )
          .fromTo(
            main.querySelector(".hero-visual"),
            { clipPath: "inset(8% 0 8% 100%)", scale: 1.025 },
            { clipPath: "inset(0% 0 0% 0%)", scale: 1, duration: 1.05 },
            0.05,
          )
          .fromTo(
            main.querySelectorAll(
              ".hero-description, .hero-copy .pill-link, .hero-secondary, .hero-topline, .product-note, .hero-bottom",
            ),
            { opacity: 0 },
            { opacity: 1, stagger: motion.stagger.details, duration: 0.55 },
            0.32,
          );
      } else if (main.dataset.motionHeading !== "false") {
        gsap.fromTo(
          main.querySelector("h1"),
          { y: 12, clipPath: "inset(0 0 100% 0)" },
          {
            y: 0,
            clipPath: "inset(0 0 0% 0)",
            duration: motion.duration.type,
            ease: motion.ease.enter,
          },
        );
      }
    });
  };
  const setupPage = () => {
    const main = mainElement();
    if (
      !main ||
      main.dataset.motionReady !== "true" ||
      !main.querySelector("h1") ||
      main === lastMain
    )
      return;
    pageContext?.revert();
    lastMain = main;
    enteredMain = null;
    if (!preference.matches) {
      pageContext = gsap.context(() => {
        const hero = main.querySelector(".hero-product");
        if (hero && matchMedia("(min-width: 761px)").matches) {
          gsap.to(hero, {
            yPercent: motion.intensity.heroParallaxPercent,
            ease: "none",
            scrollTrigger: {
              trigger: main.querySelector(".hero"),
              start: "top top",
              end: "bottom top",
              scrub: 0.6,
            },
          });
        }
        main.querySelectorAll<HTMLElement>(".collection-card").forEach((card, index) => {
          gsap.fromTo(
            card.querySelector(".collection-image"),
            { clipPath: "inset(8% 0 8% 0)", scale: 0.97 },
            {
              clipPath: "inset(0% 0 0% 0)",
              scale: 1,
              duration: 0.75,
              delay: (index % 2) * 0.09,
              ease: motion.ease.enter,
              scrollTrigger: { trigger: card, start: "top 92%", once: true },
            },
          );
        });
        const introHeading = main.querySelector(".introduction h2");
        if (introHeading)
          gsap.fromTo(
            introHeading,
            { clipPath: "inset(0 90% 0 0)" },
            {
              clipPath: "inset(0 0% 0 0)",
              duration: 1.1,
              ease: motion.ease.enter,
              scrollTrigger: { trigger: introHeading, start: "top 90%", once: true },
            },
          );
        const story = main.querySelector(".story-grid");
        if (story) {
          gsap.fromTo(
            story.querySelector(".story-image"),
            { xPercent: -5, scale: 0.96 },
            {
              xPercent: 0,
              scale: 1,
              ease: "none",
              scrollTrigger: {
                trigger: story,
                start: "top 90%",
                end: "center center",
                scrub: 0.5,
              },
            },
          );
          gsap.fromTo(
            story.querySelector(".story-copy"),
            { x: 22 },
            {
              x: 0,
              duration: 0.9,
              ease: motion.ease.enter,
              scrollTrigger: { trigger: story, start: "top 75%", once: true },
            },
          );
        }
        main.querySelectorAll(".philosophy h2, .closing h2").forEach((heading) => {
          gsap.fromTo(
            heading,
            { scale: 1.04, transformOrigin: "left center" },
            {
              scale: 1,
              duration: 1,
              ease: motion.ease.enter,
              scrollTrigger: { trigger: heading, start: "top 90%", once: true },
            },
          );
        });
      }, main);
      if (!introRunning) entrance();
    }
    if (shouldFocus && phase === "idle") {
      main.focus({ preventScroll: true });
      shouldFocus = false;
    }
    refresh();
  };
  const resetRoute = () => {
    clearTimeout(routeTimer);
    routeTimeline?.kill();
    veil.hidden = true;
    gsap.set(veil, { clearProps: "transform" });
    const main = mainElement();
    if (main?.dataset.motionReady === "true") gsap.set(main, { clearProps: "opacity,transform" });
    phase = "idle";
    destination = null;
    navTween?.kill();
    const header = root.querySelector<HTMLElement>(".site-header");
    if (header) {
      gsap.set(header, { clearProps: "transform" });
      header.dataset.scrolled = String(scrollY > 70);
    }
    previousY = scrollY;
    html.dataset.routeState = phase;
    pause();
  };
  const finishIntro = (enter = true) => {
    clearTimeout(introTimer);
    introContext?.revert();
    intro.hidden = true;
    intro.setAttribute("aria-hidden", "true");
    root.inert = false;
    root.removeAttribute("aria-hidden");
    introRunning = false;
    introDone = true;
    html.dataset.introState = "complete";
    onIntroReady();
    try {
      sessionStorage.setItem(INTRO_KEY, "seen");
    } catch {
      /* Session storage is optional. */
    }
    pause();
    if (enter) entrance();
    refresh();
  };
  const startIntro = () => {
    if (introDone) {
      entrance();
      return;
    }
    let seen = false;
    try {
      seen = sessionStorage.getItem(INTRO_KEY) === "seen";
    } catch {
      /* Use full intro with bounded skip. */
    }
    html.dataset.introKind = preference.matches ? "reduced" : seen ? "abbreviated" : "full";
    if (preference.matches) {
      finishIntro(false);
      return;
    }
    introRunning = true;
    html.dataset.introState = "loading";
    intro.dataset.kind = seen ? "abbreviated" : "full";
    intro.hidden = false;
    intro.setAttribute("aria-hidden", "false");
    root.inert = true;
    root.setAttribute("aria-hidden", "true");
    pause();
    let brandReady = seen;
    let assetsReady = seen;
    let releasing = false;
    const release = () => {
      if (!brandReady || !assetsReady || releasing || disposed || !introRunning) return;
      releasing = true;
      introContext?.add(() => {
        gsap
          .timeline({ onComplete: () => finishIntro() })
          .to(intro, {
            clipPath: "inset(0 0 100% 0)",
            duration: seen ? 0.3 : 0.6,
            ease: motion.ease.bridge,
          })
          .call(entrance, [], seen ? 0.08 : 0.22);
      });
    };
    introContext = gsap.context(() => {
      gsap.set(intro, { clipPath: "inset(0 0 0% 0)" });
      if (!seen)
        gsap.fromTo(
          intro.querySelectorAll(".intro-letter"),
          { yPercent: 110, rotate: 4 },
          {
            yPercent: 0,
            rotate: 0,
            duration: 0.48,
            stagger: motion.stagger.letters,
            ease: motion.ease.enter,
            onComplete: () => {
              brandReady = true;
              release();
            },
          },
        );
    }, intro);
    introTimer = setTimeout(() => finishIntro(), motion.limits.introMs);
    if (seen) {
      release();
      return;
    }
    let settled = 0;
    const settledAsset = () => {
      if (disposed || !introRunning) return;
      settled += 1;
      const progress = intro.querySelector<HTMLElement>("[role=progressbar]");
      progress?.setAttribute("aria-valuenow", String(settled * 50));
      const count = intro.querySelector(".intro-readiness");
      if (count) count.textContent = `${settled} / 2 essential assets`;
      introContext?.add(() =>
        gsap.to(intro.querySelector(".intro-progress-fill"), {
          scaleX: settled / 2,
          duration: motion.duration.feedback,
          ease: motion.ease.control,
          overwrite: true,
        }),
      );
      if (settled === 2) {
        assetsReady = true;
        release();
      }
    };
    document.fonts.ready.then(settledAsset, settledAsset);
    const image = root.querySelector<HTMLImageElement>("main img");
    if (!image || image.complete) settledAsset();
    else {
      image.addEventListener("load", settledAsset, { once: true, signal: abort.signal });
      image.addEventListener("error", settledAsset, { once: true, signal: abort.signal });
    }
  };
  const resetPointer = () => {
    const targets = pointerTween?.targets() || [];
    pointerTween?.kill();
    pointerTween = undefined;
    if (targets.length) gsap.set(targets, { clearProps: "transform" });
    if (pointerTarget) gsap.set(pointerTarget, { clearProps: "transform" });
    pointerTarget = null;
  };
  const configureMotion = () => {
    detachDriver?.();
    detachDriver = undefined;
    lenis = null;
    pageContext?.revert();
    pageContext = undefined;
    lastMain = null;
    enteredMain = null;
    resetRoute();
    html.dataset.motionMode = preference.matches ? "reduced" : "full";
    if (!preference.matches && finePointer.matches) {
      lenis = new Lenis({
        autoRaf: false,
        smoothWheel: true,
        syncTouch: false,
        lerp: 0.1,
        anchors: { offset: -110 },
        prevent: (node) => Boolean(node.closest("dialog, [data-lenis-prevent]")),
      });
      gsap.ticker.lagSmoothing(0);
      detachDriver = attachScrollDriver(lenis, gsap.ticker, ScrollTrigger.update);
    } else {
      gsap.ticker.lagSmoothing(500, 33);
    }
    if (preference.matches && introRunning) finishIntro(false);
    startIntro();
    setupPage();
    updateIndicator();
    if (preference.matches) {
      navTween?.kill();
      resetPointer();
      gsap.set(root.querySelector(".site-header"), { clearProps: "transform" });
    }
    pause();
  };
  const routeReady = () => {
    updateIndicator();
    if (location.pathname === lastCommittedPath) {
      setupPage();
      return;
    }
    if (destination && new URL(destination, location.origin).pathname !== location.pathname) return;
    const hydratedMain = mainElement();
    if (hydratedMain?.dataset.motionReady !== "true") return;
    lastCommittedPath = location.pathname;
    clearTimeout(routeTimer);
    const wasNavigation = phase === "waiting" || phase === "exiting";
    if (wasNavigation && !new URL(destination || location.href, location.origin).hash) {
      // Native mobile scroll-to-top may be skipped with persistent layout wrappers.
      // This applies only to an explicit link push, never popstate restoration.
      if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
      else window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
    pageContext?.revert();
    lastMain = null;
    setupPage();
    if (preference.matches) {
      resetRoute();
      if (shouldFocus) hydratedMain.focus({ preventScroll: true });
      shouldFocus = false;
      return;
    }
    routeTimeline?.kill();
    phase = "entering";
    html.dataset.routeState = phase;
    if (wasNavigation) {
      veil.hidden = false;
      gsap.set(veil, { yPercent: 0 });
    }
    routeTimeline = gsap.timeline({
      onComplete: () => {
        resetRoute();
        setupPage();
        if (shouldFocus) {
          mainElement()?.focus({ preventScroll: true });
          shouldFocus = false;
        }
        refresh();
      },
    });
    if (wasNavigation)
      routeTimeline.to(
        veil,
        { yPercent: -101, duration: motion.duration.route, ease: motion.ease.bridge },
        0,
      );
    const main = mainElement();
    if (main)
      routeTimeline.fromTo(
        main,
        { opacity: 0.82, y: 10 },
        { opacity: 1, y: 0, duration: 0.35, ease: motion.ease.enter },
        0.08,
      );
    pause();
  };
  const onLink = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      introRunning
    )
      return;
    const link =
      event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (
      !link ||
      link.hasAttribute("download") ||
      (link.target && link.target !== "_self") ||
      link.hasAttribute("data-no-transition")
    )
      return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
    if (url.pathname === location.pathname) {
      // A newer click to this page must cancel an older, still-pending exit.
      if (phase !== "idle") {
        shouldFocus = false;
        resetRoute();
      }
      return;
    }
    if (preference.matches) {
      destination = url.pathname + url.search + url.hash;
      shouldFocus = true;
      phase = "waiting";
      html.dataset.routeState = phase;
      clearTimeout(routeTimer);
      routeTimer = setTimeout(resetRoute, motion.limits.routeMs);
      return; // Let the actual Link handle this immediate, unanimated navigation.
    }
    event.preventDefault();
    destination = url.pathname + url.search + url.hash;
    shouldFocus = true;
    clearTimeout(routeTimer);
    routeTimeline?.kill();
    if (phase === "idle") gsap.set(veil, { yPercent: 101 });
    phase = "exiting";
    html.dataset.routeState = phase;
    veil.hidden = false;
    const requested = destination;
    routeTimeline = gsap
      .timeline()
      .to(veil, { yPercent: 0, duration: motion.duration.quick, ease: motion.ease.bridge })
      .call(() => {
        if (destination !== requested || disposed) return;
        phase = "waiting";
        html.dataset.routeState = phase;
        navigate(requested);
      });
    routeTimer = setTimeout(resetRoute, motion.limits.routeMs);
    pause();
  };
  const onBack = () => {
    shouldFocus = false;
    resetRoute();
  };
  const onScroll = () => {
    const header = root.querySelector<HTMLElement>(".site-header");
    if (!header) return;
    const y = scrollY;
    header.dataset.scrolled = String(y > 70);
    const focusWithin = header.contains(document.activeElement);
    const menuOpen = header.querySelector('[aria-expanded="true"]');
    if (!preference.matches && !introRunning && phase === "idle" && Math.abs(y - previousY) > 10) {
      navTween?.kill();
      navTween = gsap.to(header, {
        yPercent: y > 180 && y > previousY && !focusWithin && !menuOpen ? -160 : 0,
        duration: 0.28,
        ease: motion.ease.control,
        overwrite: true,
      });
      previousY = y;
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (
      preference.matches ||
      !finePointer.matches ||
      event.pointerType !== "mouse" ||
      introRunning ||
      phase !== "idle"
    )
      return;
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(".pill-link, .bag-button, .product-card-visual")
        : null;
    if (!target || target.closest("dialog")) return;
    const rect = target.getBoundingClientRect();
    if (pointerTarget && pointerTarget !== target)
      gsap.set(pointerTarget, { clearProps: "transform" });
    pointerTarget = target;
    pointerTween?.kill();
    pointerTween = gsap.to(target, {
      x: (event.clientX - rect.left - rect.width / 2) * motion.intensity.magnet,
      y: (event.clientY - rect.top - rect.height / 2) * motion.intensity.magnet,
      duration: motion.duration.quick,
      ease: motion.ease.control,
      overwrite: true,
    });
  };
  const onPointerOut = (event: PointerEvent) => {
    if (
      !pointerTarget ||
      (event.relatedTarget instanceof Node && pointerTarget.contains(event.relatedTarget))
    )
      return;
    pointerTween?.kill();
    pointerTween = gsap.to(pointerTarget, {
      x: 0,
      y: 0,
      duration: 0.35,
      ease: motion.ease.enter,
      clearProps: "transform",
    });
    pointerTarget = null;
  };
  const onFocus = () => {
    const header = root.querySelector<HTMLElement>(".site-header");
    if (!header?.contains(document.activeElement)) return;
    navTween?.kill();
    if (!preference.matches)
      navTween = gsap.to(header, { yPercent: 0, duration: 0.15, overwrite: true });
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && introRunning) finishIntro();
  };
  document.addEventListener("click", onLink, { capture: true, signal: abort.signal });
  document.addEventListener("pointermove", onPointerMove, { passive: true, signal: abort.signal });
  document.addEventListener("pointerout", onPointerOut, { passive: true, signal: abort.signal });
  document.addEventListener("focusin", onFocus, { signal: abort.signal });
  document.addEventListener("keydown", onKey, { signal: abort.signal });
  window.addEventListener("popstate", onBack, { signal: abort.signal });
  window.addEventListener("scroll", onScroll, { passive: true, signal: abort.signal });
  window.addEventListener("resize", updateIndicator, { passive: true, signal: abort.signal });
  window.addEventListener("shopthie:route-ready", routeReady, { signal: abort.signal });
  window.addEventListener(
    "shopthie:page-hydrated",
    () => {
      setupPage();
      routeReady();
    },
    { signal: abort.signal },
  );
  preference.addEventListener("change", configureMotion);
  const observer = new MutationObserver(setupPage);
  observer.observe(root, { childList: true, subtree: true });
  configureMotion();

  return {
    skipIntro: () => finishIntro(),
    setModalOpen: (open: boolean) => {
      modalOpen = open;
      pause();
    },
    destroy: () => {
      disposed = true;
      abort.abort();
      observer.disconnect();
      preference.removeEventListener("change", configureMotion);
      clearTimeout(routeTimer);
      clearTimeout(introTimer);
      clearTimeout(refreshTimer);
      routeTimeline?.kill();
      navTween?.kill();
      indicatorTween?.kill();
      resetPointer();
      introContext?.revert();
      pageContext?.revert();
      detachDriver?.();
      gsap.ticker.lagSmoothing(500, 33);
      root.inert = false;
      root.removeAttribute("aria-hidden");
      intro.hidden = true;
      veil.hidden = true;
      const header = root.querySelector(".site-header");
      if (header) gsap.set(header, { clearProps: "transform" });
      if (pointerTarget) gsap.set(pointerTarget, { clearProps: "transform" });
    },
  };
}
