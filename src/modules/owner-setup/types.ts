export type OwnerSetupIntent = { id: string; expiresAt: string };
export type OwnerSetupPhase = "mfa_required" | "ready" | "consented" | "completed";
export type OwnerSetupPageState =
  | { status: "guest" | "unavailable"; message?: string }
  | {
      status: "ready";
      subject: string;
      phase: OwnerSetupPhase;
      designation: string | null;
      intent?: OwnerSetupIntent;
    };
export type OwnerSetupActionResult = {
  status: "success" | "error";
  message: string;
  reloadRequired?: boolean;
  state?: OwnerSetupPageState;
};
export type OwnerSetupRpcResult =
  { ok: true; data: unknown } | { ok: false; reason: "unavailable" | "rejected" | "uncertain" };
