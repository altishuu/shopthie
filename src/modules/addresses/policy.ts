import type { GeographyLookup } from "../geography/types.ts";
import type { AddressBook, AddressFields, AddressInput, SavedAddress } from "./types.ts";

const editableKeys = [
  "label",
  "recipient",
  "line1",
  "line2",
  "country_code",
  "subdivision_code",
  "subdivision_text",
  "locality",
  "postal_code",
  "is_default",
];
const controls = ["operation", "id", "revision", "expected_subject"];
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const optionalKeys = new Set([
  "label",
  "line2",
  "subdivision_code",
  "subdivision_text",
  "locality",
  "postal_code",
]);
const limits = {
  label: 40,
  recipient: 100,
  line1: 180,
  line2: 180,
  subdivision_text: 100,
  locality: 100,
  postal_code: 32,
};

function decodeFields(
  fields: Record<string, unknown>,
  lookup: GeographyLookup,
): AddressFields | null {
  if (
    Object.keys(fields).length !== editableKeys.length ||
    editableKeys.some((key) => !Object.hasOwn(fields, key))
  )
    return null;
  if (typeof fields.country_code !== "string" || typeof fields.is_default !== "boolean")
    return null;
  const country = lookup(fields.country_code);
  if (!country) return null;
  for (const [key, max] of Object.entries(limits)) {
    const value = fields[key];
    if (value === null && optionalKeys.has(key)) continue;
    if (
      typeof value !== "string" ||
      value === "" ||
      value !== value.trim() ||
      /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value) ||
      [...value].length > max
    )
      return null;
  }
  const code = fields.subdivision_code;
  if (
    code !== null &&
    (typeof code !== "string" || !country.subdivisions.some((s) => s.code === code))
  )
    return null;
  if (code && fields.subdivision_text) return null;
  if (country.requireSubdivision && !code && !fields.subdivision_text) return null;
  if (country.requireLocality && !fields.locality) return null;
  if (country.requirePostal && !fields.postal_code) return null;
  return fields as AddressFields;
}

export function validateAddressInput(form: FormData, lookup: GeographyLookup): AddressInput {
  const operation = form.get("operation");
  if (operation !== "save" && operation !== "delete") return { valid: false };
  const keys = operation === "delete" ? controls : [...controls, ...editableKeys];
  const allowed = new Set(keys);
  for (const key of form.keys())
    if (!allowed.has(key) && !key.startsWith("$ACTION_")) return { valid: false };
  if (keys.some((key) => form.getAll(key).length !== 1)) return { valid: false };
  const values: Record<string, string> = {};
  for (const key of keys) {
    const v = form.get(key);
    if (typeof v !== "string") return { valid: false };
    values[key] = v;
  }
  if (!uuid(values.expected_subject) || (values.id !== "" && !uuid(values.id)))
    return { valid: false };
  if (
    values.revision !== values.revision.trim() ||
    !/^(0|[1-9][0-9]{0,9})$/.test(values.revision) ||
    Number(values.revision) >= 2147483647
  )
    return { valid: false };
  const common = { revision: Number(values.revision), expectedSubject: values.expected_subject };
  if (operation === "delete")
    return values.id && common.revision > 0
      ? { valid: true, operation: "delete", id: values.id, ...common }
      : { valid: false };
  if (values.is_default !== "true" && values.is_default !== "false") return { valid: false };
  const fields: Record<string, unknown> = {};
  for (const key of editableKeys)
    fields[key] =
      key === "is_default"
        ? values[key] === "true"
        : optionalKeys.has(key) && values[key] === ""
          ? null
          : values[key];
  const address = decodeFields(fields, lookup);
  return address
    ? { valid: true, operation: "save", id: values.id || null, address, ...common }
    : { valid: false };
}

export function decodeAddressBook(
  value: unknown,
  lookup: GeographyLookup,
): { valid: true; book: AddressBook } | { valid: false } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false };
  const book = value as Record<string, unknown>;
  if (
    Object.keys(book).length !== 2 ||
    !Object.hasOwn(book, "revision") ||
    !Object.hasOwn(book, "addresses") ||
    typeof book.revision !== "number" ||
    !Number.isInteger(book.revision) ||
    book.revision < 0 ||
    book.revision > 2147483647 ||
    !Array.isArray(book.addresses) ||
    book.addresses.length > 10 ||
    (book.revision === 0 && book.addresses.length > 0)
  )
    return { valid: false };
  const ids = new Set<string>();
  const addresses: SavedAddress[] = [];
  let defaults = 0;
  for (const entry of book.addresses) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return { valid: false };
    const { id, ...fields } = entry as Record<string, unknown>;
    if (!uuid(id) || ids.has(id)) return { valid: false };
    ids.add(id);
    const address = decodeFields(fields, lookup);
    if (!address) return { valid: false };
    if (address.is_default && ++defaults > 1) return { valid: false };
    addresses.push({ id, ...address });
  }
  return { valid: true, book: { revision: book.revision, addresses } };
}
