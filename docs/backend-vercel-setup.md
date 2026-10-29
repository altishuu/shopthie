# Shopthie — Vercel Supabase configuration

## Applied and read back

User authorized applying this project's Supabase environment configuration to Vercel. Target matched the local Git remote `altishuu/shopthie` using Vercel's repository filter:

- Vercel project: `shopthie`, `prj_SijFC9odtXKfcQMaIfn8yMCKn04z`.
- Team: `team_Wk1AgjgyzQs9vgKuGRfLx5Xy`.
- Supabase project: `sjqpfsjgfzmcsshkdrmc`, read back ACTIVE_HEALTHY.

Two encrypted variables were created for **production only** and individually read back; their values exactly matched the already working ignored local configuration:

| Variable                             | Vercel variable ID | Target     |
| ------------------------------------ | ------------------ | ---------- |
| NEXT_PUBLIC_SUPABASE_URL             | HzTgLC13liboTsc5   | production |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | dhp9fboXSErs7P0z   | production |

No key/token values are recorded here. These are public Supabase client settings, not privileged service-role/secret keys. No private credentials were requested in chat. No existing variables were overwritten. Preview and development targets were left untouched.

The local HTTP loopback `SHOPTHIE_APP_ORIGIN` exception was deliberately NOT copied to Vercel; hosted HTTPS must retain secure cookie defaults.

## Deployment boundary

No deployment/redeployment, commit or push was triggered. The existing Vercel deployment ID was unchanged after the configuration write. A new deployment must consume these settings before the live app uses them. Local uncommitted address-area code is not implicitly uploaded by setting environment variables.

## Related backend state

The reviewed addresses/geography migration was separately applied as `20261029031614_addresses.sql`; native history, complete reference fingerprint, ACL/RLS/functions and module flags were read back. Real controlled-account create/reload/edit/manual fallback/country resets/default switching/stale conflict/optional clearing/delete/isolation/logout checks passed. Synthetic saved addresses were removed; database readback confirmed zero address rows and one retained bookkeeping revision 6. The browser was signed out. These are local-preview/native-backend checks, not certification of an undeployed Vercel address UI.
