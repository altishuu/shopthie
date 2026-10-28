"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Product } from "@/types/product";
import { gsap, useGSAP, motion } from "@/lib/gsap";

export function ProductGallery({
  product,
  onCreditNavigate,
}: {
  product: Product;
  onCreditNavigate?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const imageRef = useRef<HTMLImageElement>(null);
  const hasPresented = useRef(false);
  const image = product.images[index];
  const multiple = product.images.length > 1;

  useGSAP(
    () => {
      const element = imageRef.current;
      if (!element) return;
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      let active = true;
      let ready = false;
      let decoded = false;
      let transition: gsap.core.Tween | undefined;
      const reset = () => {
        transition?.kill();
        gsap.set(element, { clearProps: "transform,clipPath" });
      };
      const reveal = () => {
        if (!active || ready || !decoded || imageRef.current !== element || !element.naturalWidth)
          return;
        const html = document.documentElement;
        const main = element.closest("main");
        const inPage = Boolean(element.closest("#experience"));
        if (
          inPage &&
          (html.dataset.introState !== "complete" ||
            html.dataset.routeState !== "idle" ||
            (main && !main.getClientRects().length))
        )
          return;
        ready = true;
        // Fail-open startup content was already visible: never replay over it.
        const bypass =
          inPage && !hasPresented.current && html.dataset.surfaceEntrance === "bypassed";
        hasPresented.current = true;
        if (media.matches || bypass) return;
        transition = gsap.fromTo(
          element,
          {
            clipPath: "inset(0 0 5% 0)",
            scale: 1.035,
          },
          {
            clipPath: "inset(0 0 0% 0)",
            scale: 1,
            duration: motion.duration.image,
            ease: motion.ease.control,
            overwrite: true,
            clearProps: "transform,clipPath",
          },
        );
      };
      const onReady = () => {
        // Network completion alone does not guarantee decoded pixels are ready.
        if (element.naturalWidth)
          void element.decode().then(
            () => {
              decoded = true;
              reveal();
            },
            () => {},
          );
      };
      element.addEventListener("load", onReady);
      window.addEventListener("shopthie:surface-ready", reveal);
      media.addEventListener("change", reset);
      if (element.complete) onReady();
      return () => {
        active = false;
        element.removeEventListener("load", onReady);
        window.removeEventListener("shopthie:surface-ready", reveal);
        media.removeEventListener("change", reset);
        reset();
      };
    },
    { dependencies: [image.src], revertOnUpdate: true },
  );

  return (
    <div className="product-gallery">
      <div className={`gallery-stage ${product.id === "apple-airpods-max" ? "gallery-dark" : ""}`}>
        <Image
          ref={imageRef}
          key={image.src}
          src={image.src}
          alt={image.alt}
          fill
          sizes="(max-width: 900px) 90vw, 53vw"
          preload
        />
        <a className="gallery-credit" href={`#credit-${image.creditId}`} onClick={onCreditNavigate}>
          Photograph credits
        </a>
        {multiple && (
          <div className="gallery-arrows">
            <button
              className="icon-button"
              aria-label="Previous photograph"
              onClick={() => setIndex((index + product.images.length - 1) % product.images.length)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              aria-label="Next photograph"
              onClick={() => setIndex((index + 1) % product.images.length)}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <p className="gallery-caption" role="status">
        Photograph {index + 1} of {product.images.length} · {product.brand} {product.name}
      </p>
      {multiple && (
        <div className="gallery-thumbnails" aria-label="Product photographs">
          {product.images.map((item, photoIndex) => (
            <button
              key={item.src}
              className={photoIndex === index ? "selected" : ""}
              aria-label={`Show photograph ${photoIndex + 1}`}
              aria-pressed={photoIndex === index}
              onClick={() => setIndex(photoIndex)}
            >
              <Image src={item.src} alt="" width={90} height={70} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
