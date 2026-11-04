import type { ProfileSupportInput, ProfileSupportRecord } from "./types.ts";

// The negative lookahead is an absolute end anchor: unlike $, it rejects a final newline.
export const profileSupportSubjectPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/;
const usernamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}(?![\s\S])/;
const phonePattern = /^[+][1-9][0-9]{1,14}(?![\s\S])/;

/** Assertions are not authority; preserve the submitted spelling without repair. */
export function validateProfileSupportInput(form: FormData): ProfileSupportInput {
  const keys = ["expected_subject", "target_subject", "username", "reason"];
  for (const key of form.keys())
    if (!keys.includes(key) && !key.startsWith("$ACTION_")) return { valid: false };
  if (keys.some((key) => form.getAll(key).length !== 1)) return { valid: false };
  const expectedSubject = form.get("expected_subject");
  const targetSubject = form.get("target_subject");
  const username = form.get("username");
  const reason = form.get("reason");
  if (
    typeof expectedSubject !== "string" ||
    !profileSupportSubjectPattern.test(expectedSubject) ||
    typeof targetSubject !== "string" ||
    !profileSupportSubjectPattern.test(targetSubject) ||
    expectedSubject === targetSubject ||
    typeof username !== "string" ||
    !usernamePattern.test(username) ||
    reason !== "profile_help"
  )
    return { valid: false };
  return { valid: true, expectedSubject, targetSubject, username, reason };
}

/** Reject expanded/mismatched projections in full; never return a partial profile. */
export function decodeProfileSupportRecord(
  value: unknown,
  targetSubject: string,
  username: string,
): { valid: true; profile: ProfileSupportRecord } | { valid: false } {
  try {
    if (
      typeof targetSubject !== "string" ||
      !profileSupportSubjectPattern.test(targetSubject) ||
      typeof username !== "string" ||
      !usernamePattern.test(username) ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    )
      return { valid: false };
    const keys = ["subject", "username", "phone"];
    // Data properties only, including non-enumerable/symbol expansion checks.
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      Reflect.ownKeys(descriptors).length !== keys.length ||
      !keys.every(
        (key) => Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], "value"),
      )
    )
      return { valid: false };
    const row = {
      subject: descriptors.subject.value as unknown,
      username: descriptors.username.value as unknown,
      phone: descriptors.phone.value as unknown,
    };
    if (
      typeof row.subject !== "string" ||
      !profileSupportSubjectPattern.test(row.subject) ||
      row.subject !== targetSubject ||
      typeof row.username !== "string" ||
      !usernamePattern.test(row.username) ||
      row.username.toLowerCase() !== username.toLowerCase() ||
      !(row.phone === null || (typeof row.phone === "string" && phonePattern.test(row.phone)))
    )
      return { valid: false };
    return {
      valid: true,
      profile: { subject: row.subject, username: row.username, phone: row.phone },
    };
  } catch {
    return { valid: false };
  }
}
