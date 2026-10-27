import type { Metadata } from "next";
import { WishlistContents } from "@/components/catalog/wishlist-contents";

export const metadata: Metadata = { title: "Your wishlist" };
export default function WishlistPage() {
  return (
    <main id="main" className="interior-page container" tabIndex={-1}>
      <WishlistContents />
    </main>
  );
}
