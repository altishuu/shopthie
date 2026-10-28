"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Trash2 } from "lucide-react";
import { products } from "@/data/products";
import { cartCount, cartSubtotal, type CartLine } from "@/lib/cart";
import { formatMoney } from "@/lib/money";
import { useCommerce } from "@/providers/commerce-provider";
import { QuantityControl } from "@/components/ui/quantity-control";
import { EmptyState } from "@/components/ui/empty-state";

function CartLineRow({ line }: { line: CartLine }) {
  const { send, closeOverlay } = useCommerce();
  const product = products.find((item) => item.id === line.productId);
  const variant = product?.variants.find((item) => item.id === line.variantId);
  if (!product || !variant) return null;
  const image = product.images[variant.imageIndex] || product.images[0];
  return (
    <article
      className="cart-line"
      data-cart-line={`${product.id}:${variant.id}`}
      aria-label={`${product.name}, ${variant.label}`}
    >
      <Link className="cart-line-image" href={`/products/${product.slug}`} onClick={closeOverlay}>
        <Image src={image.src} alt={image.alt} fill sizes="100px" />
      </Link>
      <div className="cart-line-info">
        <p className="product-category">{product.brand}</p>
        <h3>
          <Link href={`/products/${product.slug}`} onClick={closeOverlay}>
            {product.name}
          </Link>
        </h3>
        <p className="cart-variant">{variant.label}</p>
        <QuantityControl
          label={`Quantity for ${product.name} (${variant.label})`}
          value={line.quantity}
          max={variant.demoStock}
          onStep={(delta) =>
            send({ type: "step-quantity", productId: product.id, variantId: variant.id, delta })
          }
          onChange={(quantity) =>
            send({ type: "quantity", productId: product.id, variantId: variant.id, quantity })
          }
        />
      </div>
      <div className="cart-line-end">
        <strong>{formatMoney(product.priceMinor * line.quantity)}</strong>
        <button
          className="icon-button"
          aria-label={`Remove ${product.name} (${variant.label}) from bag`}
          onClick={(event) => {
            const focusBeforeRemove = document.activeElement;
            const dialog = event.currentTarget.closest("dialog");
            const heading = dialog
              ? dialog.querySelector<HTMLElement>("h2")
              : event.currentTarget
                  .closest("main")
                  ?.querySelector<HTMLElement>("[data-bag-heading]");
            send({ type: "remove", productId: product.id, variantId: variant.id }, ({ state }) => {
              // Repair lost focus, but never override a newer keyboard choice.
              const focused = document.activeElement;
              if (focused && focused !== document.body && focused !== focusBeforeRemove) return;
              // A duplicate queued remove is a no-op, but its latest completion
              // still repairs focus once the intended row has disappeared.
              if (
                state.cart.some(
                  (item) => item.productId === product.id && item.variantId === variant.id,
                )
              )
                return;
              if (
                !heading?.isConnected ||
                heading.closest('[hidden], [inert], [aria-hidden="true"], dialog:not([open])') ||
                !heading.getClientRects().length ||
                document.querySelector("dialog[open]") !== dialog
              )
                return;
              const visibility = getComputedStyle(heading).visibility;
              if (visibility !== "hidden" && visibility !== "collapse")
                heading.focus({ preventScroll: true });
            });
          }}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export function CartContents({ drawer = false }: { drawer?: boolean }) {
  const { state, ready, closeOverlay } = useCommerce();
  if (!ready)
    return (
      <p className="loading-state" role="status">
        Restoring your saved bag…
      </p>
    );
  if (!state.cart.length)
    return (
      <EmptyState
        title="A little room for something good."
        description="Your bag is empty. Take your time and find what fits your everyday."
        onNavigate={closeOverlay}
      />
    );
  const subtotal = cartSubtotal(state.cart, products);
  return (
    <div className={drawer ? "drawer-cart" : "cart-page-layout"}>
      <div className="cart-items">
        <p className="cart-item-count" role="status">
          {cartCount(state.cart)} {cartCount(state.cart) === 1 ? "item" : "items"} in your demo bag
        </p>
        {state.cart.map((line) => (
          <CartLineRow key={`${line.productId}:${line.variantId}`} line={line} />
        ))}
      </div>
      <section className="bag-summary" aria-label="Bag summary">
        <p className="eyebrow">A closer look</p>
        <dl>
          <div className="subtotal-row">
            <dt>Subtotal</dt>
            <dd data-cart-subtotal={subtotal} aria-live="polite">
              {formatMoney(subtotal)}
            </dd>
          </div>
          <div>
            <dt>Delivery &amp; tax</dt>
            <dd>Not calculated in this demo</dd>
          </div>
        </dl>
        <p className="demo-notice">
          Simulated prices and stock. No purchase, payment, or real order will be submitted.
        </p>
        {drawer && (
          <Link className="pill-link" href="/cart" onClick={closeOverlay}>
            View your bag
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
        <Link
          className={`pill-link ${drawer ? "secondary-button" : "accent"}`}
          href="/checkout"
          onClick={closeOverlay}
        >
          Continue to demo checkout
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <Link className="text-link" href="/shop" onClick={closeOverlay}>
          Keep exploring
        </Link>
      </section>
    </div>
  );
}
