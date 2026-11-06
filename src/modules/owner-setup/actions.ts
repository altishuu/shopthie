"use server";
import { createIdentityClient } from "@/platform/supabase/server";
import { createOwnerSetupTransport } from "./adapter";
import {
  ownerSetupUnavailable,
  readOwnerSetupPage,
  prepareOwnerSetupConsent,
  verifyOwnerSetupCode,
} from "./service";
import type { OwnerSetupPageState, OwnerSetupActionResult } from "./types";

export async function checkOwnerSetupSessionAction(): Promise<OwnerSetupPageState> {
  try {
    return await readOwnerSetupPage(createOwnerSetupTransport(await createIdentityClient(true)));
  } catch {
    return ownerSetupUnavailable();
  }
}
export async function verifyOwnerSetupMfaAction(form: FormData): Promise<OwnerSetupActionResult> {
  try {
    return await verifyOwnerSetupCode(
      createOwnerSetupTransport(await createIdentityClient(true)),
      form,
    );
  } catch {
    return {
      status: "error",
      message: "Authenticator verification could not be confirmed. Reload before continuing.",
      reloadRequired: true,
      state: ownerSetupUnavailable(),
    };
  }
}
export async function consentOwnerSetupAction(form: FormData): Promise<OwnerSetupActionResult> {
  try {
    return await prepareOwnerSetupConsent(
      createOwnerSetupTransport(await createIdentityClient(true)),
      form,
    );
  } catch {
    return {
      status: "error",
      message: "Consent could not be confirmed. Reload before continuing.",
      reloadRequired: true,
      state: ownerSetupUnavailable(),
    };
  }
}
