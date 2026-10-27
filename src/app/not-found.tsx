import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <main id="main" className="interior-page container" tabIndex={-1}>
      <div className="not-found-state">
        <p className="eyebrow">404 / Not in this collection</p>
        <h1>
          Nothing here.
          <br />
          <span>Plenty to discover.</span>
        </h1>
        <p>
          That product, collection, or page isn’t part of the Shopthie edit. Let’s find something
          else.
        </p>
        <Link href="/shop" className="pill-link">
          Explore the collection
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </main>
  );
}
