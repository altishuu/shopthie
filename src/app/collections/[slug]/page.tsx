import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { categoryDefinitions } from "@/data/products";
import { Catalog } from "@/components/catalog/catalog";

export function generateStaticParams() {
  return categoryDefinitions.map((category) => ({ slug: category.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = categoryDefinitions.find((item) => item.slug === slug);
  return { title: category?.label || "Collection not found" };
}
export default function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <main id="main" className="interior-page container" tabIndex={-1}>
      <p className="eyebrow">The Shopthie collection</p>
      <Suspense
        fallback={
          <p className="loading-state" role="status">
            Preparing the collection…
          </p>
        }
      >
        <CollectionContent params={params} />
      </Suspense>
    </main>
  );
}

async function CollectionContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = categoryDefinitions.find((item) => item.slug === slug);
  if (!category) notFound();
  return (
    <>
      <header className="page-heading">
        <h1>{category.label}.</h1>
        <div className="page-heading-bottom">
          <p>{category.description}</p>
          <span className="demo-label">Demo catalog · Not live inventory</span>
        </div>
      </header>
      <Suspense
        fallback={
          <p className="loading-state" role="status">
            Preparing the collection…
          </p>
        }
      >
        <Catalog initialCategory={category.slug} />
      </Suspense>
    </>
  );
}
