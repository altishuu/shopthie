export type LookupReason = "account_access" | "profile_help" | "address_help";
export type CustomerLookupRecord = {
  subject: string;
  username: string;
  status: "active" | "suspended";
};
export type LookupPageState =
  | { status: "ready"; subject: string }
  | { status: "guest" }
  | { status: "mfa_required" }
  | { status: "denied" | "unavailable"; message: string };
export type LookupActionResult = {
  status: "found" | "not_found" | "error";
  message: string;
  customer: CustomerLookupRecord | null;
};
export type LookupInput =
  | { valid: false }
  | { valid: true; expectedSubject: string; username: string; reason: LookupReason };
