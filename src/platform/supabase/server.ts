import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { readBackendConfig } from "../config/backend";
import { createRequestClient } from "./client";

/** RSC reads rely on proxy refresh; actions must persist cookie writes or fail rather than fake login. */
export async function createIdentityClient(writable = false) {
  // cookies() can be supplied during runtime prerendering. The SDK reads the clock
  // during async initialization, so establish an explicit request-time boundary FIRST.
  await connection();
  const store = await cookies();
  return createRequestClient(
    readBackendConfig(process.env),
    {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          for (const { name, value, options } of values) store.set(name, value, options);
        } catch (error) {
          if (writable) throw error;
          // Server Components cannot write cookies; scoped proxy persists refreshed tokens.
        }
      },
    },
    process.env.SHOPTHIE_APP_ORIGIN,
  );
}
