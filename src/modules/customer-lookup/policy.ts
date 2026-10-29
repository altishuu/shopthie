import type { CustomerLookupRecord, LookupInput, LookupReason } from "./types.ts";

export const lookupUsernamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const lookupReasons: readonly LookupReason[] = [
  "account_access",
  "profile_help",
  "address_help",
];

/** Exact, bounded form only; caller assertion is never an authority selector. */
export function validateLookupInput(form: FormData): LookupInput {
  const fields = ["expected_subject", "username", "reason"];
  for (const key of form.keys()) {
    if (!fields.includes(key) && !key.startsWith("$ACTION_")) return { valid: false };
  }
  if (fields.some((key) => form.getAll(key).length !== 1)) return { valid: false };
  const expectedSubject = form.get("expected_subject");
  const username = form.get("username");
  const reason = form.get("reason");
  if (
    typeof expectedSubject !== "string" ||
    !uuidPattern.test(expectedSubject) ||
    typeof username !== "string" ||
    !lookupUsernamePattern.test(username) ||
    typeof reason !== "string" ||
    !lookupReasons.includes(reason as LookupReason)
  )
    return { valid: false };
  return { valid: true, expectedSubject, username, reason: reason as LookupReason };
}

/** No expanded/private backend payloads or result for a different query reach the UI. */
export function decodeLookupRecord(
  value: unknown,
  username: string,
): { valid: true; customer: CustomerLookupRecord | null } | { valid: false } {
  if (!lookupUsernamePattern.test(username)) return { valid: false };
  if (value === null) return { valid: true, customer: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false };
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== 3 ||
    !["subject", "username", "status"].every((key) => Object.hasOwn(row, key)) ||
    typeof row.subject !== "string" ||
    !uuidPattern.test(row.subject) ||
    typeof row.username !== "string" ||
    !lookupUsernamePattern.test(row.username) ||
    row.username.toLowerCase() !== username.toLowerCase() ||
    (row.status !== "active" && row.status !== "suspended")
  )
    return { valid: false };
  return {
    valid: true,
    customer: { subject: row.subject, username: row.username, status: row.status },
  };
}
