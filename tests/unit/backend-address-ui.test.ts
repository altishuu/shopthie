import assert from "node:assert/strict";
import test from "node:test";
import type { SavedAddress } from "../../src/modules/addresses/types.ts";

const saved: SavedAddress = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "Test only",
  recipient: "Synthetic Recipient",
  line1: "12 Example Lane",
  line2: null,
  country_code: "XY",
  subdivision_code: null,
  subdivision_text: "Unlisted region",
  locality: "Test Town",
  postal_code: null,
  is_default: false,
};
import {
  createAddressDraft,
  changeAddressCountry,
  changeAddressSubdivision,
} from "../../src/modules/addresses/ui.ts";

test("new address captures book revision and permits unchecking the initial first default", () => {
  const book = { revision: 7, addresses: [] };
  const draft = createAddressDraft(book);
  assert.deepEqual(draft, {
    id: "",
    revision: 7,
    label: "",
    recipient: "",
    line1: "",
    line2: "",
    country_code: "",
    subdivision_code: "",
    subdivision_text: "",
    locality: "",
    postal_code: "",
    is_default: true,
  });
  draft.is_default = false;
  book.revision = 8;
  assert.equal(draft.is_default, false);
  assert.equal(draft.revision, 7);
});

test("editing copies literal fields and uses the current whole-book revision", () => {
  const book = { revision: 12, addresses: [saved] };
  const draft = createAddressDraft(book, saved);
  assert.deepEqual(draft, {
    ...saved,
    revision: 12,
    line2: "",
    subdivision_code: "",
    postal_code: "",
  });
  draft.recipient = "Changed in editor";
  assert.equal(saved.recipient, "Synthetic Recipient");
  assert.equal(createAddressDraft(book).is_default, false);
});

test("country change clears both region modes, locality and postal but preserves the rest", () => {
  const draft = createAddressDraft({ revision: 12, addresses: [saved] }, saved);
  draft.subdivision_code = "XY-TEST";
  draft.postal_code = "TEST1";
  const changed = changeAddressCountry(draft, "ZZ");
  assert.deepEqual(changed, {
    ...draft,
    country_code: "ZZ",
    subdivision_code: "",
    subdivision_text: "",
    locality: "",
    postal_code: "",
  });
  assert.equal(draft.country_code, "XY");
  assert.equal(draft.subdivision_text, "Unlisted region");
});

test("coded and manual subdivision changes always clear the other representation", () => {
  const draft = createAddressDraft({ revision: 12, addresses: [saved] }, saved);
  const coded = changeAddressSubdivision(draft, "code", "XY-TEST");
  assert.equal(coded.subdivision_code, "XY-TEST");
  assert.equal(coded.subdivision_text, "");
  const manual = changeAddressSubdivision(coded, "text", "Missing region");
  assert.equal(manual.subdivision_code, "");
  assert.equal(manual.subdivision_text, "Missing region");
  assert.equal(manual.revision, 12);
  assert.equal(draft.subdivision_text, "Unlisted region");
});
