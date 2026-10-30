"use server";
import { getIdentity } from "@/modules/identity/server";
import { createIdentityClient } from "@/platform/supabase/server";
import { createAuditTransport } from "./adapter";
import { readAuditEvents, readAuditViewPage } from "./service";
import type { AuditActionResult, AuditPageState } from "./types";
/** Self readiness only: no actor argument, event data, or audit mutation. */
export async function checkAuditViewSessionAction(): Promise<AuditPageState> {
  try {
    return await readAuditViewPage(
      createAuditTransport(await createIdentityClient(true), getIdentity),
    );
  } catch {
    return {
      status: "unavailable",
      message: "Audit history is temporarily unavailable. Reload or sign out before continuing.",
    };
  }
}
export async function loadAuditEventsAction(form: FormData): Promise<AuditActionResult> {
  try {
    return await readAuditEvents(
      createAuditTransport(await createIdentityClient(true), getIdentity),
      form,
    );
  } catch {
    return {
      status: "error",
      message: "Audit history could not be confirmed. Reload before trying again.",
      page: null,
    };
  }
}
