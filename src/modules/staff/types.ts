export type StaffEntry = { subject: string; role: "owner" | "admin" };
export type StaffPageState =
  | { status: "ready"; entry: StaffEntry }
  | { status: "guest" }
  | { status: "mfa_required" }
  | { status: "denied" | "unavailable"; message: string };
