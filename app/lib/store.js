'use strict';
// The message index: one parsed summary per message, cached in memory and in
// /var/lib/selfmail/index.json (keyed by the Maildir base name, so it survives
// flag changes and moves). Listing never re-parses mail it has already seen.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const md = require('./maildir');
const mime = require('./mime');
const events = require('./events');
const { withLock } = require('./util');

const FILE = path.join(cfg.VAR, 'index.json');
let idx = {};
try { idx = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { idx = {}; }
let dirty = false;
setInterval(() => flush(), 5000).unref();
function flush() {
  if (!dirty) return; dirty = false;
  try {
    fs.mkdirSync(cfg.VAR, { recursive: true });
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(idx)); fs.renameSync(FILE + '.tmp', FILE);
  } catch (e) { console.error('index: ' + e.message); }
}
process.on('exit', flush);

async function summary(entry) {
  const hit = idx[entry.base];
  if (hit && hit.v === 3) return hit;
  try {
    const raw = await fs.promises.readFile(entry.file);
    const s = await mime.summarize(raw, cfg.domains());
    idx[entry.base] = { v: 3, ...s }; dirty = true;
    return idx[entry.base];
  } catch (e) {
    return { v: 0, from: { name: '', address: '' }, to: [], subject: '(unreadable message)', date: 0, snippet: e.message, size: 0 };
  }
}

const row = (e, s) => ({
  id: e.id, folder: e.folder, flags: e.flags,
  unread: !e.flags.includes('S'), starred: e.flags.includes('F'), answered: e.flags.includes('R'),
  from: s.from, to: s.to, subject: s.subject, date: s.date || fileTime(e), snippet: s.snippet, attach: !!s.attach, rcpt: s.rcpt || '', size: s.size || 0,
});
function fileTime(e) { const m = /^(\d{9,11})\./.exec(e.base); return m ? +m[1] * 1000 : 0; }

let scanning = null;
/** Every message in every folder, newest first. */
async function all() {
  if (scanning) return scanning;
  scanning = (async () => {
    await md.ensure().catch(() => {});
    const out = [];
    for (const f of md.FOLDERS) {
      const entries = await md.scan(f.id);
      for (const e of entries) out.push(row(e, await summary(e)));
    }
    out.sort((a, b) => b.date - a.date);
    // forget index entries for files that no longer exist
    const live = new Set(out.map(r => r.id.split('~')[1]));
    for (const k of Object.keys(idx)) if (!live.has(k)) { delete idx[k]; dirty = true; }
    return out;
  })();
  try { return await scanning; } finally { scanning = null; }
}

function matches(r, q) {
  if (!q) return true;
  const hay = `${r.from.name} ${r.from.address} ${r.to.map(a => a.name + ' ' + a.address).join(' ')} ${r.subject} ${r.snippet} ${r.rcpt}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => {
    const m = /^(from|to|subject|has):(.+)$/.exec(w);
    if (!m) return hay.includes(w);
    if (m[1] === 'from') return `${r.from.name} ${r.from.address}`.toLowerCase().includes(m[2]);
    if (m[1] === 'to') return `${r.to.map(a => a.address).join(' ')} ${r.rcpt}`.toLowerCase().includes(m[2]);
    if (m[1] === 'subject') return r.subject.toLowerCase().includes(m[2]);
    if (m[1] === 'has') return m[2] === 'attachment' ? r.attach : true;
    return true;
  });
}

async function list({ folder = 'inbox', q = '', alias = '', starred = false, unread = false, offset = 0, limit = 60 } = {}) {
  const rows = await all();
  let sel = rows.filter(r => folder === 'all' ? r.folder !== 'trash' && r.folder !== 'spam' : folder === 'starred' ? r.starred && r.folder !== 'trash' : r.folder === folder);
  if (alias) sel = sel.filter(r => r.rcpt === alias);
  if (starred) sel = sel.filter(r => r.starred);
  if (unread) sel = sel.filter(r => r.unread);
  sel = sel.filter(r => matches(r, q));
  return { total: sel.length, items: sel.slice(offset, offset + limit) };
}

async function counts() {
  const rows = await all();
  const folders = md.FOLDERS.map(f => {
    const inF = rows.filter(r => r.folder === f.id);
    return { id: f.id, name: f.name, total: inF.length, unread: inF.filter(r => r.unread).length };
  });
  folders.splice(1, 0, { id: 'starred', name: 'Starred', total: rows.filter(r => r.starred && r.folder !== 'trash').length, unread: 0 });
  const aliases = new Map();
  for (const r of rows) {
    if (!r.rcpt || r.folder === 'trash' || r.folder === 'sent' || r.folder === 'drafts') continue;
    const a = aliases.get(r.rcpt) || { address: r.rcpt, total: 0, unread: 0, last: 0 };
    a.total++; if (r.unread) a.unread++; a.last = Math.max(a.last, r.date);
    aliases.set(r.rcpt, a);
  }
  return { folders, aliases: [...aliases.values()].sort((a, b) => b.last - a.last) };
}

// ---- changes (serialised per message) ----
const act = (id, fn) => withLock(id.split('~')[1] || id, fn);
async function mark(ids, add, remove) { for (const id of ids) await act(id, () => md.setFlags(id, add, remove)); events.emit('changed'); }
async function move(ids, folder) { const out = []; for (const id of ids) out.push(await act(id, () => md.move(id, folder))); events.emit('changed'); return out.filter(Boolean).map(x => x.id); }
async function trash(ids) {
  for (const id of ids) {
    await act(id, async () => { if (id.startsWith('trash~')) await md.remove(id); else await md.move(id, 'trash'); });
  }
  events.emit('changed');
}
async function emptyFolder(folder) {
  const entries = await md.scan(folder);
  for (const e of entries) await act(e.id, () => md.remove(e.id));
  events.emit('changed');
  return entries.length;
}
async function store(folder, raw, flags = '', toNew = false) {
  const w = await md.write(folder, raw, flags, toNew);
  events.emit(folder === 'inbox' ? 'new' : 'changed', { id: w.id });
  return w;
}

module.exports = { all, list, counts, mark, move, trash, emptyFolder, store, summary, flush };
