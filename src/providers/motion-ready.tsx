"use client";

import { createContext, useContext } from "react";

// Modal content lives outside the intro-covered page; it opens only after readiness.
export const MotionReadyContext = createContext(true);
export function useMotionReady() {
  return useContext(MotionReadyContext);
}
