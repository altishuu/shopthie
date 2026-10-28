"use client";

import { useEffect, useRef } from "react";

/** Signal after this route's own React subtree has hydrated, not the outer layout. */
export function RouteMotionReady({ heading = true }: { heading?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const main = ref.current?.closest("main");
    if (!main) return;
    main.dataset.motionReady = "true";
    main.dataset.motionHeading = String(heading);
    window.dispatchEvent(new Event("shopthie:page-hydrated"));
    return () => {
      delete main.dataset.motionReady;
      delete main.dataset.motionHeading;
    };
  }, [heading]);
  return <span ref={ref} hidden aria-hidden="true" />;
}
