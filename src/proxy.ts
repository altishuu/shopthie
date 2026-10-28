import { NextResponse, type NextRequest } from "next/server";
import { readBackendConfig } from "@/platform/config/backend";
import { createRequestClient } from "@/platform/supabase/client";

/** Refresh only account/auth requests, not the public animated storefront. Authorization stays at reads. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const configuration = readBackendConfig(process.env);
  if (configuration.status === "configured") {
    try {
      const client = createRequestClient(
        configuration,
        {
          getAll: () => request.cookies.getAll(),
          setAll: (values, headers) => {
            for (const { name, value } of values) request.cookies.set(name, value);
            const previous = response.cookies.getAll();
            response = NextResponse.next({ request });
            for (const cookie of previous) response.cookies.set(cookie);
            for (const { name, value, options } of values)
              response.cookies.set(name, value, options);
            for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
          },
        },
        process.env.SHOPTHIE_APP_ORIGIN,
      );
      // Refresh/verify, never trust getSession() data as proof of identity.
      await client.auth.getClaims();
    } catch {
      // Actual private readers independently fail closed; do not redirect in proxy and cause login loops.
    }
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export const config = {
  matcher: [
    "/login",
    "/signup",
    "/forgot-password",
    "/account/:path*",
    "/auth/:path*",
    "/admin/:path*",
  ],
};
