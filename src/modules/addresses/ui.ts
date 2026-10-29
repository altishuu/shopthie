import type { AddressBook, SavedAddress } from "./types.ts";

export interface AddressDraft {
  id: string;
  revision: number;
  label: string;
  recipient: string;
  line1: string;
  line2: string;
  country_code: string;
  subdivision_code: string;
  subdivision_text: string;
  locality: string;
  postal_code: string;
  is_default: boolean;
}

export function changeAddressSubdivision(
  draft: AddressDraft,
  mode: "code" | "text",
  value: string,
): AddressDraft {
  return {
    ...draft,
    subdivision_code: mode === "code" ? value : "",
    subdivision_text: mode === "text" ? value : "",
  };
}

export function changeAddressCountry(draft: AddressDraft, country: string): AddressDraft {
  return {
    ...draft,
    country_code: country,
    subdivision_code: "",
    subdivision_text: "",
    locality: "",
    postal_code: "",
  };
}

export function createAddressDraft(book: AddressBook, address?: SavedAddress): AddressDraft {
  return {
    id: address?.id ?? "",
    revision: book.revision,
    label: address?.label ?? "",
    recipient: address?.recipient ?? "",
    line1: address?.line1 ?? "",
    line2: address?.line2 ?? "",
    country_code: address?.country_code ?? "",
    subdivision_code: address?.subdivision_code ?? "",
    subdivision_text: address?.subdivision_text ?? "",
    locality: address?.locality ?? "",
    postal_code: address?.postal_code ?? "",
    is_default: address?.is_default ?? book.addresses.length === 0,
  };
}
