import type { IdentityState } from "../identity/types.ts";
import type { GeographyLookup } from "../geography/types.ts";
import { decodeAddressBook, validateAddressInput } from "./policy.ts";
import type { AddressPageState, AddressInput, AddressFormState } from "./types.ts";
export type AddressRpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export type VerifiedAddressIdentity = () => Promise<IdentityState>;
const unavailable = "Addresses are currently unavailable. Please try again.";

export async function mutateOwnAddressBook(
  form: FormData,
  identity: VerifiedAddressIdentity,
  mutate: (input: Extract<AddressInput, { valid: true }>) => Promise<AddressRpcResult>,
  lookup: GeographyLookup,
): Promise<AddressFormState> {
  const failed: AddressFormState = { status: "error", message: unavailable, book: null };
  try {
    const input = validateAddressInput(form, lookup);
    if (!input.valid)
      return {
        ...failed,
        message: "Check the address fields and country requirements, then try again.",
      };
    const actor = await identity();
    if (actor.status !== "active") return failed;
    if (actor.actor.userId !== input.expectedSubject)
      return {
        status: "conflict",
        message: "Your sign-in changed. Reload addresses before saving.",
        book: null,
      };
    const result = await mutate(input);
    if (result.error) {
      if (result.error.code === "P0001" && result.error.message === "address_conflict")
        return {
          status: "conflict",
          message: "This address book changed in another tab. Reload it before saving again.",
          book: null,
        };
      if (result.error.code === "P0001" && result.error.message === "address_limit")
        return { ...failed, message: "You can save up to 10 addresses. Edit or remove one first." };
      return failed;
    }
    const decoded = decodeAddressBook(result.data, lookup);
    if (!decoded.valid || decoded.book.revision !== input.revision + 1) return failed;
    if (input.operation === "delete")
      return decoded.book.addresses.some((row) => row.id === input.id)
        ? failed
        : { status: "success", message: "Address deleted.", book: decoded.book };
    if (
      !decoded.book.addresses.some(
        (row) =>
          (input.id === null || row.id === input.id) &&
          Object.entries(input.address).every(
            ([key, value]) => row[key as keyof typeof row] === value,
          ),
      )
    )
      return failed;
    return { status: "success", message: "Address saved.", book: decoded.book };
  } catch {
    return failed;
  }
}

export async function readOwnAddressBook(
  identity: VerifiedAddressIdentity,
  read: () => Promise<AddressRpcResult>,
  lookup: GeographyLookup,
): Promise<AddressPageState> {
  try {
    const actor = await identity();
    if (actor.status === "guest") return { status: "guest" };
    if (actor.status !== "active") return { status: "denied", message: unavailable };
    const result = await read();
    if (result.error) return { status: "denied", message: unavailable };
    const decoded = decodeAddressBook(result.data, lookup);
    return decoded.valid
      ? { status: "ready", book: decoded.book, subject: actor.actor.userId }
      : { status: "denied", message: unavailable };
  } catch {
    return { status: "denied", message: unavailable };
  }
}
