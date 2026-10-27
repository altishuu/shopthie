import type { Product } from "../types/product.ts";

export type CartLine = { productId: string; variantId: string; quantity: number };
export type CommerceState = { cart: CartLine[]; wishlist: string[] };
export type CommerceAction =
  | ({ type: "add" } & CartLine)
  | ({ type: "quantity" } & CartLine)
  | { type: "remove"; productId: string; variantId: string }
  | { type: "wishlist"; productId: string }
  | { type: "clear-cart" }
  | { type: "hydrate"; state: CommerceState };

export const initialCommerceState: CommerceState = { cart: [], wishlist: [] };

/** Persist identifiers only; prices are always resolved from the current catalog. */
export function serializeCommerce(state: CommerceState): string {
  return JSON.stringify({
    version: 1,
    cart: state.cart.map(({ productId, variantId, quantity }) => ({
      productId,
      variantId,
      quantity,
    })),
    wishlist: state.wishlist,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeCommerce(value: unknown, products: Product[]): CommerceState {
  if (!isRecord(value) || !Array.isArray(value.cart) || !Array.isArray(value.wishlist)) {
    return { cart: [], wishlist: [] };
  }
  let state: CommerceState = { cart: [], wishlist: [] };
  for (const entry of value.cart) {
    if (
      !isRecord(entry) ||
      typeof entry.productId !== "string" ||
      typeof entry.variantId !== "string" ||
      typeof entry.quantity !== "number"
    )
      continue;
    state = commerceReducer(
      state,
      {
        type: "add",
        productId: entry.productId,
        variantId: entry.variantId,
        quantity: entry.quantity,
      },
      products,
    );
  }
  const wishlist = [
    ...new Set(
      value.wishlist.filter(
        (id): id is string =>
          typeof id === "string" && products.some((product) => product.id === id),
      ),
    ),
  ];
  return { cart: state.cart, wishlist };
}

export function parseCommerce(raw: string | null, products: Product[]): CommerceState {
  try {
    const parsed: unknown = JSON.parse(raw ?? "null");
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.cart) ||
      !Array.isArray(parsed.wishlist)
    ) {
      return { cart: [], wishlist: [] };
    }
    return sanitizeCommerce(parsed, products);
  } catch {
    return { cart: [], wishlist: [] };
  }
}

export function cartSubtotal(cart: CartLine[], products: Product[]): number {
  return cart.reduce((total, line) => {
    const product = products.find((product) => product.id === line.productId);
    const stock =
      product?.variants.find((variant) => variant.id === line.variantId)?.demoStock ?? 0;
    if (
      !product ||
      !Number.isSafeInteger(stock) ||
      stock < 1 ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1
    )
      return total;
    if (!Number.isSafeInteger(product.priceMinor) || product.priceMinor < 0) {
      throw new RangeError("Canonical price must be a nonnegative safe integer");
    }
    const quantity = Math.min(line.quantity, stock);
    if (product.priceMinor > Math.floor((Number.MAX_SAFE_INTEGER - total) / quantity)) {
      throw new RangeError("Cart subtotal exceeds the safe integer range");
    }
    return total + product.priceMinor * quantity;
  }, 0);
}

export function cartCount(cart: CartLine[]): number {
  return cart.reduce((total, line) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) return total;
    if (line.quantity > Number.MAX_SAFE_INTEGER - total) {
      throw new RangeError("Cart count exceeds the safe integer range");
    }
    return total + line.quantity;
  }, 0);
}

export function commerceReducer(
  state: CommerceState,
  action: CommerceAction,
  products: Product[],
): CommerceState {
  if (action.type === "hydrate") return sanitizeCommerce(action.state, products);
  if (action.type === "clear-cart") return { ...state, cart: [] };
  if (action.type === "remove" || (action.type === "quantity" && action.quantity === 0)) {
    return {
      ...state,
      cart: state.cart.filter(
        (line) => line.productId !== action.productId || line.variantId !== action.variantId,
      ),
    };
  }
  if (action.type === "add" || action.type === "quantity") {
    const stock =
      products
        .find((product) => product.id === action.productId)
        ?.variants.find((variant) => variant.id === action.variantId)?.demoStock ?? 0;
    if (
      !Number.isSafeInteger(action.quantity) ||
      action.quantity < 1 ||
      !Number.isSafeInteger(stock) ||
      stock < 1
    )
      return state;
    const existing = state.cart.find(
      (line) => line.productId === action.productId && line.variantId === action.variantId,
    );
    if (action.type === "quantity" && !existing) return state;
    const next = {
      productId: action.productId,
      variantId: action.variantId,
      quantity:
        action.type === "quantity"
          ? Math.min(action.quantity, stock)
          : (existing?.quantity ?? 0) +
            Math.min(action.quantity, stock - (existing?.quantity ?? 0)),
    };
    return {
      ...state,
      cart: existing
        ? state.cart.map((line) => (line === existing ? next : line))
        : [...state.cart, next],
    };
  }
  if (action.type === "wishlist") {
    if (!products.some((product) => product.id === action.productId)) return state;
    return {
      ...state,
      wishlist: state.wishlist.includes(action.productId)
        ? state.wishlist.filter((id) => id !== action.productId)
        : [...state.wishlist, action.productId],
    };
  }
  return state;
}
