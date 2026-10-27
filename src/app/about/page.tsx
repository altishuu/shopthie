import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Our perspective",
  description: "Less noise. A more considered way to explore everyday technology.",
};
export default function AboutPage() {
  return (
    <main id="main" className="interior-page container about-page" tabIndex={-1}>
      <header className="page-heading">
        <p className="eyebrow">The Shopthie perspective</p>
        <h1>
          A place to
          <br />
          <span>look closer.</span>
        </h1>
        <div className="page-heading-bottom">
          <p>
            Not another endless wall of products.
            <br />A little space for the things that matter.
          </p>
          <span className="demo-label">An independent design demonstration</span>
        </div>
      </header>
      <div className="about-editorial-image">
        <Image
          src="/images/products/hero-apple-airpods-max.jpg"
          alt="Apple AirPods Max photographed on a dark reflective surface"
          fill
          sizes="90vw"
        />
        <a href="#credit-airpods-max-hero">Photograph credits</a>
      </div>
      <section className="philosophy" aria-labelledby="about-philosophy">
        <p className="eyebrow">Considered, not complicated</p>
        <div>
          <h2 id="about-philosophy">
            Technology should fit
            <br />
            the life you live.
          </h2>
          <p>
            The album on the way home. The photograph you keep. The voice that makes an ordinary day
            feel different. These are the moments we have in mind when we think about everyday
            technology.
          </p>
          <p>
            Shopthie is a frontend exploration of a quieter kind of store: familiar names, clear
            choices, thoughtful photography, and space to decide at your own pace.
          </p>
          <Link className="pill-link" href="/shop">
            Explore the collection
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <section className="about-boundary">
        <p className="eyebrow">A note on this experience</p>
        <h2>
          Real products.
          <br />
          An honest demonstration.
        </h2>
        <p>
          The photographs depict real models, including older examples. All displayed prices and
          quantities are simulated. This site has no live inventory, payment processing, accounts,
          or manufacturer affiliation. Your bag and wishlist stay in your browser; no order is
          placed when you try the checkout demo.
        </p>
      </section>
    </main>
  );
}
