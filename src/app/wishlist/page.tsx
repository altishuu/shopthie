import type { Metadata } from "next";
import { RouteMotionReady } from "@/components/motion/route-motion-ready";
import { WishlistContents } from "@/components/catalog/wishlist-contents";

export const metadata: Metadata = { title: "Your wishlist" };
export default function WishlistPage() {
  return (
    <main id="main" className="interior-page container" tabIndex={-1}>
      <WishlistContents />
      <RouteMotionReady heading={false} />
    </main>
  );
}
