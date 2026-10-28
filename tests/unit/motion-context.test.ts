import { test, after } from "node:test";
import assert from "node:assert/strict";
import { gsap } from "gsap";
import { independentMotion } from "../../src/lib/motion-context.ts";

after(() => gsap.ticker.sleep());

test("an entrance remains owned by the page when started from a loader callback", () => {
  const page = gsap.context(() => {});
  const loader = gsap.context(() => {});
  const value = { x: 0 };
  let tween!: gsap.core.Tween;
  try {
    loader.add(() =>
      independentMotion(() =>
        page.add(() => {
          tween = gsap.to(value, { x: 100, duration: 1, paused: true, ease: "none" });
        }),
      ),
    );
    tween.progress(0.4);
    loader.revert();
    assert.equal(value.x, 40, "loader cleanup must not revert an unrelated page scope");
    assert.equal(page.isReverted, false);
    tween.progress(0.8);
    assert.equal(value.x, 80, "the same entrance can continue to its natural completion");
    page.revert();
    assert.equal(value.x, 0, "the page still cleans up its own animation");
  } finally {
    loader.revert();
    page.revert();
  }
});

test("scope construction inside a foreign animation callback is independent too", () => {
  const bridge = gsap.context(() => {});
  const value = { x: 0 };
  let page!: gsap.Context;
  let tween!: gsap.core.Tween;
  try {
    bridge.add(() => {
      page = independentMotion(() =>
        gsap.context(() => {
          tween = gsap.to(value, { x: 100, duration: 1, paused: true, ease: "none" });
        }),
      );
    });
    tween.progress(0.5);
    bridge.revert();
    assert.equal(value.x, 50);
    assert.equal(page.isReverted, false);
  } finally {
    bridge.revert();
    page?.revert();
  }
});

test("independent registration restores the caller's GSAP context even after errors", () => {
  const caller = gsap.context(() => {});
  try {
    caller.add(() => {
      assert.equal(gsap.context(), caller);
      assert.throws(
        () =>
          independentMotion(() => {
            throw new Error("expected");
          }),
        /expected/,
      );
      assert.equal(gsap.context(), caller);
      assert.equal(
        independentMotion(() => 42),
        42,
      );
      assert.equal(gsap.context(), caller);
    });
  } finally {
    caller.revert();
  }
});
