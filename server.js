const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 10000;
const ROOT = path.resolve(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

function safeFilePath(requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath.split('?')[0] || '/');
  } catch {
    return null;
  }

  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^[/\\]+/, '');
  const target = path.resolve(ROOT, relative);
  const relativeToRoot = path.relative(ROOT, target);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return null;
  return target;
}

function applySecurityHeaders(res, contentType) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (contentType?.startsWith('text/html')) {
    res.setHeader('Content-Security-Policy', "default-src 'self' https: data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src https: http:; connect-src 'self' https:;");
  }
}

const server = http.createServer((req, res) => {
  let parsed;
  try {
    parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  if (parsed.pathname === '/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ status: 'ok', service: 'screensize', version: '2.0.0' }));
    return;
  }

  if (!['GET', 'HEAD'].includes(req.method || '')) {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  const filePath = safeFilePath(parsed.pathname);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    applySecurityHeaders(res, contentType);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=3600');

    if (req.method === 'HEAD') {
      res.writeHead(200);
      res.end();
      return;
    }

    res.writeHead(200);
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ScreenSize running on port ${PORT}`);
});
