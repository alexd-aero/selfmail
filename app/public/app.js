/* selfmail 2 — web client */
'use strict';
(() => {
// ============================================================ helpers ====
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const P = {
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
  star: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  draft: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  archive: '<rect x="2" y="3.5" width="20" height="5" rx="1"/><path d="M4 8.5v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-10M10 12.5h4"/>',
  spam: '<path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z"/><path d="M12 8v4M12 16h.01"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  all: '<path d="M4 4h16v16H4z"/><path d="M4 9h16M9 4v16"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  reply: '<path d="m9 17-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  replyall: '<path d="m7 17-5-5 5-5"/><path d="m12 17-5-5 5-5"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/>',
  forward: '<path d="m15 17 5-5-5-5"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>',
  unread: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  read: '<path d="M21.2 8.4c.5.4.8 1 .8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10c0-.6.3-1.2.8-1.6l8-5.6a2 2 0 0 1 2.4 0z"/><path d="m22 10-10 6L2 10"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
  clip: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  max: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  min: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  bold: '<path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z"/>',
  italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
  underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4M4 21h16"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  ul: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  ol: '<path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  quote: '<path d="M3 21c3 0 7-1 7-8V5H3v7h4c0 4-2 5-4 5zM14 21c3 0 7-1 7-8V5h-7v7h4c0 4-2 5-4 5z"/>',
  eraser: '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 19M22 21H7M5 11l9 9"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  mono: '<path d="m4 17 6-6-6-6M12 19h8"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z"/>',
};
const icon = (n, cls = 'i') => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', cls); s.innerHTML = P[n] || ''; return s; };
const ib = (n, title, fn, cls = '') => h('button', { class: 'ib ' + cls, title, 'aria-label': title, onclick: fn }, icon(n));

async function api(method, url, body) {
  const r = await fetch(url, { method, credentials: 'same-origin', headers: { 'X-Selfmail': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (r.status === 401 && !url.endsWith('/login')) { showLogin(); throw new Error('Please sign in again.'); }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json().catch(() => ({})) : await r.text();
  if (r.status === 403 && data && data.needsAgreement) { showAgreement(); throw new Error(data.error); }
  if (!r.ok) throw Object.assign(new Error((data && data.error) || `Error ${r.status}`), { data });
  return data;
}

function toast(msg, opts = {}) {
  const t = h('div', { class: 'toast' + (opts.bad ? ' bad' : '') }, h('span', {}, msg), opts.action ? h('button', { onclick: () => { opts.action.fn(); t.remove(); } }, opts.action.label) : null);
  $('.toasts').append(t); setTimeout(() => t.remove(), opts.ms || (opts.bad ? 6500 : 3200));
}
const fail = e => toast(e.message || String(e), { bad: true });

let menuEl = null;
function closeMenu() { menuEl?.remove(); menuEl = null; }
function menu(anchor, items) {
  closeMenu();
  menuEl = h('div', { class: 'menu' }, items.filter(Boolean).map(([ic, label, fn]) => h('button', { onclick: () => { closeMenu(); fn(); } }, ic ? icon(ic) : null, label)));
  document.body.append(menuEl);
  const r = anchor.getBoundingClientRect(), w = menuEl.offsetWidth, hh = menuEl.offsetHeight;
  menuEl.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
  menuEl.style.top = (r.bottom + hh + 8 > innerHeight ? Math.max(8, r.top - hh - 6) : r.bottom + 6) + 'px';
  setTimeout(() => document.addEventListener('pointerdown', e => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, { once: true }));
}
function dialog(title, body, actions) {
  return new Promise(resolve => {
    const d = h('div', { class: 'dialog', onclick: e => { if (e.target === d) done(null); } },
      h('div', { class: 'box' }, h('h3', { text: title }), body, h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        actions.map(([label, val, cls]) => h('button', { class: 'btn ' + (cls || ''), onclick: () => done(val) }, label)))));
    const done = v => { d.remove(); resolve(v); };
    document.body.append(d);
    d.querySelector('input,textarea,button.pri')?.focus();
  });
}
const confirmBox = (title, text, ok = 'OK', danger) => dialog(title, h('p', { class: 'muted', style: { margin: 0 }, text }), [['Cancel', false, 'ghost'], [ok, true, danger ? 'pri danger' : 'pri']]);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fmtWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = (now - d) / 864e5;
  if (days < 6) return d.toLocaleDateString([], { weekday: 'short' });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}
const fmtFull = ts => ts ? new Date(ts).toLocaleString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const fmtSize = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`;
const nameOf = a => a ? (a.name || a.address || '') : '';
function avatar(a) {
  const s = (a?.name || a?.address || '?').trim();
  let hsh = 0; for (const ch of (a?.address || s)) hsh = (hsh * 31 + ch.charCodeAt(0)) | 0;
  const letter = ([...s.replace(/^["'(]+/, '')][0] || '?').toUpperCase();
  return h('div', { class: 'avatar', style: { background: `hsl(${Math.abs(hsh) % 360} 55% 48%)` }, text: letter });
}
function copyText(t) { navigator.clipboard?.writeText(t).then(() => toast('Copied'), () => toast('Copy failed', { bad: true })); }

// ============================================================== state ====
const S = { me: null, folders: [], aliases: [], view: 'mail', folder: 'inbox', alias: '', q: '', items: [], total: 0, offset: 0, sel: new Set(), open: null, msg: null, images: new Set(), mono: {}, loading: false };
const FOLDER_ICON = { inbox: 'inbox', starred: 'star', sent: 'send', drafts: 'draft', archive: 'archive', spam: 'spam', trash: 'trash' };
const theme = () => localStorage.getItem('sm-theme') || 'auto';
function applyTheme() {
  const t = theme(), dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
applyTheme();

// ============================================================== login ====
function showLogin(msg) {
  document.title = 'Sign in · selfmail';
  const err = h('div', { class: 'err', text: msg || '' });
  const u = h('input', { type: 'text', name: 'username', autocomplete: 'username', required: true, autofocus: true });
  const p = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn pri', type: 'submit', style: { height: '42px' } }, 'Sign in');
  const form = h('form', { onsubmit: async e => {
    e.preventDefault(); btn.disabled = true; err.textContent = '';
    try { await api('POST', '/api/login', { user: u.value, pass: p.value }); boot(); }
    catch (x) { err.textContent = x.message; btn.disabled = false; p.select(); }
  } },
    h('div', { class: 'brand' }, h('div', { class: 'logo' }, icon('unread')), 'selfmail'),
    h('div', {}, h('h1', { text: 'Sign in to your mail' }), h('p', { text: 'Use the account created when selfmail was installed.' })),
    h('label', { class: 'f' }, 'Username', u), h('label', { class: 'f' }, 'Password', p), err, btn);
  document.body.replaceChildren(h('div', { class: 'login' }, form), h('div', { class: 'toasts' }));
  u.focus();
}

// ========================================================== agreement ====
function ispBadge(i, big) {
  const logo = i.logo ? h('img', { src: i.logo, alt: '', class: 'isp-logo' + (big ? ' big' : '') }) : h('div', { class: 'isp-logo mono' + (big ? ' big' : ''), text: (i.name || '?')[0] });
  return h('div', { class: 'isp' }, logo, h('div', {}, h('b', { text: i.name || 'Your internet provider' }), h('small', { text: [i.network !== i.name ? i.network : '', i.asn, i.ip].filter(Boolean).join(' · ') })));
}
function termsList(terms) { return h('ol', { class: 'terms' }, terms.map(t => h('li', {}, h('b', { text: t.h }), h('p', { text: t.p })))); }
async function showAgreement() {
  if ($('.agree-page')) return;
  document.title = 'Responsible use · selfmail';
  document.body.replaceChildren(h('div', { class: 'login agree-page' }, h('div', { class: 'agree-card' }, h('span', { class: 'spin' }))), h('div', { class: 'toasts' }));
  let a;
  try { a = await (await fetch('/api/agreement', { credentials: 'same-origin' })).json(); } catch (e) { return toast('Could not load the agreement — check the connection and reload.', { bad: true }); }
  const name = h('input', { type: 'text', placeholder: 'Your full name', autocomplete: 'name' });
  const tick = h('input', { type: 'checkbox' });
  const err = h('div', { class: 'err' });
  const btn = h('button', { class: 'btn pri', disabled: true, style: { height: '44px' } }, 'Sign and continue');
  const valid = () => { btn.disabled = !(tick.checked && name.value.trim().length >= 3); };
  name.addEventListener('input', valid); tick.addEventListener('change', valid);
  btn.addEventListener('click', async () => {
    btn.disabled = true; err.textContent = '';
    try { await api('POST', '/api/agreement', { name: name.value, agree: tick.checked }); boot(); }
    catch (e) { err.textContent = e.message; valid(); }
  });
  $('.agree-card').replaceChildren(
    h('div', { class: 'brand' }, h('div', { class: 'logo' }, icon('shield')), 'selfmail'),
    h('h1', { text: 'Before you start: responsible use' }),
    h('p', { class: 'muted', text: 'Running your own mail server comes with responsibility. Read this, then sign it with your name. You only do this once.' }),
    h('div', { class: 'isp-box' }, h('small', { text: 'This server’s internet connection' }), ispBadge(a.isp, true)),
    termsList(a.terms),
    h('label', { class: 'f' }, 'Signature', name, h('small', { text: 'Typing your name here is your signature.' })),
    h('label', { class: 'row check' }, tick, h('span', { text: `I have read this agreement. I am responsible for how this server is used, I will follow ${a.isp.name || 'my internet provider'}’s terms, and the authors of selfmail are not responsible for it.` })),
    err,
    h('div', { class: 'row' }, btn, h('span', { class: 'grow' }), h('button', { class: 'btn ghost', onclick: async () => { await fetch('/api/logout', { method: 'POST', headers: { 'X-Selfmail': '1' } }).catch(() => {}); showLogin(); } }, 'Sign out')));
  scrollTo(0, 0);
}

// ============================================================== shell ====
function shell() {
  document.body.replaceChildren(
    h('div', { class: 'shell', id: 'shell' },
      h('aside', { class: 'nav', id: 'nav' }),
      h('section', { class: 'list', id: 'list' }),
      h('section', { class: 'reader', id: 'reader' }),
      h('section', { class: 'page hide', id: 'page' })),
    h('div', { class: 'toasts' }));
}

function renderNav() {
  const nav = $('#nav'); if (!nav) return;
  const link = (href, ic, label, n, on, cls = '') => h('a', { class: `it ${cls} ${on ? 'on' : ''}`, href, onclick: () => $('#shell').classList.remove('navopen') }, icon(ic), h('span', { class: 't', text: label }), n ? h('span', { class: 'n', text: n }) : null);
  const f = id => S.folders.find(x => x.id === id) || { total: 0, unread: 0 };
  const mail = S.view === 'mail';
  nav.replaceChildren(
    h('div', { class: 'brand' }, h('div', { class: 'logo' }, icon('unread')), 'selfmail'),
    h('button', { class: 'btn pri compose-btn', onclick: () => compose() }, icon('pen'), 'Compose'),
    ...['inbox', 'starred', 'sent', 'drafts', 'archive', 'spam', 'trash'].map(id => {
      const x = f(id); const n = id === 'inbox' || id === 'spam' ? (x.unread || '') : id === 'drafts' ? (x.total || '') : '';
      return link(`#/f/${id}`, FOLDER_ICON[id], S.folders.find(y => y.id === id)?.name || id, n, mail && !S.alias && S.folder === id);
    }),
    link('#/f/all', 'all', 'All mail', '', mail && !S.alias && S.folder === 'all'),
    S.aliases.length ? h('h6', { text: 'Sent to' }) : null,
    ...S.aliases.slice(0, 30).map(a => link(`#/a/${encodeURIComponent(a.address)}`, 'at', a.address.split('@')[0], a.unread || '', mail && S.alias === a.address, 'alias')),
    h('div', { class: 'foot' },
      link('#/domain', 'globe', 'Domain & DNS', '', S.view === 'domain'),
      link('#/status', 'pulse', 'Server status', '', S.view === 'status'),
      link('#/settings', 'gear', 'Settings', '', S.view === 'settings'),
      h('div', { class: 'me' }, avatar({ name: S.me.user }), h('div', { class: 'grow' }, h('b', { text: S.me.user }), S.me.address),
        ib(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 'Switch light / dark', () => { localStorage.setItem('sm-theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); applyTheme(); renderNav(); }),
        ib('logout', 'Sign out', async () => { await api('POST', '/api/logout').catch(() => {}); showLogin('You have been signed out.'); }))));
  const inbox = f('inbox').unread;
  document.title = `${inbox ? `(${inbox}) ` : ''}${S.view === 'mail' ? (S.alias || (S.folders.find(x => x.id === S.folder)?.name || 'All mail')) : { domain: 'Domain', status: 'Status', settings: 'Settings' }[S.view]} · selfmail`;
}

async function loadFolders() {
  try { const r = await api('GET', '/api/folders'); S.folders = r.folders; S.aliases = r.aliases; renderNav(); } catch (e) { /* signed out */ }
}

// =============================================================== list ====
const folderTitle = () => S.alias ? S.alias : S.folder === 'all' ? 'All mail' : (S.folders.find(x => x.id === S.folder)?.name || S.folder);
async function loadList(more = false) {
  if (!more) { S.offset = 0; }
  S.loading = true;
  const qs = new URLSearchParams({ folder: S.alias ? 'all' : S.folder, q: S.q, alias: S.alias, offset: S.offset, limit: 60 });
  try {
    const r = await api('GET', '/api/messages?' + qs);
    S.items = more ? [...S.items, ...r.items] : r.items; S.total = r.total;
    for (const id of [...S.sel]) if (!S.items.some(x => x.id === id)) S.sel.delete(id);
  } catch (e) { fail(e); }
  S.loading = false;
  renderList();
}

function renderList() {
  const box = $('#list'); if (!box) return;
  const head = $('.list-head', box) || h('div', { class: 'list-head' });
  if (!head.isConnected) {
    const search = h('input', { type: 'search', placeholder: 'Search mail', value: S.q, 'aria-label': 'Search mail', oninput: debounce(e => { S.q = e.target.value.trim(); loadList(); }, 250) });
    head.append(h('h2', {}, ib('menu', 'Menu', () => $('#shell').classList.toggle('navopen'), 'mobile-only'), h('span', { class: 'ttl grow' }), ib('refresh', 'Refresh', () => { loadFolders(); loadList(); })),
      h('div', { class: 'search' }, icon('search'), search), h('div', { class: 'bulk' }));
    box.replaceChildren(head, h('div', { class: 'rows', id: 'rows' }));
  }
  $('.ttl', head).textContent = folderTitle();
  $('input[type=search]', head).value !== S.q && ($('input[type=search]', head).value = S.q);
  renderBulk();
  const rows = $('#rows');
  if (!S.items.length) {
    rows.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'big', text: S.q ? '🔍' : S.folder === 'trash' ? '🗑️' : '📭' }), h('b', { text: S.loading ? 'Loading…' : S.q ? 'Nothing matches your search' : 'Nothing here yet' }),
      S.q ? h('span', { text: 'Try fewer words, or from:name / to:alias / subject:word / has:attachment' }) : null));
    return;
  }
  const frag = document.createDocumentFragment();
  for (const m of S.items) {
    const who = S.folder === 'sent' || S.folder === 'drafts' || m.folder === 'sent' || m.folder === 'drafts' ? 'To: ' + (m.to.map(nameOf).join(', ') || '(no recipient)') : nameOf(m.from) || '(unknown sender)';
    const showAlias = m.rcpt && m.rcpt !== S.me.address && !S.alias;
    const cb = h('input', { type: 'checkbox', 'aria-label': 'Select', checked: S.sel.has(m.id), onclick: e => { e.stopPropagation(); e.target.checked ? S.sel.add(m.id) : S.sel.delete(m.id); renderBulk(); } });
    const star = h('button', { class: 'star' + (m.starred ? ' on' : ''), title: m.starred ? 'Unstar' : 'Star', onclick: e => { e.stopPropagation(); flag([m.id], m.starred ? '' : 'F', m.starred ? 'F' : ''); } }, icon('star'));
    frag.append(h('div', { class: `mrow ${m.unread ? 'unread' : ''} ${S.open === m.id ? 'on' : ''}`, 'data-id': m.id, onclick: () => openMsg(m.id) },
      h('div', { class: 'ck' }, cb, star),
      h('div', { class: 'who' }, who),
      h('div', { class: 'when' }, m.attach ? icon('clip') : null, fmtWhen(m.date)),
      h('div', { class: 'line2' }, h('span', { class: 'sub', text: m.subject || '(no subject)' }), m.snippet ? ` — ${m.snippet}` : '', showAlias ? h('span', { class: 'chip acc tag', text: m.rcpt.split('@')[0] }) : null,
        S.folder === 'all' && m.folder !== 'inbox' ? h('span', { class: 'chip tag', text: m.folder }) : null)));
  }
  if (S.items.length < S.total) frag.append(h('div', { class: 'more' }, h('button', { class: 'btn sm', onclick: () => { S.offset = S.items.length; loadList(true); } }, `Load more (${S.total - S.items.length} left)`)));
  rows.replaceChildren(frag);
  $('#list').classList.toggle('selecting', S.sel.size > 0);
}

function renderBulk() {
  const b = $('.bulk'); if (!b) return;
  const n = S.sel.size, all = S.items.length && S.items.every(x => S.sel.has(x.id));
  const selAll = h('input', { type: 'checkbox', title: 'Select all', checked: all, style: { width: '15px', height: '15px', margin: '0 9px', accentColor: 'var(--accent)' }, onclick: e => { if (e.target.checked) S.items.forEach(x => S.sel.add(x.id)); else S.sel.clear(); renderList(); } });
  const ids = () => [...S.sel];
  const inTrash = S.folder === 'trash', inSpam = S.folder === 'spam';
  b.replaceChildren(selAll,
    ...(n ? [
      ib('archive', 'Archive (e)', () => move(ids(), 'archive')),
      ib('trash', inTrash ? 'Delete forever' : 'Delete (#)', () => del(ids())),
      inSpam ? ib('inbox', 'Not spam', () => move(ids(), 'inbox')) : ib('spam', 'Report spam', () => move(ids(), 'spam')),
      ib('read', 'Mark read', () => flag(ids(), 'S', '')), ib('unread', 'Mark unread', () => flag(ids(), '', 'S')),
      ib('folder', 'Move to…', e => moveMenu(e.currentTarget, ids())),
      h('span', { class: 'count', text: `${n} selected` }),
    ] : [
      h('span', { class: 'count', text: S.total ? `${S.total} ${S.total === 1 ? 'message' : 'messages'}` : '' }),
      (inTrash || inSpam) && S.total ? h('button', { class: 'btn sm ghost danger', style: { marginLeft: 'auto' }, onclick: async () => { if (await confirmBox(`Empty ${inTrash ? 'Trash' : 'Spam'}?`, `${S.total} messages will be deleted forever.`, 'Empty', true)) { await api('POST', `/api/folders/${S.folder}/empty`).catch(fail); refresh(); } } }, `Empty ${inTrash ? 'Trash' : 'Spam'}`) : '',
    ]));
}

function moveMenu(anchor, ids) {
  menu(anchor, ['inbox', 'archive', 'spam', 'trash'].filter(f => f !== S.folder).map(f => [FOLDER_ICON[f], S.folders.find(x => x.id === f)?.name || f, () => move(ids, f)]));
}
async function flag(ids, add, remove) {
  try { await api('POST', '/api/messages/flags', { ids, add, remove }); for (const m of S.items) if (ids.includes(m.id)) { if (add.includes('F')) m.starred = true; if (remove.includes('F')) m.starred = false; if (add.includes('S')) m.unread = false; if (remove.includes('S')) m.unread = true; } renderList(); loadFolders(); if (S.msg && ids.includes(S.msg.id)) { S.msg.starred = ids.includes(S.msg.id) && add.includes('F') ? true : remove.includes('F') ? false : S.msg.starred; renderReaderTools(); } }
  catch (e) { fail(e); }
}
async function move(ids, folder) {
  try {
    const r = await api('POST', '/api/messages/move', { ids, folder });
    const label = S.folders.find(x => x.id === folder)?.name || folder;
    toast(`${ids.length === 1 ? 'Conversation' : ids.length + ' messages'} moved to ${label}`, { action: { label: 'Undo', fn: async () => { await api('POST', '/api/messages/move', { ids: r.ids, folder: S.folder === 'all' || S.folder === 'starred' ? 'inbox' : S.folder }).catch(fail); refresh(); } } });
    afterRemove(ids);
  } catch (e) { fail(e); }
}
async function del(ids) {
  const forever = S.folder === 'trash';
  if (forever && !await confirmBox('Delete forever?', `${ids.length} message${ids.length > 1 ? 's' : ''} will be gone for good.`, 'Delete', true)) return;
  try {
    await api('POST', '/api/messages/delete', { ids });
    toast(forever ? 'Deleted forever' : `Moved to Trash`, forever ? {} : { action: { label: 'Undo', fn: async () => { await api('POST', '/api/messages/move', { ids: ids.map(i => 'trash~' + i.split('~')[1]), folder: S.folder === 'all' || S.folder === 'starred' ? 'inbox' : S.folder }).catch(fail); refresh(); } } });
    afterRemove(ids);
  } catch (e) { fail(e); }
}
function afterRemove(ids) {
  const idx = S.items.findIndex(x => ids.includes(x.id));
  S.items = S.items.filter(x => !ids.includes(x.id)); S.total -= ids.length;
  ids.forEach(i => S.sel.delete(i));
  if (S.open && ids.includes(S.open)) {
    const next = S.items[Math.min(idx, S.items.length - 1)];
    if (next && innerWidth > 1180) openMsg(next.id); else closeMsg();
  }
  renderList(); loadFolders();
}
const refresh = () => { loadFolders(); loadList(); };

// ============================================================= reader ====
function setHash(hsh) { if (location.hash !== hsh) history.pushState(null, '', hsh); }
const baseHash = () => S.alias ? `#/a/${encodeURIComponent(S.alias)}` : `#/f/${S.folder}`;

async function openMsg(id, fromRoute) {
  if (!fromRoute) setHash(`${baseHash()}/${encodeURIComponent(id)}`);
  const row = S.items.find(x => x.id === id);
  if (row && row.folder === 'drafts') { const d = await api('GET', `/api/messages/${encodeURIComponent(id)}?peek=1`).catch(fail); if (d) return compose({ draft: d }); }
  S.open = id; $('#shell').classList.add('reading');
  $$('.mrow').forEach(r => r.classList.toggle('on', r.dataset.id === id));
  const rd = $('#reader');
  rd.replaceChildren(h('div', { class: 'rtool' }), h('div', { class: 'placeholder' }, h('span', { class: 'spin' })));
  try {
    const m = await api('GET', `/api/messages/${encodeURIComponent(id)}`);
    if (S.open !== id) return;
    m.starred = (m.flags || '').includes('F');
    S.msg = m;
    if (row && row.unread) { row.unread = false; renderList(); loadFolders(); }
    renderReader();
  } catch (e) { rd.replaceChildren(h('div', { class: 'placeholder' }, h('b', { text: e.message }))); }
}
function closeMsg() {
  S.open = null; S.msg = null; $('#shell').classList.remove('reading');
  setHash(baseHash());
  $$('.mrow.on').forEach(r => r.classList.remove('on'));
  renderEmptyReader();
}
function renderEmptyReader() {
  $('#reader')?.replaceChildren(h('div', { class: 'placeholder' }, h('div', {}, icon('unread'), h('div', { text: 'Choose a message to read it' }), h('div', { class: 'muted', style: { fontSize: '12.5px', marginTop: '6px' } }, 'Shortcuts: ', h('span', { class: 'kbd', text: 'j' }), ' ', h('span', { class: 'kbd', text: 'k' }), ' move · ', h('span', { class: 'kbd', text: 'c' }), ' compose · ', h('span', { class: 'kbd', text: '/' }), ' search'))));
}

function renderReaderTools() {
  const m = S.msg, t = $('#reader .rtool'); if (!m || !t) return;
  const inF = m.folder;
  t.replaceChildren(
    ib('back', 'Back', () => closeMsg(), 'back'),
    ib('archive', 'Archive (e)', () => move([m.id], 'archive')),
    ib('trash', inF === 'trash' ? 'Delete forever' : 'Delete (#)', () => del([m.id])),
    inF === 'spam' ? ib('inbox', 'Not spam', () => move([m.id], 'inbox')) : ib('spam', 'Report spam', () => move([m.id], 'spam')),
    h('span', { class: 'sep' }),
    ib('unread', 'Mark unread (u)', () => { flag([m.id], '', 'S'); closeMsg(); }),
    ib('star', m.starred ? 'Unstar (s)' : 'Star (s)', () => { m.starred = !m.starred; flag([m.id], m.starred ? 'F' : '', m.starred ? '' : 'F'); }, m.starred ? 'on' : ''),
    ib('folder', 'Move to…', e => moveMenu(e.currentTarget, [m.id])),
    h('span', { class: 'grow' }),
    ib('reply', 'Reply (r)', () => compose({ mode: 'reply', msg: m })),
    ib('more', 'More', e => menu(e.currentTarget, [
      ['replyall', 'Reply all', () => compose({ mode: 'replyall', msg: m })],
      ['forward', 'Forward', () => compose({ mode: 'forward', msg: m })],
      ['download', 'Download (.eml)', () => { location.href = `/api/messages/${encodeURIComponent(m.id)}/raw`; }],
      ['file', 'Show original', () => window.open(`/api/messages/${encodeURIComponent(m.id)}/raw`, '_blank')],
    ])));
  const star = $$('.ib', t).find(b => b.title.startsWith('Star') || b.title.startsWith('Unstar'));
  if (star) $('svg', star).style.fill = m.starred ? 'currentColor' : 'none';
}

function authChips(a) {
  const out = [];
  for (const k of ['spf', 'dkim', 'dmarc']) if (a?.[k]) out.push(h('span', { class: 'chip ' + (a[k] === 'pass' ? 'ok' : /fail/.test(a[k]) ? 'bad' : 'warn'), title: `${k.toUpperCase()}: ${a[k]}` }, `${k.toUpperCase()} ${a[k] === 'pass' ? '✓' : a[k]}`));
  return out;
}

function renderReader() {
  const m = S.msg, rd = $('#reader');
  const images = S.images.has(m.id);
  const mono = S.mono[m.id];
  const q = new URLSearchParams(); if (images) q.set('images', '1'); if (mono !== undefined) q.set('mono', mono ? '1' : '0');
  const frame = h('iframe', { title: 'Message', sandbox: 'allow-same-origin allow-popups allow-popups-to-escape-sandbox', src: `/api/messages/${encodeURIComponent(m.id)}/frame?${q}`, referrerpolicy: 'no-referrer' });
  const notice = h('div', { class: 'notice hide' }, icon('image'), h('span', { class: 'grow', text: 'Pictures from the internet are hidden to protect your privacy (they can tell the sender you opened this).' }),
    h('button', { class: 'btn sm', onclick: () => { S.images.add(m.id); renderReader(); } }, 'Show pictures'));
  frame.addEventListener('load', () => wireFrame(frame, notice));
  const me = S.me.address;
  const toList = [...m.to, ...m.cc].map(a => a.address === me || a.address === m.rcpt ? 'me' : nameOf(a)).join(', ');
  rd.replaceChildren(
    h('div', { class: 'rtool' }),
    h('div', { class: 'rbody' }, h('div', { class: 'rcard' },
      h('h1', { text: m.subject || '(no subject)' }),
      h('div', { class: 'sender' }, avatar(m.from),
        h('div', { class: 'grow', style: { minWidth: 0 } },
          h('div', {}, h('span', { class: 'nm', text: m.from.name || m.from.address }), m.from.name ? h('span', { class: 'ad', text: `  <${m.from.address}>` }) : null),
          h('div', { class: 'meta' }, `to ${toList || 'me'}`, m.rcpt && m.rcpt !== me ? h('span', { class: 'chip acc', text: `via ${m.rcpt}` }) : null, ...authChips(m.auth))),
        h('div', { class: 'when', text: fmtFull(m.date) })),
      notice,
      !m.hasHtml ? h('div', { class: 'row', style: { justifyContent: 'flex-end', marginBottom: '8px' } }, h('button', { class: 'btn sm ghost', title: 'Show this message in a fixed-width font (for tables and text art)', onclick: () => { S.mono[m.id] = !(mono ?? frame.dataset.mono === '1'); renderReader(); } }, icon('mono'), 'Fixed-width')) : null,
      h('div', { class: 'frame-wrap' }, frame),
      m.attachments.length ? h('div', { class: 'atts' }, m.attachments.map(a => h('a', { class: 'att', href: `/api/messages/${encodeURIComponent(m.id)}/attachments/${a.i}`, download: a.name },
        h('div', { class: 'ic' }, icon(/^image\//.test(a.type) ? 'image' : 'file')), h('div', { style: { minWidth: 0 } }, h('b', { text: a.name }), h('small', { text: fmtSize(a.size) }))))) : null,
      m.unsubscribe ? h('p', { class: 'muted', style: { fontSize: '12.5px' } }, 'Mailing list · ', h('a', { href: m.unsubscribe, target: '_blank', rel: 'noopener noreferrer' }, 'Unsubscribe')) : null,
      h('div', { class: 'replybar' },
        h('button', { class: 'btn', onclick: () => compose({ mode: 'reply', msg: m }) }, icon('reply'), 'Reply'),
        m.to.length + m.cc.length > 1 ? h('button', { class: 'btn', onclick: () => compose({ mode: 'replyall', msg: m }) }, icon('replyall'), 'Reply all') : null,
        h('button', { class: 'btn', onclick: () => compose({ mode: 'forward', msg: m }) }, icon('forward'), 'Forward')))));
  renderReaderTools();
}

/** Sizes the message frame to its content and routes mailto: links into the composer. */
function wireFrame(frame, notice) {
  let doc;
  try { doc = frame.contentDocument; } catch (e) { return; }
  if (!doc) return;
  const fit = () => { try { frame.style.height = Math.max(120, doc.documentElement.scrollHeight + 2) + 'px'; } catch (e) { /* gone */ } };
  fit();
  for (const img of doc.images) if (!img.complete) img.addEventListener('load', fit), img.addEventListener('error', fit);
  try { new ResizeObserver(fit).observe(doc.body); } catch (e) { setTimeout(fit, 400); setTimeout(fit, 1500); }
  const html = doc.documentElement.innerHTML;
  const remote = !S.images.has(S.msg?.id) && /(<img\b[^>]*\bsrc=["']?https?:|url\(["']?https?:|background=["']?https?:)/i.test(html);
  notice.classList.toggle('hide', !remote);
  frame.dataset.mono = doc.querySelector('.sm-text.mono') ? '1' : '0';
  doc.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    const href = a.getAttribute('href') || '';
    if (/^mailto:/i.test(href)) { e.preventDefault(); const u = new URL(href); compose({ to: decodeURIComponent(u.pathname), subject: u.searchParams.get('subject') || '' }); }
    else if (href.startsWith('#')) { e.preventDefault(); const t = doc.getElementById(href.slice(1)) || doc.getElementsByName(href.slice(1))[0]; t?.scrollIntoView(); }
    else if (!/^(https?|ftp):/i.test(href)) e.preventDefault();
  });
}

// ============================================================ compose ====
let openComposer = null;
function quoteHtml(m) {
  const who = m.from.name ? `${esc(m.from.name)} &lt;${esc(m.from.address)}&gt;` : esc(m.from.address);
  return `<p><br></p><p>On ${esc(fmtFull(m.date))}, ${who} wrote:</p><blockquote>${esc(m.text || '').replace(/\n/g, '<br>')}</blockquote>`;
}
function fwdHtml(m) {
  return `<p><br></p><p>---------- Forwarded message ----------<br>From: ${esc(nameOf(m.from))} &lt;${esc(m.from.address)}&gt;<br>Date: ${esc(fmtFull(m.date))}<br>Subject: ${esc(m.subject)}<br>To: ${esc(m.to.map(a => a.address).join(', '))}</p><p>${esc(m.text || '').replace(/\n/g, '<br>')}</p>`;
}
const sigHtml = () => S.me.signature ? `<p><br></p><div class="sig">-- <br>${esc(S.me.signature).replace(/\n/g, '<br>')}</div>` : '';

function compose(o = {}) {
  if (openComposer && !openComposer.closed) { if (o.mode || o.to || o.draft) openComposer.close(true); else return openComposer.focus(); }
  const me = S.me.address, dom = S.me.domain;
  const m = o.msg;
  const mine = a => a.endsWith('@' + dom);
  let to = o.to || '', cc = '', subject = o.subject || '', body = '<p><br></p>' + sigHtml(), from = me;
  let inReplyTo = '', references = '', answering = '';
  if (m) {
    from = m.rcpt && mine(m.rcpt) ? m.rcpt : me;
    const sub = m.subject || '';
    if (o.mode === 'forward') { subject = /^fwd?:/i.test(sub) ? sub : 'Fwd: ' + sub; body = '<p><br></p>' + sigHtml() + fwdHtml(m); }
    else {
      subject = /^re:/i.test(sub) ? sub : 'Re: ' + sub;
      const base = (m.replyTo.length ? m.replyTo : [m.from]).map(a => a.address);
      to = (m.folder === 'sent' ? m.to.map(a => a.address) : base).join(', ');
      if (o.mode === 'replyall') cc = [...m.to, ...m.cc].map(a => a.address).filter(a => !mine(a) && !base.includes(a)).join(', ');
      body = '<p><br></p>' + sigHtml() + quoteHtml(m);
      inReplyTo = m.msgid; references = [...(m.refs || []), m.msgid].filter(Boolean).join(' '); answering = m.id;
    }
  }
  let draftId = null;
  if (o.draft) {
    const d = o.draft; draftId = d.id;
    to = d.to.map(a => a.address).join(', '); cc = d.cc.map(a => a.address).join(', '); subject = d.subject; from = d.from.address || me;
    body = d.html || esc(d.text || '').replace(/\n/g, '<br>');
  }
  const froms = [...new Set([from, me, ...S.aliases.map(a => a.address)])].filter(mine);
  const fromSel = h('select', {}, froms.map(a => h('option', { value: a, text: a })), h('option', { value: '__other', text: 'Another address…' }));
  fromSel.value = from;
  fromSel.addEventListener('change', async () => {
    if (fromSel.value !== '__other') return;
    const inp = h('input', { type: 'text', placeholder: `anything@${dom}` });
    const v = await dialog('Send from another address', h('label', { class: 'f' }, `Every address @${dom} is yours (catch-all).`, inp), [['Cancel', null, 'ghost'], ['Use it', 'ok', 'pri']]);
    const a = (v && inp.value.trim().toLowerCase()) || '';
    if (a && mine(a) && /^[^\s@]+@/.test(a)) { fromSel.insertBefore(h('option', { value: a, text: a }), fromSel.lastChild); fromSel.value = a; }
    else { fromSel.value = me; if (v) toast(`It has to end with @${dom}`, { bad: true }); }
  });
  const toIn = h('input', { type: 'text', value: to, placeholder: 'Recipients', autocomplete: 'off' });
  const ccIn = h('input', { type: 'text', value: cc, placeholder: 'Cc' });
  const bccIn = h('input', { type: 'text', placeholder: 'Bcc' });
  const ccRow = h('div', { class: 'cfield' + (cc ? '' : ' hide') }, h('label', { text: 'Cc' }), ccIn);
  const bccRow = h('div', { class: 'cfield hide' }, h('label', { text: 'Bcc' }), bccIn);
  const subIn = h('input', { type: 'text', value: subject, placeholder: 'Subject' });
  const ed = h('div', { class: 'editor', contenteditable: 'true', 'data-ph': 'Write your message…', html: body });
  const atts = [];
  const attBox = h('div', { class: 'catts hide' });
  const status = h('span', { class: 'st grow' });
  const file = h('input', { type: 'file', multiple: true, class: 'hide', onchange: () => { addFiles(file.files); file.value = ''; } });
  const title = h('span', { class: 't', text: subject || 'New message' });
  subIn.addEventListener('input', () => { title.textContent = subIn.value || 'New message'; dirty = true; });
  const exec = (c, v) => { ed.focus(); document.execCommand(c, false, v); dirty = true; };
  const tool = (ic, t, fn) => ib(ic, t, e => { e.preventDefault(); fn(); });
  const box = h('div', { class: 'composer', role: 'dialog', 'aria-label': 'Compose' },
    h('div', { class: 'ctitle' }, title, ib('max', 'Bigger', () => box.classList.toggle('max')), ib('x', 'Close (saves a draft)', () => api_close())),
    h('div', { class: 'cfield' }, h('label', { text: 'From' }), fromSel),
    h('div', { class: 'cfield' }, h('label', { text: 'To' }), toIn, h('button', { class: 'lnk', onclick: () => { ccRow.classList.remove('hide'); ccIn.focus(); } }, 'Cc'), h('button', { class: 'lnk', onclick: () => { bccRow.classList.remove('hide'); bccIn.focus(); } }, 'Bcc')),
    ccRow, bccRow,
    h('div', { class: 'cfield' }, h('label', { text: 'Subject' }), subIn),
    h('div', { class: 'ctools' },
      tool('bold', 'Bold (Ctrl+B)', () => exec('bold')), tool('italic', 'Italic (Ctrl+I)', () => exec('italic')), tool('underline', 'Underline (Ctrl+U)', () => exec('underline')),
      tool('link', 'Link (Ctrl+K)', addLink), tool('ul', 'Bulleted list', () => exec('insertUnorderedList')), tool('ol', 'Numbered list', () => exec('insertOrderedList')),
      tool('quote', 'Quote', () => exec('formatBlock', 'blockquote')), tool('eraser', 'Clear formatting', () => exec('removeFormat')),
      h('span', { class: 'grow' }), tool('clip', 'Attach files', () => file.click())),
    ed, attBox,
    h('div', { class: 'cfoot' }, h('button', { class: 'btn pri', onclick: () => doSend() }, icon('send'), 'Send'), status,
      ib('trash', 'Discard', async () => { if (await confirmBox('Discard this message?', 'The draft will be deleted.', 'Discard', true)) { if (draftId) await api('POST', '/api/messages/delete', { ids: [draftId] }).catch(() => {}); close(); refresh(); } }), file));
  const ov = h('div', { class: 'overlay', onclick: e => { if (e.target === ov && innerWidth > 760) api_close(); } }, box);
  document.body.append(ov);
  let dirty = false, sending = false;
  ed.addEventListener('input', () => { dirty = true; });
  [toIn, ccIn, bccIn].forEach(i => i.addEventListener('input', () => { dirty = true; }));
  ed.addEventListener('paste', e => {
    const html = e.clipboardData.getData('text/html'); if (!html) return;
    e.preventDefault(); document.execCommand('insertHTML', false, cleanPaste(html)); dirty = true;
  });
  box.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doSend(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); addLink(); }
    if (e.key === 'Escape') { e.stopPropagation(); api_close(); }
  });
  function addLink() {
    const sel = getSelection(); const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const inp = h('input', { type: 'url', placeholder: 'https://' });
    dialog('Add a link', h('label', { class: 'f' }, 'Web address', inp), [['Cancel', null, 'ghost'], ['Add link', 'ok', 'pri']]).then(v => {
      if (!v || !inp.value.trim()) return;
      let url = inp.value.trim(); if (!/^(https?:|mailto:)/i.test(url)) url = 'https://' + url;
      ed.focus(); if (range) { sel.removeAllRanges(); sel.addRange(range); }
      if (range && !range.collapsed) document.execCommand('createLink', false, url);
      else document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>`);
      dirty = true;
    });
  }
  function addFiles(list) {
    for (const f of list) {
      if (atts.reduce((n, a) => n + a.size, 0) + f.size > 24e6) { toast('Attachments can be up to 24 MB in total.', { bad: true }); break; }
      const rd = new FileReader();
      rd.onload = () => { atts.push({ name: f.name, type: f.type || 'application/octet-stream', size: f.size, data: String(rd.result).split(',')[1] || '' }); renderAtts(); dirty = true; };
      rd.readAsDataURL(f);
    }
  }
  function renderAtts() {
    attBox.classList.toggle('hide', !atts.length);
    attBox.replaceChildren(...atts.map((a, i) => h('div', { class: 'catt' }, icon('clip'), h('span', { text: `${a.name} (${fmtSize(a.size)})` }), h('button', { title: 'Remove', onclick: () => { atts.splice(i, 1); renderAtts(); dirty = true; } }, icon('x')))));
  }
  ['dragover', 'drop'].forEach(ev => box.addEventListener(ev, e => { if (!e.dataTransfer?.types?.includes('Files')) return; e.preventDefault(); if (ev === 'drop') addFiles(e.dataTransfer.files); }));
  const payload = () => ({ from: fromSel.value, to: toIn.value, cc: ccIn.value, bcc: bccIn.value, subject: subIn.value, html: ed.innerHTML, attachments: atts.map(({ name, type, data }) => ({ name, type, data })), inReplyTo, references, answering, draft: draftId });
  const hasContent = () => toIn.value.trim() || subIn.value.trim() || ed.textContent.replace(/^\s*--\s*[\s\S]*$/, '').trim() || atts.length;
  async function saveDraft() {
    if (!dirty || sending || !hasContent()) return;
    dirty = false;
    try { const r = await api('POST', '/api/drafts', payload()); draftId = r.id; status.textContent = 'Draft saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
    catch (e) { dirty = true; }
  }
  const timer = setInterval(saveDraft, 8000);
  async function doSend() {
    if (sending) return;
    if (!toIn.value.trim() && !ccIn.value.trim() && !bccIn.value.trim()) { toast('Add at least one recipient.', { bad: true }); toIn.focus(); return; }
    if (!subIn.value.trim() && !await confirmBox('Send without a subject?', 'Messages without a subject are easy to miss.', 'Send anyway')) return;
    sending = true; status.replaceChildren(h('span', { class: 'spin' }), ' Sending…');
    try {
      await api('POST', '/api/send', payload());
      close(); toast('Message sent'); refresh();
    } catch (e) {
      sending = false; status.textContent = '';
      dialog('Not sent', h('div', {}, h('p', { style: { margin: '0 0 8px' }, text: e.message }), e.data?.diagnosis ? h('p', { class: 'muted', style: { margin: 0 }, text: e.data.diagnosis }) : null), [['OK', true, 'pri']]);
    }
  }
  async function api_close() {
    if (!sending && hasContent()) { dirty = true; await saveDraft(); if (draftId) toast('Saved to Drafts'); refresh(); }
    close();
  }
  function close() { clearInterval(timer); ov.remove(); openComposer.closed = true; }
  openComposer = { closed: false, close: (save) => save ? api_close() : close(), focus: () => ed.focus() };
  (to ? ed : toIn).focus();
  if (to) { const r = document.createRange(); r.setStart(ed, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); }
}
function cleanPaste(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const OK = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'A', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'PRE', 'CODE', 'SPAN']);
  const walk = (n, out) => { for (const c of n.childNodes) {
    if (c.nodeType === 3) { out.append(c.nodeValue); continue; }
    if (c.nodeType !== 1 || /^(SCRIPT|STYLE|META|LINK|TITLE)$/.test(c.tagName)) continue;
    if (!OK.has(c.tagName)) { walk(c, out); continue; }
    const e = document.createElement(c.tagName === 'SPAN' ? 'span' : c.tagName);
    if (c.tagName === 'A' && /^(https?:|mailto:)/i.test(c.getAttribute('href') || '')) e.setAttribute('href', c.getAttribute('href'));
    walk(c, e); out.append(e);
  } };
  const box = document.createElement('div'); walk(doc.body, box); return box.innerHTML;
}

// ============================================================== pages ====
function showPage(name) {
  S.view = name; $('#shell').classList.remove('reading', 'navopen');
  $('#list').classList.add('hide'); $('#reader').classList.add('hide');
  const pg = $('#page'); pg.classList.remove('hide');
  pg.replaceChildren(h('div', { class: 'page-in' }, h('div', { class: 'empty' }, h('span', { class: 'spin' }))));
  renderNav();
  ({ domain: pageDomain, status: pageStatus, settings: pageSettings })[name]().catch(e => pg.replaceChildren(h('div', { class: 'page-in' }, h('div', { class: 'card' }, h('b', { text: e.message })))));
}
const pageShell = (title, lead, ...cards) => h('div', { class: 'page-in' }, h('div', { class: 'row' }, ib('menu', 'Menu', () => $('#shell').classList.toggle('navopen'), 'mobile-only'), h('h1', { text: title })), h('p', { class: 'lead', text: lead }), ...cards);
const statusChip = s => h('span', { class: 'chip ' + ({ ok: 'ok', missing: 'bad', wrong: 'warn' }[s] || '') }, { ok: '✓ Correct', missing: '✗ Missing', wrong: '! Different' }[s] || s);

// ---- Domain & DNS ----
async function pageDomain() {
  const [st, recs] = await Promise.all([api('GET', '/api/settings'), api('GET', '/api/dns')]);
  const table = h('tbody');
  const fill = (rows, checked) => table.replaceChildren(...rows.map(r => h('tr', {},
    h('td', {}, h('b', { text: r.type }), r.priority ? h('div', { class: 'muted', text: `priority ${r.priority}` }) : null),
    h('td', { class: 'v' }, r.name, ' ', h('button', { class: 'copy', title: 'Copy name', onclick: () => copyText(r.name) }, icon('copy'))),
    h('td', { class: 'v' }, r.content, ' ', h('button', { class: 'copy', title: 'Copy value', onclick: () => copyText(r.content) }, icon('copy')), h('div', { class: 'note', text: r.note }),
      checked && r.status !== 'ok' && r.found ? h('div', { class: 'found', text: `Found: ${r.found}` }) : null, checked && r.detail ? h('div', { class: 'found', text: r.detail }) : null),
    h('td', {}, checked ? statusChip(r.status) : h('span', { class: 'chip', text: '…' })))));
  fill(recs, false);
  const summary = h('span', { class: 'chip', text: 'Checking…' });
  const check = async () => {
    summary.className = 'chip'; summary.textContent = 'Checking…';
    try { const r = await api('GET', '/api/dns/check'); fill(r.records, true); summary.className = 'chip ' + (r.ok === r.total ? 'ok' : 'warn'); summary.textContent = `${r.ok} of ${r.total} correct`; }
    catch (e) { summary.textContent = 'Check failed'; fail(e); }
  };
  check();

  const cf = h('div', { class: 'card' });
  const tokenUrl = 'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=' + encodeURIComponent(JSON.stringify([{ key: 'dns', type: 'edit' }, { key: 'zone', type: 'read' }])) + '&name=selfmail';
  function renderCf(s) {
    if (!s.cloudflare.connected) {
      const tok = h('input', { type: 'password', placeholder: 'Paste your Cloudflare API token', autocomplete: 'off' });
      const btn = h('button', { class: 'btn pri', onclick: async () => { btn.disabled = true; try { const r = await api('POST', '/api/cloudflare/connect', { token: tok.value }); toast(`Connected to ${r.zone.name}`); s.cloudflare = { connected: true, zone: r.zone.name, account: r.zone.account }; renderCf(s); } catch (e) { fail(e); btn.disabled = false; } } }, 'Connect');
      cf.replaceChildren(h('h2', {}, icon('cloud'), 'Set up DNS automatically with Cloudflare'),
        h('p', { class: 'sub', text: 'If your domain uses Cloudflare, selfmail can add and fix every record below for you. You’ll see exactly what changes before anything happens.' }),
        h('ol', { class: 'muted', style: { margin: '0 0 14px', paddingLeft: '20px', lineHeight: 1.8 } },
          h('li', {}, h('a', { href: tokenUrl, target: '_blank', rel: 'noopener' }, 'Create a Cloudflare API token'), ' — the link pre-fills the right permissions (Zone · DNS · Edit and Zone · Zone · Read).'),
          h('li', {}, 'Under “Zone Resources”, pick the domain ', h('b', { text: st.domain.split('.').slice(-2).join('.') }), ', then create the token and copy it.'),
          h('li', {}, 'Paste it here.')),
        h('div', { class: 'row' }, tok, btn));
      return;
    }
    const planBox = h('div', { class: 'ops' });
    const applyBtn = h('button', { class: 'btn pri hide', onclick: async () => {
      applyBtn.disabled = true;
      try { const r = await api('POST', '/api/cloudflare/apply'); toast(r.ok ? 'DNS records updated' : 'Some changes failed — see below', { bad: !r.ok }); showOps(r.results, true); setTimeout(check, 2500); }
      catch (e) { fail(e); } applyBtn.disabled = false;
    } }, 'Apply these changes');
    const showOps = (ops, done) => {
      const todo = ops.filter(o => !['ok', 'keep'].includes(o.action));
      applyBtn.classList.toggle('hide', done || !todo.some(o => o.action !== 'skip'));
      planBox.replaceChildren(...(todo.length ? todo : [{ action: 'ok', type: '', name: 'Everything already matches.', content: '' }]).map(o => h('div', { class: 'op' },
        h('span', { class: 'chip ' + ({ create: 'ok', update: 'acc', delete: 'bad', skip: 'warn', ok: 'ok' }[o.action] || '') }, done ? (o.done ? '✓ ' : '✗ ') + o.action : o.action),
        h('b', { class: 'typ', text: o.type }),
        h('div', { class: 'what' }, h('div', { text: o.name }), o.content ? h('div', { text: (o.priority ? o.priority + ' ' : '') + o.content }) : null, o.before ? h('div', { class: 'before', text: o.before }) : null, o.why ? h('div', { class: 'why', text: o.why }) : null, o.error ? h('div', { class: 'found', text: o.error }) : null))));
    };
    const preview = async () => { planBox.replaceChildren(h('span', { class: 'spin' })); try { showOps((await api('GET', '/api/cloudflare/plan')).ops, false); } catch (e) { planBox.replaceChildren(); fail(e); } };
    const auto = h('input', { type: 'checkbox', checked: s.autoIp, onchange: async e => { try { await api('POST', '/api/settings', { autoIp: e.target.checked }); toast(e.target.checked ? 'DNS will follow your IP' : 'Automatic IP updates off'); } catch (x) { fail(x); e.target.checked = !e.target.checked; } } });
    cf.replaceChildren(h('h2', {}, icon('cloud'), 'Cloudflare', h('span', { class: 'chip ok', text: `Connected · ${s.cloudflare.zone}` })),
      h('p', { class: 'sub', text: 'Preview what needs to change, then apply. Only mail records are touched; nothing else in your zone is changed.' }),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: preview }, icon('search'), 'Preview changes'), applyBtn, h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost danger', onclick: async () => { if (await confirmBox('Disconnect Cloudflare?', 'selfmail will forget the token. Your DNS records stay as they are.', 'Disconnect', true)) { await api('POST', '/api/cloudflare/disconnect').catch(fail); s.cloudflare.connected = false; renderCf(s); } } }, 'Disconnect')),
      planBox,
      h('label', { class: 'row', style: { marginTop: '6px', fontWeight: 600 } }, auto, 'Keep DNS updated when my home IP changes', h('span', { class: 'muted', style: { fontWeight: 400 }, text: '(checks every 10 minutes)' })));
    preview();
  }
  renderCf(st);
  $('#page').replaceChildren(pageShell('Domain & DNS', `Mail for @${st.domain} needs these DNS records. Green means the internet already sees them correctly.`,
    cf,
    h('div', { class: 'card' }, h('h2', {}, 'Records ', summary, h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: check }, icon('refresh'), 'Check again')),
      h('p', { class: 'sub', text: 'Not using Cloudflare? Add these at your DNS provider by hand (use the copy buttons). Changes can take a few minutes to show up.' }),
      h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'recs' }, h('thead', {}, h('tr', {}, h('th', { text: 'Type' }), h('th', { text: 'Name' }), h('th', { text: 'Value' }), h('th', { text: 'Status' }))), table)))));
}

// ---- Status ----
async function pageStatus() {
  const s = await api('GET', '/api/status');
  const tile = (state, title, detail, extra) => h('div', { class: 'tile' }, h('div', { class: 'h' }, h('span', { class: 'dot ' + state }), title), h('div', { class: 'd' }, detail), extra || null);
  const svc = (name, v, key) => tile(v === 'active' ? 'ok' : v === 'n/a' ? '' : 'bad', name, v === 'active' ? 'Running' : v === 'n/a' ? 'Not used' : `Not running (${v})`,
    v !== 'n/a' ? h('div', {}, h('button', { class: 'btn sm', onclick: async e => { e.target.disabled = true; try { await api('POST', '/api/services/restart', { name: key }); toast(`${name} restarted`); setTimeout(() => showPage('status'), 1200); } catch (x) { fail(x); e.target.disabled = false; } } }, 'Restart')) : null);
  const ipOk = s.ip.matches;
  const tiles = [
    svc('Postfix (sending)', s.services.postfix, 'postfix'),
    svc('OpenDKIM (signing)', s.services.opendkim, 'opendkim'),
    s.services.tunnel !== 'n/a' ? svc(`Tunnel (${s.services.tunnelUnit})`, s.services.tunnel, 'tunnel') : null,
    tile(s.smtp.ok ? 'ok' : 'bad', 'Mail server answers', s.smtp.ok ? `Greets in ${s.smtp.ms} ms — ${s.smtp.banner}` : s.smtp.detail),
    tile(s.webhook.ok === null ? '' : s.webhook.ok ? 'ok' : 'bad', 'Incoming mail path', s.webhook.detail),
    tile(ipOk ? 'ok' : 'warn', 'Public IP', s.ip.current ? `${s.ip.current}${ipOk ? '' : ` — settings and DNS still say ${s.ip.configured}. Update it in Settings, or turn on automatic updates on the Domain page.`}` : 'Could not detect.'),
    tile(s.ptr.confirmed ? 'ok' : s.ptr.names.length ? 'warn' : 'bad', 'Reverse DNS', s.ptr.names.length ? `${s.ptr.names[0]}${s.ptr.confirmed ? '' : ' — doesn’t point back to this IP. Your internet provider controls this; it costs a little spam score. Sending through a relay avoids it.'}` : 'None. Some receivers reject mail from IPs without reverse DNS.'),
    s.outbound25 === null ? tile('ok', 'Sending route', `Through ${s.outbound.host} on port ${s.outbound.using}${s.outbound.mode === 'auto' ? ' (port 25 is blocked, so the backup relay is sending)' : ''}`) : tile(s.outbound25 ? 'ok' : 'bad', 'Outgoing port 25', s.outbound25 ? `Open — this server delivers mail itself.${s.outbound.mode === 'auto' ? ` ${s.outbound.host}:${s.outbound.using} is the backup.` : ''}` : `Blocked by your internet provider.${s.outbound.mode === 'auto' ? ' The backup relay takes over.' : ' Mail can only leave through a relay (Settings → Sending).'}`),
    s.disk ? tile(s.disk.free / s.disk.total > 0.1 ? 'ok' : 'warn', 'Disk space', `${fmtSize(s.disk.free)} free of ${fmtSize(s.disk.total)}`) : null,
  ];
  const bl = h('div', { class: 'kv' }, h('div', { class: 'tile' }, h('span', { class: 'spin' })));
  api('GET', '/api/status/blocklists').then(r => {
    bl.replaceChildren(...r.results.map(x => tile({ clean: 'ok', listed: 'bad', info: 'warn', unknown: '' }[x.status], x.name,
      x.status === 'clean' ? 'Not listed' : x.status === 'unknown' ? `Couldn’t check (${x.detail})` : `${x.lists ? 'Listed on ' + x.lists.join(', ') + '. ' : 'Listed. '}${x.detail || ''}`,
      x.status === 'listed' || x.status === 'info' ? h('div', {}, h('a', { href: x.remove, target: '_blank', rel: 'noopener' }, 'How to get removed →'), x.note ? h('div', { class: 'd', text: x.note }) : null) : null)));
    bl.before(h('p', { class: 'sub', text: `Checked for ${r.ip}.` }));
  }).catch(e => bl.replaceChildren(h('div', { class: 'tile', text: e.message })));
  const qbody = h('div', {});
  const renderQueue = q => qbody.replaceChildren(!q.items.length ? h('p', { class: 'muted', text: q.ok ? 'Empty — nothing is waiting to be delivered.' : q.error || 'The queue could not be read.' }) :
    h('table', { class: 'qtable' }, h('tr', {}, h('th', { text: 'Since' }), h('th', { text: 'To' }), h('th', { text: 'Why it’s waiting' }), h('th', {})),
      q.items.map(i => h('tr', {}, h('td', { text: fmtWhen(i.at) }), h('td', { text: i.to.map(t => t.address).join(', ') }), h('td', { class: 'muted', text: i.to.map(t => t.reason).filter(Boolean).join('; ') || i.queue }),
        h('td', {}, h('button', { class: 'btn sm ghost danger', onclick: async () => { await api('POST', '/api/queue', { action: 'delete', id: i.id }).catch(fail); renderQueue(await api('GET', '/api/queue')); } }, 'Delete'))))));
  renderQueue(s.queue);
  const logPre = h('pre', { class: 'log', text: 'Loading…' });
  const filt = h('input', { type: 'search', placeholder: 'Filter the log (e.g. an address)', style: { maxWidth: '320px' } });
  let logText = '';
  const showLog = () => { const f = filt.value.trim().toLowerCase(); logPre.textContent = f ? logText.split('\n').filter(l => l.toLowerCase().includes(f)).join('\n') : logText; logPre.scrollTop = logPre.scrollHeight; };
  const loadLog = async () => { logText = await api('GET', '/api/log?n=400').catch(e => e.message); showLog(); };
  filt.addEventListener('input', showLog); loadLog();
  $('#page').replaceChildren(pageShell('Server status', 'Everything that has to work for mail to flow, checked live.',
    h('div', { class: 'card' }, h('h2', {}, 'Health', h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => showPage('status') }, icon('refresh'), 'Check again')), h('div', { class: 'kv', style: { marginTop: '12px' } }, tiles.filter(Boolean))),
    h('div', { class: 'card' }, h('h2', {}, icon('shield'), 'Blocklists'), h('p', { class: 'sub', text: 'Mail providers refuse or junk mail from addresses on these lists. Spamhaus is asked through its own servers, because it refuses public DNS.' }), bl),
    h('div', { class: 'card' }, h('h2', {}, 'Outgoing queue', h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: async () => { await api('POST', '/api/queue', { action: 'flush' }).then(() => toast('Retrying now')).catch(fail); setTimeout(async () => renderQueue(await api('GET', '/api/queue')), 1500); } }, 'Retry all now')), h('p', { class: 'sub', text: 'Messages the server is still trying to deliver.' }), qbody),
    h('div', { class: 'card' }, h('h2', {}, 'Mail log', h('span', { class: 'grow' }), filt, h('button', { class: 'btn sm', onclick: loadLog }, icon('refresh'))), logPre)));
}

// ---- Settings ----
async function pageSettings() {
  const s = await api('GET', '/api/settings');
  const save = async (patch, msg = 'Saved') => { try { Object.assign(s, await api('POST', '/api/settings', patch)); toast(msg); S.me.fromName = s.fromName; S.me.signature = s.signature; } catch (e) { fail(e); } };
  const field = (label, input, hint) => h('label', { class: 'f' }, label, input, hint ? h('small', { text: hint }) : null);
  // profile
  const nameIn = h('input', { type: 'text', value: s.fromName, placeholder: 'Your name' });
  const sigIn = h('textarea', { rows: 4, placeholder: 'Shown under every message you write' }); sigIn.value = s.signature;
  // sending
  let outMode = s.outbound.mode || 'direct';
  const relayBox = h('div', { class: 'form' });
  const hostIn = h('input', { type: 'text', value: s.outbound.host, placeholder: 'smtp-relay.example.com' });
  const portIn = h('select', {}, [['auto', 'Automatic: 587 → 465 → 2525 → 25'], ['587', '587 (STARTTLS)'], ['465', '465 (TLS)'], ['2525', '2525 (STARTTLS)'], ['25', '25']].map(([v, t]) => h('option', { value: v, text: t }))); portIn.value = String(s.outbound.port || 'auto');
  const userIn = h('input', { type: 'text', value: s.outbound.user, autocomplete: 'off' });
  const passIn = h('input', { type: 'password', placeholder: s.outbound.host ? 'Leave empty to keep the current password' : '', autocomplete: 'new-password' });
  const spfIn = h('input', { type: 'text', value: s.outbound.spfInclude, placeholder: 'e.g. spf.brevo.com' });
  const probeOut = h('div', { class: 'chips' });
  const showProbes = list => probeOut.replaceChildren(...(list || []).map(p => h('span', { class: 'chip ' + (p.ok ? 'ok' : 'bad'), title: p.banner || p.error || '' }, `${p.port} ${p.ok ? `✓ ${p.ms} ms` : '✗ ' + (p.error || 'no')}`)));
  const testBtn = h('button', { class: 'btn sm', onclick: async () => { testBtn.disabled = true; probeOut.replaceChildren(h('span', { class: 'spin' })); try { showProbes((await api('GET', '/api/outbound/probe?host=' + encodeURIComponent(hostIn.value.trim()))).results); } catch (e) { probeOut.replaceChildren(); fail(e); } testBtn.disabled = false; } }, 'Test ports');
  const MODES = [['direct', 'Directly', 'Your server delivers every message itself, on port 25 (the only port mail servers accept mail from each other on).'],
    ['auto', 'Directly, relay as backup', 'Your server still sends itself. A relay only steps in for a message that can’t be delivered directly — or for everything while your provider blocks port 25.'],
    ['relay', 'Always through a relay', 'Every message is handed to a relay service on port 587, 465 or 2525, and it delivers for you.']];
  const modeHelp = h('p', { class: 'sub', style: { margin: '0' } });
  const segOut = h('div', { class: 'seg' }, MODES.map(([k, t]) => h('button', { 'data-k': k, class: outMode === k ? 'on' : '', onclick: () => { outMode = k; setMode(); } }, t)));
  const setMode = () => { $$('button', segOut).forEach(b => b.classList.toggle('on', b.dataset.k === outMode)); relayBox.classList.toggle('hide', outMode === 'direct'); modeHelp.textContent = MODES.find(m => m[0] === outMode)[2]; };
  relayBox.append(h('div', { class: 'grid2' }, field('Relay server', hostIn), field('Port', portIn, 'Automatic tries each in order and switches if one stops answering.')),
    h('div', { class: 'row' }, testBtn, probeOut),
    h('div', { class: 'grid2' }, field('Username', userIn), field('Password', passIn)), field('SPF include (optional)', spfIn, 'Your relay’s SPF domain, so the DNS page can add it.'));
  setMode(); showProbes(s.outbound.probes);
  const o = s.outbound;
  const nowLine = o.mode === 'direct' || !o.host ? 'Right now: your server sends every message itself on port 25.'
    : o.active === 'relay' ? `Right now: everything goes through ${o.host} on port ${o.using}.` : `Right now: your server sends itself; ${o.host} on port ${o.using} is the backup.`;
  const notes = (o.notes || []).slice(0, 5).map(n => h('div', { class: 'muted', style: { fontSize: '12.5px' } }, `${fmtWhen(n.at)} — ${n.text}`));
  // receiving
  const hookIn = h('input', { type: 'url', value: s.webhookUrl, placeholder: 'https://mailhook.example.com' });
  const ep = h('code', { style: { wordBreak: 'break-all', fontSize: '12.5px' }, text: s.webhookEndpoint || '(set a public URL first)' });
  // server
  const mxIn = h('input', { type: 'text', value: s.mxhost }); const ipIn = h('input', { type: 'text', value: s.publicIp });
  const dPol = h('select', {}, [['none', 'Monitor only (none)'], ['quarantine', 'Send to spam (quarantine)'], ['reject', 'Reject (reject)']].map(([v, t]) => h('option', { value: v, text: t }))); dPol.value = s.dmarcPolicy;
  const dRua = h('input', { type: 'email', value: s.dmarcRua, placeholder: 'reports@…' });
  // security
  const curP = h('input', { type: 'password', autocomplete: 'current-password' }), newP = h('input', { type: 'password', autocomplete: 'new-password' });
  const sess = h('div', { class: 'muted' }, 'Loading…');
  api('GET', '/api/account/sessions').then(list => sess.replaceChildren(h('div', { style: { marginBottom: '8px' } }, `${list.length} signed-in ${list.length === 1 ? 'device' : 'devices'}:`),
    ...list.map(x => h('div', { style: { fontSize: '12.5px', padding: '4px 0' } }, x.current ? h('b', { text: 'This device — ' }) : null, `${x.ua.replace(/\(.*?\)/g, '').slice(0, 70) || 'unknown'} · ${x.ip} · last seen ${fmtWhen(x.seen)}`)))).catch(() => {});
  const notifOn = localStorage.getItem('sm-notify') === '1' && 'Notification' in window && Notification.permission === 'granted';
  const themeSel = h('select', {}, [['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, t]) => h('option', { value: v, text: t }))); themeSel.value = theme();
  themeSel.addEventListener('change', () => { localStorage.setItem('sm-theme', themeSel.value); applyTheme(); renderNav(); });

  $('#page').replaceChildren(pageShell('Settings', `Signed in as ${S.me.user} · ${S.me.address} · selfmail ${S.me.version}`,
    h('div', { class: 'card' }, h('h2', { text: 'Your name & signature' }), h('div', { class: 'form' }, field('Display name', nameIn, 'Shown as the sender name on mail you send.'), field('Signature', sigIn),
      h('div', {}, h('button', { class: 'btn pri', onclick: () => save({ fromName: nameIn.value, signature: sigIn.value }) }, 'Save')))),
    h('div', { class: 'card' }, h('h2', { text: 'Sending' }), h('p', { class: 'sub', text: nowLine }),
      h('div', { class: 'form' }, segOut, modeHelp, relayBox, h('div', {}, h('button', { class: 'btn pri', onclick: async e => {
        e.target.disabled = true;
        try { const r = await api('POST', '/api/settings/outbound', { mode: outMode, host: hostIn.value, port: portIn.value, user: userIn.value, pass: passIn.value, spfInclude: spfIn.value }); passIn.value = ''; const x = r.outbound; toast(x.mode === 'direct' ? 'Your server now sends every message itself' : x.active === 'relay' ? `Sending through ${x.host} on port ${x.using}` : `Sending directly; ${x.host}:${x.using} is the backup`); showPage('settings'); }
        catch (x) { if (x.data?.probes) showProbes(x.data.probes); fail(x); } e.target.disabled = false;
      } }, 'Save sending method')), notes.length ? h('div', {}, h('b', { style: { fontSize: '13px' }, text: 'Recent automatic changes' }), notes) : null)),
    h('div', { class: 'card' }, h('h2', { text: 'Receiving' }), h('p', { class: 'sub', text: s.mode === 'relay' ? 'Forward Email receives your mail on port 25 and posts each message to this server’s public URL.' : 'This server receives mail itself on port 25.' }),
      h('div', { class: 'form' }, s.mode === 'relay' ? [field('Public URL of this server', hookIn, 'The address the relay posts to (usually a Cloudflare Tunnel). Only the mail drop-off path is served there.'),
        h('div', { class: 'f' }, 'Drop-off address (goes in the forward-email TXT record)', h('div', { class: 'row' }, ep, h('button', { class: 'copy', onclick: () => copyText(ep.textContent) }, icon('copy')))),
        h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: () => save({ webhookUrl: hookIn.value }) }, 'Save'),
          h('button', { class: 'btn', onclick: async () => { if (!await confirmBox('Make a new secret drop-off address?', s.cloudflare.connected ? 'The old address stops working immediately. The DNS record is updated for you through Cloudflare.' : 'The old address stops working immediately — update the forward-email TXT record right after.', 'Make new address')) return; try { const r = await api('POST', '/api/settings/rotate-secret'); Object.assign(s, r); ep.textContent = r.webhookEndpoint; toast(r.dns?.ok ? 'New address saved and DNS updated' : 'New address saved — update the TXT record'); } catch (e) { fail(e); } } }, 'New secret address'))] : null)),
    h('div', { class: 'card' }, h('h2', { text: 'Server details' }), h('div', { class: 'form' }, h('div', { class: 'grid2' }, field('Server name (HELO)', mxIn, 'Must have an A record pointing at the public IP.'), field('Public IP', ipIn, 'Used for the A and SPF records.')),
      h('div', { class: 'grid2' }, field('DMARC policy', dPol), field('DMARC report address', dRua, 'Optional.')),
      h('div', {}, h('button', { class: 'btn pri', onclick: () => save({ mxhost: mxIn.value, publicIp: ipIn.value, dmarcPolicy: dPol.value, dmarcRua: dRua.value }) }, 'Save')))),
    h('div', { class: 'card' }, h('h2', { text: 'Security' }), h('div', { class: 'form' }, h('div', { class: 'grid2' }, field('Current password', curP), field('New password', newP, 'At least 10 characters.')),
      h('div', {}, h('button', { class: 'btn pri', onclick: async () => { try { await api('POST', '/api/account/password', { current: curP.value, next: newP.value }); curP.value = newP.value = ''; toast('Password changed — other devices were signed out'); } catch (e) { fail(e); } } }, 'Change password')),
      sess, h('div', {}, h('button', { class: 'btn', onclick: async () => { await api('POST', '/api/account/signout-others').catch(fail); toast('Other devices signed out'); showPage('settings'); } }, 'Sign out other devices')))),
    h('div', { class: 'card' }, h('h2', {}, icon('shield'), 'Responsible use'), s.agreement ? h('p', { class: 'sub', text: `Signed by ${s.agreement.name} on ${fmtFull(s.agreement.at)}${s.agreement.isp ? ` (internet provider: ${s.agreement.isp})` : ''}.` }) : null,
      h('div', {}, h('button', { class: 'btn', onclick: async () => { const a = await api('GET', '/api/agreement'); dialog('Responsible-use agreement', h('div', { class: 'agree-read' }, ispBadge(a.isp), termsList(a.terms)), [['Close', true, 'pri']]); } }, 'Read the agreement'))),
    h('div', { class: 'card' }, h('h2', { text: 'This browser' }), h('div', { class: 'form' }, h('div', { class: 'grid2' }, field('Appearance', themeSel),
      h('label', { class: 'f' }, 'New-mail notifications', h('div', {}, h('button', { class: 'btn', onclick: async e => {
        if (!('Notification' in window)) return toast('This browser can’t show notifications', { bad: true });
        const p = await Notification.requestPermission(); if (p === 'granted') { localStorage.setItem('sm-notify', '1'); toast('You’ll get a notification when mail arrives'); e.target.textContent = 'Notifications on'; } else toast('Notifications were blocked in the browser', { bad: true });
      } }, notifOn ? 'Notifications on' : 'Turn on notifications')))))),
  ));
}

// ============================================================= router ====
function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const [kind, a, b] = parts;
  if (kind === 'domain' || kind === 'status' || kind === 'settings') return showPage(kind);
  const wasMail = S.view === 'mail';
  S.view = 'mail';
  $('#page').classList.add('hide'); $('#list').classList.remove('hide'); $('#reader').classList.remove('hide');
  let folder = 'inbox', alias = '', id = null;
  if (kind === 'f' && a) { folder = a; id = b || null; }
  else if (kind === 'a' && a) { alias = a; folder = 'all'; id = b || null; }
  const changed = !wasMail || !S.listed || folder !== S.folder || alias !== S.alias;
  S.listed = true;
  S.folder = folder; S.alias = alias;
  renderNav();
  if (changed) { S.sel.clear(); S.items = []; renderList(); loadList(); }
  if (id) { if (id !== S.open) openMsg(id, true); }
  else { S.open = null; S.msg = null; $('#shell').classList.remove('reading'); $$('.mrow.on').forEach(r => r.classList.remove('on')); renderEmptyReader(); }
}
addEventListener('popstate', () => S.me && route());
addEventListener('hashchange', () => S.me && route());

// ========================================================== keyboard ====
document.addEventListener('keydown', e => {
  if (!S.me || S.view !== 'mail' || e.ctrlKey || e.metaKey || e.altKey) return;
  if ((openComposer && !openComposer.closed) || $('.dialog') || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  const i = S.items.findIndex(x => x.id === S.open);
  const k = e.key;
  if (k === 'j' || k === 'ArrowDown') { const n = S.items[i + 1] || S.items[0]; if (n) openMsg(n.id); }
  else if (k === 'k' || k === 'ArrowUp') { const n = S.items[Math.max(0, i - 1)]; if (n) openMsg(n.id); }
  else if (k === 'c') compose();
  else if (k === '/') { e.preventDefault(); $('.search input')?.focus(); }
  else if (!S.msg) return;
  else if (k === 'e') move([S.msg.id], 'archive');
  else if (k === '#' || k === 'Delete') del([S.msg.id]);
  else if (k === 's') { S.msg.starred = !S.msg.starred; flag([S.msg.id], S.msg.starred ? 'F' : '', S.msg.starred ? '' : 'F'); }
  else if (k === 'r') compose({ mode: 'reply', msg: S.msg });
  else if (k === 'a') compose({ mode: 'replyall', msg: S.msg });
  else if (k === 'f') compose({ mode: 'forward', msg: S.msg });
  else if (k === 'u' || k === 'Escape') closeMsg();
  else return;
  e.preventDefault();
});

// ============================================================ live mail ====
let es = null;
function live() {
  es?.close();
  es = new EventSource('/api/events');
  es.addEventListener('new', async () => {
    await loadFolders(); if (S.view === 'mail') await loadList();
    const newest = S.items.find(x => x.unread);
    if (newest && localStorage.getItem('sm-notify') === '1' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
      const n = new Notification(nameOf(newest.from) || 'New mail', { body: newest.subject || '(no subject)', tag: newest.id });
      n.onclick = () => { focus(); openMsg(newest.id); };
    } else if (newest) toast(`New mail from ${nameOf(newest.from)}`, { action: { label: 'Open', fn: () => { location.hash = `#/f/inbox/${encodeURIComponent(newest.id)}`; } } });
  });
  es.addEventListener('changed', debounce(() => { loadFolders(); if (S.view === 'mail') loadList(); }, 400));
  es.onerror = () => { /* the browser reconnects by itself */ };
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ============================================================== boot ====
async function boot() {
  try { S.me = await api('GET', '/api/state'); }
  catch (e) { if (!S.me) showLogin(); return; }
  if (!S.me.agreement) return showAgreement();
  shell();
  document.body.addEventListener('click', e => { if (e.target.classList?.contains('scrim')) $('#shell').classList.remove('navopen'); });
  await loadFolders();
  route();
  live();
  setInterval(() => { if (!document.hidden) loadFolders(); }, 60000);
}
boot();
})();
