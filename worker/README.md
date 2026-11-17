# TerraRun Garmin worker

Cloudflare Worker that links a user's Garmin account and receives their activities.

Flow: the app calls `POST /garmin/connect` with the Neon Auth JWT, the user approves on Garmin, Garmin redirects to `/garmin/callback`, and tokens are stored in `garmin_connections`. Garmin then pushes new activities to `/garmin/webhook`; the worker downloads the FIT file, converts it to GeoJSON and stores it in `external_activities`. The app imports pending rows through the normal route import.

## Prerequisites

1. Approval in the Garmin Connect Developer Program (Activity API) for a client id and secret. Endpoints in `src/index.js` follow Garmin's OAuth2 PKCE docs and should be re-checked against the approved program documentation.
2. Run `neon/migrations/20261116010000_external_activities.sql` in the Neon SQL Editor.

## Deploy

```
cd worker
npm install
npx wrangler secret put DATABASE_URL         # Neon owner connection string
npx wrangler secret put GARMIN_CLIENT_ID
npx wrangler secret put GARMIN_CLIENT_SECRET
npx wrangler secret put STATE_SECRET         # long random string
npx wrangler secret put WEBHOOK_SECRET       # long random string
npx wrangler deploy
```

Set `WORKER_URL` and `NEON_AUTH_JWKS_URL` (Neon Auth JWKS endpoint) in `wrangler.toml`.

In the Garmin developer portal set:
- Redirect URI: `<WORKER_URL>/garmin/callback`
- Activity file webhook: `<WORKER_URL>/garmin/webhook/<WEBHOOK_SECRET>`
- Deregistration webhook: `<WORKER_URL>/garmin/deregister/<WEBHOOK_SECRET>`

The secret is part of the path because the Garmin endpoint configuration tool strips query strings. A `?key=<WEBHOOK_SECRET>` query parameter is also accepted.

Finally add the GitHub Actions variable `VITE_GARMIN_WORKER_URL` (and `VITE_GARMIN_WORKER_URL` in `.env.local` for local dev) so the app shows "Connect Garmin" in the account menu.
