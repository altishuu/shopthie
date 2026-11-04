export type ProfileSupportRecord = {
  subject: string;
  username: string;
  /** Customer-supplied and unverified; never proof of identity. */
  phone: string | null;
};
export type ProfileSupportPageState =
  | { status: "ready"; subject: string }
  | { status: "guest" }
  | { status: "mfa_required" }
  | { status: "denied" | "unavailable"; message: string };
export type ProfileSupportResult = {
  status: "ready" | "error";
  message: string;
  profile: ProfileSupportRecord | null;
};
export type ProfileSupportInput =
  | { valid: false }
  | {
      valid: true;
      expectedSubject: string;
      targetSubject: string;
      username: string;
      reason: "profile_help";
    };
