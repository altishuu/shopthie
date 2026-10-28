import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { BackendConfiguration } from "../config/backend.ts";

export const AUTH_COOKIE_NAME = "shopthie-auth";

export function isIdentityCookieName(name: string): boolean {
  return /^shopthie-auth(?:-code-verifier)?(?:\.\d+)?$/.test(name);
}

/** Server-only cookie sessions; no browser Supabase client reads these HttpOnly cookies. */
export function getAuthCookiePolicy(appOrigin?: string) {
  let secure = true;
  if (appOrigin) {
    try {
      const parsed = new URL(appOrigin);
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
      if (
        appOrigin !== appOrigin.trim() ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash ||
        parsed.pathname !== "/" ||
        (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback))
      )
        throw new Error();
      secure = parsed.protocol === "https:";
    } catch {
      throw new Error("Invalid account app origin.");
    }
  }
  return { httpOnly: true, secure, sameSite: "lax", path: "/" } as const;
}

/** A NEW client for every request/action; never share cookies or identity through a singleton. */
export function createRequestClient(
  configuration: BackendConfiguration,
  cookies: CookieMethodsServer,
  appOrigin?: string,
) {
  if (configuration.status !== "configured")
    throw new Error("Account backend configuration is unavailable.");
  return createServerClient(configuration.url, configuration.publishableKey, {
    cookieOptions: { name: AUTH_COOKIE_NAME, ...getAuthCookiePolicy(appOrigin) },
    cookies,
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)])
            : AbortSignal.timeout(8000),
        }),
    },
  });
}
