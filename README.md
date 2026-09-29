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

## Simulator

Each preview card includes a simulator action. It opens `simulate.html` with the selected viewport dimensions and lets the user switch between Mobile, Large Mobile, Tablet and Desktop without returning to the dashboard.

For sites that forbid iframe embedding with `X-Frame-Options` or restrictive `Content-Security-Policy`, ScreenSize cannot bypass that browser security rule. The simulator therefore provides an original-site fallback and a best-effort device-sized popup for desktop browsers.

## Included files

- `public/index.html` — dashboard
- `public/styles.css` — UI and animations
- `public/app.js` — dashboard logic
- `public/simulate.html` — dedicated device simulator
- `public/simulate.js` — simulator logic
- `public/icon.svg` — site icon
- `server.js` — Render-compatible static server
