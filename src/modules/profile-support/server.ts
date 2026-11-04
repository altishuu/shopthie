import "server-only";
import { createIdentityClient } from "@/platform/supabase/server";
import { getIdentity } from "@/modules/identity/server";
import { createProfileSupportTransport } from "./adapter";
import { readProfileSupportPage } from "./service";
import type { ProfileSupportPageState } from "./types";

export async function getProfileSupportPageState(): Promise<ProfileSupportPageState> {
  try {
    const client = await createIdentityClient();
    return await readProfileSupportPage(createProfileSupportTransport(client, getIdentity));
  } catch {
    return {
      status: "unavailable",
      message: "Profile support is temporarily unavailable. Reload before continuing.",
    };
  }
}
