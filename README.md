# ScreenSize

A minimal responsive website preview tool for Render or any Node.js host.

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

## Notes

ScreenSize uses browser iframes, so sites that send `X-Frame-Options` or restrictive `Content-Security-Policy` headers may refuse to render inside the preview. The external-link button opens the original website directly.
