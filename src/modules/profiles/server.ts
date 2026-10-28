import "server-only";
import { getIdentity } from "@/modules/identity/server";
import { createIdentityClient } from "@/platform/supabase/server";
import { readOwnProfile } from "./service";

export async function getOwnProfile() {
  return readOwnProfile(getIdentity, async () => {
    const client = await createIdentityClient();
    return client.rpc("shopthie_profile_read");
  });
}
