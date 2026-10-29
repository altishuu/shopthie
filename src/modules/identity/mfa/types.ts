export type MfaFactor = { id: string; status: "verified" | "unverified" };
export type MfaContext = {
  status: "ready";
  subject: string;
  role: "customer" | "admin" | "owner";
  aal: "aal1" | "aal2";
  factors: MfaFactor[];
  otherVerifiedFactor: boolean;
};
export type MfaPageState =
  MfaContext | { status: "guest" } | { status: "denied" | "unavailable"; message: string };
export type MfaEnrollment = { factorId: string; qrCode: string; secret: string };
export type MfaActionResult =
  | { status: "success"; message: string; context: MfaContext }
  | { status: "enrollment"; message: string; context: MfaContext; enrollment: MfaEnrollment }
  | { status: "error"; message: string; reloadRequired?: boolean };
export type MfaInput =
  | { operation: "enroll"; subject: string }
  | { operation: "cancel"; subject: string; factorId: string }
  | { operation: "verify" | "remove"; subject: string; factorId: string; code: string };
