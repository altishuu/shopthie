import assert from "node:assert/strict";
import test from "node:test";
import { decodeAddressBook, validateAddressInput } from "../../src/modules/addresses/policy.ts";

test("address mutations reject expanded, duplicate and noncanonical control fields", () => {
  for (const [field, value] of [
    ["role", "owner"],
    ["user_id", "00000000-0000-4000-8000-000000000002"],
    ["age", "18"],
    ["revision", "01"],
    ["revision", "-1"],
    ["revision", "2147483647"],
    ["revision", "1\n"],
    ["expected_subject", "bad"],
    ["expected_subject", "00000000-0000-4000-8000-000000000001\n"],
    ["id", "bad"],
    ["is_default", "yes"],
  ]) {
    const data = addressForm();
    data.set(field, value);
    assert.equal(
      validateAddressInput(data, lookup).valid,
      false,
      field + ":" + JSON.stringify(value),
    );
  }
  const duplicate = addressForm();
  duplicate.append("line1", "replacement");
  assert.equal(validateAddressInput(duplicate, lookup).valid, false);
  const framework = addressForm();
  framework.set("$ACTION_REF_0", "opaque");
  assert.equal(validateAddressInput(framework, lookup).valid, true);
});

test("address text is bounded Unicode without repair, control characters or line breaks", () => {
  for (const [field, max] of [
    ["label", 40],
    ["recipient", 100],
    ["line1", 180],
    ["line2", 180],
    ["subdivision_text", 100],
    ["locality", 100],
    ["postal_code", 32],
  ] as const) {
    for (const value of [
      " bad",
      "bad ",
      "bad\n",
      "bad\t",
      "bad\u0085",
      "bad\u2028",
      "x".repeat(max + 1),
    ]) {
      const data = addressForm();
      data.set(field, value);
      assert.equal(
        validateAddressInput(data, lookup).valid,
        false,
        field + ":" + JSON.stringify(value),
      );
    }
  }
  const unicode = addressForm();
  unicode.set("recipient", "山𐐀".repeat(50));
  assert.equal(validateAddressInput(unicode, lookup).valid, true);
});
test("country requirements and coded membership allow explicit manual coverage fallback", () => {
  for (const [field, value] of [
    ["country_code", "XX"],
    ["subdivision_code", "NSW"],
    ["subdivision_code", ""],
    ["subdivision_text", "Other"],
    ["locality", ""],
    ["postal_code", ""],
  ]) {
    const data = addressForm();
    data.set(field, value);
    assert.equal(validateAddressInput(data, lookup).valid, false, field);
  }
  const fallback = addressForm();
  fallback.set("subdivision_code", "");
  fallback.set("subdivision_text", "Unlisted region");
  assert.equal(validateAddressInput(fallback, lookup).valid, true);
  const optional = addressForm();
  optional.set("country_code", "AQ");
  for (const field of ["subdivision_code", "subdivision_text", "locality", "postal_code"])
    optional.set(field, "");
  assert.equal(
    validateAddressInput(optional, (code) =>
      code === "AQ"
        ? {
            code: "AQ",
            name: "Antarctica",
            subdivisionLabel: "Region",
            requireSubdivision: false,
            requireLocality: false,
            requirePostal: false,
            subdivisions: [],
          }
        : null,
    ).valid,
    true,
  );
});

test("deletion accepts only an existing resource ID, book revision and editor subject", () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    operation: "delete",
    id: "00000000-0000-4000-8000-000000000003",
    revision: "1",
    expected_subject: "00000000-0000-4000-8000-000000000001",
  }))
    data.set(key, value);
  const result = validateAddressInput(data, lookup);
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.operation, "delete");
  for (const [field, value] of [
    ["id", ""],
    ["revision", "0"],
    ["user_id", "target"],
    ["recipient", "injected"],
  ]) {
    const bad = new FormData();
    for (const [k, v] of data) bad.set(k, v);
    bad.set(field, value);
    assert.equal(validateAddressInput(bad, lookup).valid, false);
  }
});

test("book decoder accepts only bounded own-data DTOs with coherent defaults and IDs", () => {
  const parsed = validateAddressInput(addressForm(), lookup);
  if (!parsed.valid || parsed.operation !== "save") assert.fail("fixture invalid");
  const row = { id: "00000000-0000-4000-8000-000000000003", ...parsed.address };
  const book = { revision: 1, addresses: [row] };
  assert.deepEqual(decodeAddressBook(book, lookup), { valid: true, book });
  assert.deepEqual(decodeAddressBook({ revision: 0, addresses: [] }, lookup), {
    valid: true,
    book: { revision: 0, addresses: [] },
  });
  for (const value of [
    null,
    {},
    { ...book, role: "owner" },
    { ...book, revision: 0 },
    { ...book, revision: 1.5 },
    { ...book, addresses: [{ ...row, user_id: "target" }] },
    { ...book, addresses: [row, row] },
    { ...book, addresses: [row, { ...row, id: "00000000-0000-4000-8000-000000000004" }] },
    { ...book, addresses: [{ ...row, is_default: "true" }] },
    { ...book, addresses: [{ ...row, postal_code: null }] },
    { ...book, addresses: [{ ...row, recipient: "bad\n" }] },
    {
      ...book,
      addresses: Array.from({ length: 11 }, (_, i) => ({
        ...row,
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        is_default: false,
      })),
    },
  ])
    assert.equal(decodeAddressBook(value, lookup).valid, false);
});

// A deliberately small reference fixture, not a claim of worldwide geography coverage.
const references = [
  {
    code: "US",
    name: "United States",
    subdivisionLabel: "State",
    requireSubdivision: true,
    requireLocality: true,
    requirePostal: true,
    subdivisions: [{ code: "CA", name: "California" }],
  },
];
const lookup = (code: string) => references.find((country) => country.code === code) ?? null;
function addressForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    operation: "save",
    id: "",
    revision: "0",
    expected_subject: "00000000-0000-4000-8000-000000000001",
    label: "Demo",
    recipient: "Demo Customer",
    line1: "123 Example Street",
    line2: "",
    country_code: "US",
    subdivision_code: "CA",
    subdivision_text: "",
    locality: "Example City",
    postal_code: "00000",
    is_default: "true",
  }))
    form.set(key, value);
  return form;
}

test("address creation accepts only a canonical country-scoped address draft", () => {
  const value = validateAddressInput(addressForm(), lookup);
  assert.equal(value.valid, true);
  if (!value.valid || value.operation !== "save") assert.fail("valid save required");
  assert.equal(value.id, null);
  assert.equal(value.revision, 0);
  assert.equal(value.address.line2, null);
  assert.equal(value.address.subdivision_code, "CA");
  assert.equal(value.address.is_default, true);
});
