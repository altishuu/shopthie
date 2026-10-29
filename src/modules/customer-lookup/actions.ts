"use server";

import { createIdentityClient } from "@/platform/supabase/server";
import { getIdentity } from "@/modules/identity/server";
import { createLookupTransport } from "./adapter";
import { performCustomerLookup, readCustomerLookupPage } from "./service";
import type { LookupActionResult, LookupPageState } from "./types";

/** Capability/subject only; never automatically queries Customer data or writes an audit. */
export async function checkCustomerLookupSessionAction(): Promise<LookupPageState> {
  try {
    return await readCustomerLookupPage(
      createLookupTransport(await createIdentityClient(true), getIdentity),
    );
  } catch {
    return {
      status: "unavailable",
      message: "Staff session could not be confirmed. Reload before continuing.",
    };
  }
}

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
