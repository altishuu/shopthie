"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { products } from "@/data/products";
import { cartSubtotal } from "@/lib/cart";
import { formatMoney } from "@/lib/money";
import { useCommerce } from "@/providers/commerce-provider";
import { EmptyState } from "@/components/ui/empty-state";

export function CheckoutContents() {
  const { state, ready } = useCommerce();
  const [complete, setComplete] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (complete) heading.current?.focus({ preventScroll: true });
  }, [complete]);
  if (complete)
    return (
      <div className="demo-complete">
        <span className="success-mark" aria-hidden="true">
          <Check size={30} />
        </span>
        <p className="eyebrow">Just a demonstration</p>
        <h1 ref={heading} tabIndex={-1}>
          Demo complete.
        </h1>
        <p role="status">
          No order was placed. No payment or personal information was collected. Your demo bag is
          unchanged.
        </p>
        <Link className="pill-link" href="/shop">
          Keep exploring
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
    );
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">A preview, not a purchase</p>
        <h1>Checkout demonstration.</h1>
        <p>Your collection, one last look.</p>
      </header>
      {!ready ? (
        <p className="loading-state" role="status">
          Restoring your demo bag…
        </p>
      ) : !state.cart.length ? (
        <EmptyState
          title="Nothing to preview yet."
          description="Choose a product for your bag to explore the checkout demonstration. No purchase will be made."
        />
      ) : (
        <div className="checkout-layout">
          <section className="checkout-boundary" aria-labelledby="demo-boundary">
            <span className="demo-label">No real transaction</span>
            <h2 id="demo-boundary">
              The experience.
              <br />
              Without the transaction.
            </h2>
            <p>
              This screen previews your demo bag only. There are no payment fields, delivery forms,
              real orders, live tax calculations, or shipping promises.
            </p>
            <p>
              Completing the demonstration does not send an order, charge a card, or clear your bag.
            </p>
            <button className="pill-link accent" onClick={() => setComplete(true)}>
              Complete demo
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            <Link className="text-link" href="/cart">
              Return to your bag
            </Link>
          </section>
          <section className="checkout-summary" aria-labelledby="checkout-summary-title">
            <h2 id="checkout-summary-title">Your demo collection</h2>
            {state.cart.map((line) => {
              const product = products.find((item) => item.id === line.productId)!;
              const variant = product.variants.find((item) => item.id === line.variantId)!;
              const image = product.images[variant.imageIndex] || product.images[0];
              return (
                <article key={`${line.productId}:${line.variantId}`} className="checkout-item">
                  <Image src={image.src} alt={image.alt} width={80} height={80} />
                  <div>
                    <h3>{product.name}</h3>
                    <p>
                      {variant.label} · Qty {line.quantity}
                    </p>
                  </div>
                  <strong>{formatMoney(product.priceMinor * line.quantity)}</strong>
                </article>
              );
            })}
            <dl>
              <div className="subtotal-row">
                <dt>Demo subtotal</dt>
                <dd>{formatMoney(cartSubtotal(state.cart, products))}</dd>
              </div>
              <div>
                <dt>Delivery &amp; tax</dt>
                <dd>Not calculated</dd>
              </div>
            </dl>
            <p className="demo-notice">
              All values are simulated. This is not an invoice or an order confirmation.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
