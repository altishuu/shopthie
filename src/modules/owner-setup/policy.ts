import type { OwnerSetupPageState } from "./types.ts";

export function isOwnerSetupUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === 36 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  );
}
function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Reflect.ownKeys(value).every(
      (key) =>
        typeof key === "string" &&
        Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, "value"),
    )
  );
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}
function timestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value) ||
    value.length !== 27
  )
    return false;
  const millis = value.slice(0, 23) + "Z";
  const parsed = new Date(millis);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === millis;
}
/** Strict projection only; the database owns current designation, assurance and expiry. */
export function decodeOwnerSetupState(
  value: unknown,
  expectedSubject: string,
): OwnerSetupPageState | null {
  if (!record(value) || !isOwnerSetupUuid(expectedSubject) || value.subject !== expectedSubject)
    return null;
  const hasIntent = value.status === "consented";
  if (!exact(value, ["subject", "status", "designation", ...(hasIntent ? ["intent"] : [])]))
    return null;
  if (value.status === "unavailable") {
    return value.designation === null
      ? { status: "unavailable", message: "Owner setup is not available for this account." }
      : null;
  }
  if (
    typeof value.status !== "string" ||
    !["mfa_required", "ready", "consented", "completed"].includes(value.status)
  )
    return null;
  if (
    !isOwnerSetupUuid(value.designation) &&
    !(value.status === "completed" && value.designation === null)
  )
    return null;
  const state: Extract<OwnerSetupPageState, { status: "ready" }> = {
    status: "ready",
    subject: expectedSubject,
    phase: value.status as Extract<OwnerSetupPageState, { status: "ready" }>["phase"],
    designation: value.designation as string | null,
  };
  if (hasIntent) {
    if (
      !record(value.intent) ||
      !exact(value.intent, ["id", "expiresAt"]) ||
      !isOwnerSetupUuid(value.intent.id) ||
      !timestamp(value.intent.expiresAt)
    )
      return null;
    state.intent = { id: value.intent.id, expiresAt: value.intent.expiresAt };
  }
  return state;
}
function fields(form: FormData, names: string[]): boolean {
  const keys = [...form.keys()].filter((key) => !key.startsWith("$ACTION_"));
  return (
    keys.length === names.length &&
    keys.every((key) => names.includes(key)) &&
    names.every((key) => form.getAll(key).length === 1 && typeof form.get(key) === "string")
  );
}
export function validateOwnerSetupConsent(
  form: FormData,
): { subject: string; designation: string } | null {
  if (!fields(form, ["subject", "designation", "confirm"]) || form.get("confirm") !== "yes")
    return null;
  const subject = form.get("subject"),
    designation = form.get("designation");
  return isOwnerSetupUuid(subject) && isOwnerSetupUuid(designation)
    ? { subject, designation }
    : null;
}
/** Internal action input only. Never log or return the code. */
export function validateOwnerSetupVerification(
  form: FormData,
): { subject: string; code: string } | null {
  if (!fields(form, ["subject", "code"])) return null;
  const subject = form.get("subject"),
    code = form.get("code");
  return isOwnerSetupUuid(subject) &&
    typeof code === "string" &&
    code.length === 6 &&
    /^[0-9]{6}$/.test(code)
    ? { subject, code }
    : null;
}
