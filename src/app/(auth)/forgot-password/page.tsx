import type { Metadata } from "next";
import Link from "next/link";
import { IdentityShell } from "@/modules/identity/components/identity-shell";

export const metadata: Metadata = { title: "Password recovery" };

export default function ForgotPasswordPage() {
  return (
    <IdentityShell>
      <p className="eyebrow">Not available yet</p>
      <h1 id="identity-heading">Password recovery is not available yet.</h1>
      <p className="identity-description">
        Recovery email delivery is not enabled. This page cannot send a reset link or change your
        password.
      </p>
      <p className="identity-description">
        We are not collecting your email address here. If you remember your password, return to sign
        in.
      </p>
      <Link className="identity-button" href="/login">
        Back to sign in
      </Link>
    </IdentityShell>
  );
}
