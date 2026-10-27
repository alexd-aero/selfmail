'use strict';
// Maildir++ storage. The mailbox root is <mailroot>/<domain>/<mailbox>; folders
// are dot-directories (.Sent, .Trash ...) each with cur/new/tmp. Flags live in
// the file name after ":2," (S seen, F flagged, R replied, T trashed, D draft).
// A message id is "<folder>~<unique base name>", which survives flag changes.
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const cfg = require('./config');

const FOLDERS = [
  { id: 'inbox', dir: '', name: 'Inbox' },
  { id: 'sent', dir: '.Sent', name: 'Sent' },
  { id: 'drafts', dir: '.Drafts', name: 'Drafts' },
  { id: 'archive', dir: '.Archive', name: 'Archive' },
  { id: 'spam', dir: '.Spam', name: 'Spam' },
  { id: 'trash', dir: '.Trash', name: 'Trash' },
];
const byId = Object.fromEntries(FOLDERS.map(f => [f.id, f]));
const BASE_RE = /^[A-Za-z0-9._\-=,]+$/;

const boxRoot = (c = cfg.load()) => path.join(c.mailroot, c.domain, c.mailbox);
const folderPath = (id, c) => path.join(boxRoot(c), byId[id].dir);

async function ensure() {
  for (const f of FOLDERS) for (const sub of ['cur', 'new', 'tmp']) await fsp.mkdir(path.join(folderPath(f.id), sub), { recursive: true, mode: 0o700 });
}

function splitName(name) {
  const i = name.indexOf(':2,');
  return i < 0 ? { base: name, flags: '' } : { base: name.slice(0, i), flags: name.slice(i + 3) };
}
const normFlags = f => [...new Set(String(f).replace(/[^A-Z]/g, ''))].sort().join('');

let seq = 0;
function uniqueName() {
  const host = os.hostname().replace(/[/:]/g, '_').replace(/[^A-Za-z0-9._-]/g, '') || 'host';
  const t = Date.now();
  return `${Math.floor(t / 1000)}.M${(t % 1000) * 1000 + (seq++ % 1000)}P${process.pid}R${Math.random().toString(36).slice(2, 8)}.${host}`;
}

/** Moves anything in new/ into cur/ (as every Maildir reader does), then lists cur/. */
async function scan(folderId) {
  const dir = folderPath(folderId);
  let fresh = [];
  try { fresh = await fsp.readdir(path.join(dir, 'new')); } catch (e) { /* folder missing */ }
  for (const n of fresh) {
    if (n.startsWith('.')) continue;
    const { base, flags } = splitName(n);
    try { await fsp.rename(path.join(dir, 'new', n), path.join(dir, 'cur', `${base}:2,${normFlags(flags)}`)); } catch (e) { /* raced */ }
  }
  let names = [];
  try { names = await fsp.readdir(path.join(dir, 'cur')); } catch (e) { return []; }
  const out = [];
  for (const n of names) {
    if (n.startsWith('.')) continue;
    const { base, flags } = splitName(n);
    if (!BASE_RE.test(base)) continue;
    out.push({ id: `${folderId}~${base}`, folder: folderId, base, flags, file: path.join(dir, 'cur', n) });
  }
  return out;
}

/** Finds the current file for an id (its name changes whenever flags change). */
async function locate(id) {
  const m = /^([a-z]+)~([A-Za-z0-9._\-=,]+)$/.exec(String(id || ''));
  if (!m || !byId[m[1]]) return null;
  const [, folder, base] = m;
  const dir = folderPath(folder);
  for (const sub of ['cur', 'new']) {
    let names = [];
    try { names = await fsp.readdir(path.join(dir, sub)); } catch (e) { continue; }
    const hit = names.find(n => n === base || n.startsWith(base + ':2,'));
    if (hit) return { id, folder, base, flags: splitName(hit).flags, file: path.join(dir, sub, hit), sub };
  }
  return null;
}

async function read(id) { const l = await locate(id); return l ? fsp.readFile(l.file) : null; }

async function setFlags(id, add = '', remove = '') {
  const l = await locate(id); if (!l) return null;
  let f = l.flags; for (const ch of remove) f = f.replace(ch, '');
  f = normFlags(f + add);
  const dest = path.join(folderPath(l.folder), 'cur', `${l.base}:2,${f}`);
  if (dest !== l.file) await fsp.rename(l.file, dest);
  return { ...l, flags: f, file: dest };
}

async function move(id, toFolder) {
  const l = await locate(id); if (!l || !byId[toFolder]) return null;
  if (l.folder === toFolder) return l;
  let flags = l.flags.replace('T', '');
  const dest = path.join(folderPath(toFolder), 'cur', `${l.base}:2,${normFlags(flags)}`);
  await fsp.mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
  await fsp.rename(l.file, dest);
  return { id: `${toFolder}~${l.base}`, folder: toFolder, base: l.base, flags, file: dest };
}

async function remove(id) { const l = await locate(id); if (!l) return false; await fsp.unlink(l.file); return true; }

/** Writes a message atomically (tmp/ then rename), the Maildir way. */
async function write(folderId, raw, flags = '', toNew = false) {
  const dir = folderPath(folderId);
  const base = uniqueName();
  const tmp = path.join(dir, 'tmp', base);
  await fsp.mkdir(path.join(dir, 'tmp'), { recursive: true, mode: 0o700 });
  await fsp.writeFile(tmp, raw, { mode: 0o600 });
  const dest = toNew ? path.join(dir, 'new', base) : path.join(dir, 'cur', `${base}:2,${normFlags(flags)}`);
  await fsp.rename(tmp, dest);
  return { id: `${folderId}~${base}`, folder: folderId, base, flags: toNew ? '' : normFlags(flags), file: dest };
}

module.exports = { FOLDERS, byId, boxRoot, folderPath, ensure, scan, locate, read, setFlags, move, remove, write, splitName };
