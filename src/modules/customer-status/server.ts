import "server-only";
import { createIdentityClient } from "@/platform/supabase/server";
import { getIdentity } from "@/modules/identity/server";
import { createStatusTransport } from "./adapter";
import { readStatusPage } from "./service";
import type { CustomerStatusPageState } from "./types";
export async function getCustomerStatusPageState(): Promise<CustomerStatusPageState> {
  try {
    return await readStatusPage(createStatusTransport(await createIdentityClient(), getIdentity));
  } catch {
    return {
      status: "unavailable",
      message: "Application access controls are temporarily unavailable.",
    };
  }
}
