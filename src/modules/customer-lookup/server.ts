import "server-only";
import { createIdentityClient } from "@/platform/supabase/server";
import { getIdentity } from "@/modules/identity/server";
import { createLookupTransport } from "./adapter";
import { readCustomerLookupPage } from "./service";
import type { LookupPageState } from "./types";

export async function getCustomerLookupPageState(): Promise<LookupPageState> {
  try {
    const client = await createIdentityClient();
    return await readCustomerLookupPage(createLookupTransport(client, getIdentity));
  } catch {
    return {
      status: "unavailable",
      message:
        "Customer lookup is temporarily unavailable. Reload or sign out before trying again.",
    };
  }
}
