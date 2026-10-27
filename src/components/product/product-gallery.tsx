"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Product } from "@/types/product";

export function ProductGallery({
  product,
  onCreditNavigate,
}: {
  product: Product;
  onCreditNavigate?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const image = product.images[index];
  const multiple = product.images.length > 1;
  return (
    <div className="product-gallery">
      <div className={`gallery-stage ${product.id === "apple-airpods-max" ? "gallery-dark" : ""}`}>
        <Image
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
