import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/modules/identity/actions";
import { IdentityShell } from "@/modules/identity/components/identity-shell";
import { getAuditViewPageState } from "@/modules/audit-view/server";
import { AuditHistoryManager } from "@/modules/audit-view/components/audit-history-manager";
import "@/app/audit.css";

export const metadata: Metadata = {
  title: "Operational audit history",
  robots: { index: false, follow: false },
};

async function AuditContent() {
  const state = await getAuditViewPageState();
  if (state.status === "guest") redirect("/login");
  if (state.status === "mfa_required") redirect("/account/security");
  return (
    <>
      <p className="eyebrow">Staff access</p>
      <h1 id="identity-heading">Operational audit history.</h1>
      <p className="identity-description">
        Supported Customer lookup and application-access operations only. This is not a complete
        security or compliance log. Events are loaded only when you ask, in pages of up to 20.
      </p>
      {state.status === "ready" ? (
        <AuditHistoryManager
          key={`${state.subject}:${state.scope}`}
          subject={state.subject}
          scope={state.scope}
        />
      ) : (
        <p className="identity-description" role="alert">
          Audit history is unavailable for your current session. Check your account security or
          return to staff entry.
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

export default function AuditPage() {
  return (
    <IdentityShell>
      <Suspense
        fallback={
          <>
            <h1 id="identity-heading">Checking audit access.</h1>
            <p className="identity-description" role="status">
              Checking your session securely…
            </p>
          </>
        }
      >
        <AuditContent />
      </Suspense>
    </IdentityShell>
  );
}
