import Image from "next/image";
import type { Product, ProductCategory } from "@/types/product";
import "./product-story.css";

const editorialCopy: Record<ProductCategory, string> = {
  headphones:
    "Beside a book, on a desk, between one part of the day and the next: headphones have a place in the everyday still life. Our listening edit begins with the object, then leaves room for a closer look.",
  earbuds:
    "A listening edit need not begin with a grand setup. Sometimes the most interesting composition is a small one; here, the photograph and the model’s details get equal space.",
  smartphones:
    "An everyday carry is a small, personal edit. We look at the phone as an object within it, leaving room for the photograph and a clear account of the model’s details.",
  speakers:
    "A shelf, a side table, a corner of the room: where we place an object is part of how we see it. This is our closer look at a speaker from the listening edit.",
};

export function ProductStory({ product }: { product: Product }) {
  const image = product.images[1] ?? product.images[0];
  const headingId = `pd-story-${product.id}`;
  const specificationsId = `${headingId}-specifications`;

  return (
    <section className="pd-story" aria-labelledby={headingId}>
      <header className="pd-story-intro">
        <div>
          <p className="pd-story-eyebrow">The object, in focus</p>
          <h2 className="pd-story-title" id={headingId}>
            A closer look.
          </h2>
        </div>
        <p className="pd-story-editorial">{editorialCopy[product.category]}</p>
      </header>

      <div className="pd-story-grid">
        <figure className="pd-story-figure">
          <div className="pd-story-photo">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              loading="lazy"
              sizes="(max-width: 760px) 92vw, (max-width: 1599px) 52vw, 790px"
            />
          </div>
          <figcaption className="pd-story-caption">
            <span>
              {product.brand} {product.name}
            </span>
            <a className="pd-story-credit" href={`#credit-${image.creditId}`}>
              Photograph credits
            </a>
          </figcaption>
        </figure>

        <div className="pd-story-details">
          <p className="pd-story-eyebrow">Model notes</p>
          <h3 className="pd-story-details-title" id={specificationsId}>
            The details.
          </h3>
          <dl className="pd-story-specifications" aria-labelledby={specificationsId}>
            {product.specifications.map(({ label, value }) => (
              <div className="pd-story-specification" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="pd-story-note">
            Model specifications from our catalog. The photograph is a view of the model, not a
            guarantee of a particular configuration. Prices and stock are simulated for this demo.
          </p>
          <a className="pd-story-purchase" href="#product-purchase">
            <span>Choose your configuration</span>
            <span aria-hidden="true">↑</span>
          </a>
        </div>
      </div>
    </section>
  );
}
