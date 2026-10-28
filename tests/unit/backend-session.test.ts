import assert from "node:assert/strict";
import test from "node:test";

test("session orchestration never loads account authority without verified identity", async () => {
  const { readRequestIdentity } = await import("../../src/modules/identity/session.ts");
  let actorReads = 0;
  const result = await readRequestIdentity({
    verify: async () => null,
    actor: async () => {
      actorReads++;
      return [];
    },
  });
  assert.deepEqual(result, { status: "guest" });
  assert.equal(actorReads, 0);
});

test("session transport errors fail closed and never echo provider error contents", async () => {
  const { readRequestIdentity } = await import("../../src/modules/identity/session.ts");
  const result = await readRequestIdentity({
    verify: async () => {
      throw new Error("unit-only-sensitive-message");
    },
    actor: async () => [],
  });
  assert.equal(result.status, "unavailable");
  assert.equal(JSON.stringify(result).includes("unit-only-sensitive-message"), false);
});

test("verified unit fixtures still require a successful fresh authority read", async () => {
  const { readRequestIdentity } = await import("../../src/modules/identity/session.ts");
  const fixture = {
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "unit@example.invalid",
      email_confirmed_at: "2026-01-01T00:00:00Z",
    },
    claims: { sub: "11111111-1111-4111-8111-111111111111", aal: "aal1" },
  };
  const result = await readRequestIdentity({
    verify: async () => fixture,
    actor: async () => {
      throw new Error("database unavailable");
    },
  });
  assert.equal(result.status, "unavailable");
});
