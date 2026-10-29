import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { IdentityShell } from "@/modules/identity/components/identity-shell";
import { SecurityManager } from "@/modules/identity/mfa/components/security-manager";
import { getMfaPageState } from "@/modules/identity/mfa/server";
import { logoutAction } from "@/modules/identity/actions";
import "@/app/security.css";

export const metadata: Metadata = {
  title: "Account security",
  robots: { index: false, follow: false },
};

async function SecurityContent() {
  const state = await getMfaPageState();
  if (state.status === "guest") redirect("/login");
  return (
    <>
      <p className="eyebrow">Your account</p>
      <h1 id="identity-heading">Account security.</h1>
      {state.status === "ready" ? (
        <SecurityManager key={state.subject} initialContext={state} />
      ) : (
        <p className="identity-description" role="alert">
          {state.message}
        </p>
      )}
      <form action={logoutAction}>
        <button className="identity-button" type="submit">
          Sign out
        </button>
      </form>
      <Link className="identity-text-link" href="/account" prefetch={false}>
        Back to account
      </Link>
    </>
  );
}

export default function SecurityPage() {
  return (
    <IdentityShell>
      <Suspense
        fallback={
          <>
            <h1 id="identity-heading">Checking account security.</h1>
            <p className="identity-description" role="status">
              Checking private security access…
            </p>
          </>
        }
      >
        <SecurityContent />
      </Suspense>
    </IdentityShell>
  );
}
