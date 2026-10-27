import Link from "next/link";
import { assetCredits } from "@/data/asset-credits";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <Link href="/" className="wordmark" aria-label="Shopthie home">
            shopthie<span aria-hidden="true">.</span>
          </Link>
          <nav className="footer-links" aria-label="Footer navigation">
            <Link href="/shop">Shop</Link>
            <Link href="/about">Our perspective</Link>
            <Link href="/wishlist">Wishlist</Link>
            <Link href="/cart">Your bag</Link>
          </nav>
          <p>
            Technology, thoughtfully chosen.
            <br />
            An independent frontend demonstration. No manufacturer affiliation or authorized
            reseller status is claimed.
          </p>
        </div>
        <details id="credits" className="credits">
          <summary>Photography &amp; font credits</summary>
          <p>
            Photographs retain their stated licenses. Images have been resized/re-encoded, and
            responsive layouts may crop their display.
          </p>
          <ul>
            {assetCredits.map((asset) => (
              <li key={asset.id} id={`credit-${asset.id}`}>
                <a href={asset.source}>{asset.title}</a> —{" "}
                {asset.requiredAttribution || asset.author}.{" "}
                <a href={asset.licenseUrl}>{asset.license}</a>. {asset.changes}{" "}
                <a href={asset.src}>Local source JPEG</a>.
              </li>
            ))}
          </ul>
          <p>
            Manrope and DM Sans are self-hosted from Fontsource.{" "}
            <a href="/fonts/manrope-LICENSE.txt">Manrope license</a> ·{" "}
            <a href="/fonts/dm-sans-LICENSE.txt">DM Sans license</a>.
          </p>
        </details>
        <div className="footer-bottom">
          <span>© Shopthie. A considered collection.</span>
          <span>
            Demo prices and stock. No purchases, payments, or accounts.{" "}
            <a href="#credits">Image and font credits</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
