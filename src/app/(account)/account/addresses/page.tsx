import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { IdentityShell } from "@/modules/identity/components/identity-shell";
import { AddressBookManager } from "@/modules/addresses/components/address-book-manager";
import { getOwnAddressBook } from "@/modules/addresses/server";
import { getCountries } from "@/modules/geography/catalog";
import "@/app/addresses.css";

export const metadata: Metadata = {
  title: "Your saved addresses",
  robots: { index: false, follow: false },
};

async function AddressesContent() {
  const state = await getOwnAddressBook();
  if (state.status === "guest") redirect("/login");
  return (
    <>
      <p className="eyebrow">Your account</p>
      <h1 id="identity-heading">Your addresses.</h1>
      {state.status === "ready" ? (
        <>
          <p className="identity-description">
            Your private saved addresses. For this controlled demo, use synthetic test details only.
          </p>
          <AddressBookManager
            key={state.subject}
            subject={state.subject}
            initialBook={state.book}
            countries={getCountries()}
          />
          <p className="address-help">
            Country and region choices are reference data, not address verification. Coverage may be
            incomplete. Saving an address does not confirm deliverability or shipping availability;
            demo checkout is not connected to these addresses.
          </p>
          <p className="address-help address-credits">
            Geography: <a href="https://www.geonames.org/">GeoNames</a> and{" "}
            <a href="https://github.com/google/libaddressinput">Google libaddressinput</a> ·{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Filtered reference
            data; not address verification.
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

export default function AddressesPage() {
  return (
    <IdentityShell>
      <Suspense
        fallback={
          <>
            <h1 id="identity-heading">Loading your addresses.</h1>
            <p className="identity-description" role="status">
              Checking private address access…
            </p>
          </>
        }
      >
        <AddressesContent />
      </Suspense>
    </IdentityShell>
  );
}
