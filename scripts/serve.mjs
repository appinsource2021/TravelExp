// The whole app on one port on the MCP platform (what nginx did in docker-compose.yml, apps/desktop/nginx.conf):
// the desktop build with the SPA fallback, /api and the /socket WebSocket to the API. No dependencies.
//   PORT      the port the platform's preview reaches (the test server's {port})
//   API_PORT  where the API listens (127.0.0.1, default 3007)
//   WEB_ROOT  the desktop build (default apps/desktop/dist)
//   API_ENTRY the built API (services/node/dist/index.js): run as this server's child, see below
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const PORT = Number(process.env.PORT ?? 8080);
const API_PORT = Number(process.env.API_PORT ?? 3007);
const ROOT = resolve(process.env.WEB_ROOT ?? 'apps/desktop/dist');

// The API as this server's child. When it ends, this ends too (the platform sees the test server stopped and starts it
// again); when this ends, the API's stdin closes and it ends itself. No signals: in the platform's workspaces one
// process may not signal another, not even its own child ("kill: Permission denied").
if (process.env.API_ENTRY) {
  const entry = JSON.stringify(resolve(process.env.API_ENTRY));
  const guard = `process.stdin.on('end', () => process.exit(1)); process.stdin.on('error', () => process.exit(1)); process.stdin.resume(); require(${entry});`;
  const api = spawn(process.execPath, ['-e', guard], { stdio: ['pipe', 'inherit', 'inherit'], env: { ...process.env, PORT: String(API_PORT) } });
  api.on('exit', (code, signal) => {
    console.error(`serve: the API ended (${code ?? signal}); ending too`);
    process.exit(1);
  });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf',
};

// As nginx's "location /api" and "location /socket": a prefix.
const toApi = (url) => url.startsWith('/api') || url.startsWith('/socket');

const stat = (f) => {
  try {
    return statSync(f);
  } catch {
    return null;
  }
};

/** The headers nginx set: the client's address, the scheme the platform's proxy was reached with. */
function forwarded(req) {
  const client = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '';
  return { ...req.headers, 'x-real-ip': client, 'x-forwarded-proto': req.headers['x-forwarded-proto'] ?? 'http' };
}

// Per connection, not passed on (Node frames the body itself).
const HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer']);

function proxy(req, res) {
  const up = http.request({ host: '127.0.0.1', port: API_PORT, method: req.method, path: req.url, headers: forwarded(req) }, (r) => {
    // As a flat list: every Set-Cookie stays.
    const out = [];
    for (let i = 0; i < r.rawHeaders.length; i += 2) if (!HOP.has(r.rawHeaders[i].toLowerCase())) out.push(r.rawHeaders[i], r.rawHeaders[i + 1]);
    res.writeHead(r.statusCode ?? 502, out);
    r.pipe(res);
  });
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('The API is not reachable.');
  });
  req.pipe(up);
}

function file(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let f = join(ROOT, normalize(path));
  if (f !== ROOT && !f.startsWith(ROOT + sep)) {
    res.writeHead(403).end();
    return;
  }
  let st = stat(f);
  if (st?.isDirectory()) st = stat((f = join(f, 'index.html')));
  // try_files $uri $uri/ /index.html
  if (!st?.isFile()) st = stat((f = join(ROOT, 'index.html')));
  if (!st?.isFile()) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }).end('The app is not built yet.');
    return;
  }
  const hashed = f.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'content-type': TYPES[extname(f).toLowerCase()] ?? 'application/octet-stream',
    'content-length': st.size,
    'last-modified': st.mtime.toUTCString(),
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(f).pipe(res);
}

const server = http.createServer((req, res) => (toApi(req.url ?? '/') ? proxy(req, res) : file(req, res)));

// WebSocket (/socket): the upgrade request as it came, then both ways.
server.on('upgrade', (req, socket, head) => {
  if (!toApi(req.url ?? '')) {
    socket.destroy();
    return;
  }
  const up = net.connect(API_PORT, '127.0.0.1', () => {
    const h = forwarded(req);
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const k = req.rawHeaders[i].toLowerCase();
      if (k !== 'x-real-ip' && k !== 'x-forwarded-proto') lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    lines.push(`X-Real-IP: ${h['x-real-ip']}`, `X-Forwarded-Proto: ${h['x-forwarded-proto']}`);
    up.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head?.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

server.listen(PORT, '0.0.0.0', () => console.log(`serve: http://0.0.0.0:${PORT} (web ${ROOT}, api 127.0.0.1:${API_PORT})`));
