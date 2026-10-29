import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/modules/identity/actions";
import { IdentityShell } from "@/modules/identity/components/identity-shell";
import { getCustomerLookupPageState } from "@/modules/customer-lookup/server";
import { CustomerLookupManager } from "@/modules/customer-lookup/components/customer-lookup-manager";
import { getCustomerStatusPageState } from "@/modules/customer-status/server";
import "@/app/staff.css";

export const metadata: Metadata = {
  title: "Customer lookup",
  robots: { index: false, follow: false },
};

async function CustomerLookupContent() {
  const state = await getCustomerLookupPageState();
  if (state.status === "guest") redirect("/login");
  if (state.status === "mfa_required") redirect("/account/security");
  const statusState =
    state.status === "ready" ? await getCustomerStatusPageState().catch(() => null) : null;
  const statusEnabled =
    state.status === "ready" &&
    statusState?.status === "ready" &&
    statusState.subject === state.subject;
  return (
    <>
      <p className="eyebrow">Staff access</p>
      <h1 id="identity-heading">Customer lookup.</h1>
      <p className="identity-description">
        Each submitted lookup is audited. Search only by exact username. Authorized staff may also
        check and change Customer application access. Private support fields, roles and MFA are not
        available here.
      </p>
      {state.status === "ready" ? (
        <CustomerLookupManager
          key={state.subject}
          subject={state.subject}
          statusEnabled={statusEnabled}
        />
      ) : (
        <p className="identity-description" role="alert">
          {state.message}
        </p>
      )}
      <nav className="identity-links" aria-label="Your staff session">
        <Link href="/admin" prefetch={false}>
          Staff entry
        </Link>
        <Link href="/account" prefetch={false}>
          Your account
        </Link>
        <Link href="/account/security" prefetch={false}>
          Account security
        </Link>
      </nav>
      <form className="identity-form" action={logoutAction}>
        <button className="identity-button" type="submit">
          Sign out
        </button>
      </form>
    </>
  );
}

export default function CustomerLookupPage() {
  return (
    <IdentityShell>
      <Suspense
        fallback={
          <>
            <h1 id="identity-heading">Checking lookup access.</h1>
            <p className="identity-description" role="status">
              Checking your session securely…
            </p>
          </>
        }
      >
        <CustomerLookupContent />
      </Suspense>
    </IdentityShell>
  );
}
