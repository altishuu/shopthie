# Area 4 — saved addresses and geography contract

User authorized the next bounded area after profiles. Implement an owned saved-address book and its country/subdivision reference data, then stop. No age/DOB, MFA UI, staff/support, public signup, email, payments/orders, paid maps/geocoding, commits/pushes or frontend deployment. Synthetic test details only until public privacy readiness. Preserve the storefront and existing motion architecture.

## Domain / application

- Up to 10 saved addresses per verified current actor; no owner-ID selector. Optional label (40 characters), required recipient (100), line1 (180), optional line2 (180), country code, optional coded subdivision or manual subdivision fallback (100), locality (100), postal code (32), explicit boolean default marker.
- Single-line Unicode text, literal preservation, bounded code-point length, no leading/trailing whitespace or control/line-separator characters. Do not silently normalize user input. Optional empty strings become SQL/DTO null. Country-aware required locality/postal/subdivision flags follow reviewed reference metadata, not invented shipping rules. Manual subdivisions are explicitly unverified coverage fallbacks; coded subdivision membership must be checked against the selected country in SQL as well as the app.
- At most one default, not necessarily exactly one. Saving with is_default=true clears other defaults atomically. Deleting a default may leave none; do not silently choose another. Existing checkout remains a demo, not connected to this address book.
- Global per-account book revision protects create/edit/delete/default changes. Empty initial book revision 0; successful mutation increments by 1, including deleting the last address. Book revision must survive an empty book to reject stale replays.
- Client expected_subject is a stale-editor assertion against verified current identity only, never a SQL owner/target selector.
- Form operation save: exact fields operation,id,revision,expected_subject,label,recipient,line1,line2,country_code,subdivision_code,subdivision_text,locality,postal_code,is_default. Blank id means create. Delete: exact operation,id,revision,expected_subject. Reject unknown/duplicate/authority fields; allow framework $ACTION_ fields.
- Address DTO fields only: id,label,recipient,line1,line2,country_code,subdivision_code,subdivision_text,locality,postal_code,is_default. Book DTO exactly {revision,addresses}; stable deterministic row ordering, maximum 10. No owner IDs, role/email/age data or timestamps.
- Saved-address UI is `/account/addresses`, reusing identity styling and scoped Suspense. One active editor or delete confirmation at a time; disable mutations while pending/conflicted. Preserve drafts on errors/conflicts, announce success only for validated committed results, offer full reload on conflict. Key private manager by verified subject. Never put private address responses in shared caches.

## Geography boundary — reviewed pinned reference data

Adopted GeoNames countryInfo/ADM1 extracts plus Google libaddressinput country-format metadata at commit `81eb9628382b07d371d8ea0b11badf7de3857fd5`; both DATA sources declare CC BY 4.0. Actual raw data, source hashes, retrieval provenance, derived JSON and attribution are retained under `src/modules/geography/data/`. No city dataset. Selected catalog: 250 countries/territories and 3847 country-scoped numeric GeoNames IDs (strings, NOT ISO 3166-2); obsolete AN/CS excluded, XK retained. HK's 18 ADM1 districts are intentionally excluded from postal-area suggestions; require manual area there. AC/TA are not silently merged into another identifier or separately selectable. 23 countries have no selectable subdivision entries, which is NOT a claim that they lack administrative divisions.

Country required-presence flags inherit missing Google require from ZZ; locality/postal/subdivision presence is not strict postal validation. Manual area fallback is always available for coverage/postal/admin mismatch. Retain exact matching app/DB data, stable IDs and a deliberate refresh/migration policy. Static public reference assets remain public/cached; disabling geography blocks dependent address operations, not deletion of already distributed public licensed data.

GeographyCountry = {code,name,subdivisionLabel,requireSubdivision,requireLocality,requirePostal,subdivisions:[{code,name}]}. Reference IDs must be source-defined or explicitly documented derived country-scoped IDs, with gaps exposed via manual fallback. Public reference data may be bundled/cached, but never private data. Record upstream pinned version, attribution/license, exact collected/deduplicated counts and coverage limits before adoption. No claim of universally complete/current administrative geography, deliverability or worldwide shipping. Countries without postal/subdivision requirements must remain usable.

## Planned SQL interface / invariants

- public.shopthie_addresses_read() => book DTO.
- public.shopthie_address_save(p_id uuid nullable,p_address jsonb,p_revision integer) => whole committed book DTO; p_address exactly the 10 editable address fields (no id/owner/revision).
- public.shopthie_address_delete(p_id uuid,p_revision integer) => whole committed book DTO.
- Guard address.manage_own against live identity/status/membership/MFA/module/dependencies. Lock the existing app_accounts row for both first setup and edits; recheck capability after lock, then compare book revision before mutations. Constrain row mutations by BOTH ID and auth.uid(). Foreign/unknown IDs use the same generic conflict response.
- Atomic cap/default/revision, default unique partial index, private storage/default-deny RLS/no raw anon/authenticated grants. Fixed empty search_path private definers and public invoker wrappers with minimal authenticated-only execution.
- Explicit errors: P0001/address_conflict and P0001/address_limit; 42501/address_denied; 22023/address_invalid. No raw provider messages or private fields in UI/logs.
- Enable only geography and addresses on top of the already enabled profiles/foundations. Keep prior migrations/fixture unchanged. Parent owns hosted migration/readback, integration tests and handoff.
