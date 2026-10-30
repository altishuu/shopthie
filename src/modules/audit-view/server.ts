import "server-only";
import { getIdentity } from "@/modules/identity/server";
import { createIdentityClient } from "@/platform/supabase/server";
import { createAuditTransport } from "./adapter";
import { readAuditViewPage } from "./service";
import type { AuditPageState } from "./types";
export async function getAuditViewPageState(): Promise<AuditPageState> {
  try {
    return await readAuditViewPage(createAuditTransport(await createIdentityClient(), getIdentity));
  } catch {
    return {
      status: "unavailable",
      message: "Audit history is temporarily unavailable. Reload or sign out before continuing.",
    };
  }
}
