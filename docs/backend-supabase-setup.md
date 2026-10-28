# Shopthie — hosted backend setup

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
- At foundation verification, required identity/access/audit modules were enabled and all optional modules disabled. Area 3 subsequently enabled profiles only; see the readback below.
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

## Area 3 — profiles migration and native application checks

Applied `supabase/migrations/20261028181746_profiles.sql`; hosted history version/name read back exactly. The local draft filename was aligned to the server-generated version without changing SQL. Post-alignment checks passed again.

Catalog readback confirmed profiles RLS, no raw client SELECT/INSERT/UPDATE/DELETE/TRUNCATE grants, anon RPC denial, authenticated RPC execution, fixed search paths and public invoker/private definer boundaries. Required identity/access/audit remain enabled; only optional profiles was enabled. Geography/addresses/staff/support remain disabled.

A real controlled Customer saved, reloaded and edited a synthetic profile, cleared the phone, and received a stale-revision conflict without overwrite. A trusted typed draft was retained; cookie-free private-cache isolation and logout denial passed. Database readback confirmed one synthetic profile at revision 2 with SQL NULL phone. The browser was left signed out. Native Auth settings were also rechecked unchanged: signup/anonymous OFF, email/confirmation ON.

This is native one-account application proof, not two-user native isolation or true concurrent lock-wait certification. Those broader fixture/structural distinctions are explicit in `backend-area-3.md` and `backend-area-3-results.json`. No later area, plan upgrade, provider-hook attachment, email setup, commit/push or frontend production deployment followed.
