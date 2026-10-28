import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IdentityShell } from "@/modules/identity/components/identity-shell";
import { getIdentity } from "@/modules/identity/server";
import { logoutAction } from "@/modules/identity/actions";
import type { IdentityState } from "@/modules/identity/types";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

const accessMessages = {
  unprovisioned:
    "Your sign-in is valid, but account access has not been provisioned. No account details are available.",
  unverified:
    "Your email address has not been confirmed. Account access remains unavailable until your email is verified.",
  suspended: "Access to this account is suspended. No private account details are available.",
  mfa_required:
    "Additional identity verification is required. That verification flow is not available here yet, so private account details remain protected.",
} as const;

async function AccountContent() {
  const identity: IdentityState = await getIdentity();
  if (identity.status === "guest") redirect("/login");

  return (
    <>
      <p className="eyebrow">Account access</p>
      {identity.status === "active" ? (
        <>
          <h1 id="identity-heading">Your account.</h1>
          <p className="identity-description">You are signed in to Shopthie.</p>
          <dl className="identity-details">
            <div>
              <dt>Verified email</dt>
              <dd>{identity.email}</dd>
            </div>
            <div>
              <dt>Current role</dt>
              <dd>{identity.actor.role}</dd>
            </div>
          </dl>
          <p className="identity-description">
            <Link className="identity-text-link" href="/account/profile" prefetch={false}>
              Edit your profile
            </Link>
            <br />
            Address management is not available yet.
          </p>
        </>
      ) : (
        <>
          <h1 id="identity-heading">
            {identity.status === "unavailable"
              ? "Account access is unavailable."
              : "Account access restricted."}
          </h1>
          <p className="identity-description">
            {identity.status === "unavailable" ? identity.message : accessMessages[identity.status]}
          </p>
        </>
      )}
      <form action={logoutAction}>
        <button className="identity-button" type="submit">
          Sign out
        </button>
      </form>
    </>
  );
}

export default function AccountPage() {
  return (
    <IdentityShell>
      <Suspense
        fallback={
          <>
            <h1 id="identity-heading">Checking account access.</h1>
            <p className="identity-description" role="status">
              Checking your session securely…
            </p>
          </>
        }
      >
        <AccountContent />
      </Suspense>
    </IdentityShell>
  );
}
