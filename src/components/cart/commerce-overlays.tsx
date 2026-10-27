"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { products } from "@/data/products";
import { useCommerce } from "@/providers/commerce-provider";
import { Dialog } from "@/components/ui/dialog";
import { CartContents } from "@/components/cart/cart-contents";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductOptions } from "@/components/product/product-options";

export function CommerceOverlays() {
  const { overlay, closeOverlay } = useCommerce();
  if (!overlay) return null;
  if (overlay.type === "cart")
    return (
      <Dialog key="cart" title="Your bag" onClose={closeOverlay} drawer>
        <CartContents drawer />
      </Dialog>
    );
  const product = products.find((item) => item.id === overlay.productId);
  if (!product) return null;
  return (
    <Dialog key={`quick-${product.id}`} title="Quick view" onClose={closeOverlay}>
      <div className="quick-view-grid">
        <ProductGallery product={product} onCreditNavigate={closeOverlay} />
        <div>
          <p className="eyebrow">{product.brand}</p>
          <h3 className="quick-title">{product.name}</h3>
          <p className="product-description">{product.description}</p>
          <ProductOptions product={product} />
          <Link className="text-link" href={`/products/${product.slug}`} onClick={closeOverlay}>
            View full product details
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Dialog>
  );
}
