# Area 2 identity integration contract

Implementation scope: real Supabase password login, request-scoped session refresh/validation, protected account shell, local logout, and honest gated signup/recovery pages. No profile/address CRUD, staff tools, MFA enrollment/challenge, email delivery or public signup activation in this slice.

Parent owns `src/platform/supabase/`, `src/modules/identity/{types.ts,policy.ts,server.ts,actions.ts}`, `src/proxy.ts`, backend logic unit tests and package/env files.

UI worker owns only `src/app/(auth)/`, `src/app/(account)/`, `src/modules/identity/components/`, `src/app/identity.css`, header Account-link integration, and `tests/e2e/identity.spec.ts`.

## Parent exports (to be implemented)

`src/modules/identity/types.ts`:

- `LoginState = { status: "idle" | "error"; message: string }` (no password/session data).
- `IdentityState` discriminated by `status`:
  - `guest`
  - `unavailable` (generic `message`)
  - `unprovisioned` (no inferred Customer fallback)
  - `unverified` (verified provider identity has no confirmed email)
  - `suspended`
  - `mfa_required` (no private account data rendered)
  - `active`: `email: string`, `actor: AuthorizationActor`.

`src/modules/identity/server.ts`: `getIdentity(): Promise<IdentityState>`.

`src/modules/identity/actions.ts` (`use server`):

- `loginAction(previous: LoginState, data: FormData): Promise<LoginState>`; reads email/password, validates a safe `next`, performs real SDK login, redirects only on genuine session success; generic errors otherwise.
- `logoutAction(): Promise<void>`; clears local session, invalidates private account view, redirects to `/login`.

## UI requirements

- `/login`: server-rendered branded shell, accessible client form using React useActionState(loginAction), labels Email/Password, autocomplete username/current-password, Sign in button, finite pending state, generic accessible error. No session lookup is needed on this public static form page. Do not put passwords into React/server action state, logs or URLs.
- `/account`: private request-time identity content inside scoped Suspense (Cache Components enabled). Guest redirects to `/login`; active state shows actual verified email, current role and Sign out; all other statuses render honest denied/unavailable messages, no private data. No account-update/profile stub forms.
- `/signup` and `/forgot-password`: informative unavailable/gated pages, not fake success or data-collecting placeholder forms. Explain public signup/recovery delivery is deferred; links back to login/store.
- Reuse `<RouteMotionReady />` within main; do not change global intro/animation providers. Handle private request-data Suspense without adding global loading boundaries or disabling Cache Components.
- Add a stable `/account` Account link in desktop header and mobile navigation. Hide the extra desktop icon in narrow layouts to avoid overflowing 320px widths. Never replace the SSR link target based on auth hydration. No global auth-network request/header AuthProvider.
- Namespaced CSS or CSS modules, matching existing off-white/graphite/citron typography, restrained account forms and 44px controls.

## Targeted browser checks

Use real production server and guest paths: login/form, account guest redirect, signup/recovery blocked, malformed-cookie denial, generic failed login. No fake authenticated API responses, no public-signup activation, no emails. Native successful login needs a controlled real test account and separate secure credentials; do not claim it passed without one.

No source copies/snapshots/manifests, hosted writes, credentials extraction, unrelated refactors, commits or deployment. Existing frontend user changes must remain intact.
