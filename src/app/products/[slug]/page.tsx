import { RouteMotionReady } from "@/components/motion/route-motion-ready";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { products } from "@/data/products";
import { getProduct } from "@/lib/catalog";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductOptions } from "@/components/product/product-options";
import { ProductStory } from "@/components/product/product-story";
import { ProductCard } from "@/components/catalog/product-card";

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  return {
    title: product ? `${product.brand} ${product.name}` : "Product not found",
    description: product?.description,
  };
}

// Keep URL-specific essential content readable without a streaming reveal script.
export const instant = false;

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const content = await ProductContent({ params });
  return (
    <main id="main" className="interior-page container" tabIndex={-1}>
      <Link className="back-link" href="/shop">
        <ArrowLeft size={15} aria-hidden="true" />
        Back to the collection
      </Link>
      {content}
    </main>
  );
}

async function ProductContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();
  const related = products.filter(
    (item) => item.id !== product.id && item.category === product.category,
  );
  const suggestions = [
    ...related,
    ...products.filter((item) => item.id !== product.id && item.category !== product.category),
  ].slice(0, 3);

  return (
    <>
      <div className="product-detail-grid">
        <ProductGallery product={product} />
        <div id="product-purchase" className="product-detail-copy" tabIndex={-1}>
          <p className="eyebrow">
            {product.brand} / {product.category}
          </p>
          <h1 className="product-title">{product.name}</h1>
          <p className="product-description">{product.description}</p>
          <ProductOptions product={product} />
          <details id="product-details" className="specifications">
            <summary>Details &amp; specification sources</summary>
            <dl>
              {product.specifications.map((specification) => (
                <div key={specification.label}>
                  <dt>{specification.label}</dt>
                  <dd>{specification.value}</dd>
                </div>
              ))}
            </dl>
            <p>
              Technical details are source-checked. Prices and stock are simulated. The photographed
              finish does not imply every configuration is pictured.
            </p>
            <ul>
              {product.specificationSources.map((source, index) => (
                <li key={source}>
                  <a href={source}>Product reference {index + 1}</a>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
      <ProductStory product={product} />
      <section className="related-products" aria-labelledby="related-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A little more to explore</p>
            <h2 id="related-title">Good company.</h2>
          </div>
          <p>A few more things from the Shopthie edit.</p>
        </div>
        <div className="product-grid">
          {suggestions.map((item) => (
            <ProductCard key={item.id} product={item} />
          ))}
        </div>
      </section>
      <RouteMotionReady />
    </>
  );
}
