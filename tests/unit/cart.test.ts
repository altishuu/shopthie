import assert from "node:assert/strict";
import test from "node:test";
import * as commerce from "../../src/lib/cart.ts";
import type { Product } from "../../src/types/product.ts";

const products: Product[] = [
  {
    id: "headphones",
    slug: "demo-headphones",
    brand: "Demo",
    name: "Headphones",
    category: "headphones",
    description: "Local test fixture",
    priceMinor: 12999,
    currency: "USD",
    images: [],
    specificationSources: [],
    specifications: [],
    variants: [
      { id: "black", label: "Black", imageIndex: 0, demoStock: 5 },
      { id: "white", label: "White", imageIndex: 0, demoStock: 3 },
      { id: "sold-out", label: "Sold out", imageIndex: 0, demoStock: 0 },
    ],
  },
  {
    id: "speaker",
    slug: "demo-speaker",
    brand: "Demo",
    name: "Speaker",
    category: "speakers",
    description: "Local test fixture",
    priceMinor: 4999,
    currency: "USD",
    images: [],
    specificationSources: [],
    specifications: [],
    variants: [{ id: "black", label: "Black", imageIndex: 0, demoStock: 10 }],
  },
];

function line(productId = "headphones", variantId = "black", quantity = 1) {
  return { productId, variantId, quantity };
}

function empty() {
  return { cart: [], wishlist: [] };
}

test("add creates a canonical line without mutating the input", () => {
  const state = empty();
  Object.freeze(state.cart);
  Object.freeze(state.wishlist);
  Object.freeze(state);
  assert.deepEqual(commerce.initialCommerceState, empty());
  const result = commerce.commerceReducer(
    state,
    {
      type: "add",
      ...line("headphones", "black", 2),
    },
    products,
  );
  assert.deepEqual(result, { cart: [line("headphones", "black", 2)], wishlist: [] });
  assert.deepEqual(state, empty());
});

test("add merges the same variant while preserving distinct variants", () => {
  const state = { cart: [line("headphones", "black", 2)], wishlist: [] };
  Object.freeze(state.cart[0]);
  const merged = commerce.commerceReducer(state, { type: "add", ...line() }, products);
  assert.deepEqual(merged.cart, [line("headphones", "black", 3)]);
  const distinct = commerce.commerceReducer(
    merged,
    {
      type: "add",
      ...line("headphones", "white", 2),
    },
    products,
  );
  assert.deepEqual(distinct.cart, [line("headphones", "black", 3), line("headphones", "white", 2)]);
  assert.deepEqual(state.cart, [line("headphones", "black", 2)]);
});

test("add clamps both new lines and merges to simulated variant stock", () => {
  let state = commerce.commerceReducer(
    empty(),
    { type: "add", ...line("headphones", "white", 50) },
    products,
  );
  assert.equal(state.cart[0].quantity, 3);
  state = commerce.commerceReducer(
    state,
    { type: "add", ...line("headphones", "white", Number.MAX_SAFE_INTEGER) },
    products,
  );
  assert.equal(state.cart[0].quantity, 3);
});

test("add rejects unknown IDs, unavailable stock and invalid quantities", () => {
  const state = { cart: [line()], wishlist: ["speaker"] };
  const invalid = [
    line("unknown"),
    line("headphones", "missing"),
    line("headphones", "sold-out"),
    ...[0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((q) =>
      line("headphones", "black", q),
    ),
  ];
  for (const payload of invalid) {
    assert.deepEqual(commerce.commerceReducer(state, { type: "add", ...payload }, products), state);
  }
  for (const demoStock of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const malformed = [{ ...products[0], variants: [{ ...products[0].variants[0], demoStock }] }];
    assert.deepEqual(
      commerce.commerceReducer(empty(), { type: "add", ...line() }, malformed),
      empty(),
    );
  }
});

test("quantity replaces an existing line quantity and clamps to stock", () => {
  const state = { cart: [line(), line("headphones", "white", 2)], wishlist: ["speaker"] };
  Object.freeze(state.cart[0]);
  const next = commerce.commerceReducer(
    state,
    { type: "quantity", ...line("headphones", "black", 50) },
    products,
  );
  assert.deepEqual(next, {
    cart: [line("headphones", "black", 5), line("headphones", "white", 2)],
    wishlist: ["speaker"],
  });
  assert.deepEqual(state.cart[0], line());
  const reduced = commerce.commerceReducer(
    next,
    { type: "quantity", ...line("headphones", "black", 2) },
    products,
  );
  assert.equal(reduced.cart[0].quantity, 2);
  assert.deepEqual(
    commerce.commerceReducer(state, { type: "quantity", ...line("speaker") }, products),
    state,
  );
  for (const quantity of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(
      commerce.commerceReducer(
        state,
        { type: "quantity", ...line("headphones", "black", quantity) },
        products,
      ),
      state,
    );
  }
});

test("relative quantity intents reduce in order while numeric quantities remain absolute", () => {
  let state = { cart: [line()], wishlist: ["speaker"] };
  const step = (delta: number) => ({
    type: "step-quantity" as const,
    productId: "headphones",
    variantId: "black",
    delta,
  });
  for (let i = 0; i < 3; i++) state = commerce.commerceReducer(state, step(1), products);
  assert.equal(state.cart[0].quantity, 4);
  state = commerce.commerceReducer(state, { type: "quantity", ...line() }, products);
  state = commerce.commerceReducer(state, step(1), products);
  assert.equal(state.cart[0].quantity, 2);
  for (let i = 0; i < 3; i++) state = commerce.commerceReducer(state, step(-1), products);
  assert.deepEqual(state, { cart: [line()], wishlist: ["speaker"] });
  // Only absolute zero/removal deletes; a decrement at the minimum does not.
  state = commerce.commerceReducer(
    state,
    { type: "quantity", ...line("headphones", "black", 0) },
    products,
  );
  assert.deepEqual(commerce.commerceReducer(state, step(1), products), state);
});

test("relative quantity intents respect canonical stock and safe integer boundaries", () => {
  const state = { cart: [line("headphones", "black", 4)], wishlist: ["speaker"] };
  const step = (delta: number) => ({
    type: "step-quantity" as const,
    productId: "headphones",
    variantId: "black",
    delta,
  });
  Object.freeze(state.cart[0]);
  Object.freeze(state.cart);
  const capped = commerce.commerceReducer(state, step(Number.MAX_SAFE_INTEGER), products);
  assert.equal(capped.cart[0].quantity, 5);
  assert.equal(
    commerce.commerceReducer(state, step(-Number.MAX_SAFE_INTEGER), products).cart[0].quantity,
    1,
  );
  assert.equal(state.cart[0].quantity, 4);
  for (const delta of [0, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(commerce.commerceReducer(state, step(delta), products), state);
  }
  for (const demoStock of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const malformed = [{ ...products[0], variants: [{ ...products[0].variants[0], demoStock }] }];
    assert.deepEqual(commerce.commerceReducer(state, step(1), malformed), state);
  }
  const hugeStock = [
    {
      ...products[0],
      variants: [{ ...products[0].variants[0], demoStock: Number.MAX_SAFE_INTEGER }],
    },
  ];
  const huge = { cart: [line("headphones", "black", Number.MAX_SAFE_INTEGER - 1)], wishlist: [] };
  assert.equal(
    commerce.commerceReducer(huge, step(Number.MAX_SAFE_INTEGER), hugeStock).cart[0].quantity,
    Number.MAX_SAFE_INTEGER,
  );
  for (const variantId of ["missing", "sold-out"]) {
    assert.deepEqual(commerce.commerceReducer(state, { ...step(1), variantId }, products), state);
  }
  assert.deepEqual(
    commerce.commerceReducer(state, { ...step(1), productId: "unknown" }, products),
    state,
  );
});

test("remove and zero quantity remove only the matching variant", () => {
  const state = { cart: [line(), line("headphones", "white")], wishlist: ["speaker"] };
  for (const action of [
    { type: "remove" as const, ...line() },
    { type: "quantity" as const, ...line("headphones", "black", 0) },
  ]) {
    assert.deepEqual(commerce.commerceReducer(state, action, products), {
      cart: [line("headphones", "white")],
      wishlist: ["speaker"],
    });
  }
  assert.equal(state.cart.length, 2);
  assert.deepEqual(
    commerce.commerceReducer(state, { type: "remove", ...line("unknown") }, products),
    state,
  );
});

test("wishlist toggles only known products without changing the cart", () => {
  const state = { cart: [line()], wishlist: ["speaker"] };
  Object.freeze(state.wishlist);
  const next = commerce.commerceReducer(
    state,
    { type: "wishlist", productId: "headphones" },
    products,
  );
  assert.deepEqual(next, { cart: [line()], wishlist: ["speaker", "headphones"] });
  assert.deepEqual(
    commerce.commerceReducer(next, { type: "wishlist", productId: "headphones" }, products),
    state,
  );
  assert.deepEqual(
    commerce.commerceReducer(state, { type: "wishlist", productId: "unknown" }, products),
    state,
  );
});

test("clear-cart preserves the wishlist", () => {
  const state = { cart: [line()], wishlist: ["speaker"] };
  assert.deepEqual(commerce.commerceReducer(state, { type: "clear-cart" }, products), {
    cart: [],
    wishlist: ["speaker"],
  });
  assert.deepEqual(state.cart, [line()]);
});

test("cartCount counts units rather than distinct lines", () => {
  assert.equal(commerce.cartCount([]), 0);
  assert.equal(
    commerce.cartCount([
      line("headphones", "black", 2),
      line("headphones", "white", 3),
      line("speaker"),
    ]),
    6,
  );
});

test("cartCount ignores invalid quantities and rejects aggregate overflow", () => {
  assert.equal(
    commerce.cartCount(
      [-1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 2].map((q) =>
        line("headphones", "black", q),
      ),
    ),
    2,
  );
  assert.throws(
    () => commerce.cartCount([line("headphones", "black", Number.MAX_SAFE_INTEGER), line()]),
    RangeError,
  );
});

test("cartSubtotal prices every variant from the current canonical catalog", () => {
  const cart = [
    { ...line("headphones", "black", 2), priceMinor: 1 },
    line("headphones", "white"),
    line("speaker", "black", 2),
  ];
  assert.equal(commerce.cartSubtotal([], products), 0);
  assert.equal(commerce.cartSubtotal(cart, products), 48995);
  assert.equal(
    commerce.cartSubtotal(
      cart,
      products.map((p) => ({ ...p, priceMinor: 100 })),
    ),
    500,
  );
});

test("cartSubtotal ignores invalid or unavailable lines and clamps quantities to stock", () => {
  const cart = [
    line("unknown"),
    line("headphones", "missing"),
    line("headphones", "sold-out"),
    ...[-1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((q) =>
      line("headphones", "black", q),
    ),
    line("speaker", "black", 99),
  ];
  assert.equal(commerce.cartSubtotal(cart, products), 49990);
});

test("cartSubtotal rejects invalid canonical prices and unsafe arithmetic", () => {
  for (const priceMinor of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => commerce.cartSubtotal([line()], [{ ...products[0], priceMinor }]),
      RangeError,
    );
  }
  assert.equal(commerce.cartSubtotal([line()], [{ ...products[0], priceMinor: 0 }]), 0);
  const expensive = products.map((p) => ({ ...p, priceMinor: Number.MAX_SAFE_INTEGER }));
  assert.throws(
    () => commerce.cartSubtotal([line("headphones", "black", 2)], expensive),
    RangeError,
  );
  assert.throws(() => commerce.cartSubtotal([line(), line("speaker")], expensive), RangeError);
  assert.equal(commerce.cartSubtotal([line()], expensive), Number.MAX_SAFE_INTEGER);
});

test("serializeCommerce writes version 1 with only identifiers and quantities", () => {
  const state = {
    cart: [{ ...line(), priceMinor: 1, name: "untrusted" }],
    wishlist: ["headphones"],
  };
  const before = structuredClone(state);
  assert.deepEqual(JSON.parse(commerce.serializeCommerce(state)), {
    version: 1,
    cart: [line()],
    wishlist: ["headphones"],
  });
  assert.deepEqual(state, before);
});

test("parseCommerce round trips version 1 and reprices persisted data", () => {
  const state = { cart: [line("headphones", "white", 2)], wishlist: ["speaker"] };
  assert.deepEqual(commerce.parseCommerce(commerce.serializeCommerce(state), products), state);
  const parsed = commerce.parseCommerce(
    JSON.stringify({
      version: 1,
      cart: [{ ...line(), priceMinor: 1, subtotal: -100 }],
      wishlist: [],
    }),
    products,
  );
  assert.deepEqual(parsed, { cart: [line()], wishlist: [] });
  assert.equal(commerce.cartSubtotal(parsed.cart, products), 12999);
});

test("parseCommerce resets corrupt JSON, missing data and unsupported versions", () => {
  for (const raw of [
    null,
    "",
    "{broken",
    "null",
    "[]",
    "1",
    '"text"',
    "{}",
    ...[undefined, 0, 2, "1", null].map((version) =>
      JSON.stringify({ version, cart: [line()], wishlist: ["speaker"] }),
    ),
    JSON.stringify({ version: 1, cart: {}, wishlist: [] }),
    JSON.stringify({ version: 1, cart: [], wishlist: "speaker" }),
  ]) {
    assert.deepEqual(commerce.parseCommerce(raw, products), empty(), String(raw));
  }
});

test("parseCommerce keeps valid lines while ignoring malformed and invalid entries", () => {
  const raw = JSON.stringify({
    version: 1,
    wishlist: [],
    cart: [
      null,
      true,
      "headphones",
      [],
      {},
      { productId: 3, variantId: "black", quantity: 1 },
      { productId: "headphones", variantId: 3, quantity: 1 },
      line("unknown"),
      line("headphones", "missing"),
      line("headphones", "sold-out"),
      ...[-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, "2", null].map((quantity) => ({
        ...line(),
        quantity,
      })),
      { ...line("speaker", "black", 99), priceMinor: -1000 },
    ],
  });
  assert.deepEqual(commerce.parseCommerce(raw, products), {
    cart: [line("speaker", "black", 10)],
    wishlist: [],
  });
});

test("parseCommerce merges duplicate variant lines without overflowing stock", () => {
  const raw = JSON.stringify({
    version: 1,
    wishlist: [],
    cart: [
      line("headphones", "black", 2),
      line("headphones", "white", 2),
      line("headphones", "black", Number.MAX_SAFE_INTEGER),
      line("headphones", "white", 2),
    ],
  });
  assert.deepEqual(commerce.parseCommerce(raw, products).cart, [
    line("headphones", "black", 5),
    line("headphones", "white", 3),
  ]);
  const hugeStock = [
    {
      ...products[0],
      variants: [{ ...products[0].variants[0], demoStock: Number.MAX_SAFE_INTEGER }],
    },
  ];
  const huge = JSON.stringify({
    version: 1,
    wishlist: [],
    cart: [line("headphones", "black", Number.MAX_SAFE_INTEGER), line()],
  });
  assert.deepEqual(commerce.parseCommerce(huge, hugeStock).cart, [
    line("headphones", "black", Number.MAX_SAFE_INTEGER),
  ]);
});

test("parseCommerce restores only known unique wishlist identifiers", () => {
  const raw = JSON.stringify({
    version: 1,
    cart: [],
    wishlist: ["headphones", "unknown", "speaker", "headphones", null, {}, 1, "speaker"],
  });
  assert.deepEqual(commerce.parseCommerce(raw, products), {
    cart: [],
    wishlist: ["headphones", "speaker"],
  });
});

test("hydrate sanitizes untrusted state and returns independent arrays and lines", () => {
  const incoming = {
    cart: [
      line("headphones", "black", 2),
      line("headphones", "black", 99),
      line("headphones", "white", -1),
      line("unknown"),
      { ...line("speaker"), priceMinor: 1 },
    ],
    wishlist: ["speaker", "unknown", "speaker", "headphones"],
  };
  const before = structuredClone(incoming);
  for (const item of incoming.cart) Object.freeze(item);
  Object.freeze(incoming.cart);
  Object.freeze(incoming.wishlist);
  Object.freeze(incoming);
  const result = commerce.commerceReducer(
    { cart: [line("headphones", "white")], wishlist: [] },
    { type: "hydrate", state: incoming },
    products,
  );
  assert.deepEqual(result, {
    cart: [line("headphones", "black", 5), line("speaker")],
    wishlist: ["speaker", "headphones"],
  });
  assert.notEqual(result.cart, incoming.cart);
  assert.notEqual(result.cart[1], incoming.cart[4]);
  assert.notEqual(result.wishlist, incoming.wishlist);
  assert.deepEqual(incoming, before);
  const nonfinite = {
    cart: [
      line("headphones", "black", NaN),
      line("headphones", "white", Infinity),
      line("speaker"),
    ],
    wishlist: [],
  };
  assert.deepEqual(
    commerce.commerceReducer(empty(), { type: "hydrate", state: nonfinite }, products),
    { cart: [line("speaker")], wishlist: [] },
  );
});
