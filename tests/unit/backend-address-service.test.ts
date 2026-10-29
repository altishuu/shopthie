import assert from "node:assert/strict";
import test from "node:test";
import { mutateOwnAddressBook, readOwnAddressBook } from "../../src/modules/addresses/service.ts";
import type { IdentityState } from "../../src/modules/identity/types.ts";
const subject = "00000000-0000-4000-8000-000000000001";
const active: IdentityState = {
  status: "active",
  email: "customer@example.test",
  actor: {
    userId: subject,
    role: "customer",
    status: "active",
    aal: "aal1",
    hasVerifiedMfa: false,
  },
};
const lookup = (code: string) =>
  code === "US"
    ? {
        code,
        name: "United States",
        subdivisionLabel: "State",
        requireSubdivision: true,
        requireLocality: true,
        requirePostal: true,
        subdivisions: [{ code: "CA", name: "California" }],
      }
    : null;
const address = {
  id: "00000000-0000-4000-8000-000000000003",
  label: null,
  recipient: "Demo Customer",
  line1: "123 Example Street",
  line2: null,
  country_code: "US",
  subdivision_code: "CA",
  subdivision_text: null,
  locality: "Example City",
  postal_code: "00000",
  is_default: true,
};
const book = { revision: 1, addresses: [address] };

function form() {
  const f = new FormData();
  for (const [key, value] of Object.entries({
    operation: "save",
    id: "",
    revision: "0",
    expected_subject: subject,
    label: "",
    recipient: address.recipient,
    line1: address.line1,
    line2: "",
    country_code: "US",
    subdivision_code: "CA",
    subdivision_text: "",
    locality: address.locality,
    postal_code: address.postal_code,
    is_default: "true",
  }))
    f.set(key, value);
  return f;
}
test("address saves require matching verified editor identity and validated committed data", async () => {
  let writes = 0;
  const save = async () => {
    writes++;
    return { data: book, error: null };
  };
  assert.equal(
    (await mutateOwnAddressBook(form(), async () => ({ status: "guest" }), save, lookup)).status,
    "error",
  );
  assert.equal(writes, 0);
  const changed = form();
  changed.set("expected_subject", "00000000-0000-4000-8000-000000000002");
  assert.equal(
    (await mutateOwnAddressBook(changed, async () => active, save, lookup)).status,
    "conflict",
  );
  assert.equal(writes, 0);
  const invalid = form();
  invalid.set("role", "owner");
  assert.equal(
    (await mutateOwnAddressBook(invalid, async () => active, save, lookup)).status,
    "error",
  );
  assert.equal(writes, 0);
  assert.deepEqual(await mutateOwnAddressBook(form(), async () => active, save, lookup), {
    status: "success",
    message: "Address saved.",
    book,
  });
  for (const data of [
    null,
    { revision: 0, addresses: [] },
    { revision: 1, addresses: [] },
    { ...book, revision: 2 },
    { ...book, addresses: [{ ...address, recipient: "Wrong" }] },
  ])
    assert.equal(
      (
        await mutateOwnAddressBook(
          form(),
          async () => active,
          async () => ({ data, error: null }),
          lookup,
        )
      ).status,
      "error",
    );
});

test("address delete succeeds only after the selected ID is absent at the next book revision", async () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    operation: "delete",
    id: address.id,
    revision: "1",
    expected_subject: subject,
  }))
    data.set(key, value);
  const empty = { revision: 2, addresses: [] };
  assert.deepEqual(
    await mutateOwnAddressBook(
      data,
      async () => active,
      async () => ({ data: empty, error: null }),
      lookup,
    ),
    { status: "success", message: "Address deleted.", book: empty },
  );
  for (const result of [book, { revision: 2, addresses: [address] }])
    assert.equal(
      (
        await mutateOwnAddressBook(
          data,
          async () => active,
          async () => ({ data: result, error: null }),
          lookup,
        )
      ).status,
      "error",
    );
});
test("address errors sanitize provider details while exposing only known conflict and cap states", async () => {
  for (const [error, status, text] of [
    [{ code: "P0001", message: "address_conflict" }, "conflict", "another tab"],
    [{ code: "P0001", message: "address_limit" }, "error", "10 addresses"],
    [{ code: "42501", message: "private test address" }, "error", "unavailable"],
    [{ code: "P0001", message: "private test address" }, "error", "unavailable"],
  ] as const) {
    const result = await mutateOwnAddressBook(
      form(),
      async () => active,
      async () => ({ data: null, error }),
      lookup,
    );
    assert.equal(result.status, status);
    assert.ok(result.message.includes(text));
    assert.ok(!result.message.includes("private test address"));
  }
  assert.equal(
    (
      await mutateOwnAddressBook(
        form(),
        async () => active,
        async () => {
          throw Error("private test address");
        },
        lookup,
      )
    ).status,
    "error",
  );
});

test("address book reads verify identity first and expose only valid own-data responses", async () => {
  let reads = 0;
  const read = async () => {
    reads++;
    return { data: book, error: null };
  };
  assert.deepEqual(await readOwnAddressBook(async () => ({ status: "guest" }), read, lookup), {
    status: "guest",
  });
  for (const status of ["suspended", "unverified", "mfa_required", "unprovisioned"] as const)
    assert.equal(
      (await readOwnAddressBook(async () => ({ status }), read, lookup)).status,
      "denied",
    );
  assert.equal(reads, 0);
  assert.deepEqual(await readOwnAddressBook(async () => active, read, lookup), {
    status: "ready",
    book,
    subject,
  });
  for (const data of [
    null,
    { ...book, owner_id: subject },
    { ...book, addresses: [{ ...address, role: "owner" }] },
  ])
    assert.equal(
      (
        await readOwnAddressBook(
          async () => active,
          async () => ({ data, error: null }),
          lookup,
        )
      ).status,
      "denied",
    );
  assert.equal(
    (
      await readOwnAddressBook(
        async () => active,
        async () => {
          throw Error("private failure");
        },
        lookup,
      )
    ).status,
    "denied",
  );
});
