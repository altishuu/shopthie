"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Flip } from "gsap/Flip";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, Flip, useGSAP);

export { gsap, ScrollTrigger, Flip, useGSAP };

/** Shared motion vocabulary. Durations are seconds; safety limits are milliseconds. */
export const motion = {
  ease: { enter: "power3.out", bridge: "power3.inOut", control: "power2.out" },
  duration: {
    feedback: 0.2,
    surface: 0.24,
    quick: 0.25,
    menu: 0.3,
    layout: 0.32,
    catalogEnter: 0.45,
    image: 0.34,
    route: 0.42,
    type: 0.5,
    hero: 0.8,
    reveal: 0.85,
  },
  stagger: { letters: 0.035, details: 0.055, lines: 0.11 },
  intensity: { magnet: 0.035, heroParallaxPercent: 9 },
  intro: {
    first: { reveal: 0.8, stagger: 0.035, hold: 1.4, exit: 0.65 },
    repeat: { reveal: 0.55, stagger: 0.025, hold: 1.1, exit: 0.55 },
  },
  limits: { introMs: 4000, routeMs: 2200 },
} as const;
