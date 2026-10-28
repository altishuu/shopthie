"use client";

import { useRef, type RefObject } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { products } from "@/data/products";
import { gsap, ScrollTrigger, useGSAP, motion } from "@/lib/gsap";
import { formatMoney } from "@/lib/money";
import { watchMedia } from "@/lib/media-lifecycle";
import { independentMotion } from "@/lib/motion-context";
import type { Product } from "@/types/product";
import "./home-scenes.css";

const consideredEdit = [
  { slug: "apple-airpods-pro-2nd-gen", caption: "A small daily ritual.", treatment: "pocket" },
  { slug: "bose-quietcomfort-25", caption: "An archival listening study.", treatment: "archive" },
  { slug: "sonos-play-1", caption: "A place on the shelf.", treatment: "shelf" },
].flatMap((selection) => {
  const product = products.find((item) => item.slug === selection.slug);
  return product ? [{ ...selection, product }] : [];
});

const perspectives = [
  { slug: "google-pixel-8", caption: "A softer angle.", treatment: "rose" },
  { slug: "apple-iphone-15", caption: "A familiar outline.", treatment: "outline" },
].flatMap((selection) => {
  const product = products.find((item) => item.slug === selection.slug);
  return product ? [{ ...selection, product }] : [];
});

const listeningProduct = products.find((product) => product.slug === "apple-airpods-max");
const listeningImage = listeningProduct?.images[1] ?? listeningProduct?.images[0];

/** No CSS visibility gate: SSR, failed JS, and reduced motion retain the entire edit. */
function useEditorialReveals(scope: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      const section = scope.current;
      if (!section) return;
      return watchMedia(
        {
          desktop: "(min-width: 1024px)",
          mobile: "(max-width: 1023px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (conditions) => {
          if (conditions.reduceMotion) return;
          const distance = conditions.desktop ? 28 : 14;
          const scene = independentMotion(() =>
            gsap.context(() => {
              section.querySelectorAll<HTMLElement>("[data-scene-reveal]").forEach((item) => {
                gsap.fromTo(
                  item,
                  { y: distance },
                  {
                    y: 0,
                    duration: motion.duration.reveal,
                    ease: motion.ease.control,
                    scrollTrigger: {
                      trigger: item,
                      start: "top 94%",
                      once: true,
                    },
                  },
                );
              });
            }, scope),
          );
          return () => scene.revert();
        },
      );
    },
    { scope, dependencies: [], revertOnUpdate: true },
  );
}

function ProductSignature({ product }: { product: Product }) {
  return (
    <div className="hs-product-signature">
      <div>
        <p className="hs-product-brand">{product.brand}</p>
        <h3>
          <Link href={`/products/${product.slug}`}>
            {product.name}
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </h3>
      </div>
      <p className="hs-product-price" data-price-minor={product.priceMinor}>
        {formatMoney(product.priceMinor)}
        <span>Demo price</span>
      </p>
    </div>
  );
}

export function ConsideredEdit() {
  const editRef = useRef<HTMLElement>(null);
  useEditorialReveals(editRef);
  return (
    <section
      ref={editRef}
      id="home-considered-edit"
      className="hs-edit container"
      data-home-scene="considered-edit"
      data-home-chapter
      aria-labelledby="hs-edit-title"
    >
      <header className="hs-section-header" data-scene-reveal>
        <div>
          <p className="hs-index">02 / Selected with intention</p>
          <h2 id="hs-edit-title">The considered edit.</h2>
        </div>
        <div className="hs-header-aside">
          <p>Three objects. Three ways to make a little room for listening. Curated, not ranked.</p>
          <Link className="hs-text-link" href="/shop">
            Explore the whole edit <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div className="hs-product-shelf">
        {consideredEdit.map(({ product, caption, treatment }, index) => {
          const image = product.images[0];
          return (
            <article className={`hs-shelf-object hs-shelf-object--${treatment}`} key={product.id}>
              <figure data-scene-reveal>
                <div className="hs-object-topline">
                  <span>0{index + 1}</span>
                  <span>{caption}</span>
                </div>
                <Link
                  href={`/products/${product.slug}`}
                  className="hs-object-image"
                  aria-label={`Explore ${product.brand} ${product.name}`}
                >
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    sizes="(max-width: 760px) 90vw, (max-width: 1023px) 30vw, 33vw"
                  />
                </Link>
                <figcaption>
                  <ProductSignature product={product} />
                </figcaption>
              </figure>
            </article>
          );
        })}
      </div>
      <p className="hs-demo-note">
        Editorial selections, including earlier models. Prices and stock are simulated—not live
        offers.
      </p>
    </section>
  );
}

export function ListeningInterlude() {
  const listeningRef = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const section = listeningRef.current;
      if (!section) return;
      return watchMedia(
        {
          // Short desktop windows also get the natural, unpinned document.
          desktop: "(min-width: 1024px) and (min-height: 700px)",
          mobile: "(max-width: 1023px), (max-height: 699px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (conditions) => {
          if (!conditions.desktop || conditions.reduceMotion) return;
          const scene = independentMotion(() =>
            gsap.context(() => {
              const lines = section.querySelectorAll<HTMLElement>("[data-listening-line]");
              const image = section.querySelector<HTMLElement>("[data-listening-image]");
              const progress = section.querySelector<HTMLElement>("[data-listening-progress]");
              const timeline = gsap.timeline({ defaults: { ease: "none" } });

              // Text remains legible throughout; the photograph never covers the copy or links.
              timeline.fromTo(
                lines,
                { opacity: 0.48, y: 18 },
                { opacity: 1, y: 0, duration: 0.7, stagger: 0.45 },
                0,
              );
              if (image) {
                timeline.fromTo(
                  image,
                  { scale: 0.95, yPercent: 3 },
                  { scale: 1, yPercent: -3, duration: 1.8 },
                  0,
                );
              }
              if (progress) {
                timeline.fromTo(progress, { scaleX: 0 }, { scaleX: 1, duration: 1.8 }, 0);
              }

              ScrollTrigger.create({
                id: "home-listening-scene",
                trigger: section,
                animation: timeline,
                start: "top top",
                end: () => `+=${Math.round(window.innerHeight * 0.85)}`,
                pin: true,
                pinSpacing: true,
                scrub: 0.65,
                anticipatePin: 1,
                invalidateOnRefresh: true,
              });
            }, listeningRef),
          );
          return () => scene.revert();
        },
      );
    },
    { scope: listeningRef, dependencies: [], revertOnUpdate: true },
  );

  if (!listeningProduct || !listeningImage) return null;
  return (
    <section
      ref={listeningRef}
      id="home-listening-interlude"
      className="hs-listening"
      data-home-scene="listening"
      data-home-chapter
      aria-labelledby="hs-listening-title"
    >
      <div className="hs-listening-inner container">
        <div className="hs-listening-topline">
          <p className="hs-index">04 / An interlude</p>
          <a className="hs-continue" href="#story">
            Continue exploring <ArrowDown size={14} aria-hidden="true" />
          </a>
        </div>

        <div className="hs-listening-composition">
          <div className="hs-listening-copy">
            <p className="hs-listening-prelude">One record. No rush.</p>
            <h2 id="hs-listening-title">
              <span data-listening-line>Press play.</span>
              <span data-listening-line>Stay awhile.</span>
            </h2>
            <p className="hs-listening-description">
              Not everything needs a next button. An album you know by heart. A track you’ve never
              heard. Give it a little space.
            </p>
            <Link className="hs-listening-link" href={`/products/${listeningProduct.slug}`}>
              A closer look at AirPods Max
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <figure className="hs-listening-figure">
            <div className="hs-listening-photo" data-listening-image>
              <Image
                src={listeningImage.src}
                alt={listeningImage.alt}
                fill
                sizes="(max-width: 760px) 90vw, (max-width: 1023px) 80vw, 46vw"
              />
            </div>
            <figcaption>
              <span>A study in listening</span>
              <span>
                {listeningProduct.brand} / {listeningProduct.name}
              </span>
            </figcaption>
          </figure>
        </div>

        <div className="hs-listening-baseline">
          <span>Pause here. Move at your own pace.</span>
          <span className="hs-listening-rule" aria-hidden="true">
            <span data-listening-progress />
          </span>
          <a href="#credits">Photography credits</a>
        </div>
      </div>
    </section>
  );
}

export function NewPerspective() {
  const perspectivesRef = useRef<HTMLElement>(null);
  useEditorialReveals(perspectivesRef);
  return (
    <section
      ref={perspectivesRef}
      id="home-new-perspective"
      className="hs-perspectives container"
      data-home-scene="new-perspective"
      data-home-chapter
      aria-labelledby="hs-perspectives-title"
    >
      <header className="hs-section-header" data-scene-reveal>
        <div>
          <p className="hs-index">03 / Seen differently</p>
          <h2 id="hs-perspectives-title">
            Familiar objects.
            <br />
            <span>A fresh perspective.</span>
          </h2>
        </div>
        <div className="hs-header-aside">
          <p>
            A softer colour. A different angle. Pixel 8 and iPhone 15, revisited—not the latest
            models, just another way to see the everyday.
          </p>
          <Link className="hs-text-link" href="/collections/smartphones">
            Explore the phone edit <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div className="hs-perspective-diptych">
        {perspectives.map(({ product, caption, treatment }, index) => {
          const image = product.images[0];
          return (
            <article className={`hs-perspective hs-perspective--${treatment}`} key={product.id}>
              <figure data-scene-reveal>
                <Link
                  className="hs-perspective-image"
                  href={`/products/${product.slug}`}
                  aria-label={`Explore ${product.brand} ${product.name}`}
                >
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    sizes="(max-width: 760px) 90vw, (max-width: 1023px) 44vw, 55vw"
                  />
                </Link>
                <figcaption>
                  <div className="hs-perspective-caption">
                    <span>View 0{index + 1}</span>
                    <p>{caption}</p>
                  </div>
                  <ProductSignature product={product} />
                </figcaption>
              </figure>
            </article>
          );
        })}
      </div>
      <p className="hs-demo-note">
        Demo prices shown. Explore each product for the photographed model and details.
      </p>
    </section>
  );
}
