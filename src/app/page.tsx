import Image from "next/image";
import { RouteMotionReady } from "@/components/motion/route-motion-ready";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import {
  ConsideredEdit,
  ListeningInterlude,
  NewPerspective,
} from "@/components/motion/home-scenes";
import "./storytelling.css";

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
      <section
        id="flagship"
        data-home-chapter
        className="hero container"
        aria-labelledby="hero-title"
      >
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
            <Link className="hero-secondary" href="/products/apple-airpods-max">
              Shop AirPods Max <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
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

      <section
        id="introduction"
        data-home-chapter
        className="introduction featured-story container"
        aria-labelledby="intro-title"
      >
        <header className="feature-heading">
          <p className="eyebrow">01 / Less noise. More meaning.</p>
          <h2 id="intro-title">
            Not more technology.
            <br />
            The right technology.
            <br />
            <span>Objects that earn their place in your everyday.</span>
          </h2>
        </header>
        <div id="sound" className="story-grid featured-ritual">
          <figure className="story-image featured-photo">
            <Image
              src="/images/products/apple-airpods-pro-2nd-gen.jpg"
              alt="Second-generation AirPods Pro earbuds and their charging case, photographed together"
              fill
              sizes="(max-width: 760px) 90vw, 48vw"
            />
          </figure>
          <div className="story-copy">
            <p className="eyebrow">Apple / AirPods Pro · 2nd generation</p>
            <h3>
              Small things.
              <br />
              Familiar rituals.
            </h3>
            <p>
              A favourite track. A pause between places. A little room for yourself. Begin with the
              objects that already belong in your day.
            </p>
            <Link className="pill-link" href="/products/apple-airpods-pro-2nd-gen">
              Explore AirPods Pro <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
            <p className="feature-note">
              The photographed second-generation model. No charging-connector version is inferred.{" "}
              <a href="#credit-airpods-pro">Photography credits</a>
            </p>
          </div>
        </div>
      </section>

      <ConsideredEdit />

      <NewPerspective />

      <ListeningInterlude />

      <section
        id="story"
        data-home-chapter
        className="philosophy container"
        aria-labelledby="story-title"
      >
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

      <section
        id="weekend-edit"
        data-home-chapter
        className="editorial-feature container"
        aria-labelledby="weekend-title"
      >
        <div className="editorial-feature-copy">
          <p className="eyebrow">06 / Notes from the edit</p>
          <h2 id="weekend-title">A change of scene.</h2>
          <p>
            Same favourite record. A different corner of the day. Take a look beyond the headphones,
            starting with the photographed JBL Flip 3.
          </p>
          <Link className="pill-link" href="/products/jbl-flip-3">
            Explore JBL Flip 3 <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
          <Link className="text-link" href="/collections/speakers">
            The speaker edit <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <span className="demo-label">An earlier-model editorial selection. No live offer.</span>
        </div>
        <figure className="editorial-feature-figure">
          <div className="editorial-feature-photo">
            <Image
              src="/images/products/jbl-flip-3.jpg"
              alt="Teal JBL Flip 3 and carrying cord on a warm wooden surface"
              fill
              sizes="(max-width: 760px) 90vw, 55vw"
            />
          </div>
          <figcaption>
            <span>JBL Flip 3 / A photographic study</span>
            <a href="#credit-jbl-flip-3">
              Image credits <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </figcaption>
        </figure>
      </section>

      <section
        id="collection"
        data-home-chapter
        className="collection container"
        aria-labelledby="collection-title"
      >
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

      <section
        id="closing"
        data-home-chapter
        className="closing container"
        aria-labelledby="closing-title"
      >
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
      <RouteMotionReady />
    </main>
  );
}
