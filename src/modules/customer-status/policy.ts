import type { CustomerStatusRecord, StatusInput, StatusReason } from "./types.ts";

export const statusSubjectPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const statusReasons: readonly StatusReason[] = [
  "account_security",
  "customer_request",
  "account_review",
];

/** Caller assertion and selected resource are distinct; no client role/status authority. */
export function validateStatusInput(form: FormData, change: boolean): StatusInput {
  const keys = [
    "expected_subject",
    "target_subject",
    "reason",
    ...(change ? ["revision", "desired_status", "confirm_change"] : []),
  ];
  for (const key of form.keys())
    if (!keys.includes(key) && !key.startsWith("$ACTION_")) return { valid: false };
  if (keys.some((key) => form.getAll(key).length !== 1)) return { valid: false };
  const expectedSubject = form.get("expected_subject");
  const targetSubject = form.get("target_subject");
  const reason = form.get("reason");
  if (
    typeof expectedSubject !== "string" ||
    !statusSubjectPattern.test(expectedSubject) ||
    typeof targetSubject !== "string" ||
    !statusSubjectPattern.test(targetSubject) ||
    expectedSubject === targetSubject ||
    typeof reason !== "string" ||
    !statusReasons.includes(reason as StatusReason)
  )
    return { valid: false };
  const base = {
    valid: true as const,
    expectedSubject,
    targetSubject,
    reason: reason as StatusReason,
  };
  if (!change) return base;
  const revision = form.get("revision");
  const desiredStatus = form.get("desired_status");
  if (
    form.get("confirm_change") !== "yes" ||
    typeof revision !== "string" ||
    !/^(0|[1-9][0-9]{0,9})$/.test(revision) ||
    Number(revision) >= 2147483647 ||
    (desiredStatus !== "active" && desiredStatus !== "suspended")
  )
    return { valid: false };
  return { ...base, revision: Number(revision), desiredStatus };
}

export function decodeStatusRecord(
  value: unknown,
  target: string,
): { valid: true; record: CustomerStatusRecord } | { valid: false } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false };
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== 3 ||
    !["subject", "status", "revision"].every((key) => Object.hasOwn(row, key)) ||
    typeof row.subject !== "string" ||
    row.subject.length !== 36 ||
    !statusSubjectPattern.test(row.subject) ||
    row.subject !== target ||
    (row.status !== "active" && row.status !== "suspended") ||
    typeof row.revision !== "number" ||
    !Number.isInteger(row.revision) ||
    row.revision < 0 ||
    row.revision > 2147483647
  )
    return { valid: false };
  return {
    valid: true,
    record: { subject: row.subject, status: row.status, revision: row.revision },
  };
}
