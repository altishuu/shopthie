import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { IdentityShell } from "@/modules/identity/components/identity-shell";
import { ProfileForm } from "@/modules/profiles/components/profile-form";
import { getOwnProfile } from "@/modules/profiles/server";
import "@/app/profiles.css";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

async function ProfileContent() {
  const state = await getOwnProfile();
  if (state.status === "guest") redirect("/login");
  return (
    <>
      <p className="eyebrow">Your account</p>
      <h1 id="identity-heading">Your profile.</h1>
      {state.status === "ready" ? (
        <>
          <p className="identity-description">
            {state.profile
              ? "Update your private account details."
              : "Choose a username to set up your profile."}{" "}
            For this controlled demo, use synthetic test details only.
          </p>
          <ProfileForm key={state.subject} profile={state.profile} subject={state.subject} />
          <p className="profile-help profile-privacy">
            Age information is not collected while privacy decisions are pending. Your role, email
            verification and account status cannot be changed here.
          </p>
        </>
      ) : (
        <p className="identity-description" role="alert">
          {state.message}
        </p>
      )}
      <Link className="identity-text-link" href="/account" prefetch={false}>
        Back to account
      </Link>
    </>
  );
}

export default function ProfilePage() {
  return (
    <IdentityShell>
      <Suspense
        fallback={
          <>
            <h1 id="identity-heading">Loading your profile.</h1>
            <p className="identity-description" role="status">
              Checking private profile access…
            </p>
          </>
        }
      >
        <ProfileContent />
      </Suspense>
    </IdentityShell>
  );
}
