import type { AuditCursor, AuditEvent, AuditInput, AuditPage, AuditScope } from "./types.ts";
export const auditUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validAuditSubject(value: unknown): value is string {
  return typeof value === "string" && value.length === 36 && auditUuidPattern.test(value);
}
/** Calendar validation only: NEVER replace/roundtrip the raw six-microsecond cursor. */
export function validAuditTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value) ||
    !value.endsWith("Z") ||
    value.startsWith("0000")
  )
    return false;
  try {
    return new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
  } catch {
    return false;
  }
}
export function validateAuditInput(form: FormData): AuditInput {
  const keys = ["expected_subject", "cursor_created_at", "cursor_id"];
  for (const key of form.keys())
    if (!keys.includes(key) && !key.startsWith("$ACTION_")) return { valid: false };
  if (keys.some((key) => form.getAll(key).length !== 1)) return { valid: false };
  const subject = form.get("expected_subject"),
    time = form.get("cursor_created_at"),
    id = form.get("cursor_id");
  if (!validAuditSubject(subject) || typeof time !== "string" || typeof id !== "string")
    return { valid: false };
  if (time === "" && id === "") return { valid: true, expectedSubject: subject, before: null };
  if (!validAuditTimestamp(time) || !validAuditSubject(id)) return { valid: false };
  return { valid: true, expectedSubject: subject, before: { createdAt: time, id } };
}

function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function cursor(value: unknown): value is AuditCursor {
  return (
    exact(value, ["createdAt", "id"]) &&
    validAuditTimestamp(value.createdAt) &&
    validAuditSubject(value.id)
  );
}
function older(a: AuditCursor, b: AuditCursor): boolean {
  return a.createdAt < b.createdAt || (a.createdAt === b.createdAt && a.id < b.id);
}
/** Scope, tuples and full microsecond cursor remain bound to the current request. */
export function decodeAuditPage(
  value: unknown,
  subject: string,
  scope: AuditScope,
  before: AuditCursor | null,
): { valid: true; page: AuditPage } | { valid: false } {
  if (
    !validAuditSubject(subject) ||
    !["own", "all"].includes(scope) ||
    (before !== null && !cursor(before)) ||
    !exact(value, ["scope", "events", "nextCursor"]) ||
    value.scope !== scope ||
    !Array.isArray(value.events) ||
    value.events.length > 20
  )
    return { valid: false };
  const events: AuditEvent[] = [];
  let previous = before;
  for (const raw of value.events) {
    if (
      !exact(raw, [
        "id",
        "actorSubject",
        "targetSubject",
        "eventType",
        "reason",
        "outcome",
        "createdAt",
      ]) ||
      !validAuditSubject(raw.id) ||
      !validAuditSubject(raw.actorSubject) ||
      !validAuditTimestamp(raw.createdAt) ||
      (raw.targetSubject !== null && !validAuditSubject(raw.targetSubject)) ||
      typeof raw.reason !== "string" ||
      typeof raw.outcome !== "string" ||
      (scope === "own" && raw.actorSubject !== subject)
    )
      return { valid: false };
    const tuple = { createdAt: raw.createdAt, id: raw.id };
    if (previous && !older(tuple, previous)) return { valid: false };
    const lookup =
      raw.eventType === "customer.lookup" &&
      ["account_access", "profile_help", "address_help"].includes(raw.reason) &&
      ((raw.outcome === "found" && raw.targetSubject !== null) ||
        (raw.outcome === "not_found" && raw.targetSubject === null));
    const status =
      ["account_security", "customer_request", "account_review"].includes(raw.reason) &&
      raw.targetSubject !== null &&
      ((raw.eventType === "customer.status.read" && raw.outcome === "read") ||
        (raw.eventType === "customer.status.change" &&
          ["active", "suspended"].includes(raw.outcome)));
    if (!lookup && !status) return { valid: false };
    events.push({
      id: raw.id,
      actorSubject: raw.actorSubject,
      targetSubject: raw.targetSubject,
      eventType: raw.eventType,
      reason: raw.reason,
      outcome: raw.outcome,
      createdAt: raw.createdAt,
    } as AuditEvent);
    previous = tuple;
  }
  let nextCursor: AuditCursor | null = null;
  if (value.nextCursor !== null) {
    if (
      !cursor(value.nextCursor) ||
      events.length !== 20 ||
      !previous ||
      value.nextCursor.id !== previous.id ||
      value.nextCursor.createdAt !== previous.createdAt
    )
      return { valid: false };
    nextCursor = { id: value.nextCursor.id, createdAt: value.nextCursor.createdAt };
  }
  return { valid: true, page: { scope, events, nextCursor } };
}
