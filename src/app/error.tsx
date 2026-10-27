"use client";

import Link from "next/link";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="interior-page container">
      <div className="empty-state">
        <h1 className="product-title">A brief interruption.</h1>
        <p>The page couldn’t finish loading. Your saved bag should still be in this browser.</p>
        <button className="pill-link" onClick={reset}>
          Try again
        </button>
        <Link className="text-link" href="/shop">
          Return to the collection
        </Link>
      </div>
    </main>
  );
}
