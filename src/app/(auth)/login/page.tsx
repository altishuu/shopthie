import type { Metadata } from "next";
import Link from "next/link";
import { IdentityShell } from "@/modules/identity/components/identity-shell";
import { LoginForm } from "@/modules/identity/components/login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <IdentityShell>
      <p className="eyebrow">Account access</p>
      <h1 id="identity-heading">Welcome back.</h1>
      <p className="identity-description">Sign in with your existing Shopthie account.</p>
      <LoginForm />
      <nav className="identity-links" aria-label="Account help">
        <Link href="/forgot-password">Forgot password?</Link>
        <Link href="/signup">Create an account</Link>
      </nav>
    </IdentityShell>
  );
}
