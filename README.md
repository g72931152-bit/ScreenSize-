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
- `public/sprite.svg` — UI icons
- `server.js` — Render-compatible static server


## 2.1 loading reliability
The dashboard keeps the ScreenSize logo visible until the frame is actually ready. The server also checks X-Frame-Options and CSP frame-ancestors before attempting an embed, so blocked pages are reported honestly instead of being marked as loaded.

## 2.2 interface refresh
Minimal Material-style UI (light/dark follows the system), indeterminate loading bar, staggered card entrance, logo loader that animates only while loading, snackbar feedback, SVG icons instead of text glyphs. Iframes are sandboxed without top-navigation. Static files are revalidated with ETag so updates are never stale.
