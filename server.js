'use strict';
// Servidor de la plataforma de notas — Colegio Montessori Ecocistema Arrayán
// Sin dependencias externas: requiere Node.js 22.13 o superior (incluye SQLite).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('./src/db');
const { createApi, HttpError } = require('./src/api');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const TRUST_PROXY = process.env.TRUST_PROXY !== '0';

const db = openDb(path.join(DATA_DIR, 'arrayan.db'));
const api = createApi(db);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; " +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'El archivo o los datos enviados son demasiado grandes.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

async function handleApi(req, res, url) {
  const cookies = parseCookies(req.headers.cookie);
  const setCookies = [];
  const forwarded = TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  const ctx = {
    method: req.method,
    pathname: url.pathname,
    query: url.searchParams,
    token: cookies.sid || null,
    ip: forwarded || req.socket.remoteAddress || '',
    secure: process.env.COOKIE_SECURE === '1' || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https'),
    setCookie: (c) => setCookies.push(c),
    body: {},
  };

  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // Protección CSRF: exigimos una cabecera personalizada que un formulario externo no puede enviar
      if (req.headers['x-requested-with'] !== 'arrayan') throw new HttpError(403, 'Solicitud no permitida.');
      const limit = url.pathname === '/api/restore' ? 50 * 1024 * 1024 : 2 * 1024 * 1024;
      const raw = await readBody(req, limit);
      if (raw) {
        try { ctx.body = JSON.parse(raw); } catch { throw new HttpError(400, 'Datos con formato inválido.'); }
        if (typeof ctx.body !== 'object' || ctx.body === null) ctx.body = {};
      }
    }
    const result = await api.handle(ctx);
    const headers = setCookies.length ? { 'Set-Cookie': setCookies } : {};
    if (result && result.__download) {
      const d = result.__download;
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        ...headers,
        'Content-Type': d.type,
        'Content-Disposition': `attachment; filename="${d.name}"`,
        'Cache-Control': 'no-store',
      });
      res.end(d.body);
      return;
    }
    sendJson(res, 200, result === undefined ? { ok: true } : result, headers);
  } catch (err) {
    const headers = setCookies.length ? { 'Set-Cookie': setCookies } : {};
    if (String(err.message || '').includes('UNIQUE constraint failed')) {
      sendJson(res, 400, { error: 'Ya existe un registro con esos datos.' }, headers);
      return;
    }
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    const message = status >= 500 ? 'Ocurrió un error inesperado. Inténtalo nuevamente.' : err.message;
    sendJson(res, status, { error: message }, headers);
  }
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(400);
    res.end();
    return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      // Aplicación de una sola página: cualquier ruta desconocida sin extensión vuelve a index.html
      if (!path.extname(rel)) return sendFile(res, path.join(PUBLIC_DIR, 'index.html'), 'no-cache');
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return;
    }
    const ext = path.extname(file);
    const cache = ext === '.html' || rel === '/sw.js' || ext === '.webmanifest' ? 'no-cache' : 'public, max-age=3600';
    sendFile(res, file, cache);
  });
}

function sendFile(res, file, cache) {
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': cache,
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`🌳 Ecocistema Arrayán funcionando en http://localhost:${PORT}`);
  console.log(`   Datos en: ${DATA_DIR}`);
});

function shutdown() {
  server.close(() => {
    try { db.close(); } catch { /* ya cerrada */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
