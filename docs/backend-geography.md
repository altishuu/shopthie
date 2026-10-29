# Area 4 geography: adopted reference and limits

GeoNames country/ADM1 data declares CC BY 4.0 and no accuracy/timeliness/completeness warranty. Its source codes mix conventions and are not uniformly ISO 3166-2.[1] Google libaddressinput separately licenses DATA CC BY 4.0 and code Apache 2.0; this project extracts country metadata only, not Java implementation code.[2]

Country presence rules inherit missing `require` from `ZZ`; `C`, `S` and `Z` respectively concern locality, postal/administrative area and postal code. These are presence rules, not a deliverability certification.[3]

## Actual adopted artifact

Measured by the importer: 250 selectable countries/territories and 3847 country-scoped GeoNames record-ID strings, with 23 country entries having no selectable subdivisions. The two original GeoNames DATA extracts are retained; source SHA-256/retrieval/counts are in `src/modules/geography/data/provenance.json`. Google country metadata is pinned at `81eb9628382b07d371d8ea0b11badf7de3857fd5` and the extracted JSON is retained. No city database or paid geography service is used.

- Exclude obsolete AN/CS records; preserve source-defined XK. Country code identities are not silently changed.
- Preserve numeric GeoNames subdivision IDs as strings scoped to country; retain original mixed source codes in upstream DATA. A source ID is not promised permanent: retirement requires explicit review/migration of affected addresses.
- Do not list HK's 18 ADM1 districts as postal-area choices; the address form uses manual postal-area text there. Other countries always offer an explicit manual fallback for missing or differently structured postal/admin areas.
- AC/TA are present in Google's postal metadata but absent from the adopted GeoNames country list: they are not independently selectable and are not silently aliased into another ID. This is a coverage limitation, not a claim of complete global postal destinations.
- Locality/postal/admin presence follows pinned metadata with defaults, not GeoNames postal-format columns. No postal regex or actual delivery verification is claimed. Countries without these requirements remain valid.
- Reference data can be public/cached; customer addresses never are. The private address RPC independently validates exact country/subdivision membership against the same embedded seed. A geography module disable blocks dependent address operations, not already redistributed static public reference artifacts.

## Maintenance

No automatic network refresh. Review future source/license/ID/coverage changes, regenerate data and the database seed together, test country membership and affected saved data, and deploy a version-aligned migration. Do not silently remap/delete referenced IDs. Attribution/license and modification notices accompany the artifacts and are visible on the saved-address page.

This snapshot is address-book reference information only. It does not establish shipping coverage, authoritative current administrative boundaries, strict worldwide postal validation or public-service privacy readiness.

## Sources

[1] https://download.geonames.org/export/dump/readme.txt
[2] https://github.com/google/libaddressinput/blob/81eb9628382b07d371d8ea0b11badf7de3857fd5/README.md
[3] https://github.com/google/libaddressinput/wiki/AddressValidationMetadata
