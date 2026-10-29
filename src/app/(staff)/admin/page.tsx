import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { logoutAction } from "@/modules/identity/actions";
import { redirect } from "next/navigation";
import { IdentityShell } from "@/modules/identity/components/identity-shell";
import { getStaffPageState } from "@/modules/staff/server";
import type { StaffPageState } from "@/modules/staff/types";
import { getCustomerLookupPageState } from "@/modules/customer-lookup/server";

export const metadata: Metadata = {
  title: "Staff entry",
  robots: { index: false, follow: false },
};

async function StaffContent() {
  const state: StaffPageState = await getStaffPageState();
  if (state.status === "guest") redirect("/login");
  if (state.status === "mfa_required") redirect("/account/security");
  const lookupReady =
    state.status === "ready" && (await getCustomerLookupPageState()).status === "ready";
  return (
    <>
      <p className="eyebrow">Staff access</p>
      <h1 id="identity-heading">Staff entry.</h1>
      {state.status === "ready" ? (
        <>
          <p className="identity-description">Your staff session and authenticator are verified.</p>
          <dl className="identity-details">
            <div>
              <dt>Current role</dt>
              <dd>{state.entry.role}</dd>
            </div>
          </dl>
          <p className="identity-description">
            Customer lookup is available only when enabled for your current session. Account
            management and private support are not available.
          </p>
          {lookupReady && (
            <nav className="identity-links" aria-label="Available staff tools">
              <Link href="/admin/customers" prefetch={false}>
                Customer lookup
              </Link>
            </nav>
          )}
        </>
      ) : (
        <p className="identity-description" role="alert">
          {state.message}
        </p>
      )}
      <nav className="identity-links" aria-label="Your staff session">
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

export default function StaffPage() {
  return (
    <IdentityShell>
      <Suspense
        fallback={
          <>
            <h1 id="identity-heading">Checking staff access.</h1>
            <p className="identity-description" role="status">
              Checking your session securely…
            </p>
          </>
        }
      >
        <StaffContent />
      </Suspense>
    </IdentityShell>
  );
}
