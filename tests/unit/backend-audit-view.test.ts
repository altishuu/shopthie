import assert from "node:assert/strict";
import test from "node:test";

test("audit input rejects malformed/partial/normalized cursors and authority overrides", async () => {
  const { validateAuditInput, validAuditTimestamp } =
    await import("../../src/modules/audit-view/policy.ts");
  for (const raw of [
    "2026-02-30T12:00:00.123456Z",
    "2026-10-29T16:55:55.123Z",
    timestamp + "\n",
    "2026-10-29T16:55:55.123456+00:00",
    "0000-01-01T00:00:00.000000Z",
  ]) {
    assert.equal(validAuditTimestamp(raw), false);
    const data = form();
    data.set("cursor_created_at", raw);
    data.set("cursor_id", eventId);
    assert.equal(validateAuditInput(data).valid, false);
  }
  for (const key of ["expected_subject", "cursor_created_at", "cursor_id"]) {
    const duplicate = form();
    duplicate.append(key, String(duplicate.get(key)));
    assert.equal(validateAuditInput(duplicate).valid, false);
    const binary = form();
    binary.set(key, new Blob(["bad"]));
    assert.equal(validateAuditInput(binary).valid, false);
  }
  const partial = form();
  partial.set("cursor_id", eventId);
  assert.equal(validateAuditInput(partial).valid, false);
  for (const key of ["actor_id", "scope", "role", "limit"]) {
    const data = form();
    data.set(key, "owner");
    assert.equal(validateAuditInput(data).valid, false);
  }
});
function event(id = eventId, time = timestamp) {
  return {
    id,
    actorSubject: subject,
    targetSubject: target,
    eventType: "customer.lookup",
    reason: "profile_help",
    outcome: "found",
    createdAt: time,
  };
}
test("audit page decoder admits only minimal supported data and actual Admin actor scope", async () => {
  const { decodeAuditPage } = await import("../../src/modules/audit-view/policy.ts");
  const page = { scope: "own", events: [event()], nextCursor: null };
  assert.deepEqual(decodeAuditPage(page, subject, "own", null), { valid: true, page });
  for (const changed of [
    { ...page, scope: "all" },
    { ...page, phone: "+123" },
    { ...page, events: [{ ...event(), actorSubject: target }] },
    { ...page, events: [{ ...event(), email: "private@example.invalid" }] },
    { ...page, events: [{ ...event(), reason: "free text" }] },
    { ...page, events: [{ ...event(), eventType: "support.private.read" }] },
    { ...page, events: [{ ...event(), targetSubject: null }] },
    { ...page, nextCursor: { createdAt: timestamp, id: eventId } },
  ])
    assert.equal(decodeAuditPage(changed, subject, "own", null).valid, false);
  assert.equal(
    decodeAuditPage(
      { scope: "all", events: [{ ...event(), actorSubject: target }], nextCursor: null },
      subject,
      "all",
      null,
    ).valid,
    true,
  );
  assert.equal(
    decodeAuditPage(
      {
        scope: "own",
        events: [{ ...event(), targetSubject: null, outcome: "not_found" }],
        nextCursor: null,
      },
      subject,
      "own",
      null,
    ).valid,
    true,
  );
});

test("audit decoder enforces stable descending tuples and justifies last-visible pagination without losing microseconds", async () => {
  const { decodeAuditPage } = await import("../../src/modules/audit-view/policy.ts");
  const rows = Array.from({ length: 20 }, (_, i) =>
    event(`00000000-0000-4000-8000-${(100 - i).toString(16).padStart(12, "0")}`),
  );
  const last = rows[19];
  const next = { createdAt: last.createdAt, id: last.id };
  assert.equal(
    decodeAuditPage({ scope: "own", events: rows, nextCursor: next }, subject, "own", null).valid,
    true,
  );
  assert.equal(
    decodeAuditPage(
      { scope: "own", events: rows, nextCursor: { ...next, id: eventId } },
      subject,
      "own",
      null,
    ).valid,
    false,
  );
  for (const events of [
    [rows[1], rows[0]],
    [rows[0], rows[0]],
    [...rows, rows[19]],
  ])
    assert.equal(
      decodeAuditPage({ scope: "own", events, nextCursor: null }, subject, "own", null).valid,
      false,
    );
  const before = { createdAt: timestamp, id: eventId };
  assert.equal(
    decodeAuditPage(
      { scope: "own", events: [event(eventId, "2026-10-29T16:55:55.123455Z")], nextCursor: null },
      subject,
      "own",
      before,
    ).valid,
    true,
  );
  assert.equal(
    decodeAuditPage(
      { scope: "own", events: [event(eventId, "2026-10-29T16:55:55.123457Z")], nextCursor: null },
      subject,
      "own",
      before,
    ).valid,
    false,
  );
});
const staff = (role: "admin" | "owner" = "admin") => ({
  status: "active" as const,
  email: "fixture@example.invalid",
  actor: {
    userId: subject,
    role,
    status: "active" as const,
    aal: "aal2" as const,
    hasVerifiedMfa: true,
  },
});
test("audit service binds current trusted role, caller and scope without client-controlled filters", async () => {
  const { readAuditViewPage, readAuditEvents } =
    await import("../../src/modules/audit-view/service.ts");
  for (const role of ["admin", "owner"] as const) {
    const scope = role === "owner" ? "all" : "own";
    let calls = 0;
    const port = {
      identity: async () => staff(role),
      ready: async () => ({ data: true, error: null }),
      read: async (before: unknown) => {
        calls++;
        assert.equal(before, null);
        return { data: { scope, events: [event()], nextCursor: null }, error: null };
      },
    };
    assert.deepEqual(await readAuditViewPage(port), { status: "ready", subject, scope });
    const result = await readAuditEvents(port, form());
    assert.equal(result.status, "ready");
    assert.equal(result.page?.scope, scope);
    assert.equal(calls, 1);
  }
});

test("audit gates deny nonstaff, stale MFA, suspension, disabled viewer and stale callers before any event read", async () => {
  const { readAuditViewPage, readAuditEvents } =
    await import("../../src/modules/audit-view/service.ts");
  let reads = 0,
    readyCalls = 0;
  const base = {
    identity: async () => staff(),
    ready: async () => {
      readyCalls++;
      return { data: true, error: null };
    },
    read: async () => {
      reads++;
      return { data: { scope: "own", events: [], nextCursor: null }, error: null };
    },
  };
  const denied = [
    { status: "guest" },
    { status: "mfa_required" },
    { status: "unavailable" },
    ...[
      { role: "customer" },
      { role: "visitor" },
      { aal: "aal1" },
      { hasVerifiedMfa: false },
      { status: "suspended" },
      { userId: subject + "\n" },
    ].map((change) => ({ ...staff(), actor: { ...staff().actor, ...change } })),
  ];
  for (const identity of denied) {
    const port = {
      ...base,
      identity: async () => identity as Awaited<ReturnType<typeof base.identity>>,
    };
    assert.notEqual((await readAuditViewPage(port)).status, "ready");
    assert.equal((await readAuditEvents(port, form())).page, null);
  }
  assert.equal(reads, 0);
  assert.equal(readyCalls, 0);
  const disabled = { ...base, enabledModules: [] };
  assert.notEqual((await readAuditViewPage(disabled)).status, "ready");
  assert.equal((await readAuditEvents(disabled, form())).page, null);
  const stale = form();
  stale.set("expected_subject", target);
  assert.equal((await readAuditEvents(base, stale)).page, null);
  assert.equal(reads, 0);
  assert.equal(readyCalls, 0);
  for (const data of [false, null, {}, "true"]) {
    const port = { ...base, ready: async () => ({ data, error: null }) };
    assert.notEqual((await readAuditViewPage(port)).status, "ready");
    assert.equal((await readAuditEvents(port, form())).page, null);
  }
  assert.equal(reads, 0);
});

test("audit provider failures and scope drift return no page or raw diagnostics", async () => {
  const { readAuditEvents, readAuditViewPage } =
    await import("../../src/modules/audit-view/service.ts");
  const marker = "private-provider-detail@invalid";
  const base = {
    identity: async () => staff(),
    ready: async () => ({ data: true, error: null }),
    read: async () => ({ data: { scope: "own", events: [], nextCursor: null }, error: null }),
  };
  const broken = [
    {
      ...base,
      identity: async () => {
        throw new Error(marker);
      },
    },
    { ...base, ready: async () => ({ data: true, error: { message: marker } }) },
    {
      ...base,
      read: async () => ({
        data: { scope: "own", events: [event()], nextCursor: null },
        error: { message: marker },
      }),
    },
    {
      ...base,
      read: async () => {
        throw new Error(marker);
      },
    },
    {
      ...base,
      read: async () => ({
        data: { scope: "all", events: [{ ...event(), actorSubject: target }], nextCursor: null },
        error: null,
      }),
    },
  ];
  for (const port of broken) {
    const result = await readAuditEvents(port, form());
    assert.equal(result.status, "error");
    assert.equal(result.page, null);
    assert.equal(JSON.stringify(result).includes(marker), false);
  }
  const unavailable = await readAuditViewPage({
    ...base,
    identity: async () => {
      throw new Error(marker);
    },
  });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(JSON.stringify(unavailable).includes(marker), false);
});

const subject = "00000000-0000-4000-8000-000000000001";
const target = "00000000-0000-4000-8000-000000000002";
const eventId = "00000000-0000-4000-8000-000000000003";
const timestamp = "2026-10-29T16:55:55.123456Z";
function form() {
  const data = new FormData();
  data.set("expected_subject", subject);
  data.set("cursor_created_at", "");
  data.set("cursor_id", "");
  return data;
}
test("audit input preserves canonical microsecond cursor literally and accepts no scope/actor selectors", async () => {
  const { validateAuditInput } = await import("../../src/modules/audit-view/policy.ts");
  assert.deepEqual(validateAuditInput(form()), {
    valid: true,
    expectedSubject: subject,
    before: null,
  });
  const next = form();
  next.set("cursor_created_at", timestamp);
  next.set("cursor_id", eventId);
  assert.deepEqual(validateAuditInput(next), {
    valid: true,
    expectedSubject: subject,
    before: { createdAt: timestamp, id: eventId },
  });
});
