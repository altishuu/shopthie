export type GeographyCountry = {
  code: string;
  name: string;
  subdivisionLabel: string;
  requireSubdivision: boolean;
  requireLocality: boolean;
  requirePostal: boolean;
  subdivisions: readonly { code: string; name: string }[];
};
export type GeographyLookup = (code: string) => GeographyCountry | null;
