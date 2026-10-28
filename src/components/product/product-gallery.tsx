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
  const image = product.images[index];
  const multiple = product.images.length > 1;

  useGSAP(
    () => {
      const element = imageRef.current;
      if (!element) return;
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      let active = true;
      let ready = false;
      let transition: gsap.core.Tween | undefined;
      const reset = () => {
        transition?.kill();
        gsap.set(element, { clearProps: "transform,clipPath" });
      };
      const reveal = () => {
        if (!active || ready || imageRef.current !== element || !element.naturalWidth) return;
        ready = true;
        if (media.matches) return;
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
        if (element.naturalWidth) void element.decode().then(reveal, () => {});
      };
      element.addEventListener("load", onReady);
      media.addEventListener("change", reset);
      if (element.complete) onReady();
      return () => {
        active = false;
        element.removeEventListener("load", onReady);
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
