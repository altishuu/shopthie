export type AddressFields = {
  label: string | null;
  recipient: string;
  line1: string;
  line2: string | null;
  country_code: string;
  subdivision_code: string | null;
  subdivision_text: string | null;
  locality: string | null;
  postal_code: string | null;
  is_default: boolean;
};
export type SavedAddress = AddressFields & { id: string };
export type AddressBook = { revision: number; addresses: SavedAddress[] };
export type AddressInput =
  | { valid: false }
  | {
      valid: true;
      operation: "save";
      id: string | null;
      revision: number;
      expectedSubject: string;
      address: AddressFields;
    }
  | { valid: true; operation: "delete"; id: string; revision: number; expectedSubject: string };
export type AddressPageState =
  | { status: "ready"; book: AddressBook; subject: string }
  | { status: "guest" }
  | { status: "denied"; message: string };
export type AddressFormState = {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  book: AddressBook | null;
};
