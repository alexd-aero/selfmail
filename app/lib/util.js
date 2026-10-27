'use strict';
const { execFile } = require('child_process');
const crypto = require('crypto');

/** Runs a program without a shell. Never throws: resolves { code, out, err }. */
function run(cmd, args = [], opts = {}) {
  return new Promise(resolve => {
    const child = execFile(cmd, args, { timeout: opts.timeout || 20000, maxBuffer: 16e6, env: opts.env || process.env }, (e, out, err) => {
      resolve({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, out: String(out || ''), err: String(err || e?.message || '') });
    });
    if (opts.input != null) { child.stdin.end(String(opts.input)); }
  });
}

/** Privileged operations go through one allow-listed helper (bin/selfmail-root) via sudo. */
const ROOT_HELPER = process.env.SELFMAIL_ROOT_HELPER || '/opt/selfmail/bin/selfmail-root';
function root(op, args = [], opts = {}) {
  return run('sudo', ['-n', ROOT_HELPER, op, ...args.map(String)], { timeout: opts.timeout || 30000, input: opts.input, env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin' } });
}

const token = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

function safeEqual(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  if (A.length !== B.length) { crypto.timingSafeEqual(A, A); return false; }
  return crypto.timingSafeEqual(A, B);
}

const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const isDomain = s => /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(String(s || ''));
const isEmail = s => /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,63}$/i.test(String(s || '').trim());
const isIPv4 = s => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(s || ''));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Small in-process lock so two requests never rename the same Maildir file at once. */
const locks = new Map();
async function withLock(key, fn) {
  while (locks.has(key)) await locks.get(key).catch(() => {});
  let release; const p = new Promise(r => { release = r; });
  locks.set(key, p);
  try { return await fn(); } finally { locks.delete(key); release(); }
}

module.exports = { run, root, token, safeEqual, escHtml, isDomain, isEmail, isIPv4, sleep, withLock };
