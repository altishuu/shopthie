import type { Profile, ProfileInput } from "./types.ts";

const usernamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/;
const phonePattern = /^[+][1-9][0-9]{1,14}$/;

/** Reject malformed/expanded backend responses instead of passing hidden authority/PII to the UI. */
export function decodeProfile(
  value: unknown,
): { valid: true; profile: Profile | null } | { valid: false } {
  if (value === null) return { valid: true, profile: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false };
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== 3 ||
    typeof row.username !== "string" ||
    !usernamePattern.test(row.username) ||
    !(row.phone === null || (typeof row.phone === "string" && phonePattern.test(row.phone))) ||
    typeof row.revision !== "number" ||
    !Number.isInteger(row.revision) ||
    row.revision < 1 ||
    row.revision > 2147483647
  )
    return { valid: false };
  return {
    valid: true,
    profile: { username: row.username, phone: row.phone, revision: row.revision },
  };
}

/** Reject unknown/duplicate fields rather than passing editable authority/age data downstream. */
export function validateProfileInput(form: FormData): ProfileInput {
  const allowed = new Set(["username", "phone", "revision", "expected_subject"]);
  for (const key of form.keys()) {
    if (!allowed.has(key) && !key.startsWith("$ACTION_")) return { valid: false };
  }
  if ([...allowed].some((key) => form.getAll(key).length !== 1)) return { valid: false };
  const username = form.get("username");
  const phone = form.get("phone");
  const revision = form.get("revision");
  const subject = form.get("expected_subject");
  if (
    typeof username !== "string" ||
    !usernamePattern.test(username) ||
    typeof phone !== "string" ||
    (phone !== "" && !phonePattern.test(phone)) ||
    typeof revision !== "string" ||
    !/^(0|[1-9][0-9]{0,9})$/.test(revision) ||
    Number(revision) >= 2147483647 ||
    typeof subject !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(subject)
  )
    return { valid: false };
  return {
    valid: true,
    username,
    phone: phone === "" ? null : phone,
    revision: Number(revision),
    expectedSubject: subject,
  };
}
