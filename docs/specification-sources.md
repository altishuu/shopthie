# Seed catalog specification provenance

Reviewed October 27, 2026. This is a historical-model frontend demonstration, not an inventory feed, availability statement, manufacturer endorsement, or current retail-price comparison.

## Verified facts used

- **AirPods Max:** Apple H1 in each ear cup; Active Noise Cancellation and Transparency mode. The support document describes the original model; no connector, newer generation, official finish, battery-life or lossless-audio claim is adopted.[1]
- **QuietComfort 25:** Bose support identifies the Acoustic Noise Cancelling model.[8] Its official product announcement supplies the single-AAA-battery fact; no runtime, device-specific cable compatibility, historical price or availability text is reused.[2]
- **AirPods Pro (2nd generation):** Apple H2 and Active Noise Cancellation. These minimal earbud facts are used without claiming the photographed case is Lightning or USB-C, or importing connector-specific resistance ratings.[9]
- **Pixel 8:** Google Tensor G3; 128 GB and 256 GB storage options, taken specifically from the **Pixel 8** section, not Pixel 8 Pro or Pixel 8a. Google notes regional/channel storage variation; our choices are simulated selections, not a claim that any particular finish/storage SKU is available.[4]
- **iPhone 15:** A16 Bionic; 128 GB, 256 GB and 512 GB capacity options from the base iPhone 15 support document, not a Pro model.[5]
- **JBL Flip 3:** Bluetooth 4.1; output power 2 × 8 W, from the English manufacturer specification sheet. No later Flip generation or IP water-resistance rating is inferred.[6]
- **Sonos PLAY:1:** two Class-D digital amplifiers; one 10/100 Mbps Ethernet port. The retrieved PDF is a multi-product user guide despite its filename; facts were checked in its **Play:1 → Specifications** chapter, not the One or One SL chapters.[7]

The prose descriptions are original editorial copy, not additional technical specifications. Every product description explicitly states that its USD price and stock are mock.

## Photographs and variants

Image identity, filenames, dimensions, authors and licenses remain grounded in `docs/catalog-sources.json`, `docs/asset-manifest.md` and `src/data/asset-credits.ts`. Every image references its matching existing credit ID; local JPEG dimensions were also checked against the manifest. AirPods Max has two images; the other models have one each.

Pixel 8 retains only the sourced Rose photograph. iPhone 15 retains the photographed finish without giving it an unverified official color name. Both phones reuse their single photograph for every storage selection; the photograph does **not** prove the pictured device's storage capacity. The other products use one **Photographed model** variant. No invented color swatches or connector-generation variants are supplied.

## Mock commerce data

**All prices are invented demo USD amounts, not manufacturer prices or sale offers. All stock is simulated: `demoStock: 5` per variant.** The schema has a model-level price, so every storage choice deliberately shares the same demo price; no storage upgrade premium is implied. Featured flags are editorial demo choices.

| Model | Mock USD price | Mock units per variant |
| --- | ---: | ---: |
| Apple AirPods Max | $449.00 | 5 |
| Bose QuietComfort 25 | $159.00 | 5 |
| Apple AirPods Pro (2nd generation) | $199.00 | 5 |
| Google Pixel 8 | $549.00 | 5 |
| Apple iPhone 15 | $649.00 | 5 |
| JBL Flip 3 | $79.00 | 5 |
| Sonos PLAY:1 | $149.00 | 5 |

## Retrieval limits

Apple, Google, JBL and Sonos source bodies were retrieved and inspected. Bose's support page returned an application shell, so its indexed official model title is used only for identity/noise-cancelling nomenclature; the static official Bose announcement was retrieved for the battery fact. A legacy Bose PDF endpoint had an expired TLS certificate and was not used. No certificate checks were bypassed.

There is no blocker for the minimal facts listed above. Exact connector/hardware SKUs, the iPhone photograph's official finish name, photographed phones' actual storage, live availability, real stock and real prices remain deliberately unasserted.

## Utility contract

- `src/data/products.ts`: `products: Product[]`; `categoryDefinitions: { slug: ProductCategory; label: string; description: string }[]`.
- `src/lib/catalog.ts`: `getProduct(slug): Product | undefined`; exact, case-sensitive slug lookup.
- `getCollection(category)`: **one category-definition object or `undefined`, never a product array**. Exact category-slug lookup; `all` has no collection metadata.
- `filterProducts(items, { query?, category?, brand?, sort? } = {})`: fresh `Product[]`; no input or nested data mutation. Query is a trimmed, case-insensitive substring across brand, name and description. Filters combine with AND. Category uses exact slugs; brand is trimmed/case-insensitive. Undefined, empty string and `all` category/brand values are unfiltered; other unknown values return no matches.
- Sorts: `featured` (also default/unknown fallback), `price-asc`, `price-desc`, `name` (English, case-insensitive). Ties preserve input order. Featured sorts true first, with false/undefined treated alike.

## Verification

`node --test tests/unit/catalog.test.ts`: 16 catalog tests, implemented in individual observed RED → GREEN cycles. Covers model uniqueness, licensed source mapping, galleries/variants, mock commerce, metadata lookup, search, categories, brands, sorting, stable ties, unknown/empty inputs and nonmutation. Full unit-suite totals may grow as parallel work lands; run `node --test tests/unit/*.test.ts` for the current total.

## Sources

[1] https://support.apple.com/en-ca/111858
[2] https://bose.com/pressroom/bose-quietcomfort-25-acoustic-noise-cancelling-headphones
[4] https://support.google.com/pixelphone/answer/7158570?hl=en
[5] https://support.apple.com/en-us/111831
[6] https://support.jbl.com/on/demandware.static/-/Sites-masterCatalog_Harman/default/dwbece8b7e/pdfs/JBL%20FLIP%203_SpecSheet_EN_Final_20%20May.pdf
[7] https://www.sonos.com/pdfs/productguides/en-us/play1guide.pdf
[8] https://support.bose.com/s/product/quietcomfort-25-acoustic-noise-cancelling-headphones/01t8c00000OydKfAAJ?language=en_US
[9] https://support.apple.com/en-us/111851
