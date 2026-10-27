import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Product } from "../../src/types/product.ts";

import * as data from "../../src/data/products.ts";
import { assetCredits } from "../../src/data/asset-credits.ts";
import * as catalog from "../../src/lib/catalog.ts";

const { products } = data;

const slugs = (items: Product[]) => items.map((product) => product.slug);

test("filterProducts returns a fresh array for omitted filters and handles empty input", () => {
  assert.equal(typeof catalog.filterProducts, "function");
  const input = structuredClone(products);
  const snapshot = structuredClone(input);
  const result = catalog.filterProducts(input);
  assert.deepEqual([...slugs(result)].sort(), [...slugs(input)].sort());
  assert.notEqual(result, input);
  assert.deepEqual(catalog.filterProducts([], {}), []);
  assert.deepEqual(input, snapshot);
});

test("getCollection resolves category metadata, never a product array", () => {
  assert.equal(typeof catalog.getCollection, "function");
  for (const collection of data.categoryDefinitions)
    assert.equal(catalog.getCollection(collection.slug), collection);
  for (const slug of ["", "all", "unknown", "HEADPHONES", "toString"])
    assert.equal(catalog.getCollection(slug), undefined);
});

test("getProduct resolves exact slugs and returns undefined for unknown or empty slugs", () => {
  assert.equal(typeof catalog.getProduct, "function");
  for (const product of products) assert.equal(catalog.getProduct(product.slug), product);
  for (const slug of ["", "unknown", "APPLE-IPHONE-15", "toString"])
    assert.equal(catalog.getProduct(slug), undefined);
});

test("category filtering honors all and blank defaults but rejects unknown categories", () => {
  assert.deepEqual(slugs(catalog.filterProducts(products, { category: "headphones" })), [
    "apple-airpods-max",
    "bose-quietcomfort-25",
  ]);
  for (const category of [undefined, "", "all"])
    assert.equal(catalog.filterProducts(products, { category }).length, products.length);
  for (const category of ["unknown", "toString", "HEADPHONES"])
    assert.deepEqual(catalog.filterProducts(products, { category }), []);
});

test("brand filtering is case-insensitive with all and blank defaults and no unknown-brand matches", () => {
  assert.deepEqual(slugs(catalog.filterProducts(products, { brand: " aPpLe " })), [
    "apple-airpods-max",
    "apple-airpods-pro-2nd-gen",
    "apple-iphone-15",
  ]);
  for (const brand of [undefined, "", "all", " ALL "])
    assert.equal(catalog.filterProducts(products, { brand }).length, products.length);
  for (const brand of ["unknown", "toString", "App"])
    assert.deepEqual(catalog.filterProducts(products, { brand }), []);
  assert.deepEqual(
    slugs(catalog.filterProducts(products, { category: "speakers", brand: "JBL" })),
    ["jbl-flip-3"],
  );
});

test("text search is a trimmed case-insensitive substring across brand, name and description", () => {
  assert.deepEqual(slugs(catalog.filterProducts(products, { query: "  aIrPoDs  " })), [
    "apple-airpods-max",
    "apple-airpods-pro-2nd-gen",
  ]);
  assert.deepEqual(slugs(catalog.filterProducts(products, { query: "bOsE" })), [
    "bose-quietcomfort-25",
  ]);
  assert.deepEqual(slugs(catalog.filterProducts(products, { query: "SCULPTURAL" })), [
    "apple-airpods-max",
  ]);
  assert.deepEqual(slugs(catalog.filterProducts(products, { query: "Apple AirPods" })), [
    "apple-airpods-max",
    "apple-airpods-pro-2nd-gen",
  ]);
  assert.deepEqual(catalog.filterProducts(products, { query: "nothing-matches-this" }), []);
  for (const query of [undefined, "", "   "])
    assert.equal(catalog.filterProducts(products, { query }).length, products.length);
  assert.deepEqual(
    slugs(
      catalog.filterProducts(products, { query: "airpods", category: "earbuds", brand: "Apple" }),
    ),
    ["apple-airpods-pro-2nd-gen"],
  );
});

test("featured is the stable default and unknown-sort fallback without input mutation", () => {
  const input = Object.freeze(
    [
      { ...products[4], featured: false },
      { ...products[0], featured: true },
      { ...products[1], featured: false },
      { ...products[2], featured: true },
      { ...products[5], featured: undefined },
    ].map((product) => Object.freeze(structuredClone(product))),
  );
  const snapshot = structuredClone(input);
  for (const sort of [undefined, "", "featured", "unknown", "toString", "__proto__"]) {
    assert.deepEqual(slugs(catalog.filterProducts(input, { sort })), [
      "apple-airpods-max",
      "apple-airpods-pro-2nd-gen",
      "apple-iphone-15",
      "bose-quietcomfort-25",
      "jbl-flip-3",
    ]);
  }
  assert.deepEqual(input, snapshot);
});

test("price-asc orders numeric minor units with stable ties and no mutation", () => {
  const input = Object.freeze(structuredClone(products));
  const snapshot = structuredClone(input);
  assert.deepEqual(slugs(catalog.filterProducts(input, { sort: "price-asc" })), [
    "jbl-flip-3",
    "sonos-play-1",
    "bose-quietcomfort-25",
    "apple-airpods-pro-2nd-gen",
    "apple-airpods-max",
    "google-pixel-8",
    "apple-iphone-15",
  ]);
  const tied = [
    { ...products[1], priceMinor: 100 },
    { ...products[0], priceMinor: 100 },
  ];
  assert.deepEqual(catalog.filterProducts(tied, { sort: "price-asc" }), tied);
  assert.deepEqual(input, snapshot);
});

test("price-desc orders numeric minor units with stable ties and no mutation", () => {
  const input = Object.freeze(structuredClone(products));
  const snapshot = structuredClone(input);
  assert.deepEqual(slugs(catalog.filterProducts(input, { sort: "price-desc" })), [
    "apple-iphone-15",
    "google-pixel-8",
    "apple-airpods-max",
    "apple-airpods-pro-2nd-gen",
    "bose-quietcomfort-25",
    "sonos-play-1",
    "jbl-flip-3",
  ]);
  const tied = [
    { ...products[1], priceMinor: 100 },
    { ...products[0], priceMinor: 100 },
  ];
  assert.deepEqual(catalog.filterProducts(tied, { sort: "price-desc" }), tied);
  assert.deepEqual(input, snapshot);
});

test("name sorting uses case-insensitive English order with stable ties and no mutation", () => {
  const input = Object.freeze(
    [
      { ...products[0], name: "Zulu" },
      { ...products[1], name: "alpha" },
      { ...products[2], name: "Beta" },
      { ...products[3], name: "ALPHA" },
    ].map((product) => Object.freeze(structuredClone(product))),
  );
  const snapshot = structuredClone(input);
  assert.deepEqual(slugs(catalog.filterProducts(input, { sort: "name" })), [
    "bose-quietcomfort-25",
    "google-pixel-8",
    "apple-airpods-pro-2nd-gen",
    "apple-airpods-max",
  ]);
  assert.deepEqual(input, snapshot);
  assert.deepEqual(
    slugs(
      catalog.filterProducts(products, {
        brand: "Apple",
        category: "all",
        query: "airpods",
        sort: "price-desc",
      }),
    ),
    ["apple-airpods-max", "apple-airpods-pro-2nd-gen"],
  );
});

const identities = [
  ["apple-airpods-max", "Apple", "AirPods Max", "headphones"],
  ["bose-quietcomfort-25", "Bose", "QuietComfort 25", "headphones"],
  ["apple-airpods-pro-2nd-gen", "Apple", "AirPods Pro (2nd generation)", "earbuds"],
  ["google-pixel-8", "Google", "Pixel 8", "smartphones"],
  ["apple-iphone-15", "Apple", "iPhone 15", "smartphones"],
  ["jbl-flip-3", "JBL", "Flip 3", "speakers"],
  ["sonos-play-1", "Sonos", "PLAY:1", "speakers"],
];

test("catalog galleries match every licensed asset, local dimension and credit ID", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../../docs/catalog-sources.json", import.meta.url), "utf8"),
  );
  for (const product of products) {
    const assets = manifest.assets.filter(
      (asset: { product_id: string }) => asset.product_id === product.id,
    );
    assert.equal(product.images.length, assets.length, product.id);
    for (const [index, image] of product.images.entries()) {
      assert.equal(image.src, assets[index].public_path);
      assert.deepEqual([image.width, image.height], assets[index].local_dimensions);
      assert.ok(image.alt.includes(product.name), "alt identifies the model");
      assert.ok(readFileSync(new URL(`../../public${image.src}`, import.meta.url)).length > 0);
      assert.equal(assetCredits.find((credit) => credit.id === image.creditId)?.src, image.src);
    }
  }
});
test("variants use verified storage options or a photographed-model label and five mock units", () => {
  for (const product of products) {
    const labels =
      product.id === "google-pixel-8"
        ? ["128 GB", "256 GB"]
        : product.id === "apple-iphone-15"
          ? ["128 GB", "256 GB", "512 GB"]
          : ["Photographed model"];
    assert.deepEqual(
      product.variants.map((variant) => variant.label),
      labels,
      product.id,
    );
    assert.equal(new Set(product.variants.map((variant) => variant.id)).size, labels.length);
    for (const variant of product.variants) {
      assert.ok(variant.id.startsWith(`${product.id}-`));
      assert.equal(variant.demoStock, 5);
      assert.ok(
        Number.isInteger(variant.imageIndex) &&
          variant.imageIndex >= 0 &&
          variant.imageIndex < product.images.length,
      );
      assert.equal(variant.swatch, undefined, "do not infer unverified finish swatches");
    }
  }
});

test("each model has minimal manufacturer-sourced specifications with no connector or finish inference", () => {
  const specs: Record<string, [string, string][]> = {
    "apple-airpods-max": [
      ["Chip", "Apple H1 in each ear cup"],
      ["Noise control", "Active Noise Cancellation and Transparency mode"],
    ],
    "bose-quietcomfort-25": [
      ["Noise control", "Acoustic Noise Cancelling"],
      ["Battery", "One AAA battery"],
    ],
    "apple-airpods-pro-2nd-gen": [
      ["Chip", "Apple H2"],
      ["Noise control", "Active Noise Cancellation"],
    ],
    "google-pixel-8": [
      ["Processor", "Google Tensor G3"],
      ["Storage options", "128 GB / 256 GB"],
    ],
    "apple-iphone-15": [
      ["Chip", "A16 Bionic"],
      ["Storage options", "128 GB / 256 GB / 512 GB"],
    ],
    "jbl-flip-3": [
      ["Bluetooth", "4.1"],
      ["Output power", "2 × 8 W"],
    ],
    "sonos-play-1": [
      ["Amplification", "Two Class-D digital amplifiers"],
      ["Ethernet", "One 10/100 Mbps port"],
    ],
  };
  for (const product of products) {
    assert.deepEqual(
      product.specifications.map(({ label, value }) => [label, value]),
      specs[product.id],
    );
    assert.ok(product.specificationSources.length > 0);
    const allowed =
      product.brand === "Apple"
        ? ["support.apple.com"]
        : product.brand === "Bose"
          ? ["support.bose.com", "bose.com"]
          : product.brand === "Google"
            ? ["support.google.com"]
            : product.brand === "JBL"
              ? ["support.jbl.com"]
              : ["www.sonos.com"];
    assert.ok(
      product.specificationSources.every(
        (source) =>
          new URL(source).protocol === "https:" && allowed.includes(new URL(source).hostname),
      ),
    );
  }
});

test("catalog commerce is explicitly mock USD data with original editorial descriptions and featured choices", () => {
  for (const product of products) {
    assert.equal(product.currency, "USD");
    assert.ok(Number.isSafeInteger(product.priceMinor) && product.priceMinor > 0);
    assert.match(product.description, /mock USD price and stock/i);
    assert.ok(product.description.length > 80);
    assert.equal(typeof product.featured, "boolean");
  }
  assert.ok(products.some((product) => product.featured));
  assert.ok(products.some((product) => !product.featured));
  assert.equal(new Set(products.map((product) => product.description)).size, products.length);
});

test("category definitions cover the four product categories with route metadata", () => {
  assert.ok(Array.isArray(data.categoryDefinitions));
  assert.deepEqual(
    data.categoryDefinitions.map(({ slug }) => slug),
    ["headphones", "earbuds", "smartphones", "speakers"],
  );
  for (const collection of data.categoryDefinitions) {
    assert.ok(collection.label.length > 0 && collection.description.length > 20);
  }
});

test("catalog contains exactly the seven sourced model identities with unique IDs and slugs", () => {
  assert.ok(Array.isArray(data.products), "products must be exported as an array");
  assert.deepEqual(
    data.products.map((p: Product) => [p.id, p.brand, p.name, p.category]),
    identities,
  );
  assert.equal(new Set(data.products.map((p: Product) => p.id)).size, identities.length);
  assert.deepEqual(
    data.products.map((p: Product) => p.slug),
    identities.map(([id]) => id),
  );
});
