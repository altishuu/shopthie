"use client";

import { Suspense, useEffect, useReducer, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCommerce } from "@/providers/commerce-provider";
import { createExperience } from "@/lib/experience";
import { MotionReadyContext } from "@/providers/motion-ready";

function RouteObserver() {
  const pathname = usePathname();
  useEffect(() => {
    window.dispatchEvent(new Event("shopthie:route-ready"));
  }, [pathname]);
  return null;
}

export function MotionExperience({ children }: { children: React.ReactNode }) {
  const [introReady, markIntroReady] = useReducer(() => true, false);
  const root = useRef<HTMLDivElement>(null);
  const intro = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const controls = useRef<ReturnType<typeof createExperience> | null>(null);
  const router = useRouter();
  const { overlay } = useCommerce();

  useEffect(() => {
    if (!root.current || !intro.current || !veil.current) return;
    const experience = createExperience(
      root.current,
      intro.current,
      veil.current,
      (href) => router.push(href),
      markIntroReady,
    );
    controls.current = experience;
    return () => {
      experience.destroy();
      controls.current = null;
    };
  }, [router]);

  useEffect(() => {
    controls.current?.setModalOpen(Boolean(overlay));
  }, [overlay]);

  return (
    <>
      <MotionReadyContext value={introReady}>
        <div id="experience" ref={root}>
          {children}
        </div>
      </MotionReadyContext>
      <div
        id="intro-screen"
        className="intro-screen"
        ref={intro}
        hidden
        aria-hidden="true"
        role="region"
        aria-label="Shopthie introduction"
      >
        <div className="intro-topline">
          <span>A considered kind of tech.</span>
          <span>THE SHOPTHIE EDIT — 01</span>
        </div>
        <div className="intro-center">
          <p className="intro-overline">Less noise. More meaning.</p>
          <div className="intro-brand" role="img" aria-label="Shopthie">
            {"shopthie.".split("").map((letter, index) => (
              <span aria-hidden="true" className="intro-letter" key={index}>
                {letter}
              </span>
            ))}
          </div>
          <p className="intro-caption">Objects for a better everyday.</p>
        </div>
        <div className="intro-bottom">
          <div
            className="intro-progress"
            role="progressbar"
            aria-label="Essential asset readiness"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={0}
          >
            <span className="intro-progress-fill" />
          </div>
          <span className="intro-readiness">0 / 2 essential assets</span>
          <button type="button" onClick={() => controls.current?.skipIntro()}>
            Skip intro <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
      <div id="route-veil" className="route-veil" ref={veil} hidden aria-hidden="true">
        <span className="route-veil-wordmark">
          shopthie<span>.</span>
        </span>
        <span className="route-veil-caption">A little closer to your kind of better.</span>
      </div>
      <Suspense fallback={null}>
        <RouteObserver />
      </Suspense>
    </>
  );
}
