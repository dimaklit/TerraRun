# TerraRun

A running territory-control game built with React, MapLibre GL JS, and Turf.

## Run locally

Requires Node.js 22 and npm.

```sh
npm ci
npm run dev
```

On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm`.

## Neon local setup

The app falls back to demo mode when Neon is not configured. To use the Neon
project locally:

1. In Neon, enable Managed Better Auth and the Data API on the `production`
	branch, with **Use Neon Auth** and **Grant public schema access** enabled.
2. Run `neon/migrations/20261116000000_private_activities.sql` in the Neon SQL
	Editor, then refresh the Data API schema cache.
3. Copy `.env.example` to `.env.local` and set `VITE_NEON_DATABASE_URL` to the
	HTTPS database endpoint URL shown for the `neondb` database. Use the URL
	without a password, credentials, or query parameters.
4. Restart `npm run dev`, then create an account or sign in with Neon Auth.

For GitHub Pages, add the same non-secret endpoint URL as the repository
Actions variable `VITE_NEON_DATABASE_URL`. Never use Neon’s PostgreSQL
connection string here; it contains credentials. The frontend Data API URL is
public, so all private tables must keep Row-Level Security enabled.

## Check and build

```sh
npm test
npm run build
npm run preview
```

## Deploy to GitHub Pages

In repository **Settings > Pages**, choose **GitHub Actions** as the source.
Once Pages is available, add a repository Actions variable named `PAGES_ENABLED`
with the value `true` under **Settings > Secrets and variables > Actions > Variables**.
Then start the workflow manually or push a change.
The Pages workflow tests and builds pushes to `master`, then publishes `dist`
when `PAGES_ENABLED` is `true`. Otherwise it only tests and builds.
Pull requests run the build without deploying. The workflow can also be started
manually from the Actions tab.

Expected site URL after a successful deployment:
https://dimaklit.github.io/TerraRun/

GitHub Pages for a private repository requires an eligible GitHub plan.
Do not change repository visibility without the owner's approval. Standard
Pages sites can be publicly accessible even when their source repository is private.

## Current scope

- Multiple GPX/GeoJSON imports and per-player route visibility filters.
- Enclosed-route capture, reinforcement, attacks, neutralization, and ownership.
- Map styles, optional 3D strength towers, and shared-area metrics.

With Neon configured, accounts and private imported activities persist per user.
The game territory-control calculation still runs in the client preview and is
not authoritative multiplayer state. Shared public territories, secure
server-side combat processing, and Strava/Garmin synchronization are not
connected. Neon Managed Better Auth currently allows public self-registration;
use RLS and never expose database passwords. Avoid uploading sensitive real-world
route data to a public demo.

UI exploration pages are available through the development server at
`/ui-examples.html` and `/game-ui-examples.html`; the current production build
publishes the main application only.

Never commit provider secrets, access tokens, or service-role keys. Local
environment files, dependencies, and build output are excluded by `.gitignore`.