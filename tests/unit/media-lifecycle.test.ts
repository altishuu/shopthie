import { test } from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { watchMedia } from "../../src/lib/media-lifecycle.ts";

class Query extends EventTarget {
  matches: boolean;
  constructor(matches: boolean) {
    super();
    this.matches = matches;
  }
}

test("media lifecycle removes every native listener and active scene exactly once", () => {
  const queries = { wide: new Query(true), reduce: new Query(false) };
  let enters = 0,
    exits = 0;
  const dispose = watchMedia(
    { wide: "wide", reduce: "reduce" },
    (conditions) => {
      assert.deepEqual(conditions, { wide: true, reduce: false });
      enters += 1;
      return () => {
        exits += 1;
      };
    },
    (key) => queries[key as keyof typeof queries],
  );
  assert.equal(enters, 1);
  for (const source of Object.values(queries))
    assert.equal(getEventListeners(source, "change").length, 1);
  dispose();
  dispose();
  assert.equal(exits, 1);
  for (const source of Object.values(queries)) {
    assert.equal(getEventListeners(source, "change").length, 0);
    source.dispatchEvent(new Event("change"));
  }
  assert.equal(enters, 1);
});

test("changed conditions revert before recreation; duplicate events do not recreate", () => {
  const queries = { wide: new Query(true), reduce: new Query(false) };
  const events: string[] = [];
  const dispose = watchMedia(
    { wide: "wide", reduce: "reduce" },
    (conditions) => {
      events.push(`enter:${conditions.wide}:${conditions.reduce}`);
      return () => {
        events.push("exit");
      };
    },
    (key) => queries[key as keyof typeof queries],
  );
  queries.wide.matches = false;
  queries.reduce.matches = true;
  queries.wide.dispatchEvent(new Event("change"));
  queries.reduce.dispatchEvent(new Event("change"));
  assert.deepEqual(events, ["enter:true:false", "exit", "enter:false:true"]);
  dispose();
  assert.equal(events.at(-1), "exit");
});

test("a failing initial scene still removes registered native listeners", () => {
  const source = new Query(true);
  assert.throws(
    () =>
      watchMedia(
        { wide: "wide" },
        () => {
          throw new Error("expected");
        },
        () => source,
      ),
    /expected/,
  );
  assert.equal(getEventListeners(source, "change").length, 0);
});
