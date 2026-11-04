"use server";

import { createIdentityClient } from "@/platform/supabase/server";
import { getIdentity } from "@/modules/identity/server";
import { createProfileSupportTransport } from "./adapter";
import { readProfileSupport, readProfileSupportPage } from "./service";
import type { ProfileSupportPageState, ProfileSupportResult } from "./types";

/** No target arguments: capability of the current session only, no profile read/audit. */
export async function checkProfileSupportSessionAction(): Promise<ProfileSupportPageState> {
  try {
    return await readProfileSupportPage(
      createProfileSupportTransport(await createIdentityClient(true), getIdentity),
    );
  } catch {
    return {
      status: "unavailable",
      message: "Profile support session could not be confirmed. Reload before continuing.",
    };
  }
}

/** Cookie writes support session lifecycle only. SQL owns the mandatory atomic read+audit. */
export async function loadProfileSupportAction(data: FormData): Promise<ProfileSupportResult> {
  try {
    return await readProfileSupport(
      createProfileSupportTransport(await createIdentityClient(true), getIdentity),
      data,
    );
  } catch {
    return {
      status: "error",
      message:
        "Profile support could not be confirmed. Run a fresh Customer lookup before continuing.",
      profile: null,
    };
  }
}
