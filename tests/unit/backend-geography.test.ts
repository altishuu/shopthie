import assert from "node:assert/strict";
import test from "node:test";
import {
  createGeographyCatalog,
  getCountries,
  getCountry,
} from "../../src/modules/geography/catalog.ts";

test("the reviewed pinned catalog exposes real bounded data and country-aware presence flags", () => {
  const countries = getCountries();
  assert.equal(countries.length, 250);
  assert.equal(
    countries.reduce((n, c) => n + c.subdivisions.length, 0),
    3847,
  );
  assert.equal(getCountry("AN"), null);
  assert.equal(getCountry("CS"), null);
  assert.ok(getCountry("XK"));
  assert.equal(getCountry("US")?.requirePostal, true);
  assert.equal(getCountry("SG")?.requireLocality, false);
  assert.equal(getCountry("SG")?.requirePostal, true);
  assert.equal(getCountry("AE")?.requirePostal, false);
  assert.equal(getCountry("AG")?.requireLocality, false);
  assert.equal(getCountry("HK")?.subdivisions.length, 0);
  assert.equal(getCountry("HK")?.requireSubdivision, true);
  assert.ok(
    getCountry("US")?.subdivisions.some(
      (row) => row.name === "California" && /^[1-9][0-9]*$/.test(row.code),
    ),
  );
  for (const country of countries)
    assert.equal(
      new Set(country.subdivisions.map((row) => row.code)).size,
      country.subdivisions.length,
    );
});

test("unconfigured geography fails explicitly instead of fabricating empty worldwide coverage", () => {
  const catalog = createGeographyCatalog(null);
  assert.throws(() => catalog.getCountries(), /unavailable/);
  assert.throws(() => catalog.getCountry("US"), /unavailable/);
});

test("a configured reference catalog preserves source identifiers without repair", () => {
  const country = {
    code: "US",
    name: "United States",
    subdivisionLabel: "State",
    requireSubdivision: true,
    requireLocality: true,
    requirePostal: true,
    subdivisions: [{ code: "CA", name: "California" }],
  };
  const catalog = createGeographyCatalog([country]);
  assert.equal(catalog.getCountry("US"), country);
  assert.equal(catalog.getCountry("us"), null);
  assert.equal(catalog.getCountry("US\n"), null);
  assert.deepEqual(catalog.getCountries(), [country]);
});
