"use server";

import { createIdentityClient } from "@/platform/supabase/server";
import { getIdentity } from "@/modules/identity/server";
import { createLookupTransport } from "./adapter";
import { performCustomerLookup } from "./service";
import type { LookupActionResult } from "./types";

/** No prior action-state DTO is trusted or posted back; SQL couples every read to its audit. */
export async function lookupCustomerAction(data: FormData): Promise<LookupActionResult> {
  try {
    const client = await createIdentityClient(true);
    return await performCustomerLookup(createLookupTransport(client, getIdentity), data);
  } catch {
    return {
      status: "error",
      message: "Customer lookup could not be confirmed. Please try again.",
      customer: null,
    };
  }
}
