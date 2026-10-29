"use server";
import { revalidatePath } from "next/cache";
import { createIdentityClient } from "@/platform/supabase/server";
import { getIdentity } from "@/modules/identity/server";
import { createStatusTransport } from "./adapter";
import { performCustomerStatus, readStatusPage } from "./service";
import type { CustomerStatusPageState, CustomerStatusResult } from "./types";

/** Current self-capability/subject only; no Customer read, audit or mutation. */
export async function checkCustomerStatusSessionAction(): Promise<CustomerStatusPageState> {
  try {
    return await readStatusPage(
      createStatusTransport(await createIdentityClient(true), getIdentity),
    );
  } catch {
    return {
      status: "unavailable",
      message: "Staff session could not be confirmed. Reload before continuing.",
    };
  }
}

export async function loadCustomerStatusAction(data: FormData): Promise<CustomerStatusResult> {
  try {
    return await performCustomerStatus(
      createStatusTransport(await createIdentityClient(true), getIdentity),
      data,
      false,
    );
  } catch {
    return {
      status: "error",
      message: "The access check could not be confirmed. Check current access before continuing.",
      record: null,
    };
  }
}
export async function changeCustomerStatusAction(data: FormData): Promise<CustomerStatusResult> {
  let result: CustomerStatusResult;
  try {
    result = await performCustomerStatus(
      createStatusTransport(await createIdentityClient(true), getIdentity),
      data,
      true,
    );
  } catch {
    result = {
      status: "error",
      message: "The access change could not be confirmed. Check current access before continuing.",
      record: null,
    };
  }
  // Also invalidate on uncertainty: an error may follow a committed mutation.
  revalidatePath("/account", "layout");
  revalidatePath("/admin", "layout");
  return result;
}
