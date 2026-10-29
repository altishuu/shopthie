"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { cookies } from "next/headers";
import { createIdentityClient } from "@/platform/supabase/server";
import { accountDestinationAfterLogin, validateLoginInput } from "./policy";
import { getIdentity } from "./server";
import { isIdentityCookieName } from "@/platform/supabase/client";
import type { LoginState } from "./types";

export async function loginAction(_previous: LoginState, data: FormData): Promise<LoginState> {
  const input = validateLoginInput(data);
  if (!input.valid)
    return { status: "error", message: "Enter a valid email address and password." };
  let destination = "/account";
  try {
    const client = await createIdentityClient(true);
    const result = await client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (result.error || !result.data.session || !result.data.user) {
      return {
        status: "error",
        message:
          result.error?.status === 429
            ? "Too many sign-in attempts. Please wait and try again."
            : "Sign-in failed. Check your details or try again later.",
      };
    }
    destination = accountDestinationAfterLogin(await getIdentity(), input.next);
  } catch {
    return {
      status: "error",
      message: "Sign-in is temporarily unavailable. Please try again later.",
    };
  }
  revalidatePath("/account", "layout");
  redirect(destination, RedirectType.replace);
}

export async function logoutAction(): Promise<void> {
  try {
    const client = await createIdentityClient(true);
    await client.auth.signOut({ scope: "local" });
  } catch {
    // Clear this app's local token cookies even when provider/session verification is unavailable.
  }
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (isIdentityCookieName(cookie.name)) store.delete(cookie.name);
  }
  revalidatePath("/account", "layout");
  redirect("/login", RedirectType.replace);
}
