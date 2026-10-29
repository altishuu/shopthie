import "server-only";
import { createIdentityClient } from "@/platform/supabase/server";
import { getIdentity } from "@/modules/identity/server";
import { readStaffEntry } from "./service";
import type { StaffPageState } from "./types";

export async function getStaffPageState(): Promise<StaffPageState> {
  return readStaffEntry({
    identity: getIdentity,
    read: async () => {
      const client = await createIdentityClient();
      const result = await client.rpc("shopthie_staff_entry");
      if (result.error) throw new Error("Staff entry is temporarily unavailable.");
      return result.data;
    },
  });
}
