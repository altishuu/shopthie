import Image from "next/image";
import Link from "next/link";
import { products } from "@/data/products";
import { formatMoney } from "@/lib/money";
import type { Product } from "@/types/product";

/** Read-only server content remains useful while/if the interactive catalog cannot start. */
export function CatalogFallback({ category }: { category?: Product["category"] }) {
  const items = category ? products.filter((product) => product.category === category) : products;
  return (
    <section aria-label="Read-only catalog preview">
      <p className="option-note">
        Browse the documented demo models below. Interactive filters and shopping require
        JavaScript.
      </p>
      <div className="product-grid">
        {items.map((product) => (
          <article
            key={product.id}
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
                  src={product.images[0].src}
                  alt={product.images[0].alt}
                  fill
                  sizes="(max-width: 600px) 90vw, (max-width: 1100px) 44vw, 30vw"
                />
              </Link>
              <span className="product-brand">{product.brand}</span>
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
        ))}
      </div>
    </section>
  );
}
