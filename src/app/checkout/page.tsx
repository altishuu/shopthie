import type { Metadata } from "next";
import { CheckoutContents } from "@/components/cart/checkout-contents";

export const metadata: Metadata = { title: "Checkout demonstration" };
export default function CheckoutPage() {
  return (
    <main id="main" className="interior-page container" tabIndex={-1}>
      <CheckoutContents />
    </main>
  );
}
