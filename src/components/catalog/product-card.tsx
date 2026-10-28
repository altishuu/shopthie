"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Heart } from "lucide-react";
import type { Product } from "@/types/product";
import { formatMoney } from "@/lib/money";
import { useCommerce } from "@/providers/commerce-provider";
import { useMotionReady } from "@/providers/motion-ready";

export function ProductCard({
  product,
  onWishlistRemoved,
}: {
  product: Product;
  onWishlistRemoved?: () => void;
}) {
  const { state, ready: storeReady, send, notify, openQuickView } = useCommerce();
  const motionReady = useMotionReady();
  const ready = storeReady && motionReady;
  const saved = state.wishlist.includes(product.id);
  const image = product.images[0];
  return (
    <article
      className={`product-card ${product.category === "headphones" && product.brand === "Apple" ? "product-card-dark" : ""}`}
      data-product-card={product.slug}
    >
      <div className="product-card-visual">
        <Link
          href={`/products/${product.slug}`}
          className="product-image-link"
          aria-label={`View ${product.name}`}
        >
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes="(max-width: 600px) 90vw, (max-width: 1100px) 44vw, 30vw"
          />
        </Link>
        <span className="product-brand">{product.brand}</span>
        <button
          className="icon-button wishlist-toggle"
          disabled={!ready}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name}`}
          onClick={() => {
            send({ type: "wishlist", productId: product.id });
            notify(
              saved
                ? `${product.name} removed from your wishlist.`
                : `${product.name} saved to your wishlist.`,
            );
            if (saved) onWishlistRemoved?.();
          }}
        >
          <Heart size={18} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
        </button>
        <button
          className="quick-view-button"
          disabled={!ready}
          onClick={() => openQuickView(product.id)}
          aria-label={`Quick view ${product.name}`}
        >
          Quick view <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="product-card-meta">
        <div>
          <p className="product-category">{product.category}</p>
          <h2>
            <Link href={`/products/${product.slug}`}>{product.name}</Link>
          </h2>
        </div>
        <div className="product-price" data-price-minor={product.priceMinor}>
          {formatMoney(product.priceMinor)}
          <span>Demo price</span>
        </div>
      </div>
    </article>
  );
}
