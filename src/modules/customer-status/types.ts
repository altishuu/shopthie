export type StatusReason = "account_security" | "customer_request" | "account_review";
export type CustomerStatusRecord = {
  subject: string;
  status: "active" | "suspended";
  revision: number;
};
export type CustomerStatusPageState =
  | { status: "ready"; subject: string }
  | { status: "guest" }
  | { status: "mfa_required" }
  | { status: "denied" | "unavailable"; message: string };
export type CustomerStatusResult = {
  status: "ready" | "success" | "conflict" | "error";
  message: string;
  record: CustomerStatusRecord | null;
};
export type StatusInput =
  | { valid: false }
  | {
      valid: true;
      expectedSubject: string;
      targetSubject: string;
      reason: StatusReason;
      desiredStatus?: "active" | "suspended";
      revision?: number;
    };
