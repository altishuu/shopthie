"use client";

import { useRef } from "react";
import { products } from "@/data/products";
import { useCommerce } from "@/providers/commerce-provider";
import { ProductCard } from "@/components/catalog/product-card";
import { EmptyState } from "@/components/ui/empty-state";

export function WishlistContents() {
  const { state, ready } = useCommerce();
  const heading = useRef<HTMLHeadingElement>(null);
  const saved = products.filter((product) => state.wishlist.includes(product.id));
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Good things can wait</p>
        <h1 ref={heading} tabIndex={-1}>
          Your wishlist.
        </h1>
        <p>A little collection of possibilities.</p>
      </header>
      {!ready ? (
        <p className="loading-state" role="status">
          Restoring your wishlist…
        </p>
      ) : saved.length ? (
        <>
          <p className="wishlist-count" role="status">
            {saved.length} saved {saved.length === 1 ? "product" : "products"}
          </p>
          <div className="product-grid">
            {saved.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onWishlistRemoved={() => {
                  const target = heading.current;
                  if (
                    !target?.isConnected ||
                    target.closest('[hidden], [inert], [aria-hidden="true"], dialog:not([open])') ||
                    !target.getClientRects().length ||
                    document.querySelector("dialog[open]")
                  )
                    return;
                  const visibility = getComputedStyle(target).visibility;
                  if (visibility !== "hidden" && visibility !== "collapse")
                    target.focus({ preventScroll: true });
                }}
              />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          title="Keep something in mind."
          description="Tap the heart on a product to save it here. Your wishlist stays in this browser."
        />
      )}
    </>
  );
}
