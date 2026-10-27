"use client";

import { createContext, useContext, useEffect, useReducer, useState } from "react";
import { products } from "@/data/products";
import {
  commerceReducer,
  initialCommerceState,
  parseCommerce,
  serializeCommerce,
  type CommerceAction,
  type CommerceState,
} from "@/lib/cart";

export const COMMERCE_STORAGE_KEY = "shopthie-commerce-v1";

type Overlay = { type: "cart" } | { type: "quick"; productId: string } | null;
type Store = { state: CommerceState; ready: boolean; storageAvailable: boolean; notice: string };
type Action =
  | { type: "commerce"; action: CommerceAction }
  | { type: "loaded"; state: CommerceState }
  | { type: "storage-error" }
  | { type: "notice"; message: string };

function reducer(store: Store, action: Action): Store {
  switch (action.type) {
    case "loaded":
      return {
        ...store,
        ready: true,
        state: commerceReducer(store.state, { type: "hydrate", state: action.state }, products),
      };
    case "commerce":
      return { ...store, state: commerceReducer(store.state, action.action, products) };
    case "storage-error":
      return { ...store, storageAvailable: false };
    case "notice":
      return { ...store, notice: action.message };
  }
}

type CommerceContextValue = Store & {
  send: (action: CommerceAction) => void;
  notify: (message: string) => void;
  addItem: (productId: string, variantId: string, quantity: number) => void;
  overlay: Overlay;
  openCart: () => void;
  openQuickView: (productId: string) => void;
  closeOverlay: () => void;
};
const CommerceContext = createContext<CommerceContextValue | null>(null);

export function CommerceProvider({ children }: { children: React.ReactNode }) {
  const [store, dispatch] = useReducer(reducer, {
    state: initialCommerceState,
    ready: false,
    storageAvailable: true,
    notice: "",
  });
  const [overlay, setOverlay] = useState<Overlay>(null);

  useEffect(() => {
    try {
      dispatch({
        type: "loaded",
        state: parseCommerce(localStorage.getItem(COMMERCE_STORAGE_KEY), products),
      });
    } catch {
      dispatch({ type: "loaded", state: initialCommerceState });
      dispatch({ type: "storage-error" });
    }
    const sync = (event: StorageEvent) => {
      if (event.key === COMMERCE_STORAGE_KEY || event.key === null)
        dispatch({ type: "loaded", state: parseCommerce(event.newValue, products) });
    };
    const closeOnBack = () => setOverlay(null);
    window.addEventListener("storage", sync);
    window.addEventListener("popstate", closeOnBack);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("popstate", closeOnBack);
    };
  }, []);

  useEffect(() => {
    if (!store.ready || !store.storageAvailable) return;
    try {
      localStorage.setItem(COMMERCE_STORAGE_KEY, serializeCommerce(store.state));
    } catch {
      dispatch({ type: "storage-error" });
    }
  }, [store.ready, store.state, store.storageAvailable]);

  const notify = (message: string) => dispatch({ type: "notice", message });
  const addItem = (productId: string, variantId: string, quantity: number) => {
    const product = products.find((item) => item.id === productId);
    const variant = product?.variants.find((item) => item.id === variantId);
    if (!store.ready || !product || !variant || !Number.isSafeInteger(quantity) || quantity < 1)
      return;
    const currentQuantity =
      store.state.cart.find((line) => line.productId === productId && line.variantId === variantId)
        ?.quantity || 0;
    if (currentQuantity >= variant.demoStock) {
      notify("You’ve reached this option’s demo quantity limit.");
      return;
    }
    dispatch({ type: "commerce", action: { type: "add", productId, variantId, quantity } });
    notify(`${product.name} added to your demo bag.`);
    setOverlay({ type: "cart" });
  };

  return (
    <CommerceContext
      value={{
        ...store,
        overlay,
        send: (action) => dispatch({ type: "commerce", action }),
        notify,
        addItem,
        openCart: () => setOverlay({ type: "cart" }),
        openQuickView: (productId) => setOverlay({ type: "quick", productId }),
        closeOverlay: () => setOverlay(null),
      }}
    >
      {children}
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {store.notice}
      </div>
      {!store.storageAvailable && (
        <p className="storage-warning" role="status">
          Your browser is blocking saved state. Your bag and wishlist will work for this visit only.
        </p>
      )}
    </CommerceContext>
  );
}

export function useCommerce() {
  const value = useContext(CommerceContext);
  if (!value) throw new Error("Shopping components require CommerceProvider");
  return value;
}
