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
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) e.style.setProperty(sk, sv); else e.style[sk] = sv; } }
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
  verified: '<path d="M12 2.5l2.4 1.8 3-.2.9 2.9 2.4 1.8-.9 2.9.9 2.9-2.4 1.8-.9 2.9-3-.2L12 21.5l-2.4-1.8-3 .2-.9-2.9-2.4-1.8.9-2.9-.9-2.9 2.4-1.8.9-2.9 3 .2z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M8 13h8M6 13h.01M18 13h.01"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a6 6 0 0 0 6-6c0-4.9-4.5-8.6-10-8.6z"/>',
  sparkle: '<path d="M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9z"/><path d="M19 3v4M17 5h4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
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
  const ms = opts.ms || (opts.bad ? 6500 : 3400);
  const t = h('div', { class: 'toast' + (opts.bad ? ' bad' : ''), role: 'status' },
    h('span', { class: 'ti' }, icon(opts.bad ? 'x' : (opts.icon || 'check'))), h('span', {}, msg),
    opts.action ? h('button', { onclick: () => { opts.action.fn(); kill(); } }, opts.action.label) : null,
    opts.bar ? h('i', { class: 'bar', style: { '--ms': ms + 'ms' } }) : null);
  const kill = () => { if (!t.isConnected) return; t.classList.add('out'); setTimeout(() => t.remove(), 260); };
  $('.toasts')?.append(t); const timer = setTimeout(kill, ms);
  return { close: () => { clearTimeout(timer); kill(); } };
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
const failedLogos = new Set();
function avatar(a, cls = '') {
  const addr = String(a?.address || '').toLowerCase(), s = String(a?.name || addr || '?').trim();
  let hsh = 0; for (const ch of (addr || s)) hsh = (hsh * 31 + ch.charCodeAt(0)) | 0;
  const h1 = Math.abs(hsh) % 360;
  const letter = ([...s.replace(/^["'(]+/, '')][0] || '?').toUpperCase();
  const box = h('div', { class: 'avatar ' + cls, style: { '--h1': h1, '--h2': (h1 + 45) % 360 } }, h('span', { text: letter }));
  const dom = addr.split('@')[1];
  if (dom && localStorage.getItem('sm-logos') !== '0' && !failedLogos.has(dom) && dom !== S.me?.domain) {
    const img = new Image(); img.alt = ''; img.decoding = 'async';
    img.onload = () => box.append(img); img.onerror = () => failedLogos.add(dom);
    img.src = '/api/avatar/' + encodeURIComponent(dom);
  }
  return box;
}
const kbd = t => h('span', { class: 'kbd', text: t });
const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
function fmtAgo(ts) {
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'Just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400 && new Date(ts).toDateString() === new Date().toDateString()) return `${Math.floor(s / 3600)} hour${s >= 7200 ? 's' : ''} ago`;
  if (s < 172800 && new Date(ts).getDate() === new Date(Date.now() - 864e5).getDate()) return 'Yesterday';
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} days ago`;
  return fmtWhen(ts);
}
function dayGroup(ts) {
  if (!ts) return 'Older';
  const d = new Date(ts), now = new Date();
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 864e5);
  if (diff <= 0) return 'Today'; if (diff === 1) return 'Yesterday'; if (diff < 7) return 'This week';
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'Earlier this month';
  return d.toLocaleDateString([], { month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
const aliasChip = a => { let x = 0; for (const c of a) x = (x * 31 + c.charCodeAt(0)) | 0; return h('span', { class: 'chip acc', style: { '--h': Math.abs(x) % 360 }, text: '@' + a.split('@')[0], title: a }); };
function copyText(t) { navigator.clipboard?.writeText(t).then(() => toast('Copied'), () => toast('Copy failed', { bad: true })); }

// ============================================================== state ====
const S = { me: null, folders: [], aliases: [], view: 'mail', folder: 'inbox', alias: '', q: '', items: [], total: 0, offset: 0, sel: new Set(), open: null, msg: null, images: new Set(), mono: {}, loading: false };
const FOLDER_ICON = { inbox: 'inbox', starred: 'star', sent: 'send', drafts: 'draft', archive: 'archive', spam: 'spam', trash: 'trash' };
const theme = () => localStorage.getItem('sm-theme') || 'auto';
const ACCENTS = { violet: ['#6d5efc', '#a855f7', '#ec4899'], ocean: ['#0ea5e9', '#6366f1', '#22d3ee'], emerald: ['#10b981', '#06b6d4', '#84cc16'], sunset: ['#f97316', '#ef4444', '#ec4899'], rose: ['#e11d48', '#db2777', '#a855f7'], gold: ['#f59e0b', '#f97316', '#eab308'] };
function applyTheme() {
  const t = theme(), dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  const a = ACCENTS[localStorage.getItem('sm-accent')] || ACCENTS.violet;
  ['--a1', '--a2', '--a3'].forEach((k, i) => root.style.setProperty(k, a[i]));
  root.dataset.density = localStorage.getItem('sm-density') || 'comfortable';
}
function toggleTheme() { localStorage.setItem('sm-theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); applyTheme(); renderNav(); }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
applyTheme();

// ============================================================== login ====
function showLogin(msg) {
  document.title = 'Sign in · selfmail';
  const err = h('div', { class: 'err', text: msg || '' });
  const u = h('input', { type: 'text', name: 'username', autocomplete: 'username', required: true, autofocus: true });
  const p = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn pri', type: 'submit', style: { height: '46px', fontSize: '15px' } }, 'Sign in', icon('forward'));
  const form = h('form', { onsubmit: async e => {
    e.preventDefault(); btn.disabled = true; err.textContent = '';
    try { await api('POST', '/api/login', { user: u.value, pass: p.value }); boot(); }
    catch (x) { err.textContent = x.message; btn.disabled = false; p.select(); }
  } },
    h('div', { class: 'brand' }, h('div', { class: 'logo' }, icon('unread')), 'selfmail'),
    h('div', {}, h('h1', { text: 'Welcome back' }), h('p', { text: 'Sign in to your own mail server.' })),
    h('label', { class: 'f' }, 'Username', u), h('label', { class: 'f' }, 'Password', p), err, btn);
  form.classList.add('glass');
  document.body.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'orb a' }), h('div', { class: 'orb b' }), h('div', { class: 'orb c' }), form), h('div', { class: 'toasts' }));
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
  document.body.replaceChildren(h('div', { class: 'login agree-page' }, h('div', { class: 'orb a' }), h('div', { class: 'orb b' }), h('div', { class: 'agree-card glass' }, h('span', { class: 'spin' }))), h('div', { class: 'toasts' }));
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
      h('section', { class: 'list glass', id: 'list' }),
      h('section', { class: 'reader glass', id: 'reader' }),
      h('section', { class: 'page glass hide', id: 'page' })),
    h('div', { class: 'toasts' }));
}

function renderNav() {
  const nav = $('#nav'); if (!nav) return;
  const link = (href, ic, label, n, on, cls = '') => h('a', { class: `it ${cls} ${on ? 'on' : ''}`, href, title: label, onclick: () => $('#shell').classList.remove('navopen') }, icon(ic), h('span', { class: 't', text: label }), n ? h('span', { class: 'n', text: n }) : null);
  const f = id => S.folders.find(x => x.id === id) || { total: 0, unread: 0 };
  const mail = S.view === 'mail';
  // keep the scroll position and the address filter across refreshes
  const oldScroll = $('.nav-scroll', nav)?.scrollTop || 0, oldList = $('.addr-list', nav)?.scrollTop || 0;
  const oldFilter = $('.addr-filter input', nav), hadFocus = oldFilter && document.activeElement === oldFilter;
  const open = localStorage.getItem('sm-addr-open') === '1';
  const q = S.addrQ || '';
  const aliases = S.aliases.filter(a => !q || a.address.includes(q.toLowerCase()));
  const unreadAll = S.aliases.reduce((n, a) => n + (a.unread || 0), 0);
  const filter = h('label', { class: 'addr-filter' }, icon('search'), h('input', { type: 'search', placeholder: 'Find an address', value: q, oninput: e => { S.addrQ = e.target.value; renderNav(); } }));
  const section = S.aliases.length ? h('div', { class: 'addr' + (open ? ' open' : '') },
    h('button', { class: 'addr-head', 'aria-expanded': String(open), onclick: () => { localStorage.setItem('sm-addr-open', open ? '0' : '1'); renderNav(); if (!open) requestAnimationFrame(() => $('#nav .addr')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); } },
      h('span', { class: 'chev', html: '<svg viewBox="0 0 24 24" class="i"><path d="m9 6 6 6-6 6"/></svg>' }), h('span', { class: 'grow', text: 'Addresses' }),
      unreadAll ? h('span', { class: 'n u', text: unreadAll }) : null, h('span', { class: 'n', text: S.aliases.length })),
    open ? h('div', { class: 'addr-body' },
      S.aliases.length > 6 ? filter : null,
      h('div', { class: 'addr-list' }, aliases.length ? aliases.map(a => link(`#/a/${encodeURIComponent(a.address)}`, 'at', a.address.split('@')[0], a.unread || '', mail && S.alias === a.address, 'alias')) : h('div', { class: 'addr-none', text: 'No address matches' }))) : null) : null;
  nav.replaceChildren(
    h('div', { class: 'brand' }, h('div', { class: 'logo' }, icon('unread')), 'selfmail'),
    h('button', { class: 'btn pri compose-btn', onclick: () => compose() }, icon('pen'), 'Compose'),
    h('div', { class: 'nav-scroll' },
      ...['inbox', 'starred', 'sent', 'drafts', 'archive', 'spam', 'trash'].map(id => {
        const x = f(id); const n = id === 'inbox' || id === 'spam' ? (x.unread || '') : id === 'drafts' ? (x.total || '') : '';
        return link(`#/f/${id}`, FOLDER_ICON[id], S.folders.find(y => y.id === id)?.name || id, n, mail && !S.alias && S.folder === id);
      }),
      link('#/f/all', 'all', 'All mail', '', mail && !S.alias && S.folder === 'all'),
      section),
    h('div', { class: 'foot' },
      link('#/domain', 'globe', 'Domain & DNS', '', S.view === 'domain'),
      link('#/status', 'pulse', 'Server status', '', S.view === 'status'),
      link('#/settings', 'gear', 'Settings', '', S.view === 'settings'),
      h('div', { class: 'me' }, avatar({ name: S.me.user }), h('div', { class: 'grow' }, h('b', { text: S.me.user }), S.me.address),
        ib(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 'Switch light / dark', toggleTheme),
        ib('logout', 'Sign out', async () => { await api('POST', '/api/logout').catch(() => {}); showLogin('You have been signed out.'); }))));
  $('a[href="#/f/inbox"] .n', nav)?.classList.add('hot');
  $('.nav-scroll', nav).scrollTop = oldScroll;
  const list = $('.addr-list', nav); if (list) list.scrollTop = oldList;
  if (hadFocus) { const i = $('.addr-filter input', nav); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
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
  if (!S.items.length) renderList();
  const qs = new URLSearchParams({ folder: S.alias ? 'all' : S.folder, q: S.q, alias: S.alias, offset: S.offset, limit: 60 });
  try {
    const r = await api('GET', '/api/messages?' + qs);
    S.items = more ? [...S.items, ...r.items] : r.items; S.total = r.total;
    for (const id of [...S.sel]) if (!S.items.some(x => x.id === id)) S.sel.delete(id);
  } catch (e) { fail(e); }
  S.loading = false;
  renderList(S.animateNext); S.animateNext = false;
}

function skeleton(n = 9) {
  return Array.from({ length: n }, (_, i) => h('div', { class: 'skel' }, h('i', { style: { width: '38px', height: '38px', borderRadius: '12px', flex: 'none' } }),
    h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '3px' } }, h('i', { style: { width: `${38 + (i * 13) % 30}%`, height: '11px' } }), h('i', { style: { width: `${62 + (i * 7) % 28}%`, height: '10px' } }), h('i', { style: { width: `${48 + (i * 11) % 40}%`, height: '9px' } }))));
}
function renderList(animate) {
  const box = $('#list'); if (!box) return;
  if (!$('.list-head', box)) {
    const search = h('input', { type: 'search', placeholder: 'Search mail', value: S.q, 'aria-label': 'Search mail', oninput: debounce(e => { S.q = e.target.value.trim(); loadList(); }, 250) });
    box.replaceChildren(h('div', { class: 'list-head' },
      h('h2', {}, ib('menu', 'Menu', () => $('#shell').classList.toggle('navopen'), 'mobile-only'), h('span', { class: 'ttl grow' }), ib('refresh', 'Refresh', () => { loadFolders(); loadList(); })),
      h('div', { class: 'search' }, icon('search'), search, kbd(MAC ? '⌘ K' : 'Ctrl K')),
      h('div', { class: 'bulk' })),
    h('div', { class: 'rows', id: 'rows' }));
  }
  $('.ttl', box).textContent = folderTitle();
  const si = $('.search input', box); if (document.activeElement !== si && si.value !== S.q) si.value = S.q;
  renderBulk();
  const rows = $('#rows');
  rows.classList.toggle('selecting', S.sel.size > 0);
  if (!S.items.length) {
    if (S.loading) { rows.replaceChildren(...skeleton()); return; }
    const art = { trash: 'trash', spam: 'spam', sent: 'send', drafts: 'draft', starred: 'star', archive: 'archive' }[S.folder] || 'inbox';
    const zero = S.folder === 'inbox' && !S.alias && !S.q;
    rows.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'art' }, icon(S.q ? 'search' : zero ? 'sparkle' : art)),
      h('b', { text: S.q ? 'Nothing matches your search' : zero ? 'Inbox zero' : 'Nothing here yet' }),
      h('span', { text: S.q ? 'Try fewer words, or from:name · to:alias · subject:word · has:attachment' : zero ? 'You’re all caught up. Enjoy it.' : '' })));
    return;
  }
  const frag = document.createDocumentFragment(); let lastG = '', i = 0;
  const act = (ic, tip, fn, cls = '') => h('button', { class: 'ib ' + cls, title: tip, 'aria-label': tip, onclick: e => { e.stopPropagation(); fn(); } }, icon(ic));
  for (const m of S.items) {
    const g = dayGroup(m.date);
    if (g !== lastG) { frag.append(h('div', { class: 'ghead', style: { '--i': Math.min(i++, 16) }, text: g })); lastG = g; }
    const outgoing = m.folder === 'sent' || m.folder === 'drafts';
    const who = outgoing ? 'To: ' + (m.to.map(nameOf).join(', ') || '(no recipient)') : nameOf(m.from) || '(unknown sender)';
    const checked = S.sel.has(m.id);
    const cb = h('input', { type: 'checkbox', 'aria-label': 'Select', checked, onclick: e => { e.stopPropagation(); e.target.checked ? S.sel.add(m.id) : S.sel.delete(m.id); e.target.closest('.mrow').classList.toggle('checked', e.target.checked); rows.classList.toggle('selecting', S.sel.size > 0); renderBulk(); } });
    const chips = [];
    if (m.rcpt && m.rcpt !== S.me.address && !S.alias) chips.push(aliasChip(m.rcpt));
    if (S.folder === 'all' && m.folder !== 'inbox') chips.push(h('span', { class: 'chip', text: S.folders.find(f => f.id === m.folder)?.name || m.folder }));
    if (m.folder === 'drafts') chips.push(h('span', { class: 'chip warn', text: 'Draft' }));
    frag.append(h('div', { class: `mrow ${m.unread ? 'unread' : ''} ${S.open === m.id ? 'on' : ''} ${checked ? 'checked' : ''}`, 'data-id': m.id, style: { '--i': Math.min(i++, 16) }, onclick: () => openMsg(m.id) },
      h('label', { class: 'sel', onclick: e => e.stopPropagation() }, cb),
      avatar(outgoing ? (m.to[0] || m.from) : m.from),
      h('div', { class: 'mmain' },
        h('div', { class: 'mtop' }, h('span', { class: 'who', text: who }), m.starred ? icon('star', 'i starred') : null, m.attach ? icon('clip') : null, h('span', { class: 'when', text: fmtWhen(m.date) })),
        h('div', { class: 'msub', text: m.subject || '(no subject)' }),
        m.snippet ? h('div', { class: 'msnip', text: m.snippet }) : null,
        chips.length ? h('div', { class: 'mchips' }, chips) : null),
      h('div', { class: 'hover-act' },
        act('archive', 'Archive', () => move([m.id], 'archive')),
        act('trash', 'Delete', () => del([m.id])),
        act(m.unread ? 'read' : 'unread', m.unread ? 'Mark as read' : 'Mark as unread', () => flag([m.id], m.unread ? 'S' : '', m.unread ? '' : 'S')),
        act('star', m.starred ? 'Unstar' : 'Star', () => flag([m.id], m.starred ? '' : 'F', m.starred ? 'F' : ''), m.starred ? 'on' : ''))));
  }
  if (S.items.length < S.total) frag.append(h('div', { class: 'more' }, h('button', { class: 'btn sm', onclick: () => { S.offset = S.items.length; loadList(true); } }, `Load more · ${S.total - S.items.length} left`)));
  rows.replaceChildren(frag);
  if (animate) { rows.classList.remove('enter'); void rows.offsetWidth; rows.classList.add('enter'); clearTimeout(rows._t); rows._t = setTimeout(() => rows.classList.remove('enter'), 1300); }
}

function renderBulk() {
  const b = $('.bulk'); if (!b) return;
  const n = S.sel.size, all = S.items.length && S.items.every(x => S.sel.has(x.id));
  b.classList.toggle('active', n > 0);
  const selAll = h('input', { type: 'checkbox', class: 'selall', title: 'Select all', checked: all, onclick: e => { if (e.target.checked) S.items.forEach(x => S.sel.add(x.id)); else S.sel.clear(); renderList(); } });
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
      h('span', { class: 'count', text: S.total ? `${S.total} ${S.total === 1 ? 'conversation' : 'conversations'}` : '' }),
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
  const unread = S.folders.find(f => f.id === 'inbox')?.unread || 0;
  $('#reader')?.replaceChildren(h('div', { class: 'placeholder' }, h('div', {},
    h('div', { class: 'art' }, icon(unread ? 'unread' : 'sparkle')),
    h('b', { text: unread ? `${unread} unread in your inbox` : 'You’re all caught up' }),
    h('div', { class: 'muted', style: { fontSize: '13px', lineHeight: 2 } }, 'Press ', kbd(MAC ? '⌘ K' : 'Ctrl K'), ' to search anything · ', kbd('c'), ' to write · ', kbd('?'), ' for shortcuts'))));
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
  const notice = h('div', { class: 'notice hide' }, icon('image'), h('span', { class: 'grow', text: 'Pictures from the internet are hidden to protect your privacy — they can tell the sender you opened this.' }),
    h('button', { class: 'btn sm', onclick: () => { S.images.add(m.id); renderReader(); } }, 'Show pictures'));
  frame.addEventListener('load', () => wireFrame(frame, notice));
  const me = S.me.address;
  const toList = [...m.to, ...m.cc].map(a => a.address === me || a.address === m.rcpt ? 'me' : nameOf(a)).join(', ');
  const a = m.auth || {};
  const verified = a.dkim === 'pass' && (a.spf === 'pass' || a.dmarc === 'pass');
  const failed = [a.spf, a.dkim, a.dmarc].some(x => /fail/.test(x || ''));
  const authTip = `SPF ${a.spf || '—'} · DKIM ${a.dkim || '—'} · DMARC ${a.dmarc || '—'}`;
  const badge = verified ? h('span', { class: 'verified', title: authTip }, icon('verified'), 'Verified sender') : failed ? h('span', { class: 'verified warn', title: authTip }, icon('spam'), 'Couldn’t verify sender') : null;
  const isImg = t => /^image\/(png|jpe?g|gif|webp)$/i.test(t);
  rd.replaceChildren(
    h('div', { class: 'rtool' }),
    h('div', { class: 'rbody' }, h('div', { class: 'rcard' },
      h('div', { class: 'rchips' }, h('span', { class: 'chip', text: S.folders.find(f => f.id === m.folder)?.name || m.folder }), m.rcpt && m.rcpt !== me ? aliasChip(m.rcpt) : null,
        m.attachments.length ? h('span', { class: 'chip' }, icon('clip'), String(m.attachments.length)) : null),
      h('h1', { text: m.subject || '(no subject)' }),
      h('div', { class: 'sender' }, avatar(m.from, 'lg'),
        h('div', { class: 'grow', style: { minWidth: 0 } },
          h('div', {}, h('span', { class: 'nm', text: m.from.name || m.from.address }), m.from.name ? h('span', { class: 'ad', text: `  ${m.from.address}` }) : null),
          h('div', { class: 'meta' }, `to ${toList || 'me'}`, badge)),
        h('div', { class: 'when' }, h('b', { text: fmtAgo(m.date) }), h('span', { text: fmtFull(m.date) }))),
      notice,
      !m.hasHtml ? h('div', { class: 'row', style: { justifyContent: 'flex-end', marginBottom: '8px' } }, h('button', { class: 'btn sm ghost', title: 'Show this message in a fixed-width font (for tables and text art)', onclick: () => { S.mono[m.id] = !(mono ?? frame.dataset.mono === '1'); renderReader(); } }, icon('mono'), 'Fixed-width')) : null,
      h('div', { class: 'frame-wrap' }, frame),
      m.attachments.length ? h('div', { class: 'atts' }, m.attachments.map(x => h('a', { class: 'att', href: `/api/messages/${encodeURIComponent(m.id)}/attachments/${x.i}`, download: x.name },
        h('div', { class: 'ic' }, isImg(x.type) ? h('img', { src: `/api/messages/${encodeURIComponent(m.id)}/attachments/${x.i}?view=1`, alt: '', loading: 'lazy' }) : icon('file')),
        h('div', { style: { minWidth: 0 } }, h('b', { text: x.name }), h('small', { text: `${fmtSize(x.size)} · ${(x.type.split('/')[1] || 'file').toUpperCase()}` }))))) : null,
      m.unsubscribe ? h('p', { class: 'muted', style: { fontSize: '12.5px' } }, 'Mailing list · ', h('a', { href: m.unsubscribe, target: '_blank', rel: 'noopener noreferrer' }, 'Unsubscribe')) : null,
      m.folder !== 'sent' ? quickReply(m) : h('div', { class: 'row', style: { marginTop: '18px' } }, h('button', { class: 'btn', onclick: () => compose({ mode: 'forward', msg: m }) }, icon('forward'), 'Forward')))));
  renderReaderTools();
}

function quickReply(m) {
  const ta = h('textarea', { placeholder: `Reply to ${m.from.name || m.from.address}…`, rows: 2 });
  const box = h('div', { class: 'qreply' }, avatar({ name: S.me.fromName || S.me.user, address: S.me.address }),
    h('div', { class: 'grow' }, ta, h('div', { class: 'qa' },
      h('button', { class: 'btn pri sm send-btn', onclick: () => send() }, icon('send'), 'Send'),
      h('button', { class: 'btn ghost sm', onclick: () => compose({ mode: 'reply', msg: m, text: ta.value }) }, icon('max'), 'Full editor'),
      m.to.length + m.cc.length > 1 ? h('button', { class: 'btn ghost sm', onclick: () => compose({ mode: 'replyall', msg: m, text: ta.value }) }, icon('replyall'), 'Reply all') : null,
      h('span', { class: 'grow' }), h('span', { class: 'muted', style: { fontSize: '12px' } }, kbd(MAC ? '⌘' : 'Ctrl'), ' ', kbd('Enter')))));
  ta.addEventListener('input', () => box.classList.toggle('filled', !!ta.value.trim()));
  ta.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); } });
  function send() {
    const text = ta.value.trim(); if (!text) return ta.focus();
    const p = { ...replyBasics(m, 'reply'), html: `<p>${esc(text).replace(/\n/g, '<br>')}</p>` + sigHtml() + quoteHtml(m), attachments: [] };
    ta.value = ''; box.classList.remove('filled'); ta.blur();
    queueSend(p, () => { ta.value = text; box.classList.add('filled'); ta.focus(); });
  }
  return box;
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
let openComposer = null, contactsCache = null;
async function contacts() { if (!contactsCache) contactsCache = await api('GET', '/api/contacts').catch(() => []); return contactsCache; }
function quoteHtml(m) {
  const who = m.from.name ? `${esc(m.from.name)} &lt;${esc(m.from.address)}&gt;` : esc(m.from.address);
  return `<p><br></p><p>On ${esc(fmtFull(m.date))}, ${who} wrote:</p><blockquote>${esc(m.text || '').replace(/\n/g, '<br>')}</blockquote>`;
}
function fwdHtml(m) {
  return `<p><br></p><p>---------- Forwarded message ----------<br>From: ${esc(nameOf(m.from))} &lt;${esc(m.from.address)}&gt;<br>Date: ${esc(fmtFull(m.date))}<br>Subject: ${esc(m.subject)}<br>To: ${esc(m.to.map(a => a.address).join(', '))}</p><p>${esc(m.text || '').replace(/\n/g, '<br>')}</p>`;
}
const sigHtml = () => S.me.signature ? `<p><br></p><div class="sig">-- <br>${esc(S.me.signature).replace(/\n/g, '<br>')}</div>` : '';
const mine = a => String(a || '').toLowerCase().endsWith('@' + S.me.domain);
/** From / To / Cc / Subject and threading headers for a reply or forward. */
function replyBasics(m, mode) {
  const sub = m.subject || '';
  const from = m.rcpt && mine(m.rcpt) ? m.rcpt : S.me.address;
  if (mode === 'forward') return { from, to: '', cc: '', bcc: '', subject: /^fwd?:/i.test(sub) ? sub : 'Fwd: ' + sub };
  const base = (m.replyTo.length ? m.replyTo : [m.from]).map(a => a.address);
  const to = (m.folder === 'sent' ? m.to.map(a => a.address) : base).join(', ');
  const cc = mode === 'replyall' ? [...m.to, ...m.cc].map(a => a.address).filter(a => !mine(a) && !base.includes(a)).join(', ') : '';
  return { from, to, cc, bcc: '', subject: /^re:/i.test(sub) ? sub : 'Re: ' + sub, inReplyTo: m.msgid, references: [...(m.refs || []), m.msgid].filter(Boolean).join(' '), answering: m.id };
}

/** Undo send: the message waits 5 seconds before it actually leaves. */
function queueSend(p, onUndo) {
  let cancelled = false;
  toast('Sending…', { icon: 'send', ms: 5000, bar: true, action: { label: 'Undo', fn: () => { cancelled = true; onUndo && onUndo(); toast('Not sent — back to editing', { icon: 'back' }); } } });
  setTimeout(async () => {
    if (cancelled) return;
    try { await api('POST', '/api/send', p); toast('Message sent', { icon: 'send' }); contactsCache = null; refresh(); }
    catch (e) {
      const v = await dialog('Not sent', h('div', {}, h('p', { style: { margin: '0 0 8px' }, text: e.message }), e.data?.diagnosis ? h('p', { class: 'muted', style: { margin: 0 }, text: e.data.diagnosis }) : null), [['Close', null, 'ghost'], ['Edit message', 'edit', 'pri']]);
      if (v === 'edit') compose({ restore: p });
    }
  }, 5000);
}

/** Recipients as chips, with suggestions from people you've written to or heard from. */
function tokenField(initial, placeholder) {
  const wrap = h('div', { class: 'tokens' });
  const input = h('input', { type: 'text', placeholder, autocomplete: 'off', spellcheck: 'false' });
  let list = [], sug = null, sugIdx = 0, sugItems = [], onChange = () => {};
  const valid = a => /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(a);
  const parse = str => String(str || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean).map(x => { const mm = /^(.*)<([^>]+)>\s*$/.exec(x); return mm ? { name: mm[1].trim().replace(/^"|"$/g, ''), address: mm[2].trim().toLowerCase() } : { name: '', address: x.toLowerCase() }; });
  function render() {
    wrap.replaceChildren(...list.map((t, i) => h('span', { class: 'token' + (valid(t.address) ? '' : ' bad'), title: t.address }, avatar(t), h('span', { text: t.name || t.address }),
      h('button', { type: 'button', title: 'Remove', onclick: () => { list.splice(i, 1); render(); onChange(); input.focus(); } }, icon('x')))), input);
  }
  function add(str) { for (const t of parse(str)) if (!list.some(x => x.address === t.address)) list.push(t); render(); onChange(); }
  function commit() { if (input.value.trim()) { add(input.value); input.value = ''; } closeSug(); }
  function closeSug() { sug?.remove(); sug = null; }
  function pick(c) { if (!list.some(x => x.address === c.address)) list.push({ name: c.name, address: c.address }); input.value = ''; render(); onChange(); closeSug(); input.focus(); }
  function paintSug() {
    if (!sug) { sug = h('div', { class: 'suggest' }); wrap.parentElement.append(sug); }
    sug.replaceChildren(...sugItems.map((c, i) => h('button', { type: 'button', class: i === sugIdx ? 'on' : '', onmousedown: e => { e.preventDefault(); pick(c); }, onmouseenter: () => { sugIdx = i; paintSug(); } },
      avatar(c), h('div', {}, h('b', { text: c.name || c.address }), c.name ? h('small', { text: c.address }) : null))));
  }
  input.addEventListener('keydown', e => {
    if (sug && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); sugIdx = (sugIdx + (e.key === 'ArrowDown' ? 1 : -1) + sugItems.length) % sugItems.length; paintSug(); return; }
    if ((e.key === 'Enter' || e.key === 'Tab') && sug && sugItems[sugIdx]) { e.preventDefault(); pick(sugItems[sugIdx]); return; }
    if ((e.key === 'Enter' || e.key === ',' || e.key === ';' || (e.key === 'Tab' && input.value.trim())) && input.value.trim()) { e.preventDefault(); commit(); return; }
    if (e.key === 'Backspace' && !input.value && list.length) { list.pop(); render(); onChange(); input.focus(); }
    if (e.key === 'Escape' && sug) { e.stopPropagation(); closeSug(); }
  });
  input.addEventListener('input', async () => {
    const qq = input.value.trim().toLowerCase(); if (!qq) return closeSug();
    const all = await contacts();
    sugItems = all.filter(c => !list.some(x => x.address === c.address) && (c.address.includes(qq) || (c.name || '').toLowerCase().includes(qq))).slice(0, 6);
    sugIdx = 0; sugItems.length ? paintSug() : closeSug();
  });
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) { if (input.value.trim()) commit(); closeSug(); } }, 150));
  input.addEventListener('paste', e => { const t = e.clipboardData.getData('text'); if (/[,;\n]/.test(t)) { e.preventDefault(); add(t); } });
  wrap.addEventListener('click', e => { if (e.target === wrap) input.focus(); });
  add(initial);
  return {
    el: wrap,
    value: () => { if (input.value.trim()) commit(); return list.map(t => t.name ? `"${t.name.replace(/"/g, '')}" <${t.address}>` : t.address).join(', '); },
    count: () => list.length + (input.value.trim() ? 1 : 0),
    invalid: () => list.filter(t => !valid(t.address)).map(t => t.address),
    onChange: fn => { onChange = fn; }, focus: () => input.focus(),
  };
}

function compose(o = {}) {
  if (openComposer && !openComposer.closed) { if (o.mode || o.to || o.draft || o.restore) openComposer.close(true); else return openComposer.focus(); }
  const me = S.me.address, dom = S.me.domain;
  const m = o.msg;
  let base = { from: me, to: o.to || '', cc: '', bcc: '', subject: o.subject || '' };
  let body = '<p><br></p>' + sigHtml(), atts = [], draftId = null;
  if (m) {
    base = { ...base, ...replyBasics(m, o.mode) };
    const lead = o.text ? `<p>${esc(o.text).replace(/\n/g, '<br>')}</p>` : '<p><br></p>';
    body = lead + sigHtml() + (o.mode === 'forward' ? fwdHtml(m) : quoteHtml(m));
  }
  if (o.draft) {
    const d = o.draft; draftId = d.id;
    base = { ...base, from: d.from.address || me, to: d.to.map(a => a.address).join(', '), cc: d.cc.map(a => a.address).join(', '), subject: d.subject };
    body = d.html || esc(d.text || '').replace(/\n/g, '<br>');
  }
  if (o.restore) { const r = o.restore; base = { ...base, ...r }; body = r.html || ''; atts = (r.attachments || []).map(x => ({ ...x, size: Math.round((x.data || '').length * 0.75) })); draftId = r.draft || null; }

  const froms = [...new Set([base.from, me, ...S.aliases.map(a => a.address)])].filter(mine);
  const fromSel = h('select', {}, froms.map(a => h('option', { value: a, text: a })), h('option', { value: '__other', text: 'Another address…' }));
  fromSel.value = base.from;
  fromSel.addEventListener('change', async () => {
    if (fromSel.value !== '__other') return;
    const inp = h('input', { type: 'text', placeholder: `anything@${dom}` });
    const v = await dialog('Send from another address', h('label', { class: 'f' }, `Every address @${dom} is yours (catch-all).`, inp), [['Cancel', null, 'ghost'], ['Use it', 'ok', 'pri']]);
    const a = (v && inp.value.trim().toLowerCase()) || '';
    if (a && mine(a) && /^[^\s@]+@/.test(a)) { fromSel.insertBefore(h('option', { value: a, text: a }), fromSel.lastChild); fromSel.value = a; }
    else { fromSel.value = me; if (v) toast(`It has to end with @${dom}`, { bad: true }); }
  });
  const to = tokenField(base.to, 'Who is it for?'), cc = tokenField(base.cc, 'Cc'), bcc = tokenField(base.bcc, 'Bcc');
  const ccRow = h('div', { class: 'cfield' + (base.cc ? '' : ' hide') }, h('label', { text: 'Cc' }), cc.el);
  const bccRow = h('div', { class: 'cfield' + (base.bcc ? '' : ' hide') }, h('label', { text: 'Bcc' }), bcc.el);
  const subIn = h('input', { type: 'text', value: base.subject, placeholder: 'What’s it about?' });
  const ed = h('div', { class: 'editor', contenteditable: 'true', 'data-ph': 'Write your message…', html: body });
  const attBox = h('div', { class: 'catts hide' });
  const status = h('span', { class: 'st grow' });
  const file = h('input', { type: 'file', multiple: true, class: 'hide', onchange: () => { addFiles(file.files); file.value = ''; } });
  const title = h('span', { class: 't', text: base.subject || (m ? (o.mode === 'forward' ? 'Forward' : 'Reply') : 'New message') });
  let dirty = !!o.restore, sending = false;
  subIn.addEventListener('input', () => { title.textContent = subIn.value || 'New message'; dirty = true; });
  [to, cc, bcc].forEach(t => t.onChange(() => { dirty = true; }));
  const exec = (c, v) => { ed.focus(); document.execCommand(c, false, v); dirty = true; };
  const tool = (ic, t, fn) => h('button', { class: 'ib', title: t, 'aria-label': t, onmousedown: e => e.preventDefault(), onclick: fn }, icon(ic));
  const box = h('div', { class: 'composer', role: 'dialog', 'aria-label': 'Compose' },
    h('div', { class: 'ctitle' }, icon('pen'), title, ib('max', 'Bigger', () => box.classList.toggle('max')), ib('x', 'Close (saves a draft)', () => closeSave())),
    h('div', { class: 'cfield' }, h('label', { text: 'From' }), fromSel),
    h('div', { class: 'cfield' }, h('label', { text: 'To' }), to.el, h('button', { class: 'lnk', onclick: () => { ccRow.classList.remove('hide'); cc.focus(); } }, 'Cc'), h('button', { class: 'lnk', onclick: () => { bccRow.classList.remove('hide'); bcc.focus(); } }, 'Bcc')),
    ccRow, bccRow,
    h('div', { class: 'cfield' }, h('label', { text: 'Subject' }), subIn),
    h('div', { class: 'ctools' },
      tool('bold', 'Bold (Ctrl+B)', () => exec('bold')), tool('italic', 'Italic (Ctrl+I)', () => exec('italic')), tool('underline', 'Underline (Ctrl+U)', () => exec('underline')), h('span', { class: 'sep' }),
      tool('link', 'Link (Ctrl+K)', addLink), tool('ul', 'Bulleted list', () => exec('insertUnorderedList')), tool('ol', 'Numbered list', () => exec('insertOrderedList')),
      tool('quote', 'Quote', () => exec('formatBlock', 'blockquote')), tool('eraser', 'Clear formatting', () => exec('removeFormat')),
      h('span', { class: 'grow' }), tool('clip', 'Attach files', () => file.click())),
    ed, attBox,
    h('div', { class: 'cfoot' }, h('button', { class: 'btn pri send-btn', onclick: () => doSend() }, 'Send', icon('send')), status,
      h('span', { class: 'muted', style: { fontSize: '12px' } }, kbd(MAC ? '⌘' : 'Ctrl'), ' ', kbd('Enter')),
      ib('trash', 'Discard', async () => { if (await confirmBox('Discard this message?', 'The draft will be deleted.', 'Discard', true)) { if (draftId) await api('POST', '/api/messages/delete', { ids: [draftId] }).catch(() => {}); close(); refresh(); } }), file),
    h('div', { class: 'dropzone' }, 'Drop files to attach'));
  const ov = h('div', { class: 'overlay', onclick: e => { if (e.target === ov && innerWidth > 760) closeSave(); } }, box);
  document.body.append(ov);
  renderAtts();
  ed.addEventListener('input', () => { dirty = true; });
  ed.addEventListener('paste', e => { const html = e.clipboardData.getData('text/html'); if (!html) return; e.preventDefault(); document.execCommand('insertHTML', false, cleanPaste(html)); dirty = true; });
  box.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doSend(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && e.target === ed) { e.preventDefault(); e.stopPropagation(); addLink(); }
    if (e.key === 'Escape') { e.stopPropagation(); closeSave(); }
  });
  let dragDepth = 0;
  box.addEventListener('dragenter', e => { if (!e.dataTransfer?.types?.includes('Files')) return; dragDepth++; box.classList.add('dragging'); });
  box.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; box.classList.remove('dragging'); } });
  box.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  box.addEventListener('drop', e => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); dragDepth = 0; box.classList.remove('dragging'); addFiles(e.dataTransfer.files); });
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
    attBox.replaceChildren(...atts.map((a, i) => h('div', { class: 'catt' }, icon('clip'), h('span', { text: `${a.name} · ${fmtSize(a.size)}` }), h('button', { title: 'Remove', onclick: () => { atts.splice(i, 1); renderAtts(); dirty = true; } }, icon('x')))));
  }
  const payload = () => ({ from: fromSel.value, to: to.value(), cc: cc.value(), bcc: bcc.value(), subject: subIn.value, html: ed.innerHTML, attachments: atts.map(({ name, type, data }) => ({ name, type, data })), inReplyTo: base.inReplyTo || '', references: base.references || '', answering: base.answering || '', draft: draftId });
  const hasContent = () => to.count() || subIn.value.trim() || ed.textContent.replace(/^\s*--\s*[\s\S]*$/, '').trim() || atts.length;
  async function saveDraft() {
    if (!dirty || sending || !hasContent()) return;
    dirty = false;
    try { const r = await api('POST', '/api/drafts', payload()); draftId = r.id; status.textContent = 'Draft saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
    catch (e) { dirty = true; }
  }
  const timer = setInterval(saveDraft, 8000);
  async function doSend() {
    if (sending) return;
    const bad = [...to.invalid(), ...cc.invalid(), ...bcc.invalid()];
    if (bad.length) { toast(`“${bad[0]}” isn’t a valid address`, { bad: true }); return; }
    if (!to.count() && !cc.count() && !bcc.count()) { toast('Add at least one recipient.', { bad: true }); to.focus(); return; }
    if (!subIn.value.trim() && !await confirmBox('Send without a subject?', 'Messages without a subject are easy to miss.', 'Send anyway')) return;
    sending = true;
    const p = payload();
    close();
    queueSend(p, () => compose({ restore: p }));
  }
  async function closeSave() {
    if (!sending && hasContent()) { dirty = true; await saveDraft(); if (draftId) toast('Saved to Drafts', { icon: 'draft' }); refresh(); }
    close();
  }
  function close() { clearInterval(timer); ov.remove(); openComposer.closed = true; }
  openComposer = { closed: false, close: save => save ? closeSave() : close(), focus: () => ed.focus() };
  if (base.to) { ed.focus(); const r = document.createRange(); r.setStart(ed, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); }
  else to.focus();
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
  // Cloudflare's template link opens its own "Create API token" form with the
  // permissions already ticked; the person only clicks Continue → Create → Copy.
  // selfmail then picks the token up by itself: from the clipboard when the tab
  // gets focus back, or from a paste anywhere on the page.
  const zoneGuess = st.domain.split('.').slice(-2).join('.');
  const tokenUrl = 'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=' + encodeURIComponent(JSON.stringify([{ key: 'dns', type: 'edit' }, { key: 'zone', type: 'read' }])) +
    '&accountId=*&zoneId=all&name=' + encodeURIComponent('selfmail · ' + zoneGuess);
  const looksLikeToken = t => /^[A-Za-z0-9_\-]{35,90}$/.test(t);
  function renderCf(s) {
    if (!s.cloudflare.connected) {
      let waiting = false, busy = false, tried = '', popup = null;
      const stateEl = h('div', { class: 'cf-state' });
      const setState = (kind, text) => { stateEl.className = 'cf-state ' + kind; stateEl.replaceChildren(kind === 'busy' ? h('span', { class: 'spin' }) : h('span', { class: 'dot' }), h('span', { text })); };
      const steps = h('ol', { class: 'cf-steps' },
        h('li', {}, h('b', { text: 'Sign in to Cloudflare' }), h('span', { text: 'A Cloudflare window opens with the right permissions already chosen.' })),
        h('li', {}, h('b', {}, 'Click ', h('i', { text: 'Continue to summary' }), ', then ', h('i', { text: 'Create Token' })), h('span', { text: 'It can only edit DNS — nothing else in your account.' })),
        h('li', {}, h('b', {}, 'Click ', h('i', { text: 'Copy' }), ' and come back'), h('span', { text: 'selfmail picks the token up by itself and connects.' })));
      const connect = async (token) => {
        token = String(token || '').trim();
        if (busy || !token) return;
        busy = true; tried = token; setState('busy', 'Connecting to Cloudflare…');
        try {
          const r = await api('POST', '/api/cloudflare/connect', { token });
          try { popup && !popup.closed && popup.close(); } catch { }
          cleanup();
          toast(`Connected to ${r.zone.name}`, { icon: 'check' });
          s.cloudflare = { connected: true, zone: r.zone.name, account: r.zone.account, fresh: true }; renderCf(s);
        } catch (e) { busy = false; setState('bad', e.message); }
      };
      const sniff = async () => {
        if (!waiting || busy || !navigator.clipboard?.readText || !window.isSecureContext) return;
        try { const t = (await navigator.clipboard.readText()).trim(); if (looksLikeToken(t) && t !== tried) connect(t); } catch { }
      };
      const onPaste = e => {
        if (!document.body.contains(cf)) return cleanup();
        const t = (e.clipboardData?.getData('text') || '').trim();
        if (looksLikeToken(t) && !e.target.closest?.('.compose')) { e.preventDefault(); manual.value = t; connect(t); }
      };
      const onFocus = () => { if (!document.body.contains(cf)) return cleanup(); setTimeout(sniff, 150); };
      const cleanup = () => { window.removeEventListener('focus', onFocus); document.removeEventListener('paste', onPaste); };
      window.addEventListener('focus', onFocus); document.addEventListener('paste', onPaste);

      const start = () => {
        const w = 1060, ht = 860, x = Math.max(0, (screen.availWidth - w) / 2), y = Math.max(0, (screen.availHeight - ht) / 2);
        popup = window.open(tokenUrl, 'selfmail-cloudflare', `popup,width=${w},height=${ht},left=${x},top=${y}`);
        if (!popup) location.assign(tokenUrl);
        waiting = true; cf.classList.add('waiting');
        setState('wait', window.isSecureContext && navigator.clipboard?.readText ? 'Waiting for your token — copy it in Cloudflare and come back here' : 'Waiting for your token — copy it in Cloudflare, come back and press ' + (MAC ? '⌘' : 'Ctrl') + '+V');
      };
      const manual = h('input', { type: 'password', placeholder: 'Paste a Cloudflare API token', autocomplete: 'off', onkeydown: e => { if (e.key === 'Enter') connect(manual.value); } });
      const pasteBtn = window.isSecureContext && navigator.clipboard?.readText ? h('button', { class: 'btn', onclick: async () => { try { const t = (await navigator.clipboard.readText()).trim(); if (!t) return toast('The clipboard is empty', { bad: true }); manual.value = t; connect(t); } catch { toast('The browser didn’t allow reading the clipboard — paste it into the box instead', { bad: true }); manual.focus(); } } }, icon('copy'), 'Paste from clipboard') : null;
      cf.className = 'card cf-card';
      cf.replaceChildren(
        h('div', { class: 'cf-hero' },
          h('div', { class: 'cf-logo', html: '<svg viewBox="0 0 64 32"><path fill="#fff" d="M43.6 22.4l.5-1.7c.6-2 .4-3.8-.6-5.1-.9-1.2-2.3-1.9-4.1-2l-17.4-.2c-.1 0-.2-.1-.3-.1-.1-.1-.1-.2 0-.3.1-.2.2-.3.4-.3l17.6-.2c2.1-.1 4.3-1.8 5.1-3.8l1-2.6c0-.1.1-.2 0-.3C44.6 2.5 40.4 0 35.6 0c-5.5 0-10.2 3.6-11.9 8.5-1.1-.8-2.5-1.3-4-1.1-2.6.3-4.7 2.4-5 5-.1.7 0 1.3.1 2C10.5 14.5 7 18.1 7 22.5c0 .4 0 .8.1 1.2 0 .2.2.3.3.3h35.5c.2 0 .4-.1.4-.3z"/><path fill="#fff" opacity=".75" d="M50.1 10.2h-.5c-.1 0-.2.1-.3.2l-.8 2.6c-.6 2-.4 3.8.6 5.1.9 1.2 2.3 1.9 4.1 2l3.7.2c.1 0 .2.1.3.1.1.1.1.2 0 .3-.1.2-.2.3-.4.3l-3.8.2c-2.1.1-4.3 1.8-5.1 3.8l-.3.7c-.1.1 0 .3.2.3h13c.2 0 .3-.1.3-.2.2-.8.3-1.7.3-2.6 0-5.1-4.2-9.3-9.3-9.3"/></svg>' }),
          h('div', { class: 'grow' },
            h('h2', { text: 'Set up DNS automatically with Cloudflare' }),
            h('p', { class: 'sub', text: `If ${zoneGuess} uses Cloudflare, selfmail adds and fixes every record below for you. You’ll see exactly what changes before anything happens.` })),
          h('button', { class: 'btn cf-go', onclick: start }, 'Connect Cloudflare', icon('arrow'))),
        steps, stateEl,
        h('details', { class: 'cf-manual' }, h('summary', { text: 'Already have a token? Paste it yourself' }),
          h('div', { class: 'row' }, manual, pasteBtn, h('button', { class: 'btn pri', onclick: () => connect(manual.value) }, 'Connect')),
          h('p', { class: 'muted small' }, 'It needs ', h('b', { text: 'Zone · DNS · Edit' }), ' and ', h('b', { text: 'Zone · Zone · Read' }), ' for ', h('b', { text: zoneGuess }), '. ', h('a', { href: tokenUrl, target: '_blank', rel: 'noopener' }, 'Open the pre-filled form'))));
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
      const n = todo.filter(o => o.action !== 'skip').length;
      applyBtn.classList.toggle('hide', done || !n);
      applyBtn.replaceChildren(icon('sparkle'), n === 1 ? 'Apply 1 change' : `Apply all ${n} changes`);
      planBox.replaceChildren(...(todo.length ? todo : [{ action: 'ok', type: '', name: 'Everything already matches.', content: '' }]).map(o => h('div', { class: 'op' },
        h('span', { class: 'chip ' + ({ create: 'ok', update: 'acc', delete: 'bad', skip: 'warn', ok: 'ok' }[o.action] || '') }, done ? (o.done ? '✓ ' : '✗ ') + o.action : o.action),
        h('b', { class: 'typ', text: o.type }),
        h('div', { class: 'what' }, h('div', { text: o.name }), o.content ? h('div', { text: (o.priority ? o.priority + ' ' : '') + o.content }) : null, o.before ? h('div', { class: 'before', text: o.before }) : null, o.why ? h('div', { class: 'why', text: o.why }) : null, o.error ? h('div', { class: 'found', text: o.error }) : null))));
    };
    const preview = async () => { planBox.replaceChildren(h('span', { class: 'spin' })); try { showOps((await api('GET', '/api/cloudflare/plan')).ops, false); } catch (e) { planBox.replaceChildren(); fail(e); } };
    const auto = h('input', { type: 'checkbox', checked: s.autoIp, onchange: async e => { try { await api('POST', '/api/settings', { autoIp: e.target.checked }); toast(e.target.checked ? 'DNS will follow your IP' : 'Automatic IP updates off'); } catch (x) { fail(x); e.target.checked = !e.target.checked; } } });
    cf.className = 'card';
    const fresh = s.cloudflare.fresh; s.cloudflare.fresh = false;
    cf.replaceChildren(h('h2', {}, icon('cloud'), 'Cloudflare', h('span', { class: 'chip ok', text: `Connected · ${s.cloudflare.zone}` })),
      fresh ? h('div', { class: 'cf-done' }, icon('check'), h('div', {}, h('b', { text: 'Cloudflare is linked.' }), h('span', { text: ' Here’s everything selfmail will set up — one click and you’re done.' }))) : null,
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
  const states = tiles.filter(Boolean).map(t => $('.dot', t)?.className || '');
  const bad = states.filter(c => /\bbad\b/.test(c)).length, warn = states.filter(c => /\bwarn\b/.test(c)).length;
  const hc = bad ? 'var(--bad)' : warn ? 'var(--warn)' : 'var(--ok)';
  const hero = h('div', { class: 'hero', style: { '--hc': hc } }, h('div', { class: 'ring' }, icon(bad ? 'x' : warn ? 'spam' : 'check')),
    h('div', {}, h('h2', { text: bad ? `${bad} thing${bad > 1 ? 's' : ''} need${bad > 1 ? '' : 's'} attention` : warn ? 'Mail is flowing — with a few warnings' : 'All systems operational' }),
      h('p', { text: bad ? 'Details below, with what to do about each one.' : warn ? 'Everything works; the yellow items can hurt delivery to some providers.' : 'Mail is flowing in and out normally.' })));
  $('#page').replaceChildren(pageShell('Server status', 'Everything that has to work for mail to flow, checked live.', hero,
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
    h('div', { class: 'card' }, h('h2', {}, icon('palette'), 'Appearance'), h('p', { class: 'sub', text: 'Saved in this browser.' }),
      h('div', { class: 'form' },
        h('div', { class: 'f' }, 'Theme', segPick([['auto', 'Match device'], ['light', 'Light'], ['dark', 'Dark']], theme(), v => { localStorage.setItem('sm-theme', v); applyTheme(); renderNav(); })),
        h('div', { class: 'f' }, 'Accent', h('div', { class: 'swatches' }, Object.entries(ACCENTS).map(([k, c]) => h('button', { class: 'swatch' + ((localStorage.getItem('sm-accent') || 'violet') === k ? ' on' : ''), title: k[0].toUpperCase() + k.slice(1), style: { background: `linear-gradient(135deg,${c[0]},${c[1]} 55%,${c[2]})` },
          onclick: e => { localStorage.setItem('sm-accent', k); applyTheme(); $$('.swatch').forEach(x => x.classList.remove('on')); e.currentTarget.classList.add('on'); } })))),
        h('div', { class: 'f' }, 'Message list', segPick([['comfortable', 'Comfortable'], ['compact', 'Compact']], localStorage.getItem('sm-density') || 'comfortable', v => { localStorage.setItem('sm-density', v); applyTheme(); })),
        h('label', { class: 'row check' }, h('input', { type: 'checkbox', checked: localStorage.getItem('sm-logos') !== '0', onchange: e => { localStorage.setItem('sm-logos', e.target.checked ? '1' : '0'); toast(e.target.checked ? 'Sender logos on' : 'Sender logos off — initials only'); } }),
          h('span', {}, h('b', { text: 'Show sender logos' }), h('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'Your server fetches each company’s logo once and keeps it — your browser never contacts anyone else.'))),
        h('div', { class: 'f' }, 'New-mail notifications', h('div', {}, h('button', { class: 'btn', onclick: async e => {
          if (!('Notification' in window)) return toast('This browser can’t show notifications', { bad: true });
          const p = await Notification.requestPermission(); if (p === 'granted') { localStorage.setItem('sm-notify', '1'); toast('You’ll get a notification when mail arrives', { icon: 'unread' }); e.target.textContent = 'Notifications on'; } else toast('Notifications were blocked in the browser', { bad: true });
        } }, notifOn ? 'Notifications on' : 'Turn on notifications'))))),
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
  if (changed) { S.sel.clear(); S.items = []; S.animateNext = true; renderList(); loadList(); }
  if (id) { if (id !== S.open) openMsg(id, true); }
  else { S.open = null; S.msg = null; $('#shell').classList.remove('reading'); $$('.mrow.on').forEach(r => r.classList.remove('on')); renderEmptyReader(); }
}
addEventListener('popstate', () => S.me && route());
addEventListener('hashchange', () => S.me && route());

function segPick(opts, val, fn) {
  const seg = h('div', { class: 'seg' }, opts.map(([v, t]) => h('button', { 'data-v': v, class: v === val ? 'on' : '', onclick: () => { $$('button', seg).forEach(b => b.classList.toggle('on', b.dataset.v === v)); fn(v); } }, t)));
  return h('div', {}, seg);
}

// ===================================================== command palette ====
function palette() {
  if ($('.palette')) return;
  closeMenu();
  const inp = h('input', { type: 'text', placeholder: 'Search mail, jump anywhere, or run a command…', 'aria-label': 'Command' });
  const res = h('div', { class: 'res' });
  let items = [], idx = 0, seq = 0;
  const ov = h('div', { class: 'palette', onclick: e => { if (e.target === ov) close(); } },
    h('div', { class: 'box' }, h('div', { class: 'pin' }, icon('search'), inp, kbd('Esc')), res,
      h('div', { class: 'foot' }, h('span', {}, kbd('↑'), ' ', kbd('↓'), ' move'), h('span', {}, kbd('Enter'), ' open'), h('span', { class: 'grow' }), h('span', {}, 'Try from:, to:, subject: or has:attachment'))));
  const close = () => ov.remove();
  const go = hsh => { close(); location.hash = hsh; };
  const commands = () => [
    { sec: 'Actions', ic: 'pen', t: 'Write a message', k: 'c', run: () => { close(); compose(); } },
    { sec: 'Actions', ic: document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', t: 'Switch light / dark', run: () => { toggleTheme(); close(); } },
    { sec: 'Actions', ic: 'refresh', t: 'Refresh mail', run: () => { close(); refresh(); } },
    { sec: 'Actions', ic: 'keyboard', t: 'Keyboard shortcuts', k: '?', run: () => { close(); shortcuts(); } },
    ...['inbox', 'starred', 'sent', 'drafts', 'archive', 'spam', 'trash', 'all'].map(f => ({ sec: 'Go to', ic: FOLDER_ICON[f] || 'all', t: S.folders.find(x => x.id === f)?.name || 'All mail', run: () => go('#/f/' + f) })),
    { sec: 'Go to', ic: 'globe', t: 'Domain & DNS', run: () => go('#/domain') },
    { sec: 'Go to', ic: 'pulse', t: 'Server status', run: () => go('#/status') },
    { sec: 'Go to', ic: 'gear', t: 'Settings', run: () => go('#/settings') },
    ...S.aliases.map(a => ({ sec: 'Addresses', ic: 'at', t: a.address, sub: a.unread ? `${a.unread} unread` : `${a.total} messages`, run: () => go('#/a/' + encodeURIComponent(a.address)) })),
  ];
  function draw(list) {
    items = list; idx = Math.min(idx, Math.max(0, items.length - 1));
    if (!items.length) return res.replaceChildren(h('div', { class: 'hint', text: 'Nothing found' }));
    const out = []; let sec = '';
    items.forEach((x, i) => {
      if (x.sec !== sec) { out.push(h('h6', { text: x.sec })); sec = x.sec; }
      out.push(h('button', { class: 'it' + (i === idx ? ' on' : ''), onmouseenter: () => { idx = i; paint(); }, onclick: () => x.run() },
        x.msg ? avatar(x.msg.from) : icon(x.ic),
        h('div', { class: 'grow' }, h('b', { text: x.t }), x.sub ? h('small', { text: x.sub }) : null),
        x.k ? kbd(x.k) : null));
    });
    res.replaceChildren(...out);
  }
  function paint() { $$('.it', res).forEach((b, i) => b.classList.toggle('on', i === idx)); $$('.it', res)[idx]?.scrollIntoView({ block: 'nearest' }); }
  async function update() {
    const q = inp.value.trim(), ql = q.toLowerCase(), my = ++seq;
    let list = commands().filter(x => !ql || x.t.toLowerCase().includes(ql) || x.sec.toLowerCase().includes(ql));
    if (!ql) list = list.filter(x => x.sec !== 'Addresses');
    idx = 0; draw(list.slice(0, 40));
    if (q.length >= 2) {
      const r = await api('GET', '/api/messages?' + new URLSearchParams({ folder: 'all', q, limit: 8 })).catch(() => ({ items: [] }));
      if (my !== seq) return;
      const msgs = r.items.map(m => ({ sec: 'Messages', msg: m, t: m.subject || '(no subject)', sub: `${nameOf(m.from)} · ${fmtWhen(m.date)}`, run: () => { close(); S.alias = ''; location.hash = `#/f/${m.folder}/${encodeURIComponent(m.id)}`; } }));
      draw([...msgs, ...list.slice(0, 30)]);
    }
  }
  inp.addEventListener('input', debounce(update, 120));
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint(); } }
    else if (e.key === 'Enter') { e.preventDefault(); items[idx]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  document.body.append(ov); update(); inp.focus();
}
function shortcuts() {
  const k = (keys, t) => h('div', {}, h('span', { text: t }), h('span', {}, ...keys.flatMap((x, i) => [i ? ' ' : '', kbd(x)])));
  dialog('Keyboard shortcuts', h('div', { class: 'keys' },
    k([MAC ? '⌘' : 'Ctrl', 'K'], 'Search & commands'), k(['c'], 'Write a message'), k(['j'], 'Next message'), k(['k'], 'Previous message'),
    k(['r'], 'Reply'), k(['a'], 'Reply all'), k(['f'], 'Forward'), k(['e'], 'Archive'), k(['#'], 'Delete'), k(['s'], 'Star'),
    k(['u'], 'Back to the list'), k(['/'], 'Search this folder'), k([MAC ? '⌘' : 'Ctrl', 'Enter'], 'Send'), k(['?'], 'This list')), [['Got it', true, 'pri']]);
}

// ========================================================== keyboard ====
document.addEventListener('keydown', e => {
  if (!S.me) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.target.closest?.('.composer')) { e.preventDefault(); palette(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if ((openComposer && !openComposer.closed) || $('.dialog') || $('.palette') || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.key === '?') { e.preventDefault(); shortcuts(); return; }
  if (S.view !== 'mail') return;
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
