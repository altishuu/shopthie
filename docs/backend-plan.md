# Shopthie backend — planning draft

Status: IMPLEMENTATION AUTHORIZED AREA-BY-AREA. The user approved starting the backend blueprint. Area 1 foundation work is complete locally and verified; see `backend-progress.md` for limits and the hosted-target prerequisite. Existing storefront behavior, free-only limits, deferred email/age policy, no Stripe, no unsolicited commits/pushes/deployment, and project-selection boundaries remain in effect.

This file records requirements and decisions. The consolidated technical proposal is in `backend-blueprint.md`; its unapproved defaults and launch gates are explicitly labeled.

## Confirmed decisions

- Shopthie will be operated from the Philippines. This is the operator location, not a restriction on international address selection.
- Plan around Supabase for the backend and email/password authentication. Do not connect, provision or integrate it yet.
- First backend release adds authentication/RBAC, customer profiles and saved addresses.
- Activate application roles Owner, Admin and Customer initially. Manager and Cashier are future roles, not launch functionality.
- Public customer signup is allowed. Elevated roles are assigned separately by authorized staff, never selected on a signup form.
- Start with predefined roles composed of reusable permissions. Owner-editable custom roles are not a launch requirement.
- Signup requires email, password and username. Age information, phone number and saved addresses are optional.
- Age is an optional age range, not an exact age or date of birth. Minimum-age/audience policy is a separate open decision; an optional age field is not an eligibility check.
- Real customer profile/address information is intended, not fictional-only demo data. Include public-service privacy requirements before collecting it publicly.
- Owner and Admin may view private profile/address details for support, with restricted access and auditing. This is not blanket permission to browse or export everyone's information.
- Address forms should provide worldwide country/territory selection and country-dependent province/state/region selection. Coverage must be assessed against a specific dataset; do not claim every subdivision is complete without verification.
- The user intends public/demo use. Free services only; do not assume permission for upgrades, card setup, paid plans or domain purchases.
- The earlier “only digit inputs for now” answer was a misunderstanding about payment infrastructure, not a numeric-only form requirement.
- Do not integrate Stripe. Keep future payment functionality modular and provider-independent. No real payment processing is in launch scope.
- The user has no existing domain/email-sending service. Email-delivery implementation is explicitly deferred; do not set up a sender now.
- Intended audience includes teenagers and adults. The user explicitly chose to keep the exact signup-age cutoff pending and gate public teen signup until safeguards are reviewed. Do not infer a 13+, 16+ or 18+ policy. A child/teen consent approach is not finalized.
- Require authenticator-app MFA for Owner and Admin; MFA is optional for customers.
- Include a minimal staff dashboard: user lookup, customer account status and audited support views. Only Owner manages staff access.
- Feature modules/configuration are developer-managed initially. Runtime Owner dashboard toggles are not a launch requirement.

Not selected for the first backend release: a database-backed product/inventory dashboard, cloud-synced carts/wishlists, or real orders/checkout/payments. Existing frontend demo behavior remains unchanged unless separately approved.

## Architecture proposal — pending approval

Use a modular monolith: one backend with explicit module interfaces and dependencies, rather than independent microservices at launch.

Shared foundation:

- Identity and sessions through Supabase Auth, with a dedicated integration boundary rather than auth calls scattered throughout business modules.
- Central authorization with predefined role-to-permission mappings, deny-by-default server checks and record-ownership checks.
- Database row-level policies as additional protection for customer-owned records; frontend hiding is not an access-control boundary.
- Server validation, consistent errors, security-sensitive audit events, safe configuration and abuse controls proportionate to a public demo.
- Never expose privileged service credentials to the browser. Prevent shared caches from mixing private data across users.
- Confirmed staff protection: authenticator-app MFA for Owner/Admin, optional for customers, not SMS. Supabase currently lists basic MFA in its free plan; implementation and quota details must be rechecked when approved.[4]

Initial feature modules:

- Accounts: signup, login/logout, email verification, password recovery and account lifecycle. Email delivery is a deferred dependency, not a feature to silently bypass.
- Profiles: customers maintain their own allowed profile fields. Email remains the login identifier; a unique, case-insensitive username is a proposal, not a finalized validation rule.
- Addresses: customer-owned addresses with country-dependent fields and reference-data selection. Other customers cannot access them. Owner/Admin support access follows the restricted audited path below, not unrestricted table access.
- Access control: safe initial Owner bootstrap, Owner-only staff assignment and server enforcement. Bootstrap, recovery and last-owner safeguards need detailed design; Admin cannot grant staff roles.
- Administrative UI: confirmed minimal staff dashboard for user lookup, customer status and audited support views, with Owner-only staff management. No full commerce dashboard or runtime feature-toggle UI.

Future optional modules: catalog, inventory, carts, wishlists, orders, payments, notifications, and potentially manual sales/POS. Naming a module here does not add it to launch scope.

Module contracts should declare dependencies, routes/UI entry points, permissions and database migrations. Disable related UI and server operations together. Disabling a module is not deleting its data, and dependencies must prevent enabling a feature without its foundations. Authentication and authorization enforcement are not optional feature flags.

Payments should eventually use a provider-neutral boundary, independent of identity/profiles. No Stripe SDK, live gateway, fake successful charge, card collection or new payment implementation is authorized by this plan. The existing checkout remains explicitly a frontend demo.

## Roles

The initial role set is confirmed; detailed permissions below are proposals.

| Application role | Suggested responsibility                                                                | Boundary                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner            | Highest-level application administration; staff-role assignments and sensitive settings | Separate from customer signup; define safe bootstrap, recovery and last-owner protection                                                   |
| Admin            | Customer-account administration and audited support                                     | Cannot promote themselves or others, assign staff roles or manage other privileged accounts; support data access is restricted and audited |
| Customer         | Own account, profile and addresses                                                      | Cannot access another customer's records or grant themselves elevated permissions                                                          |
| Manager — future | Product, inventory and order operations                                                 | No staff/security-role control; not activated until corresponding workflows exist                                                          |
| Cashier — future | Staff-entered/counter sales and receipts, if needed                                     | No role management, arbitrary pricing changes or unrestricted refunds; no launch POS requirement                                           |

Permissions describe actions rather than spreading role-name checks throughout features. Ownership rules are additional to RBAC. Supabase Auth does not replace application authorization. Never use signup input or user-editable profile metadata as authority for privileges; Supabase explicitly warns against trusting user-editable metadata for authorization.[1] Application roles are distinct from Supabase project/team access.

Confirmed privacy boundary: customers access their own records. Owner/Admin support access is allowed only through an explicitly authorized, audited workflow. Proposed controls: require a target account and support reason; return only necessary fields; log actor, target, reason, action and time without copying addresses/phone values into logs. Do not grant staff direct raw-table access that could bypass the support audit path. Bulk personal-data export is not included.

Public-service privacy planning must cover a data/purpose inventory, accurate notices, retention/deletion policy, account export/deletion, contact information, restricted staff access, incident handling and hosting/processing regions. The operator country is confirmed as the Philippines; minimum-age policy, intended markets and jurisdiction-specific review remain open. No global-compliance claim is made by this draft. Do not collect real personal data publicly before readiness approval.

### Philippines-specific planning baseline

- Use the Philippine Data Privacy Act and National Privacy Commission guidance as the operator-side baseline; review any additional obligations relevant to intended overseas markets separately.[8]
- The Act explicitly lists age under sensitive personal information. Conservatively treat the requested optional age range as sensitive age-related information pending review, rather than assuming that using a range removes the sensitivity. Define its purpose, appropriate processing basis, access restrictions and deletion behavior; do not treat an optional field as automatic consent.[8]
- NPC Advisory 2024-03 covers child-oriented transparency and includes people below 18 within its child definition. Plan age-appropriate notices and a reviewed approach for under-18 participants rather than treating them as ordinary adult accounts.[9]
- The NPC FAQ explains that this advisory does not establish an age of digital consent. Do not copy a foreign 13/16 cutoff or assume a product signup threshold alone establishes compliance. The minimum signup age and any guardian/consent workflow remain a product-policy decision subject to review.[10]
- No DOB, identity-document collection, paid age-verification service, email-service setup or additional profile fields are authorized by this planning update.

### Why the operator country is requested

Only a country-level operating location is requested, not a home/street address, nationality or identity document. It informs which privacy/regulatory assumptions need review; intended users and activities can also matter. For example, the European Commission describes GDPR scope by EU establishment and by offering services to or monitoring people in the EU, including free services.[5] This example is not a determination that GDPR applies to Shopthie.

Teenager participation makes audience and minimum-age policy especially relevant. Where consent is the applicable basis, the European Commission notes country-dependent parental-consent thresholds for children's data.[6] Do not infer a universal permitted signup age from this example.

Operator location and hosting region are separate decisions. Supabase recommends a primary region near users for performance; privacy/transfer requirements still need their own review.[7] Philippines operation does not change the core modular/RBAC design or automatically restrict the international address dropdown. No hosting region or public-account privacy readiness is approved solely by choosing the operator country.

## Global address proposal

- Use versioned, license-compatible country/subdivision reference data, not a paid maps/autocomplete dependency.
- Filter subdivision choices by the selected country and use appropriate province/state/region labels.
- Allow an appropriate fallback for places without subdivisions or missing dataset coverage; avoid excluding a valid international address solely because the reference data is incomplete.
- City/locality, address lines and postal codes follow country-aware rules; no single universal mandatory province or postal-code format.
- Loading a country should not require downloading the entire world's city database.
- Geographic selection does not prove postal deliverability or promise worldwide shipping. This release has no real fulfillment.
- Dataset choice, coverage, update policy and licensing remain open. A candidate examined is the community Countries States Cities Database; its ODbL attribution/share-alike obligations need review before adoption.[3] No dataset has been installed.

## Free-tier/public-signup constraint

Supabase's official SMTP guide says the built-in sender is restricted to pre-authorized project-team addresses. Public verification and password-reset delivery therefore need a separately suitable email setup; the default sender must not be assumed to work for arbitrary visitors.[2]

Determine whether an existing domain/sender is available and identify a genuinely free option within its limits. If a requirement cannot be satisfied at zero cost, report that constraint and revise the plan rather than enable a paid service or silently remove verification. Public demo abuse controls, quota exhaustion and service availability also need explicit handling; free tier is not an uptime guarantee.

Confirmed: no sender/domain currently exists and implementation is deferred. Public self-service account launch stays a readiness gate until verification/recovery delivery is configured and tested. Controlled development testing and the existing public-facing frontend demo are separate from verified public account signup. This dependency does not authorize implementing an email service now.

## Decisions still needed

1. Intentionally deferred launch policy: exact minimum signup age and required teen/parental safeguards. Public teen signup stays gated until reviewed. The optional profile age range is not an identity/age-verification system. Address-country coverage does not settle legal applicability or user eligibility.
2. Review proposed operational defaults: safe Owner bootstrap/last-owner protection; email-only login; multiple addresses with one default; international phone as unverified contact information, not phone login/SMS; and private customer account pages rather than a public profile directory.
3. Review the consolidated technical proposal in `backend-blueprint.md`: schema, permission/ownership matrix, module contracts, rollout/readiness gates and focused essential verification. Privacy/retention choices and email-sender selection/implementation remain deferred. No application or infrastructure implementation is approved.

## Reference notes

Provider-specific facts below were checked against official documentation/upstream material. Recheck integration details, free-tier terms and reference-data licensing when implementation is actually approved. Architecture, role boundaries and proposed defaults are project design proposals, not claims of implemented behavior or legal compliance.

## Sources

[1] https://supabase.com/docs/guides/database/postgres/row-level-security
[2] https://supabase.com/docs/guides/auth/auth-smtp
[3] https://github.com/dr5hn/countries-states-cities-database
[4] https://supabase.com/pricing
[5] https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr/who-does-data-protection-law-apply_en — European Commission — Who does data protection law apply to?
[6] https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data/are-there-any-specific-safeguards-data-about-children_en — European Commission — Safeguards for children’s data
[7] https://supabase.com/docs/guides/platform/regions — Supabase — Available regions
[8] https://privacy.gov.ph/data-privacy-act — Philippines NPC — Data Privacy Act, Republic Act 10173
[9] https://privacy.gov.ph/wp-content/uploads/2024/12/Advisory-2024.12.17-Guidelines-on-Child-Oriented-Transparency-w-SGD.pdf — Philippines NPC — Advisory 2024-03, Child-Oriented Transparency
[10] https://privacy.gov.ph/wp-content/uploads/2024/12/FAQs-Advisory-on-Guidelines-on-Child-Oriented-Transparency.pdf — Philippines NPC — Child-Oriented Transparency FAQ
