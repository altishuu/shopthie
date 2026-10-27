export type ProductCategory = "headphones" | "earbuds" | "smartphones" | "speakers";

export type ProductAsset = {
  src: string;
  width: number;
  height: number;
  alt: string;
  creditId: string;
};

export type ProductVariant = {
  id: string;
  label: string;
  swatch?: string;
  imageIndex: number;
  /** A simulated frontend stock limit, never a live inventory claim. */
  demoStock: number;
};

export type Product = {
  id: string;
  slug: string;
  brand: string;
  name: string;
  category: ProductCategory;
  description: string;
  priceMinor: number;
  currency: string;
  images: ProductAsset[];
  variants: ProductVariant[];
  specificationSources: string[];
  specifications: { label: string; value: string }[];
  featured?: boolean;
};
