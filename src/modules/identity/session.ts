import { identityFromVerifiedData } from "./policy.ts";
import type { IdentityState, ProviderUser, VerifiedIdentityClaims } from "./types.ts";

export type IdentityTransport = {
  verify(): Promise<{ user: ProviderUser; claims: VerifiedIdentityClaims } | null>;
  actor(): Promise<unknown>;
};

/** The production adapter must verify using Supabase, not untrusted cookie/session contents. */
export async function readRequestIdentity(transport: IdentityTransport): Promise<IdentityState> {
  try {
    const verified = await transport.verify();
    if (!verified) return { status: "guest" };
    const rows = await transport.actor();
    return identityFromVerifiedData(verified.user, verified.claims, rows);
  } catch {
    return {
      status: "unavailable",
      message: "Account access is temporarily unavailable. Please try again.",
    };
  }
}
