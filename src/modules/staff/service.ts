import { authorize } from "../access/permissions.ts";
import type { IdentityState } from "../identity/types.ts";
import type { StaffPageState } from "./types.ts";

export type StaffTransport = { identity(): Promise<IdentityState>; read(): Promise<unknown> };
const denied = (): StaffPageState => ({
  status: "denied",
  message: "Staff access is not available to this account.",
});
const unavailable = (): StaffPageState => ({
  status: "unavailable",
  message: "Staff access is temporarily unavailable. Reload or sign out before trying again.",
});

/** Self-session entry only; this is not a directory or a grant of staff tools. */
export async function readStaffEntry(port: StaffTransport): Promise<StaffPageState> {
  try {
    const identity = await port.identity();
    if (identity.status === "guest" || identity.status === "mfa_required") return identity;
    if (identity.status === "unavailable") return unavailable();
    if (identity.status !== "active") return denied();
    const actor = identity.actor;
    if (actor.role !== "owner" && actor.role !== "admin") return denied();
    if (!authorize(actor, { permission: "staff.enter", resourceOwnerId: actor.userId }).allowed)
      return denied();
    const data = await port.read();
    if (Array.isArray(data) && data.length === 0) return denied();
    if (
      !Array.isArray(data) ||
      data.length !== 1 ||
      !data[0] ||
      typeof data[0] !== "object" ||
      Array.isArray(data[0])
    )
      return unavailable();
    const row = data[0] as Record<string, unknown>;
    const keys = Object.keys(row);
    if (
      keys.length !== 2 ||
      !keys.includes("user_id") ||
      !keys.includes("role") ||
      row.user_id !== actor.userId ||
      row.role !== actor.role
    )
      return unavailable();
    return { status: "ready", entry: { subject: actor.userId, role: actor.role } };
  } catch {
    return unavailable();
  }
}
