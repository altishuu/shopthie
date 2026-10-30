export type AuditScope = "own" | "all";
export type AuditCursor = { createdAt: string; id: string };
export type AuditEvent = {
  id: string;
  actorSubject: string;
  targetSubject: string | null;
  eventType: "customer.lookup" | "customer.status.read" | "customer.status.change";
  reason:
    | "account_access"
    | "profile_help"
    | "address_help"
    | "account_security"
    | "customer_request"
    | "account_review";
  outcome: "found" | "not_found" | "read" | "active" | "suspended";
  createdAt: string;
};
export type AuditPage = { scope: AuditScope; events: AuditEvent[]; nextCursor: AuditCursor | null };
export type AuditPageState =
  | { status: "ready"; subject: string; scope: AuditScope }
  | { status: "guest" }
  | { status: "mfa_required" }
  | { status: "denied" | "unavailable"; message: string };
export type AuditActionResult = {
  status: "ready" | "error";
  message: string;
  page: AuditPage | null;
};
export type AuditInput =
  { valid: false } | { valid: true; expectedSubject: string; before: AuditCursor | null };
