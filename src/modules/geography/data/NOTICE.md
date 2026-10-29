# Geography reference data notices

Country and first-level administrative suggestions are derived from the GeoNames geographical database (GeoNames and contributors), licensed under Creative Commons Attribution 4.0 International:

- https://download.geonames.org/export/dump/countryInfo.txt
- https://download.geonames.org/export/dump/admin1CodesASCII.txt
- https://download.geonames.org/export/dump/readme.txt
- License: https://creativecommons.org/licenses/by/4.0/

Country-format metadata is derived from Google libaddressinput data, licensed CC BY 4.0. Country data was extracted from the file at commit `81eb9628382b07d371d8ea0b11badf7de3857fd5`; Java implementation/source code is not redistributed here.

- https://github.com/google/libaddressinput/blob/81eb9628382b07d371d8ea0b11badf7de3857fd5/common/src/main/java/com/google/i18n/addressinput/common/RegionDataConstants.java
- Data/code license declaration: https://github.com/google/libaddressinput/blob/81eb9628382b07d371d8ea0b11badf7de3857fd5/README.md
- Metadata interpretation: https://github.com/google/libaddressinput/wiki/AddressValidationMetadata

**Modifications:** obsolete `AN`/`CS` country records excluded; source-defined `XK` retained. GeoNames numeric record IDs are strings scoped to the source country, not ISO 3166-2 codes. Country flags inherit missing `require` from Google `ZZ` defaults and are presence checks only. Hong Kong ADM1 district choices are deliberately omitted because they do not represent Google's postal areas; use manual area entry. `AC`/`TA` are not separate selectable countries in the GeoNames list and are not silently remapped. Names/IDs remain literal; options are sorted, and manual fallback remains available for gaps or postal/admin differences.

Exact raw-source checksums, retrieval time, counts and filters are in `provenance.json`. The two small GeoNames source DATA extracts and extracted Google country metadata are retained under `upstream/` to preserve the actual adopted snapshot. No city database is downloaded. These are public reference data artifacts, not snapshots/copies of Shopthie's application source.

This reference information does not guarantee complete/current geographic coverage, postal validation, deliverability or shipping availability. Refresh requires explicit review of IDs, affected saved addresses, attribution and a matching database migration; never silently retire/remap a referenced ID or change the application dataset independently of SQL validation.
