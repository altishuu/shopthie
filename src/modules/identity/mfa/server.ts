import "server-only";
import { createIdentityClient } from "@/platform/supabase/server";
import { createMfaTransport } from "./adapter";
import type { MfaPageState } from "./types";

export async function getMfaPageState(): Promise<MfaPageState> {
  try {
    return await createMfaTransport(await createIdentityClient()).readContext();
  } catch {
    return {
      status: "unavailable",
      message: "Security settings are temporarily unavailable. Please reload or sign out.",
    };
  }
}
