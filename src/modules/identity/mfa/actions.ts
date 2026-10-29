"use server";

import { revalidatePath } from "next/cache";
import { createIdentityClient } from "@/platform/supabase/server";
import { createMfaTransport } from "./adapter";
import { performMfaOperation } from "./service";
import type { MfaActionResult } from "./types";

/** No previous action state: the transient setup key must never be echoed back in subsequent requests. */
export async function mfaAction(data: FormData): Promise<MfaActionResult> {
  let result: MfaActionResult;
  try {
    result = await performMfaOperation(createMfaTransport(await createIdentityClient(true)), data);
  } catch {
    result = {
      status: "error",
      message: "Security access is temporarily unavailable. Reload before trying again.",
      reloadRequired: true,
    };
  }
  // Verification/removal can have changed cookies even when the final readback failed.
  // Do not invalidate the setup page during initial QR delivery.
  if (result.status !== "enrollment") revalidatePath("/account", "layout");
  return result;
}
