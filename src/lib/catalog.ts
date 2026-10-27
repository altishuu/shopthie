import { categoryDefinitions, products } from "../data/products.ts";
import type { Product } from "../types/product.ts";

type ProductFilters = {
  query?: string;
  category?: string;
  brand?: string;
  sort?: string;
};

/** Filter into a new array before stable sorting; source records are never edited. */
export function filterProducts(items: readonly Product[], filters: ProductFilters = {}): Product[] {
  const brand = filters.brand?.trim().toLowerCase();
  const query = filters.query?.trim().toLowerCase();
  return items
    .filter(
      (product) =>
        (!filters.category ||
          filters.category === "all" ||
          product.category === filters.category) &&
        (!brand || brand === "all" || product.brand.toLowerCase() === brand) &&
        (!query ||
          `${product.brand} ${product.name} ${product.description}`.toLowerCase().includes(query)),
    )
    .sort((a, b) => {
      if (filters.sort === "price-asc") return a.priceMinor - b.priceMinor;
      if (filters.sort === "price-desc") return b.priceMinor - a.priceMinor;
      if (filters.sort === "name")
        return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    });
}

/** Route metadata lookup, not the collection’s product list. */
export function getCollection(category: string): (typeof categoryDefinitions)[number] | undefined {
  return categoryDefinitions.find((collection) => collection.slug === category);
}

export function getProduct(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}
