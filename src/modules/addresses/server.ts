import "server-only";
import { getIdentity } from "@/modules/identity/server";
import { createIdentityClient } from "@/platform/supabase/server";
import { getCountry } from "@/modules/geography/catalog";
import { readOwnAddressBook } from "./service";

export async function getOwnAddressBook() {
  return readOwnAddressBook(
    getIdentity,
    async () => {
      const client = await createIdentityClient();
      return client.rpc("shopthie_addresses_read");
    },
    getCountry,
  );
}
