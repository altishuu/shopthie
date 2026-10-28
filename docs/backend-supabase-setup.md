# Shopthie — hosted foundation setup

## Verified external state

- Supabase organization: Personal (`ksagzcpxnheiykvmukuk`), Free plan.
- User-authorized pause: `neomessage` (`zpyplkyoodizqvpjoegg`), read back as `INACTIVE` before creating Shopthie.
- New dedicated project: `shopthie` (`sjqpfsjgfzmcsshkdrmc`), Singapore / `ap-southeast-1`.
- Creation quote: $0 per month. No plan upgrade or other existing-project changes were requested/performed.
- New project was read back `ACTIVE_HEALTHY`; an actual `SELECT 1` returned successfully.

## Authority migration applied and read back

Local file: `supabase/migrations/20261028145618_authority_foundation.sql`.

Hosted migration history: version `20261028145618`, name `authority_foundation`. The initial local migration file was renamed to match the exact server-generated version; SQL contents did not change. Tests/reference paths were updated and all 25 backend checks passed again.

Readback confirmed:

- `owner`, `admin`, `customer` application roles.
- Required identity/access/audit modules enabled; profiles/geography/addresses/staff/support disabled.
- Every authority table has RLS enabled and no raw SELECT/INSERT/UPDATE/DELETE/TRUNCATE privileges for anon/authenticated clients.
- Fixed Customer-provisioning trigger installed.
- Anonymous execution of the public actor-context RPC denied.
- Unidentified capability request denied using the real provider auth helpers.
- At foundation-migration verification there were zero Auth users. During Area 2 the user subsequently created one controlled test identity; no public registration was opened.

This is real hosted schema/catalog/grant verification, not verification of login, JWT signatures, MFA enrollment, email delivery or customer CRUD. The broader local role/RLS tests use explicit auth TEST fixtures as documented separately.

## Auth configuration — user applied, API verified

The user saved settings in their own dashboard. A real GET to the project Auth `/settings` endpoint, using the enabled modern publishable key, independently returned:

- `disable_signup: true` — native public signup disabled.
- `mailer_autoconfirm: false` — email confirmation required.
- `external.email: true` — email/password provider enabled.
- `external.anonymous_users: false` — anonymous sign-ins disabled.

The always-denying `before_user_created` function remains installed but NOT attached as a provider hook. Public registration is currently blocked by the native signup switch; the hook is not being represented as attached. Public signup must not be reopened before policy/email and provider-hook readiness are resolved.

Only the modern public/publishable key and project URL were written to the app's ignored local environment file. No privileged/service key, password or management token was retrieved. The example environment contains placeholders only. Account sessions are now wired using the server-only flow described in `backend-area-2.md`; public signup and recovery are informative gated pages, not fake working flows.

The browser automation session is still separate from the user's dashboard login. Native `/settings` verification did not require extracting any browser or MCP secrets. No SMTP setup, email-delivery test or public-age approval is implied.

The subsequent native count read returned one Auth user and one automatically provisioned application account. Real browser sign-in, current Customer authority, reload persistence, concurrent anonymous isolation, logout and post-logout denial passed using that controlled identity. The browser was left signed out. See `backend-area-2-results.json`; fixture/negative-test results remain separate from this real-provider proof.
