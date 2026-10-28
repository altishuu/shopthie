import assert from "node:assert/strict";
import test from "node:test";
import type { IdentityState } from "../../src/modules/identity/types.ts";

const active: IdentityState = {
  status: "active",
  email: "unit@example.invalid",
  actor: {
    userId: "00000000-0000-4000-8000-000000000001",
    role: "customer",
    status: "active",
    aal: "aal1",
    hasVerifiedMfa: false,
  },
};
const profile = { username: "Shopthie_Test", phone: null, revision: 1 };
const form = () => {
  const f = new FormData();
  f.set("username", profile.username);
  f.set("phone", "");
  f.set("revision", "0");
  f.set("expected_subject", active.status === "active" ? active.actor.userId : "");
  return f;
};

test("profile saves require active identity and a validated committed response", async () => {
  const { saveOwnProfile } = await import("../../src/modules/profiles/service.ts");
  let saves = 0;
  const save = async () => {
    saves++;
    return { data: profile, error: null };
  };
  const denied = await saveOwnProfile(form(), async () => ({ status: "guest" }), save);
  assert.equal(denied.status, "error");
  assert.equal(saves, 0);
  const result = await saveOwnProfile(form(), async () => active, save);
  assert.deepEqual(result, { status: "success", message: "Profile saved.", profile });
  assert.equal(
    (
      await saveOwnProfile(
        form(),
        async () => active,
        async () => ({ data: null, error: null }),
      )
    ).status,
    "error",
  );
  assert.equal(
    (
      await saveOwnProfile(
        form(),
        async () => active,
        async () => ({ data: { ...profile, revision: 3 }, error: null }),
      )
    ).status,
    "error",
  );
});

test("profile conflict and username collision errors are safe and never reported as saves", async () => {
  const { saveOwnProfile } = await import("../../src/modules/profiles/service.ts");
  const conflict = await saveOwnProfile(
    form(),
    async () => active,
    async () => ({ data: null, error: { code: "P0001", message: "profile_conflict" } }),
  );
  assert.equal(conflict.status, "conflict");
  const duplicate = await saveOwnProfile(
    form(),
    async () => active,
    async () => ({
      data: null,
      error: { code: "23505", message: "private unrelated record detail" },
    }),
  );
  assert.equal(duplicate.status, "error");
  assert.match(duplicate.message, /username.*unavailable/i);
  assert.equal(JSON.stringify(duplicate).includes("private unrelated"), false);
});

test("profile unavailable, suspended and malformed reads fail closed without copying provider data", async () => {
  const { readOwnProfile, saveOwnProfile } = await import("../../src/modules/profiles/service.ts");
  for (const identity of [
    { status: "suspended" },
    { status: "mfa_required" },
    { status: "unavailable", message: "unit sensitive transport" },
  ] as IdentityState[]) {
    let calls = 0;
    const io = async () => {
      calls++;
      return { data: profile, error: null };
    };
    assert.equal((await readOwnProfile(async () => identity, io)).status, "denied");
    assert.equal((await saveOwnProfile(form(), async () => identity, io)).status, "error");
    assert.equal(calls, 0);
  }
  const denied = await readOwnProfile(
    async () => active,
    async () => ({ data: { ...profile, role: "owner" }, error: null }),
  );
  assert.equal(denied.status, "denied");
  const failure = await saveOwnProfile(
    form(),
    async () => active,
    async () => {
      throw new Error("unit-sensitive");
    },
  );
  assert.equal(failure.status, "error");
  assert.equal(JSON.stringify(failure).includes("unit-sensitive"), false);
});

test("a profile editor opened by another identity cannot overwrite the new signed-in account", async () => {
  const { saveOwnProfile } = await import("../../src/modules/profiles/service.ts");
  const data = form();
  data.set("expected_subject", "00000000-0000-4000-8000-000000000002");
  let saves = 0;
  const result = await saveOwnProfile(
    data,
    async () => active,
    async () => {
      saves++;
      return { data: profile, error: null };
    },
  );
  assert.equal(result.status, "conflict");
  assert.equal(saves, 0);
});

test("profile reads require verified active identity before the self-only data reader", async () => {
  const { readOwnProfile } = await import("../../src/modules/profiles/service.ts");
  let reads = 0;
  const read = async () => {
    reads++;
    return { data: profile, error: null };
  };
  assert.deepEqual(await readOwnProfile(async () => ({ status: "guest" }), read), {
    status: "guest",
  });
  assert.equal(reads, 0);
  assert.deepEqual(await readOwnProfile(async () => active, read), {
    status: "ready",
    profile,
    subject: active.actor.userId,
  });
});
