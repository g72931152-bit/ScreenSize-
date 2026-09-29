# ScreenSize

A minimal responsive website preview and device simulator for Render or any Node.js host.

## Run locally

```bash
npm start
```

Then open `http://localhost:10000`.

## Render

Create a Web Service from the GitHub repository.

- Build command: leave empty
- Start command: `npm start`
- Node: 18+

The app listens on Render's `PORT` environment variable automatically.

## Features in this build

- Responsive preview grid for Mobile, Large Mobile, Tablet, Desktop and Wide Desktop.
- Smooth logo placeholder animation while previews are empty/loading.
- Per-device reload, simulator and original-site actions.
- Dedicated simulator with viewport rotation, zoom controls and keyboard shortcuts (`R`, `+`, `-`, `0`).
- Custom viewport sizes up to 4000 × 3000.
- Recent URL history stored only in the browser's local storage.
- Share links through the current page URL.
- Friendly fallback when a target site refuses iframe embedding.
- Hardened static-file path handling and basic security headers.
- `/health` endpoint for deployment checks.

## Important embedding limitation

A normal browser iframe cannot bypass a target site's `X-Frame-Options` or restrictive `Content-Security-Policy`. ScreenSize does not proxy or rewrite third-party pages to evade those controls. When embedding is refused, use the original-site button or the best-effort device-sized popup.

## Included files

- `public/index.html` — dashboard
- `public/styles.css` — UI and animations
- `public/app.js` — dashboard logic
- `public/simulate.html` — dedicated device simulator
- `public/simulate.js` — simulator logic
- `public/icon.svg` — site icon
- `server.js` — Render-compatible static server
