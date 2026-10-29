import type { GeographyCountry } from "./types.ts";
import countries from "./data/countries.json" with { type: "json" };

/** Public reference data only. null is a real unavailable state, never invented coverage. */
export function createGeographyCatalog(countries: readonly GeographyCountry[] | null) {
  const byCode =
    countries === null ? null : new Map(countries.map((country) => [country.code, country]));
  const requireData = () => {
    if (countries === null) throw new Error("Geography reference data is unavailable.");
    return countries;
  };
  return {
    getCountries: (): readonly GeographyCountry[] => requireData(),
    getCountry: (code: string): GeographyCountry | null => {
      requireData();
      return byCode!.get(code) ?? null;
    },
  };
}

// Reviewed public reference data; attribution/filters/provenance accompany the pinned dataset.
const catalog = createGeographyCatalog(countries);
export const getCountries = catalog.getCountries;
export const getCountry = catalog.getCountry;
