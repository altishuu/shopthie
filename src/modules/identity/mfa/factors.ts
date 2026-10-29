/** Fresh provider getUser().factors only; never editable metadata or a decoded unverified JWT. */
export function hasVerifiedTotpFactor(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) return false;
  const ids = new Set<string>();
  let verified = false;
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const factor = item as Record<string, unknown>;
    if (
      typeof factor.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(factor.id) ||
      ids.has(factor.id) ||
      (factor.status !== "verified" && factor.status !== "unverified") ||
      typeof factor.factor_type !== "string" ||
      factor.factor_type.length === 0
    )
      return false;
    ids.add(factor.id);
    if (factor.status === "verified" && factor.factor_type === "totp") verified = true;
  }
  return verified;
}
