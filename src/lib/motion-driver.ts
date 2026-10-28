type ScrollEngine = {
  raf: (milliseconds: number) => void;
  on: (event: "scroll", update: () => void) => unknown;
  off: (event: "scroll", update: () => void) => unknown;
  destroy: () => void;
};
type SharedTicker = {
  add: (frame: (seconds: number) => void) => unknown;
  remove: (frame: (seconds: number) => void) => unknown;
};

/** Own exactly one ticker callback; never create another RAF alongside GSAP. */
export function attachScrollDriver(
  engine: ScrollEngine,
  ticker: SharedTicker,
  update: () => void,
): () => void {
  const frame = (seconds: number) => engine.raf(seconds * 1000);
  engine.on("scroll", update);
  ticker.add(frame);
  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    ticker.remove(frame);
    engine.off("scroll", update);
    engine.destroy();
  };
}
