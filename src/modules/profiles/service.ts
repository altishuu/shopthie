import type { IdentityState } from "../identity/types.ts";
import { decodeProfile, validateProfileInput } from "./policy.ts";
import type { ProfilePageState, ProfileFormState, ProfileInput } from "./types.ts";

export type ProfileRpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export type VerifiedProfileIdentity = () => Promise<IdentityState>;
const unavailable = "Profiles are currently unavailable. Please try again.";

export async function saveOwnProfile(
  form: FormData,
  identity: VerifiedProfileIdentity,
  save: (input: Extract<ProfileInput, { valid: true }>) => Promise<ProfileRpcResult>,
): Promise<ProfileFormState> {
  const failed: ProfileFormState = { status: "error", message: unavailable, profile: null };
  const input = validateProfileInput(form);
  if (!input.valid)
    return {
      status: "error",
      message: "Check your username and international phone format, then try again.",
      profile: null,
    };
  try {
    const actor = await identity();
    if (actor.status !== "active") return failed;
    if (actor.actor.userId !== input.expectedSubject)
      return {
        status: "conflict",
        message: "Your sign-in changed. Reload this profile before saving.",
        profile: null,
      };
    const result = await save(input);
    if (result.error) {
      if (result.error.code === "P0001" && result.error.message === "profile_conflict")
        return {
          status: "conflict",
          message: "This profile changed in another tab. Reload it before saving again.",
          profile: null,
        };
      if (result.error.code === "23505")
        return {
          status: "error",
          message: "That username is unavailable. Choose another.",
          profile: null,
        };
      return failed;
    }
    const decoded = decodeProfile(result.data);
    if (!decoded.valid || !decoded.profile || decoded.profile.revision !== input.revision + 1)
      return failed;
    return { status: "success", message: "Profile saved.", profile: decoded.profile };
  } catch {
    return failed;
  }
}

export async function readOwnProfile(
  identity: VerifiedProfileIdentity,
  read: () => Promise<ProfileRpcResult>,
): Promise<ProfilePageState> {
  try {
    const actor = await identity();
    if (actor.status === "guest") return { status: "guest" };
    if (actor.status !== "active") return { status: "denied", message: unavailable };
    const result = await read();
    if (result.error) return { status: "denied", message: unavailable };
    const decoded = decodeProfile(result.data);
    return decoded.valid
      ? { status: "ready", profile: decoded.profile, subject: actor.actor.userId }
      : { status: "denied", message: unavailable };
  } catch {
    return { status: "denied", message: unavailable };
  }
}
