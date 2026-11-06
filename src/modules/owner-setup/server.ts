import "server-only";
import { createIdentityClient } from "@/platform/supabase/server";
import { createOwnerSetupTransport } from "./adapter";
import { ownerSetupUnavailable, readOwnerSetupPage } from "./service";
import type { OwnerSetupPageState } from "./types";

export async function getOwnerSetupPageState(): Promise<OwnerSetupPageState> {
  try {
    return await readOwnerSetupPage(createOwnerSetupTransport(await createIdentityClient()));
  } catch {
    return ownerSetupUnavailable();
  }
}
