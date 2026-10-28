import assert from "node:assert/strict";
import test from "node:test";

test("profile DTO decoding returns only the exact committed self shape, never extra private or authority fields", async () => {
  const { decodeProfile } = await import("../../src/modules/profiles/policy.ts");
  const profile = { username: "Shopthie_Test", phone: null, revision: 1 };
  assert.deepEqual(decodeProfile(profile), { valid: true, profile });
  assert.deepEqual(decodeProfile(null), { valid: true, profile: null });
  for (const value of [
    undefined,
    [],
    { ...profile, role: "owner" },
    { ...profile, user_id: "other" },
    { ...profile, revision: 0 },
    { ...profile, revision: 1.5 },
    { ...profile, username: "Test\n" },
    { ...profile, phone: "invalid" },
  ]) {
    assert.deepEqual(decodeProfile(value), { valid: false });
  }
});

function profileForm() {
  const form = new FormData();
  form.set("username", "Shopthie_Test");
  form.set("phone", "");
  form.set("revision", "0");
  form.set("expected_subject", "00000000-0000-4000-8000-000000000001");
  return form;
}

test("profile input accepts only canonical own-data fields and explicitly clears a blank phone", async () => {
  const { validateProfileInput } = await import("../../src/modules/profiles/policy.ts");
  assert.deepEqual(validateProfileInput(profileForm()), {
    valid: true,
    username: "Shopthie_Test",
    phone: null,
    revision: 0,
    expectedSubject: "00000000-0000-4000-8000-000000000001",
  });
  for (const field of ["user_id", "role", "status", "email", "age", "age_range"]) {
    const form = profileForm();
    form.set(field, "forged");
    assert.deepEqual(validateProfileInput(form), { valid: false });
  }
});

test("profile tokens reject terminal line breaks rather than accepting regex end-of-line matches", async () => {
  const { validateProfileInput } = await import("../../src/modules/profiles/policy.ts");
  for (const [field, value] of [
    ["username", "Test\n"],
    ["phone", "+12025550123\n"],
    ["revision", "0\n"],
  ]) {
    const form = profileForm();
    form.set(field, value);
    assert.deepEqual(validateProfileInput(form), { valid: false });
  }
});

test("profile validation rejects malformed, duplicate and silently repaired values", async () => {
  const { validateProfileInput } = await import("../../src/modules/profiles/policy.ts");
  for (const [field, value] of [
    ["username", " Test"],
    ["username", "ab"],
    ["username", "a".repeat(33)],
    ["username", "has space"],
    ["phone", "09171234567"],
    ["phone", "+1 202 555 0123"],
    ["phone", "+0123"],
    ["revision", "01"],
    ["revision", "-1"],
    ["revision", "2147483647"],
  ]) {
    const form = profileForm();
    form.set(field, value);
    assert.deepEqual(validateProfileInput(form), { valid: false });
  }
  const duplicate = profileForm();
  duplicate.append("username", "Second");
  assert.deepEqual(validateProfileInput(duplicate), { valid: false });
  const valid = profileForm();
  valid.set("phone", "+12025550123");
  valid.set("revision", "3");
  assert.deepEqual(validateProfileInput(valid), {
    valid: true,
    username: "Shopthie_Test",
    phone: "+12025550123",
    revision: 3,
    expectedSubject: "00000000-0000-4000-8000-000000000001",
  });
});
