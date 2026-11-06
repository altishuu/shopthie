import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { IdentityShell } from "@/modules/identity/components/identity-shell";
import { OwnerSetupManager } from "@/modules/owner-setup/components/owner-setup-manager";
import { getOwnerSetupPageState } from "@/modules/owner-setup/server";
import {
  checkOwnerSetupSessionAction,
  verifyOwnerSetupMfaAction,
  consentOwnerSetupAction,
} from "@/modules/owner-setup/actions";
import "@/app/owner-setup.css";

export const metadata: Metadata = {
  title: "Owner setup",
  robots: { index: false, follow: false },
};

async function OwnerSetupContent() {
  const state = await getOwnerSetupPageState();
  if (state.status === "guest") redirect("/login");
  return (
    <>
      <p className="eyebrow">Your account</p>
      <h1 id="identity-heading">Owner setup.</h1>
      <OwnerSetupManager
        key={state.status === "ready" ? `${state.subject}:${state.designation}` : state.status}
        initial={state.status === "ready" ? state : { status: "unavailable" }}
        checkAction={checkOwnerSetupSessionAction}
        verifyAction={verifyOwnerSetupMfaAction}
        consentAction={consentOwnerSetupAction}
      />
      <Link className="identity-text-link" href="/account" prefetch={false}>
        Back to account
      </Link>
    </>
  );
}

export default function OwnerSetupPage() {
  return (
    <IdentityShell>
      <Suspense
        fallback={
          <>
            <h1 id="identity-heading">Checking Owner setup.</h1>
            <p className="identity-description" role="status">
              Checking current self access…
            </p>
          </>
        }
      >
        <OwnerSetupContent />
      </Suspense>
    </IdentityShell>
  );
}
