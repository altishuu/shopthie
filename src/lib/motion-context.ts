import { gsap } from "gsap";

/** Keep unrelated lifecycle scopes from being adopted by a GSAP callback's context. */
export function independentMotion<T>(create: () => T): T {
  const caller = gsap.context();
  if (!caller) return create();

  let result!: T;
  let failed = false;
  let error: unknown;
  caller.ignore(() => {
    // GSAP's ignore() restores its context after the callback, not in a finally.
    // Catch inside it so even a failing registration restores the caller first.
    try {
      result = create();
    } catch (cause) {
      failed = true;
      error = cause;
    }
  });
  if (failed) throw error;
  return result;
}
