'use strict';
const crypto = require('node:crypto');

const SESSION_DAYS = 14;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltB64, hashB64] = stored.split('$');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

// Clave temporal fácil de dictar por teléfono: palabra + 4 dígitos
const WORDS = ['arrayan', 'semilla', 'bosque', 'raiz', 'hoja', 'flor', 'nube', 'rio', 'lago', 'monte', 'perla', 'torre', 'trigo', 'luna', 'sol', 'cerro'];
function tempPassword() {
  const w = WORDS[crypto.randomInt(WORDS.length)];
  const n = String(crypto.randomInt(1000, 10000));
  return `${w}${n}`;
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function createSessionStore(db) {
  const ins = db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)');
  const get = db.prepare(`SELECT u.id, u.rut, u.name, u.role, u.email, u.phone, u.must_change, u.active, s.expires_at
                          FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`);
  const del = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const delUser = db.prepare('DELETE FROM sessions WHERE user_id = ?');
  const purge = db.prepare('DELETE FROM sessions WHERE expires_at < ?');

  return {
    create(userId) {
      const token = crypto.randomBytes(32).toString('base64url');
      const now = Date.now();
      ins.run(sha256(token), userId, now + SESSION_DAYS * 86400e3, now);
      if (Math.random() < 0.05) purge.run(now);
      return token;
    },
    lookup(token) {
      if (!token) return null;
      const row = get.get(sha256(token));
      if (!row) return null;
      if (row.expires_at < Date.now() || !row.active) {
        del.run(sha256(token));
        return null;
      }
      return { id: row.id, rut: row.rut, name: row.name, role: row.role, email: row.email, phone: row.phone, must_change: !!row.must_change };
    },
    destroy(token) {
      if (token) del.run(sha256(token));
    },
    destroyAllFor(userId) {
      delUser.run(userId);
    },
    maxAgeSeconds: SESSION_DAYS * 86400,
  };
}

// Límite de intentos de inicio de sesión (en memoria)
function createLoginLimiter({ maxAttempts = 8, windowMs = 10 * 60e3 } = {}) {
  const hits = new Map();
  return {
    check(key) {
      const e = hits.get(key);
      if (!e) return true;
      if (Date.now() > e.until) { hits.delete(key); return true; }
      return e.count < maxAttempts;
    },
    fail(key) {
      const e = hits.get(key);
      if (!e || Date.now() > e.until) hits.set(key, { count: 1, until: Date.now() + windowMs });
      else e.count++;
    },
    reset(key) { hits.delete(key); },
  };
}

module.exports = { hashPassword, verifyPassword, tempPassword, createSessionStore, createLoginLimiter };
