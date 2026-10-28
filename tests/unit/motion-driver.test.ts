import { test } from "node:test";
import assert from "node:assert/strict";
import { attachScrollDriver } from "../../src/lib/motion-driver.ts";

function fixture() {
  const calls: unknown[][] = [];
  const frames = new Set<(seconds: number) => void>();
  const update = () => calls.push(["update"]);
  const engine = {
    raf: (milliseconds: number) => calls.push(["raf", milliseconds]),
    on: (name: string, listener: () => void) => calls.push(["on", name, listener]),
    off: (name: string, listener: () => void) => calls.push(["off", name, listener]),
    destroy: () => calls.push(["destroy"]),
  };
  const ticker = {
    add: (frame: (seconds: number) => void) => {
      frames.add(frame);
    },
    remove: (frame: (seconds: number) => void) => {
      frames.delete(frame);
    },
  };
  return { calls, frames, update, engine, ticker };
}

test("scroll engine uses exactly one shared ticker and converts seconds to milliseconds", () => {
  const f = fixture();
  const detach = attachScrollDriver(f.engine, f.ticker, f.update);
  assert.equal(f.frames.size, 1);
  [...f.frames][0](1.25);
  assert.deepEqual(f.calls[1], ["raf", 1250]);
  assert.deepEqual(f.calls[0], ["on", "scroll", f.update]);
  detach();
});

test("driver cleanup removes the exact frame and scroll listener and destroys once", () => {
  const f = fixture();
  const detach = attachScrollDriver(f.engine, f.ticker, f.update);
  detach();
  detach();
  assert.equal(f.frames.size, 0);
  assert.deepEqual(f.calls.slice(1), [["off", "scroll", f.update], ["destroy"]]);
});

test("Strict Mode setup-cleanup-setup has only one active driver", () => {
  const f = fixture();
  attachScrollDriver(f.engine, f.ticker, f.update)();
  const detach = attachScrollDriver(f.engine, f.ticker, f.update);
  assert.equal(f.frames.size, 1);
  detach();
  assert.equal(f.frames.size, 0);
});
