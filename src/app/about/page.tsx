import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { RouteMotionReady } from "@/components/motion/route-motion-ready";
import "./about.css";

export const metadata: Metadata = {
  title: "Our perspective",
  description: "Less noise. A more considered way to explore everyday technology.",
};

export default function AboutPage() {
  return (
    <main id="main" className="interior-page container about-page" tabIndex={-1}>
      <header className="page-heading about-editorial-heading">
        <p className="eyebrow">The Shopthie perspective</p>
        <h1>
          A place to
          <br />
          <span>look closer.</span>
        </h1>
        <div className="about-editorial-intro">
          <p>Not another endless wall of products. A little space for the things that matter.</p>
          <span className="demo-label">An independent design demonstration</span>
        </div>
      </header>

      <section className="about-editorial-spread" aria-labelledby="about-perspective">
        <figure className="about-editorial-figure">
          <div className="about-editorial-photo">
            <Image
              src="/images/products/hero-apple-airpods-max.jpg"
              alt="Apple AirPods Max resting on a black surface, with the ear cups reflected below"
              fill
              sizes="(max-width: 900px) 92vw, (max-width: 1600px) 51vw, 800px"
            />
          </div>
          <figcaption className="about-editorial-caption">
            <span>
              Apple AirPods Max
              <br />
              Photograph by SimonWaldherr · CC BY-SA 4.0
            </span>
            <a href="#credit-airpods-max-hero">Photograph credits</a>
          </figcaption>
        </figure>
        <div className="about-editorial-essay">
          <p className="eyebrow">Considered, not complicated</p>
          <h2 id="about-perspective">Technology should fit the life you live.</h2>
          <p>
            The album on the way home. The photograph you keep. The voice that makes an ordinary day
            feel different. These are the moments we have in mind when we think about everyday
            technology.
          </p>
          <p>
            Shopthie is a frontend exploration of a quieter kind of store: familiar names, clear
            choices, thoughtful photography, and space to decide at your own pace.
          </p>
          <Link className="pill-link about-editorial-cta" href="/shop">
            Explore the collection
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="about-editorial-principles" aria-label="The way we look at things">
        <div className="about-editorial-principles-intro">
          <p className="eyebrow">Our editorial approach</p>
          <h2>The way we look at things.</h2>
          <p>Not a verdict on what you need. A way to make room for a closer look.</p>
        </div>
        <ol className="about-editorial-principle-list">
          <li>
            <span className="about-editorial-index" aria-hidden="true">
              01
            </span>
            <div>
              <h3>Begin with the everyday.</h3>
              <p>
                A familiar song. A conversation. A moment worth keeping. Start with the part of your
                day you have in mind, rather than the longest list of features.
              </p>
            </div>
          </li>
          <li>
            <span className="about-editorial-index" aria-hidden="true">
              02
            </span>
            <div>
              <h3>Give the object room.</h3>
              <p>
                Let a photograph hold your attention. Notice a shape, a control, a detail you might
                otherwise pass by. An image offers a perspective, not the whole story.
              </p>
            </div>
          </li>
          <li>
            <span className="about-editorial-index" aria-hidden="true">
              03
            </span>
            <div>
              <h3>Leave space to decide.</h3>
              <p>
                Browse, compare, or set something aside. This edit is an invitation to explore, not
                a reason to hurry. Your own priorities belong at the centre of the decision.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="about-editorial-boundary" aria-labelledby="about-demo-boundary">
        <div>
          <p className="eyebrow">A note on this experience</p>
          <h2 id="about-demo-boundary">
            Real products.
            <br />
            An honest demonstration.
          </h2>
        </div>
        <div className="about-editorial-boundary-copy">
          <p className="about-editorial-boundary-lead">
            A store to explore. Not a place to purchase.
          </p>
          <p>
            The photographs depict real models, including older examples. All displayed prices and
            quantities are simulated. This site has no live inventory, payment processing, accounts,
            or manufacturer affiliation.
          </p>
          <p>
            Your bag and wishlist stay in your browser; no order is placed when you try the checkout
            demo. The editorial presentation is not evidence of materials, durability, or
            environmental impact.
          </p>
        </div>
      </section>
      <RouteMotionReady />
    </main>
  );
}
