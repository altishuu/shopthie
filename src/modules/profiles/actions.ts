"use server";

import { revalidatePath } from "next/cache";
import { getIdentity } from "@/modules/identity/server";
import { createIdentityClient } from "@/platform/supabase/server";
import { saveOwnProfile } from "./service";
import type { ProfileFormState } from "./types";

export async function saveProfileAction(
  _previous: ProfileFormState,
  data: FormData,
): Promise<ProfileFormState> {
  const result = await saveOwnProfile(data, getIdentity, async (input) => {
    const client = await createIdentityClient();
    return client.rpc("shopthie_profile_save", {
      p_username: input.username,
      p_phone: input.phone,
      p_revision: input.revision,
    });
  });
  if (result.status === "success") revalidatePath("/account/profile");
  return result;
}
