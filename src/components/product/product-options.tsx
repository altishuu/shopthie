"use client";

import { useState } from "react";
import { ArrowRight, Heart } from "lucide-react";
import type { Product } from "@/types/product";
import { formatMoney } from "@/lib/money";
import { QuantityControl } from "@/components/ui/quantity-control";
import { useCommerce } from "@/providers/commerce-provider";

export function ProductOptions({ product }: { product: Product }) {
  const { state, ready, send, notify, addItem } = useCommerce();
  const [variantId, setVariantId] = useState(product.variants[0].id);
  const [quantity, setQuantity] = useState(1);
  const variant = product.variants.find((item) => item.id === variantId)!;
  const inBag =
    state.cart.find((line) => line.productId === product.id && line.variantId === variantId)
      ?.quantity || 0;
  const remaining = Math.max(0, variant.demoStock - inBag);
  const saved = state.wishlist.includes(product.id);

  return (
    <div className="product-options" aria-busy={!ready}>
      <p className="detail-price" data-unit-price={product.priceMinor}>
        {formatMoney(product.priceMinor)}
        <span>Demo price · {product.currency}</span>
      </p>
      <label className="field-label" htmlFor={`option-${product.id}`}>
        Choose your option
      </label>
      <select
        id={`option-${product.id}`}
        aria-label="Product option"
        value={variantId}
        onChange={(event) => {
          setVariantId(event.currentTarget.value);
          setQuantity(1);
        }}
      >
        {product.variants.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
            {item.demoStock === 0 ? " — unavailable in demo" : ""}
          </option>
        ))}
      </select>
      <p className="option-note">
        Options are limited to verified configurations. Photographs show the documented finish;
        storage does not change the exterior image.
      </p>
      <div className="purchase-row">
        <QuantityControl
          value={Math.min(quantity, remaining || 1)}
          max={remaining || 1}
          onChange={setQuantity}
          disabled={!ready || remaining === 0}
        />
        <button
          className="pill-link add-button"
          disabled={!ready || remaining === 0}
          onClick={() => addItem(product.id, variant.id, Math.min(quantity, remaining))}
        >
          {" "}
          {remaining === 0 ? "Demo limit reached" : "Add to bag"}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
      <button
        className="save-product"
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
        }}
      >
        <Heart size={17} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
        {saved ? "Saved to wishlist" : "Save for later"}
      </button>
      <p className="demo-stock">
        {ready ? `${remaining} remaining in this demo option` : "Restoring your saved bag…"}
      </p>
      <p className="demo-notice">
        Frontend demonstration. Prices and stock are simulated, including older models. No order or
        payment will be processed. Demo price is the same across the listed options.
      </p>
    </div>
  );
}
