# TerraRun

A running territory-control game built with React, MapLibre GL JS, and Turf.

## Run locally

Requires Node.js 22 and npm.

```sh
npm ci
npm run dev
```

On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm`.

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

This is a local demo, not an authenticated multiplayer service. Activities and
territories exist only in the current browser session and reset on reload.
Strava/Garmin synchronization and authoritative server-side validation are not
connected. Do not upload sensitive real-world route data to a public demo.

UI exploration pages are available through the development server at
`/ui-examples.html` and `/game-ui-examples.html`; the current production build
publishes the main application only.

Never commit provider secrets, access tokens, or service-role keys. Local
environment files, dependencies, and build output are excluded by `.gitignore`.