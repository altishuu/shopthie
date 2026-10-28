import type { Metadata } from "next";
import { Catalog } from "@/components/catalog/catalog";

export const metadata: Metadata = {
  title: "The collection",
  description:
    "Explore Shopthie’s considered edit of headphones, earbuds, smartphones, and speakers. Frontend demonstration with simulated prices.",
};

export default function ShopPage() {
  return (
    <main id="main" className="interior-page container" tabIndex={-1}>
      <header className="page-heading">
        <p className="eyebrow">The Shopthie collection</p>
        <h1>The considered edit.</h1>
        <div className="page-heading-bottom">
          <p>
            Good technology. A little less noise.
            <br />
            Find the things that fit your everyday.
          </p>
          <span className="demo-label">Demo catalog · Prices &amp; stock simulated</span>
        </div>
      </header>
      <Catalog />
    </main>
  );
}
