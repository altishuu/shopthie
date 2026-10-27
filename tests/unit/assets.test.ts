import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { assetCredits } from "../../src/data/asset-credits.ts";

test("every catalog photograph has a local file and public attribution record", () => {
  assert.equal(assetCredits.length, 8);
  assert.equal(new Set(assetCredits.map((asset) => asset.id)).size, assetCredits.length);
  for (const asset of assetCredits) {
    assert.ok(existsSync(`public${asset.src}`), `Missing image: ${asset.src}`);
    assert.ok(asset.author.length > 0);
    assert.match(asset.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.match(asset.licenseUrl, /^https:\/\/creativecommons\.org\/licenses\//);
    assert.match(asset.changes, /resiz|encod/i);
  }
});
