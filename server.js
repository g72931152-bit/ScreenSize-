const http = require('http');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 10000;
const ROOT = path.resolve(__dirname, 'public');
const APP_VERSION = '2.2.0';
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
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (contentType?.startsWith('text/html')) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' https: data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src https: http:; connect-src 'self' https:;"
    );
  }
}

function isPrivateOrReservedIp(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0 ||
      a >= 224
    );
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('::ffff:') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:') ||
      normalized.startsWith('ff')
    );
  }
  return true;
}

async function assertPublicTarget(targetUrl) {
  const parsed = new URL(targetUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS are supported.');
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Private network targets are not allowed.');
  }
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) throw new Error('Private network targets are not allowed.');
    return parsed.href;
  }
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
    throw new Error('The target resolves to a private or reserved network.');
  }
  return parsed.href;
}

function parseFrameAncestors(cspValue) {
  if (!cspValue) return null;
  const directive = cspValue
    .split(';')
    .map(item => item.trim())
    .find(item => /^frame-ancestors\s/i.test(item));
  if (!directive) return null;
  return directive.replace(/^frame-ancestors\s+/i, '').trim().split(/\s+/).filter(Boolean);
}

function cspBlocksEmbedding(cspValue, embeddingOrigin, targetOrigin) {
  const sources = parseFrameAncestors(cspValue);
  if (!sources?.length) return false;
  const app = new URL(embeddingOrigin);
  const target = new URL(targetOrigin);

  const matches = sources.some(source => {
    const token = source.toLowerCase();
    if (token === "'none'") return false;
    if (token === '*') return true;
    if (token === "'self'") return app.origin === target.origin;
    if (token === 'http:' || token === 'https:') return app.protocol === token;
    if (token.startsWith('http://') || token.startsWith('https://')) {
      const protocol = token.startsWith('https://') ? 'https:' : 'http:';
      let host = token.slice(protocol.length + 2).split('/')[0];
      let port = null;
      const colon = host.lastIndexOf(':');
      if (colon > -1 && host.indexOf(':') === colon) {
        port = Number(host.slice(colon + 1));
        host = host.slice(0, colon);
      }
      const expectedPort = port || (protocol === 'https:' ? 443 : 80);
      const actualPort = Number(app.port || (app.protocol === 'https:' ? 443 : 80));
      const hostnameMatches = host.startsWith('*.')
        ? app.hostname.endsWith(host.slice(1)) && app.hostname !== host.slice(2)
        : app.hostname === host;
      return app.protocol === protocol && hostnameMatches && actualPort === expectedPort;
    }
    return false;
  });

  return !matches;
}

function xFrameOptionsBlocks(value, embeddingOrigin, targetOrigin) {
  if (!value) return false;
  const token = value.split(',')[0].trim().toUpperCase();
  if (!token) return false;
  if (token === 'DENY') return true;
  if (token === 'SAMEORIGIN') return new URL(embeddingOrigin).origin !== new URL(targetOrigin).origin;
  if (token.startsWith('ALLOW-FROM')) {
    const allowed = value.replace(/^\s*ALLOW-FROM\s+/i, '').trim();
    try { return new URL(embeddingOrigin).origin !== new URL(allowed).origin; } catch { return true; }
  }
  return false;
}

async function inspectEmbedding(targetUrl, embeddingOrigin) {
  let current = await assertPublicTarget(targetUrl);
  for (let redirect = 0; redirect < 6; redirect += 1) {
    await assertPublicTarget(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    let response;
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'ScreenSize/2.2 (+responsive-preview)' }
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      current = new URL(location, current).href;
      continue;
    }

    const xfo = response.headers.get('x-frame-options') || '';
    const csp = response.headers.get('content-security-policy') || '';
    const blockedBy = [];
    if (xFrameOptionsBlocks(xfo, embeddingOrigin, new URL(current).origin)) blockedBy.push('X-Frame-Options');
    if (cspBlocksEmbedding(csp, embeddingOrigin, new URL(current).origin)) blockedBy.push('CSP frame-ancestors');
    response.body?.cancel().catch(() => {});

    return {
      ok: blockedBy.length === 0,
      blockedBy,
      status: response.status,
      finalUrl: current,
      contentType: response.headers.get('content-type') || ''
    };
  }
  return { ok: true, blockedBy: [], status: 0, finalUrl: current, contentType: '' };
}

function getRequestOrigin(req) {
  const protocol = String(req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  return `${protocol}://${host}`;
}

const server = http.createServer(async (req, res) => {
  let parsed;
  try {
    parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  if (parsed.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ status: 'ok', service: 'screensize', version: APP_VERSION }));
    return;
  }

  if (parsed.pathname === '/api/inspect') {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const target = parsed.searchParams.get('url');
    if (!target) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: 'Missing url.' }));
      return;
    }
    try {
      const result = await inspectEmbedding(target, getRequestOrigin(req));
      res.writeHead(200);
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(422);
      res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unable to inspect this website.' }));
    }
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
    const etag = `W/"${stats.size}-${Math.floor(stats.mtimeMs)}"`;
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304);
      res.end();
      return;
    }

    if (req.method === 'HEAD') {
      res.writeHead(200);
      res.end();
      return;
    }

    res.writeHead(200);
    fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ScreenSize ${APP_VERSION} running on port ${PORT}`);
});
