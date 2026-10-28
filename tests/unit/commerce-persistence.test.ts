import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as cart from "../../src/lib/cart.ts";
import { products } from "../../src/data/products.ts";
import type { CommerceAction, CommerceState } from "../../src/lib/cart.ts";

const require = createRequire(import.meta.url);
const key = "shopthie-commerce-v1";
const first = products[0];
const second = products[1];
type Value = {
  state: CommerceState;
  ready: boolean;
  storageAvailable: boolean;
  notice: string;
  overlay: { type: string } | null;
  send: (
    action: CommerceAction,
    onCommit?: (change: { before: CommerceState; state: CommerceState }) => void,
  ) => void;
  notify: (message: string) => void;
  openCart: () => void;
  closeOverlay: () => void;
  addItem: (productId: string, variantId: string, quantity: number) => void;
};

/** Execute the ACTUAL provider, substituting only its host hooks and browser I/O.
 * State/reducer/effect code is not copied: flushing models a committed render,
 * while storage notifications have an independently controlled delivery queue.
 */
function providerWorld(locks?: import("../../src/lib/commerce-persistence.ts").CommerceLocks) {
  let raw: string | null = null;
  let writes = 0;
  const events: (() => void)[] = [];
  type Tab = {
    readonly value: Value;
    readonly pendingFrames: number;
    readonly lateUpdates: number;
    emit: (event: unknown, name?: string) => void;
    flush: () => void;
    frame: () => void;
    takeFrame: () => () => void;
    dispose: () => void;
  };
  const tabs: Tab[] = [];
  function tab(): Tab {
    const slots: unknown[] = [];
    const listeners = new Map<string, Set<(event: unknown) => void>>();
    const effects: (() => void)[] = [];
    const cleanups = new Map<number, () => void>();
    const frames = new Map<number, () => void>();
    let frameId = 0;
    let disposed = false;
    let lateUpdates = 0;
    let cursor = 0;
    let dirty = true;
    let value!: Value;
    const hooks = {
      createContext: () => ({}),
      useContext: () => value,
      useCallback<T>(callback: T, deps: unknown[]): T {
        const index = cursor++;
        const previous = slots[index] as { callback: T; deps: unknown[] } | undefined;
        if (
          !previous ||
          previous.deps.length !== deps.length ||
          deps.some((dep, i) => !Object.is(dep, previous.deps[i]))
        )
          slots[index] = { callback, deps };
        return (slots[index] as { callback: T }).callback;
      },
      useRef(initial: unknown) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = { current: initial };
        return slots[index];
      },
      useState(initial: unknown) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [
          slots[index],
          (next: unknown) => {
            if (disposed) lateUpdates++;
            slots[index] = typeof next === "function" ? next(slots[index]) : next;
            dirty = true;
          },
        ];
      },
      useReducer(reducer: (state: unknown, action: unknown) => unknown, initial: unknown) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [
          slots[index],
          (action: unknown) => {
            if (disposed) lateUpdates++;
            slots[index] = reducer(slots[index], action);
            dirty = true;
          },
        ];
      },
      useEffect(effect: () => void | (() => void), deps: unknown[]) {
        const index = cursor++;
        const previous = slots[index] as unknown[] | undefined;
        if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
          slots[index] = deps;
          effects.push(() => {
            cleanups.get(index)?.();
            const cleanup = effect();
            if (cleanup) cleanups.set(index, cleanup);
            else cleanups.delete(index);
          });
        }
      },
    };
    const api = {
      get value() {
        return value;
      },
      get pendingFrames() {
        return frames.size;
      },
      get lateUpdates() {
        return lateUpdates;
      },
      emit(event: unknown, name = "storage") {
        listeners.get(name)?.forEach((listener) => listener(event));
      },
      takeFrame() {
        const entry = frames.entries().next().value;
        assert.ok(entry, "a committed UI continuation owns one frame");
        frames.delete(entry[0]);
        return entry[1];
      },
      frame() {
        api.flush();
        const batch = [...frames.values()];
        frames.clear();
        assert.ok(batch.length <= 1, "UI continuations own at most one single-shot frame");
        batch.forEach((callback) => callback());
        assert.equal(frames.size, 0, "UI completion must never become an animation loop");
      },
      dispose() {
        disposed = true;
        cleanups.forEach((cleanup) => cleanup());
        cleanups.clear();
      },
      flush() {
        let count = 0;
        while (dirty || effects.length) {
          assert.ok(count++ < 50, "a provider render must settle");
          if (dirty) {
            cursor = 0;
            dirty = false;
            const tree = providerModule.exports.CommerceProvider({ children: null });
            value = tree.props.value;
          }
          effects.splice(0).forEach((effect) => effect());
        }
      },
    };
    const storage = {
      getItem: () => raw,
      setItem(_key: string, next: string) {
        writes++;
        if (next === raw) return;
        raw = next;
        tabs
          .filter((other) => other !== api)
          .forEach((other) => {
            events.push(() => other.emit({ key, newValue: next, storageArea: storage }));
          });
      },
    };
    const source = readFileSync(
      new URL("../../src/providers/commerce-provider.tsx", import.meta.url),
      "utf8",
    );
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const providerModule = {
      exports: {} as {
        CommerceProvider: (props: { children: null }) => { props: { value: Value } };
      },
    };
    runInNewContext(compiled, {
      module: providerModule,
      exports: providerModule.exports,
      require(name: string) {
        if (name === "react") return hooks;
        // This host harness executes the provider itself, not its route-observer
        // child. Actual route transitions are covered by browser regressions.
        if (name === "next/navigation")
          return { usePathname: () => "/", useSearchParams: () => new URLSearchParams() };
        if (name === "react/jsx-runtime")
          return {
            jsx: (type: unknown, props: unknown) => ({ type, props }),
            jsxs: (type: unknown, props: unknown) => ({ type, props }),
          };
        if (name === "@/data/products") return { products };
        if (name === "@/lib/cart") return cart;
        if (name === "@/lib/commerce-persistence")
          return require("../../src/lib/commerce-persistence.ts");
        throw new Error(`Unexpected provider dependency: ${name}`);
      },
      localStorage: storage,
      window: {
        localStorage: storage,
        addEventListener(name: string, listener: (event: unknown) => void) {
          if (!listeners.has(name)) listeners.set(name, new Set());
          listeners.get(name)!.add(listener);
        },
        removeEventListener(name: string, listener: (event: unknown) => void) {
          listeners.get(name)?.delete(listener);
        },
      },
      requestAnimationFrame(callback: () => void) {
        const id = ++frameId;
        frames.set(id, callback);
        return id;
      },
      cancelAnimationFrame(id: number) {
        frames.delete(id);
      },
      navigator: { locks },
      AbortController,
      setTimeout,
      clearTimeout,
    });
    tabs.push(api);
    api.flush();
    return api;
  }
  return {
    tab,
    get raw() {
      return raw;
    },
    external(next: string | null, eventKey: string | null = key, payload = next) {
      raw = next;
      tabs.forEach((tab) => tab.emit({ key: eventKey, newValue: payload }));
      tabs.forEach((tab) => tab.flush());
    },
    get writes() {
      return writes;
    },
    get pending() {
      return events.length;
    },
    reset() {
      events.length = 0;
      writes = 0;
    },
    drain(limit = 24) {
      for (let i = 0; i < limit && events.length; i++) {
        events.shift()!();
        tabs.forEach((tab) => tab.flush());
      }
    },
  };
}

const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

test("actual provider: queued wishlist notices use each committed canonical result", async () => {
  const requests: (() => void)[] = [];
  const world = providerWorld({
    request(_name, _options, callback) {
      return new Promise<void>((resolve) => {
        requests.push(() => {
          callback();
          resolve();
        });
      });
    },
  });
  const a = world.tab();
  assert.equal(a.value.send({ type: "wishlist", productId: first.id }), undefined);
  a.value.send({ type: "wishlist", productId: first.id });
  await tick();
  a.flush();
  assert.equal(requests.length, 1, "the second intent waits in the local FIFO");
  assert.equal(a.value.notice, "", "pending toggles must not announce success");
  assert.equal(world.raw, null);
  requests.shift()!();
  await tick();
  a.flush();
  const savedNotice = a.value.notice;
  const savedWishlist = [...a.value.state.wishlist];
  assert.equal(requests.length, 1);
  requests.shift()!();
  await tick();
  a.flush();
  assert.deepEqual(savedWishlist, [first.id]);
  assert.deepEqual(JSON.parse(world.raw!).wishlist, []);
  assert.deepEqual([...a.value.state.wishlist], []);
  assert.equal(savedNotice, `${first.name} saved to your wishlist.`);
  assert.equal(a.value.notice, `${first.name} removed from your wishlist.`);
  assert.equal(world.writes, 2);
});

function heldProvider() {
  const requests: (() => void)[] = [];
  const world = providerWorld({
    request(_name, _options, callback) {
      return new Promise<void>((resolve) => {
        requests.push(() => {
          callback();
          resolve();
        });
      });
    },
  });
  const a = world.tab();
  const seeded = cart.commerceReducer(cart.initialCommerceState, addFirst, products);
  world.external(cart.serializeCommerce(seeded));
  return { world, a, requests, seeded };
}

const removeFirst: CommerceAction = {
  type: "remove",
  productId: first.id,
  variantId: first.variants[0].id,
};

test("actual provider: removal completion is void, canonical, post-render and single-shot; no-op is silent", async () => {
  const { world, a, requests, seeded } = heldProvider();
  let calls = 0;
  assert.equal(
    a.value.send(removeFirst, ({ before, state }) => {
      calls++;
      assert.equal(JSON.stringify(before), JSON.stringify(seeded));
      assert.equal(state.cart.length, 0);
      assert.equal(a.value.state.cart.length, 0, "the consumer sees a committed render");
      assert.equal(a.value.notice, `${first.name} removed from your bag.`);
    }),
    undefined,
  );
  await tick();
  a.flush();
  assert.equal(a.value.notice, "");
  assert.equal(a.pendingFrames, 0);
  assert.equal(calls, 0);
  assert.equal(requests.length, 1);
  requests.shift()!();
  await tick();
  assert.equal(calls, 0, "promise completion alone cannot focus pre-render DOM");
  a.flush();
  assert.equal(a.value.notice, `${first.name} removed from your bag.`);
  assert.equal(a.pendingFrames, 1);
  a.frame();
  a.frame();
  assert.equal(calls, 1);
  a.value.notify("unchanged");
  a.flush();
  a.value.send(removeFirst, ({ before, state }) => {
    assert.equal(before.cart.length, 0);
    assert.equal(state.cart.length, 0);
    calls++;
  });
  await tick();
  requests.shift()!();
  await tick();
  a.frame();
  assert.equal(calls, 2, "the latest no-op completion can still repair focus for an absent row");
  assert.equal(a.value.notice, "unchanged", "a duplicate remove must not announce success");
  assert.equal(world.writes, 1);
});

for (const phase of ["pending", "scheduled", "dequeued"] as const) {
  for (const cancellation of [
    "dismiss",
    "replace",
    "navigate",
    "send",
    "add",
    "dispose",
  ] as const) {
    test(`actual provider: ${cancellation} cancels ${phase} completion, not accepted mutations`, async () => {
      const { world, a, requests } = heldProvider();
      let calls = 0;
      a.value.send(removeFirst, () => calls++);
      await tick();
      let dequeued: (() => void) | undefined;
      if (phase !== "pending") {
        requests.shift()!();
        await tick();
        a.flush();
        assert.equal(a.pendingFrames, 1);
        if (phase === "dequeued") dequeued = a.takeFrame();
      }
      if (cancellation === "dismiss") a.value.closeOverlay();
      else if (cancellation === "replace") a.value.openCart();
      else if (cancellation === "navigate") a.emit({}, "popstate");
      else if (cancellation === "send") a.value.send({ type: "wishlist", productId: second.id });
      else if (cancellation === "add") a.value.addItem(second.id, second.variants[0].id, 1);
      else a.dispose();
      assert.equal(a.pendingFrames, 0, "supersession synchronously cancels the owned frame");
      dequeued?.(); // Cancellation alone is insufficient: recheck identity/generations at execution.
      for (let i = 0; i < 3; i++) {
        await tick();
        requests.shift()?.();
      }
      await tick();
      if (cancellation !== "dispose") a.frame();
      assert.equal(calls, 0);
      assert.equal(a.pendingFrames, 0);
      assert.equal(a.lateUpdates, 0, "late promises cannot dispatch or schedule after disposal");
      assert.equal(
        JSON.parse(world.raw!).cart.some(
          (line: { productId: string }) => line.productId === first.id,
        ),
        false,
      );
      if (cancellation === "send") assert.deepEqual(JSON.parse(world.raw!).wishlist, [second.id]);
      if (cancellation === "add") assert.equal(JSON.parse(world.raw!).cart[0].productId, second.id);
    });
  }
}

test("actual provider: latest duplicate removal gets the no-op completion without duplicate success", async () => {
  const { a, requests, world } = heldProvider();
  let oldCalls = 0;
  let latestCalls = 0;
  a.value.send(removeFirst, () => oldCalls++);
  a.value.send(removeFirst, ({ before, state }) => {
    assert.equal(before.cart.length, 0, "the second remove rebases to an already absent row");
    assert.equal(state.cart.length, 0);
    latestCalls++;
  });
  await tick();
  assert.equal(requests.length, 1);
  requests.shift()!();
  await tick();
  a.flush();
  assert.equal(a.value.notice, `${first.name} removed from your bag.`);
  assert.equal(a.pendingFrames, 0, "the superseded real removal cannot steal focus");
  a.value.notify("do not repeat success");
  requests.shift()!();
  await tick();
  a.frame();
  assert.equal(oldCalls, 0);
  assert.equal(latestCalls, 1);
  assert.equal(a.value.notice, "do not repeat success");
  assert.equal(world.writes, 1);
});

function persistenceFactory(): typeof import("../../src/lib/commerce-persistence.ts").createCommercePersistence {
  return require("../../src/lib/commerce-persistence.ts").createCommercePersistence;
}

test("serialized transactions rebase overlapping tabs and retain pending local intent", async () => {
  const create = persistenceFactory();
  let raw: string | null = null;
  let writes = 0;
  const requests: { name: string; run: () => void }[] = [];
  const locks = {
    request(
      name: string,
      _options: { mode: "exclusive"; signal: AbortSignal },
      callback: () => void,
    ) {
      return new Promise<void>((resolve) =>
        requests.push({
          name,
          run: () => {
            callback();
            resolve();
          },
        }),
      );
    },
  };
  const storage = {
    read: () => raw,
    write: (next: string) => {
      raw = next;
      writes++;
    },
  };
  let aState = cart.initialCommerceState;
  let bState = cart.initialCommerceState;
  const a = create({
    products,
    storage,
    locks,
    onState: (state) => {
      aState = state;
    },
    onStorageError() {},
  });
  const b = create({
    products,
    storage,
    locks,
    onState: (state) => {
      bState = state;
    },
    onStorageError() {},
  });
  a.sync();
  b.sync();
  const add = {
    type: "add" as const,
    productId: first.id,
    variantId: first.variants[0].id,
    quantity: 1,
  };
  const one = a.send(add);
  const two = b.send({ type: "wishlist", productId: second.id });
  const three = a.send({ ...add, type: "quantity", quantity: 3 });
  await tick();
  assert.equal(requests.length, 2, "one lock request per tab, not per queued action");
  requests.shift()!.run();
  await tick();
  b.sync();
  assert.equal(bState.cart.length, 0, "remote events cannot replace a tab's pending transaction");
  requests.shift()!.run();
  await tick();
  a.sync();
  requests.shift()!.run();
  await Promise.all([one, two, three]);
  a.sync();
  b.sync();
  const expected = {
    cart: [{ productId: first.id, variantId: first.variants[0].id, quantity: 3 }],
    wishlist: [second.id],
  };
  assert.deepEqual(aState, expected);
  assert.deepEqual(bState, expected);
  assert.deepEqual(JSON.parse(raw!), { version: 1, ...expected });
  assert.equal(writes, 3);
  for (let i = 0; i < 24; i++) {
    a.sync();
    b.sync();
  }
  assert.equal(writes, 3, "remote hydration never persists");
  assert.equal(requests.length, 0);
});

test("actual provider: overlapping tab intents converge without storage-event echoes", async () => {
  const world = providerWorld();
  const a = world.tab();
  const b = world.tab();
  world.reset();
  a.value.send({ type: "wishlist", productId: first.id });
  b.value.send({ type: "wishlist", productId: second.id });
  await tick();
  a.flush();
  b.flush();
  world.drain();
  assert.equal(world.pending, 0, `remote echoes must stop (writes=${world.writes})`);
  assert.ok(world.writes <= 2, `only local intents may write (writes=${world.writes})`);
  assert.deepEqual([...a.value.state.wishlist].sort(), [first.id, second.id].sort());
  assert.deepEqual([...b.value.state.wishlist].sort(), [first.id, second.id].sort());
});

test("actual provider: stale notifications re-read storage; remove and clear never echo", async () => {
  const world = providerWorld();
  const a = world.tab();
  const b = world.tab();
  assert.equal(world.writes, 0, "hydration alone must not write");
  const saved = { cart: [], wishlist: [first.id] };
  world.external(
    cart.serializeCommerce(saved),
    key,
    cart.serializeCommerce(cart.initialCommerceState),
  );
  assert.deepEqual([...a.value.state.wishlist], [first.id]);
  assert.deepEqual([...b.value.state.wishlist], [first.id]);
  world.external(null, key, cart.serializeCommerce(saved));
  assert.equal(a.value.state.wishlist.length, 0, "removeItem reads missing current state");
  world.external(cart.serializeCommerce(saved));
  world.external(null, null);
  assert.equal(b.value.state.wishlist.length, 0, "clear events also invalidate current state");
  assert.equal(world.writes, 0);
  assert.equal(world.pending, 0);
});

test("actual provider: drawer waits for committed add and following quantity intent is retained", async () => {
  const world = providerWorld();
  const a = world.tab();
  a.value.addItem(first.id, first.variants[0].id, 1);
  a.flush();
  assert.equal(a.value.overlay, null, "do not expose an empty drawer before the add");
  a.value.send({
    type: "quantity",
    productId: first.id,
    variantId: first.variants[0].id,
    quantity: 3,
  });
  await tick();
  a.flush();
  assert.equal(JSON.stringify(a.value.overlay), '{"type":"cart"}');
  assert.equal(a.value.state.cart[0].quantity, 3);
  assert.equal(JSON.parse(world.raw!).cart[0].quantity, 3);
  assert.equal(world.writes, 2);
});

function memoryPersistence(
  options: {
    raw?: string | null;
    readBlocked?: boolean;
    writeBlocked?: boolean;
    locks?: import("../../src/lib/commerce-persistence.ts").CommerceLocks;
    lockWaitMs?: number;
  } = {},
) {
  let raw = options.raw ?? null;
  let writes = 0;
  let errors = 0;
  let state = cart.initialCommerceState;
  const controller = persistenceFactory()({
    products,
    locks: options.locks,
    lockWaitMs: options.lockWaitMs,
    storage: {
      read() {
        if (options.readBlocked) throw new Error("read blocked");
        return raw;
      },
      write(next) {
        if (options.writeBlocked) throw new Error("write blocked");
        raw = next;
        writes++;
      },
    },
    onState(next) {
      state = next;
    },
    onStorageError() {
      errors++;
    },
  });
  controller.sync();
  return {
    ...controller,
    get state() {
      return state;
    },
    get raw() {
      return raw;
    },
    get writes() {
      return writes;
    },
    get errors() {
      return errors;
    },
  };
}

const addFirst: CommerceAction = {
  type: "add",
  productId: first.id,
  variantId: first.variants[0].id,
  quantity: 1,
};

for (const order of ["AABB", "ABAB", "ABBA", "BAAB", "BABA", "BBAA"]) {
  test(`overlapping same-line adds and independent wishlist intents converge in lock order ${order}`, async () => {
    let raw: string | null = null;
    let writes = 0;
    const requests: { tab: string; run: () => void }[] = [];
    const make = (tab: string) =>
      persistenceFactory()({
        products,
        storage: {
          read: () => raw,
          write: (next) => {
            raw = next;
            writes++;
          },
        },
        locks: {
          request(name, _options, callback) {
            assert.equal(name, key, "all tabs must share one canonical lock name");
            return new Promise<void>((resolve) =>
              requests.push({
                tab,
                run() {
                  callback();
                  resolve();
                },
              }),
            );
          },
        },
        onState() {},
        onStorageError() {
          assert.fail("storage remains available");
        },
      });
    const a = make("A");
    const b = make("B");
    const operations = [
      a.send(addFirst),
      b.send(addFirst),
      a.send({ type: "wishlist", productId: first.id }),
      b.send({ type: "wishlist", productId: second.id }),
    ];
    for (const tab of order) {
      await tick();
      const index = requests.findIndex((request) => request.tab === tab);
      assert.ok(index >= 0, `${tab} must have an outstanding lock request`);
      requests.splice(index, 1)[0].run();
      // Deliver a notification while the other tab's intents remain queued.
      a.sync();
      b.sync();
    }
    await Promise.all(operations);
    const persisted = JSON.parse(raw!);
    assert.equal(persisted.cart[0].quantity, 2, "neither concurrent increment is lost");
    assert.deepEqual(persisted.wishlist.sort(), [first.id, second.id].sort());
    assert.equal(writes, 4);
    assert.equal(requests.length, 0);
    for (let i = 0; i < 24; i++) {
      a.sync();
      b.sync();
    }
    assert.equal(writes, 4);
  });
}

test("no-lock fallback queues rapid adds, clamps stock, preserves wishlist and skips no-op writes", async () => {
  const p = memoryPersistence();
  await Promise.all(Array.from({ length: 12 }, () => p.send(addFirst)));
  assert.equal(p.state.cart[0].quantity, first.variants[0].demoStock);
  assert.equal(p.writes, first.variants[0].demoStock);
  await p.send({ type: "wishlist", productId: second.id });
  await p.send({ type: "clear-cart" });
  assert.deepEqual(p.state, { cart: [], wishlist: [second.id] });
  const before = p.writes;
  await p.send({ type: "clear-cart" });
  assert.equal(p.writes, before);
  assert.deepEqual(JSON.parse(p.raw!), { version: 1, cart: [], wishlist: [second.id] });
});

for (const blocked of ["readBlocked", "writeBlocked"] as const) {
  test(`${blocked}: every local intent survives in-memory without remote overwrite or retry loops`, async () => {
    const p = memoryPersistence({ [blocked]: true });
    await p.send(addFirst);
    p.sync();
    await p.send(addFirst);
    await p.send({ type: "wishlist", productId: second.id });
    p.sync();
    assert.equal(p.state.cart[0].quantity, 2);
    assert.deepEqual(p.state.wishlist, [second.id]);
    assert.equal(p.errors, 1);
    assert.equal(p.writes, 0);
  });
}

test("corrupt persistence hydrates empty without writing, then a local intent repairs version 1", async () => {
  const p = memoryPersistence({ raw: "{broken" });
  assert.deepEqual(p.state, cart.initialCommerceState);
  assert.equal(p.writes, 0);
  await p.send(addFirst);
  assert.deepEqual(JSON.parse(p.raw!), {
    version: 1,
    cart: [Object.fromEntries(Object.entries(addFirst).filter(([key]) => key !== "type"))],
    wishlist: [],
  });
  assert.equal(p.errors, 0);
});

for (const failure of ["throw", "reject", "timeout"] as const) {
  test(`lock ${failure}: bounded fallback applies once, ignores late grants, and keeps FIFO`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let requests = 0;
    let lateGrant: (() => void) | undefined;
    const p = memoryPersistence({
      lockWaitMs: 20,
      locks: {
        request(_name, options, callback) {
          requests++;
          assert.equal(options.mode, "exclusive");
          if (failure === "throw") throw new Error("blocked");
          if (failure === "reject") return Promise.reject(new Error("blocked"));
          lateGrant = callback;
          return new Promise(() => {});
        },
      },
    });
    const one = p.send(addFirst);
    const two = p.send(addFirst);
    await tick();
    if (failure === "timeout") {
      assert.equal(p.writes, 0);
      t.mock.timers.tick(20);
    }
    await Promise.all([one, two]);
    lateGrant?.();
    p.sync();
    assert.equal(p.state.cart[0].quantity, 2);
    assert.equal(p.writes, 2);
    assert.equal(requests, 1, "disable unusable locks for subsequent intents in this visit");
    assert.equal(p.errors, 0, "lock unavailability is not a storage failure");
  });
}
