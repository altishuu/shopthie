import type { Metadata } from "next";
import Link from "next/link";
import { IdentityShell } from "@/modules/identity/components/identity-shell";

export const metadata: Metadata = { title: "Account creation" };

export default function SignupPage() {
  return (
    <IdentityShell>
      <p className="eyebrow">Not open yet</p>
      <h1 id="identity-heading">Account creation is not open.</h1>
      <p className="identity-description">
        Public signup is currently disabled. We are not collecting registration details or creating
        new accounts here.
      </p>
      <p className="identity-description">
        Already have a Shopthie account? You can sign in with your existing details.
      </p>
      <Link className="identity-button" href="/login">
        Back to sign in
      </Link>
    </IdentityShell>
  );
}
