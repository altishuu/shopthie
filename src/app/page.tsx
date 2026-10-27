import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";

const categories = [
  {
    title: "Headphones",
    slug: "headphones",
    model: "Apple AirPods Max",
    src: "/images/products/apple-airpods-max-detail.jpg",
    alt: "A close photograph of Apple AirPods Max on a dark surface",
    credit: "airpods-max-detail",
    note: "The over-ear chapter. A photographic study of the AirPods Max; no connector version or generation is inferred.",
    className: "dark-photo",
  },
  {
    title: "Earbuds",
    slug: "earbuds",
    model: "Apple AirPods Pro · 2nd generation",
    src: "/images/products/apple-airpods-pro-2nd-gen.jpg",
    alt: "Apple AirPods Pro second-generation earbuds beside their charging case",
    credit: "airpods-pro",
    note: "A smaller way to bring your listening along. This selection depicts the second-generation AirPods Pro; charging connector version is not specified.",
    className: "",
  },
  {
    title: "Smartphones",
    slug: "smartphones",
    model: "Google Pixel 8 · Rose",
    src: "/images/products/google-pixel-8-rose.jpg",
    alt: "The Rose Google Pixel 8 photographed from the rear at an angle",
    credit: "pixel-8",
    note: "An everyday object, seen from another angle. The photograph shows the Pixel 8 in Rose; storage options are documented on the product page.",
    className: "",
  },
  {
    title: "Speakers",
    slug: "speakers",
    model: "JBL Flip 3",
    src: "/images/products/jbl-flip-3.jpg",
    alt: "A teal JBL Flip 3 speaker with a carrying cord, resting on wood",
    credit: "jbl-flip-3",
    note: "Sound beyond the headphones. The photographed Flip 3 is an older-model demo selection, not a current-stock offer.",
    className: "lifestyle-photo",
  },
];

export default function Home() {
  return (
    <main id="main" tabIndex={-1}>
      <section className="hero container" aria-labelledby="hero-title">
        <div className="hero-topline">
          <p className="eyebrow">Technology, thoughtfully chosen.</p>
          <span className="hero-edition">THE SHOPTHIE EDIT — 01</span>
        </div>
        <div className="hero-composition">
          <div className="hero-copy">
            <h1 id="hero-title">
              <span>Good sound.</span>
              <span className="soft">Better days.</span>
            </h1>
            <p className="hero-description">
              For the songs you come back to.
              <br />
              And everything you haven’t heard yet.
              <br />
              Discover a more considered kind of tech.
            </p>
            <a className="pill-link" href="#collection">
              Explore the edit <ArrowRight size={17} aria-hidden="true" />
            </a>
            <a className="hero-secondary" href="#sound">
              A closer look <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
          <div className="hero-visual">
            <span className="photo-label">IN FOCUS / APPLE AIRPODS MAX</span>
            <div className="hero-product">
              <Image
                src="/images/products/hero-apple-airpods-max.jpg"
                alt="Apple AirPods Max headphones with metallic earcups reflected on a black surface"
                fill
                sizes="(max-width: 760px) 90vw, 48vw"
                preload
              />
            </div>
            <div className="product-note">
              <Link href="/products/apple-airpods-max">
                <strong>Lose yourself in the listening.</strong>
                <span>Explore Apple AirPods Max ↗</span>
              </Link>
            </div>
            <a className="photo-credit-link" href="#credits">
              Photography credits <ArrowUpRight size={11} aria-hidden="true" />
            </a>
          </div>
        </div>
        <div className="hero-bottom">
          <a className="hero-scroll" href="#introduction">
            <ArrowDown size={14} aria-hidden="true" /> A little further. A little better.
          </a>
          <span>Demo store · Prices &amp; stock simulated</span>
        </div>
      </section>

      <section id="introduction" className="introduction container" aria-labelledby="intro-title">
        <p className="eyebrow">Less noise. More meaning.</p>
        <h2 id="intro-title">
          Not more technology.
          <br />
          The right technology.
          <br />
          <span>Objects that earn their place in your everyday.</span>
        </h2>
      </section>

      <section id="collection" className="collection container" aria-labelledby="collection-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Four ways to find your better</p>
            <h2 id="collection-title">Meet the edit.</h2>
          </div>
          <p>Sound. Connection. Everyday possibilities. Explore the world of Shopthie.</p>
        </div>
        <div className="collection-grid">
          {categories.map((category, index) => (
            <article className={`collection-card ${category.className}`} key={category.title}>
              <Link
                className="collection-image category-image-link"
                href={`/collections/${category.slug}`}
                aria-label={`Explore ${category.title.toLowerCase()}`}
              >
                <span className="card-index">0{index + 1} / THE EDIT</span>
                <Image
                  src={category.src}
                  alt={category.alt}
                  fill
                  sizes="(max-width: 390px) 90vw, (max-width: 760px) 44vw, 46vw"
                />
              </Link>
              <div className="card-category">
                <h3>
                  <Link href={`/collections/${category.slug}`}>
                    {category.title}
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                </h3>
                <span>The {category.title === "Smartphones" ? "connected" : "listening"} edit</span>
              </div>
              <p className="card-model">{category.model}</p>
              <details>
                <summary>About this selection</summary>
                <p>{category.note}</p>
                <a href={`#credit-${category.credit}`}>Photograph source and license</a>
              </details>
            </article>
          ))}
        </div>
        <p className="collection-disclaimer">
          A working frontend demonstration using photographed example models, including older
          products. Prices and stock are simulated; no purchases or payments are processed.
        </p>
      </section>

      <section id="sound" className="sound-story" aria-labelledby="sound-title">
        <div className="story-grid container">
          <div className="story-image dark-photo">
            <Image
              src="/images/products/apple-airpods-max-detail.jpg"
              alt="A detailed photographic view of the AirPods Max headband and earcups against black"
              fill
              sizes="(max-width: 760px) 90vw, 50vw"
            />
          </div>
          <div className="story-copy">
            <p className="eyebrow">The listening chapter</p>
            <h2 id="sound-title">
              Some things
              <br />
              deserve your
              <br />
              full attention.
            </h2>
            <p>
              An album from start to finish. A familiar voice. A moment that’s only yours. Make a
              little room for the things worth listening to.
            </p>
            <Link className="pill-link accent" href="/collections/headphones">
              Find your listening edit
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <div className="story-footnote">Featured photography / Apple AirPods Max</div>
          </div>
        </div>
      </section>

      <section id="story" className="philosophy container" aria-labelledby="story-title">
        <p className="eyebrow">The Shopthie perspective</p>
        <div>
          <h2 id="story-title">
            Considered.
            <br />
            Not complicated.
          </h2>
          <p>
            We’re building a quieter way to explore technology. A space for familiar names,
            thoughtful details, and the things that make a difference to your day.
          </p>
          <p>
            No endless wall of specifications. No shouting for your attention. Just room to look a
            little closer—and find what matters to you.
          </p>
          <Link className="text-link" href="/about">
            Our perspective
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <section className="closing container" aria-labelledby="closing-title">
        <h2 id="closing-title">
          Find your kind
          <br />
          <span>of better.</span>
        </h2>
        <Link className="pill-link" href="/shop">
          Shop the collection
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
