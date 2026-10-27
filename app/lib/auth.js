'use strict';
// Accounts: /etc/selfmail/users.json  { "<name>": { "salt": b64, "hash": b64, "N": 16384 } }  (scrypt)
// Sessions: random tokens in an HttpOnly cookie, kept in memory and mirrored to
// /var/lib/selfmail/sessions.json so a restart doesn't sign everyone out.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ETC, VAR } = require('./config');
const { token, safeEqual } = require('./util');

const USERS = path.join(ETC, 'users.json');
const SESS = path.join(VAR, 'sessions.json');
const COOKIE = 'sm_sid';
const TTL = 30 * 24 * 3600e3;

function readJSON(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return def; } }
function writeJSON(f, v) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, f);
}

const users = () => readJSON(USERS, {});
function hashPassword(pass, salt = crypto.randomBytes(16)) {
  const N = 16384;
  const hash = crypto.scryptSync(String(pass), salt, 64, { N, r: 8, p: 1, maxmem: 64e6 });
  return { salt: salt.toString('base64'), hash: hash.toString('base64'), N };
}
function verify(name, pass) {
  const u = users()[name];
  if (!u || typeof u !== 'object') { hashPassword(pass); return false; }   // same cost either way
  const got = crypto.scryptSync(String(pass), Buffer.from(u.salt, 'base64'), 64, { N: u.N || 16384, r: 8, p: 1, maxmem: 64e6 });
  return safeEqual(got.toString('base64'), u.hash);
}
function setPassword(name, pass) {
  const all = users(); all[name] = hashPassword(pass); writeJSON(USERS, all);
}

// ---- sessions ----
let sessions = new Map(Object.entries(readJSON(SESS, {})));
const persist = () => { try { writeJSON(SESS, Object.fromEntries(sessions)); } catch (e) { console.error('sessions: ' + e.message); } };
function prune() { const now = Date.now(); for (const [k, s] of sessions) if (s.exp < now) sessions.delete(k); }

function create(user, req) {
  prune();
  const id = token(32);
  sessions.set(id, { user, exp: Date.now() + TTL, created: Date.now(), seen: Date.now(), ip: clientIp(req), ua: String(req.headers['user-agent'] || '').slice(0, 160) });
  persist();
  return id;
}
function get(req) {
  const id = parseCookies(req)[COOKIE];
  if (!id) return null;
  const s = sessions.get(id);
  if (!s || s.exp < Date.now()) { if (s) { sessions.delete(id); persist(); } return null; }
  if (Date.now() - s.seen > 3600e3) { s.seen = Date.now(); s.exp = Date.now() + TTL; persist(); }
  return { id, ...s };
}
function destroy(id) { if (sessions.delete(id)) persist(); }
function destroyOthers(keep) { for (const k of [...sessions.keys()]) if (k !== keep) sessions.delete(k); persist(); }
function list() { prune(); return [...sessions.entries()].map(([id, s]) => ({ id: id.slice(0, 8), ...s })); }

function cookie(id, req, clear) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  return `${COOKIE}=${clear ? '' : id}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}; Max-Age=${clear ? 0 : TTL / 1000}`;
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function clientIp(req) {
  return String(req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();
}

// ---- brute-force brake: 8 failures per IP per 15 minutes ----
const fails = new Map();
function allowed(ip) { const f = fails.get(ip); return !f || f.until < Date.now() || f.n < 8; }
function failed(ip) { const f = fails.get(ip); if (!f || f.until < Date.now()) fails.set(ip, { n: 1, until: Date.now() + 15 * 60e3 }); else f.n++; }
function succeeded(ip) { fails.delete(ip); }

module.exports = { USERS, users, verify, setPassword, create, get, destroy, destroyOthers, list, cookie, clientIp, allowed, failed, succeeded };
