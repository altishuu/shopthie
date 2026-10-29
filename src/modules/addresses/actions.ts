"use server";

import { revalidatePath } from "next/cache";
import { getIdentity } from "@/modules/identity/server";
import { createIdentityClient } from "@/platform/supabase/server";
import { getCountry } from "@/modules/geography/catalog";
import { mutateOwnAddressBook } from "./service";
import type { AddressFormState } from "./types";

export async function mutateAddressAction(
  _previous: AddressFormState,
  data: FormData,
): Promise<AddressFormState> {
  const result = await mutateOwnAddressBook(
    data,
    getIdentity,
    async (input) => {
      const client = await createIdentityClient();
      if (input.operation === "delete") {
        return client.rpc("shopthie_address_delete", {
          p_id: input.id,
          p_revision: input.revision,
        });
      }
      return client.rpc("shopthie_address_save", {
        p_id: input.id,
        p_address: input.address,
        p_revision: input.revision,
      });
    },
    getCountry,
  );
  if (result.status === "success") revalidatePath("/account/addresses");
  return result;
}
