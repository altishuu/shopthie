import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMoney } from "../../src/lib/money.ts";

test("USD defaults format integer minor units with the dollar symbol", () => {
  assert.equal(formatMoney(34900), "$349.00");
  assert.equal(formatMoney(0), "$0.00");
});

test("money rejects non-integer or unsafe minor-unit amounts", () => {
  for (const amount of [NaN, Infinity, 12.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => formatMoney(amount), /safe integer/);
  }
});

test("currency configuration can change symbols and decimal precision without rewriting components", () => {
  assert.equal(formatMoney(24900, { currency: "EUR", locale: "en-US" }), "€249.00");
  assert.equal(formatMoney(24900, { currency: "JPY", locale: "en-US" }), "¥24,900");
  assert.equal(formatMoney(1234, { currency: "KWD", locale: "en-US" }), "KWD\u00a01.234");
  assert.equal(
    formatMoney(34900, { currency: "USD", locale: "en-US", symbolOverride: "US$" }),
    "US$349.00",
  );
});
