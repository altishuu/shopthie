"use client";

import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { products } from "@/data/products";
import {
  commerceReducer,
  initialCommerceState,
  type CommerceAction,
  type CommerceState,
} from "@/lib/cart";
import {
  COMMERCE_STORAGE_KEY,
  createCommercePersistence,
  type CommerceLocks,
  type Change,
} from "@/lib/commerce-persistence";

export { COMMERCE_STORAGE_KEY };

type Overlay = { type: "cart" } | { type: "quick"; productId: string } | null;
type Store = { state: CommerceState; ready: boolean; storageAvailable: boolean; notice: string };
type Action =
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
    case "storage-error":
      return { ...store, storageAvailable: false };
    case "notice":
      return { ...store, notice: action.message };
  }
}

type CommerceContextValue = Store & {
  // Mutations always commit; this optional UI continuation belongs only to the
  // latest local interaction and runs after its committed render (even no-ops).
  send: (action: CommerceAction, onCommit?: (change: Change) => void) => void;
  notify: (message: string) => void;
  addItem: (productId: string, variantId: string, quantity: number) => void;
  overlay: Overlay;
  openCart: () => void;
  openQuickView: (productId: string) => void;
  closeOverlay: () => void;
};
const CommerceContext = createContext<CommerceContextValue | null>(null);

// Only this null-rendering observer may suspend on route data. The root store
// and its page children must remain outside that dynamic Suspense boundary.
function CommerceRouteObserver({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = `${pathname}?${searchParams.toString()}`;
  const previous = useRef(route);
  useEffect(() => {
    if (previous.current === route) return;
    previous.current = route;
    onNavigate();
  }, [route, onNavigate]);
  return null;
}

export function CommerceProvider({ children }: { children: React.ReactNode }) {
  const [store, dispatch] = useReducer(reducer, {
    state: initialCommerceState,
    ready: false,
    storageAvailable: true,
    notice: "",
  });
  const [overlay, setOverlay] = useState<Overlay>(null);
  const interactionGeneration = useRef(0);
  // Focus supersession must not change the generation that owns pending adds.
  const focusIntent = useRef(0);
  const uiFrame = useRef<number | null>(null);
  const pendingUI = useRef<{
    controller: ReturnType<typeof createCommercePersistence>;
    generation: number;
    ticket: number;
    change: Change;
    onCommit: (change: Change) => void;
  } | null>(null);
  const [uiCommit, setUICommit] = useState(0);
  const cancelUI = useCallback(() => {
    focusIntent.current++;
    if (uiFrame.current !== null) cancelAnimationFrame(uiFrame.current);
    uiFrame.current = null;
    pendingUI.current = null;
  }, []);
  const replaceOverlay = useCallback(
    (next: Overlay) => {
      interactionGeneration.current++;
      cancelUI();
      setOverlay(next);
    },
    [cancelUI],
  );
  const closeOverlay = useCallback(() => replaceOverlay(null), [replaceOverlay]);

  const persistence = useRef<ReturnType<typeof createCommercePersistence> | null>(null);
  useEffect(() => {
    if (!pendingUI.current) return;
    // The effect observes the committed React tree; one owned frame lets DOM
    // consumers repair focus, never a microtask racing the state render.
    const frame = requestAnimationFrame(() => {
      if (uiFrame.current !== frame) return;
      uiFrame.current = null;
      const completion = pendingUI.current;
      pendingUI.current = null;
      if (
        completion &&
        persistence.current === completion.controller &&
        interactionGeneration.current === completion.generation &&
        focusIntent.current === completion.ticket
      )
        completion.onCommit(completion.change);
    });
    uiFrame.current = frame;
    return () => {
      cancelAnimationFrame(frame);
      if (uiFrame.current === frame) uiFrame.current = null;
    };
  }, [uiCommit]);

  useEffect(() => {
    let active = true;
    let locks: CommerceLocks | undefined;
    try {
      locks = navigator.locks;
    } catch {
      // Sandboxed/older browsers still support best-effort local persistence.
    }
    const controller = createCommercePersistence({
      products,
      storage: {
        read: () => localStorage.getItem(COMMERCE_STORAGE_KEY),
        write: (value) => localStorage.setItem(COMMERCE_STORAGE_KEY, value),
      },
      locks,
      onState: (state) => {
        if (active) dispatch({ type: "loaded", state });
      },
      onStorageError: () => {
        if (active) dispatch({ type: "storage-error" });
      },
    });
    persistence.current = controller;
    controller.sync();
    const sync = (event: StorageEvent) => {
      if (event.key === COMMERCE_STORAGE_KEY || event.key === null) controller.sync();
    };
    window.addEventListener("storage", sync);
    window.addEventListener("popstate", closeOverlay);
    return () => {
      active = false;
      persistence.current = null;
      cancelUI();
      window.removeEventListener("storage", sync);
      window.removeEventListener("popstate", closeOverlay);
    };
  }, [closeOverlay, cancelUI]);

  const send = (action: CommerceAction, onCommit?: (change: Change) => void) => {
    const controller = persistence.current;
    if (!controller) return;
    cancelUI();
    const ticket = focusIntent.current;
    const generation = interactionGeneration.current;
    void controller.send(action).then((change) => {
      if (persistence.current !== controller) return;
      const { before, state } = change;
      if (action.type === "wishlist") {
        const product = products.find((item) => item.id === action.productId);
        if (product && before.wishlist.includes(product.id) !== state.wishlist.includes(product.id))
          notify(
            state.wishlist.includes(product.id)
              ? `${product.name} saved to your wishlist.`
              : `${product.name} removed from your wishlist.`,
          );
      } else if (action.type === "remove") {
        const matches = (line: CommerceState["cart"][number]) =>
          line.productId === action.productId && line.variantId === action.variantId;
        const product = products.find((item) => item.id === action.productId);
        if (product && before.cart.some(matches) && !state.cart.some(matches))
          notify(`${product.name} removed from your bag.`);
      }
      if (
        onCommit &&
        interactionGeneration.current === generation &&
        focusIntent.current === ticket
      ) {
        pendingUI.current = { controller, generation, ticket, change, onCommit };
        setUICommit((value) => value + 1);
      }
    });
  };

  const notify = (message: string) => dispatch({ type: "notice", message });
  const addItem = (productId: string, variantId: string, quantity: number) => {
    const product = products.find((item) => item.id === productId);
    const variant = product?.variants.find((item) => item.id === variantId);
    if (!store.ready || !product || !variant || !Number.isSafeInteger(quantity) || quantity < 1)
      return;
    const controller = persistence.current;
    if (!controller) return;
    cancelUI();
    const generation = interactionGeneration.current;
    void controller.send({ type: "add", productId, variantId, quantity }).then(({ before }) => {
      // The mutation remains accepted, but its UI continuation belongs only to
      // the interaction that initiated it, not a later dismissal or navigation.
      if (persistence.current !== controller || interactionGeneration.current !== generation)
        return;
      const currentQuantity =
        before.cart.find((line) => line.productId === productId && line.variantId === variantId)
          ?.quantity || 0;
      if (currentQuantity >= variant.demoStock) {
        notify("You’ve reached this option’s demo quantity limit.");
        return;
      }
      notify(`${product.name} added to your demo bag.`);
      // Do not expose quantity controls until the add transaction has committed.
      cancelUI();
      setOverlay({ type: "cart" });
    });
  };

  return (
    <CommerceContext
      value={{
        ...store,
        overlay,
        send,
        notify,
        addItem,
        openCart: () => replaceOverlay({ type: "cart" }),
        openQuickView: (productId) => replaceOverlay({ type: "quick", productId }),
        closeOverlay,
      }}
    >
      {children}
      {/* This null-rendering browser observer must not abort an SSR boundary
          for request-only search params. Its first client render still tracks
          the route before hydrated shopping controls can be used. */}
      {store.ready && (
        <Suspense fallback={null}>
          <CommerceRouteObserver onNavigate={closeOverlay} />
        </Suspense>
      )}
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
