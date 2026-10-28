type QuerySource = {
  readonly matches: boolean;
  addEventListener: (type: "change", listener: () => void) => void;
  removeEventListener: (type: "change", listener: () => void) => void;
};

/** Explicitly own native media-query listeners as well as each rebuilt scene. */
export function watchMedia<Key extends string>(
  queries: Record<Key, string>,
  activate: (conditions: Record<Key, boolean>) => void | (() => void),
  match: (query: string) => QuerySource = (query) => window.matchMedia(query),
): () => void {
  const sources = (Object.entries(queries) as [Key, string][]).map(([key, query]) => ({
    key,
    source: match(query),
  }));
  let conditions: Record<Key, boolean> | undefined;
  let cleanup: (() => void) | undefined;
  let disposed = false;
  const update = () => {
    if (disposed) return;
    const next = Object.fromEntries(
      sources.map(({ key, source }) => [key, source.matches]),
    ) as Record<Key, boolean>;
    if (conditions && sources.every(({ key }) => conditions![key] === next[key])) return;
    const previousCleanup = cleanup;
    cleanup = undefined;
    previousCleanup?.();
    conditions = next;
    cleanup = activate(next) || undefined;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    sources.forEach(({ source }) => source.removeEventListener("change", update));
    const previousCleanup = cleanup;
    cleanup = undefined;
    previousCleanup?.();
  };
  try {
    sources.forEach(({ source }) => source.addEventListener("change", update));
    update();
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}
