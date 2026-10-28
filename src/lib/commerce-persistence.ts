import {
  commerceReducer,
  initialCommerceState,
  parseCommerce,
  serializeCommerce,
  type CommerceAction,
  type CommerceState,
} from "./cart.ts";
import type { Product } from "../types/product.ts";

export const COMMERCE_STORAGE_KEY = "shopthie-commerce-v1";

/** Structural subset of LockManager, also usable by deterministic schedulers. */
export type CommerceLocks = {
  request: (
    name: string,
    options: { mode: "exclusive"; signal: AbortSignal },
    callback: () => void,
  ) => Promise<unknown>;
};

type Options = {
  products: Product[];
  storage: { read: () => string | null; write: (value: string) => void };
  locks?: CommerceLocks;
  lockWaitMs?: number;
  onState: (state: CommerceState) => void;
  onStorageError: () => void;
};
export type Change = { before: CommerceState; state: CommerceState };

/** Only local intents write. Remote events are hints to read current storage,
 * never snapshots to echo. Each tab queues its own intents; cooperating tabs
 * serialize the entire synchronous read/reduce/write under one origin lock.
 * Without usable locks this is best-effort, not a cross-tab atomicity claim.
 */
export function createCommercePersistence(options: Options) {
  let state = initialCommerceState;
  let available = true;
  let locks = options.locks;
  let pending = 0;
  let tail: Promise<unknown> = Promise.resolve();

  function storageError() {
    available = false;
    options.onStorageError();
  }

  function read() {
    if (available) {
      try {
        state = parseCommerce(options.storage.read(), options.products);
      } catch {
        storageError();
      }
    }
    return state;
  }

  function sync() {
    // A storage notification must not replace this tab's queued local work.
    // The final transaction re-reads after the queue drains instead.
    if (pending) return;
    options.onState(read());
  }

  function commit(action: CommerceAction): Change {
    const before = read();
    state = commerceReducer(before, action, options.products);
    if (available && serializeCommerce(before) !== serializeCommerce(state)) {
      try {
        options.storage.write(serializeCommerce(state));
      } catch {
        // Keep the reduced state, including this intent, for this visit.
        storageError();
      }
    }
    options.onState(state);
    return { before, state };
  }

  function exclusive(operation: () => Change): Promise<Change> {
    if (!locks || !available) return Promise.resolve(operation());
    const manager = locks;
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      let finished = false;
      const run = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try {
          resolve(operation());
        } catch (error) {
          reject(error);
        }
      };
      const fallback = () => {
        if (finished) return;
        locks = undefined;
        // Cancel a queued lock and guard against a late/nonconforming grant.
        controller.abort();
        run();
      };
      const timer = setTimeout(fallback, options.lockWaitMs ?? 2000);
      try {
        Promise.resolve(
          manager.request(
            COMMERCE_STORAGE_KEY,
            {
              mode: "exclusive",
              signal: controller.signal,
            },
            run,
          ),
        ).catch(fallback);
      } catch {
        fallback();
      }
    });
  }

  function send(action: CommerceAction): Promise<Change> {
    pending++;
    const result = tail.then(() => exclusive(() => commit(action)));
    // A rejected operation cannot poison subsequent local intents.
    tail = result.catch(() => {});
    return result.finally(() => {
      pending--;
      if (!pending) sync();
    });
  }

  return { sync, send };
}
