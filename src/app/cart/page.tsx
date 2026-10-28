import type { Metadata } from "next";
import { RouteMotionReady } from "@/components/motion/route-motion-ready";
import { CartContents } from "@/components/cart/cart-contents";

export const metadata: Metadata = { title: "Your bag" };
export default function CartPage() {
  return (
    <main id="main" className="interior-page container" tabIndex={-1}>
      <header className="page-heading">
        <p className="eyebrow">Your considered collection</p>
        <h1 data-bag-heading tabIndex={-1}>
          Your bag.
        </h1>
        <p>Good things, all in one place.</p>
      </header>
      <CartContents />
      <RouteMotionReady />
    </main>
  );
}
