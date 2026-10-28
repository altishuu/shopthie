"use client";

import { useActionState } from "react";
import { loginAction } from "@/modules/identity/actions";
import type { LoginState } from "@/modules/identity/types";

const initialState: LoginState = { status: "idle", message: "" };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const hasError = state.status === "error";

  return (
    <form
      className="identity-form"
      action={formAction}
      aria-label="Sign in"
      aria-busy={pending}
      aria-describedby={hasError ? "identity-login-error" : undefined}
    >
      {hasError && (
        <p className="identity-error" id="identity-login-error" role="alert">
          {state.message}
        </p>
      )}
      <fieldset disabled={pending}>
        <legend className="visually-hidden">Sign in details</legend>
        <div className="identity-field">
          <label htmlFor="identity-email">Email</label>
          <input
            id="identity-email"
            name="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>
        <div className="identity-field">
          <label htmlFor="identity-password">Password</label>
          <input
            id="identity-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <input name="next" type="hidden" value="/account" />
        <button className="identity-button" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </fieldset>
      <p className="identity-form-status" role="status">
        {pending ? "Signing in. Please wait." : ""}
      </p>
    </form>
  );
}
