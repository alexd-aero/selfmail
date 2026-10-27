'use strict';
// selfmail 2 — web mail client + admin for a Postfix/OpenDKIM mail server.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const MailComposer = require('nodemailer/lib/mail-composer');

const cfg = require('./lib/config');
const auth = require('./lib/auth');
const store = require('./lib/store');
const md = require('./lib/maildir');
const mime = require('./lib/mime');
const mailer = require('./lib/send');
const dns = require('./lib/dns');
const cloudflare = require('./lib/cloudflare');
const status = require('./lib/status');
const events = require('./lib/events');
const outbound = require('./lib/outbound');
const isp = require('./lib/isp');
const agreement = require('./lib/agreement');
const gate = require('./lib/host');
const { root, token, safeEqual, isDomain, isEmail, isIPv4 } = require('./lib/util');

const VERSION = require('./package.json').version;
const PUBLIC = path.join(__dirname, 'public');
const IS_PROD = process.env.NODE_ENV !== 'development';

// ------------------------------------------------------------ http helpers --
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Opener-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
const APP_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

function json(res, code, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { ...SEC, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; Object.assign(this, extra || {}); } }
const fail = (status, msg, extra) => { throw new HttpError(status, msg, extra); };

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(new HttpError(413, 'Too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function body(req, limit = 1e6) {
  const b = await readBody(req, limit);
  if (!b.length) return {};
  try { return JSON.parse(b.toString('utf8')); } catch (e) { fail(400, 'Bad JSON.'); }
}
const ids = v => (Array.isArray(v) ? v : [v]).map(String).filter(x => /^[a-z]+~[A-Za-z0-9._\-=,]+$/.test(x)).slice(0, 500);

// ----------------------------------------------------------------- router --
const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, open: !!opts.open });
}

// ---------------------------------------------------------------- inbound --
// A relay (Forward Email) POSTs each message here. The secret in the path is
// the credential; with a webhook key set, the HMAC signature is checked too.
async function inbound(req, res, p) {
  const c = cfg.load();
  if (!c.inboundSecret || !safeEqual(p.secret, c.inboundSecret)) return json(res, 403, { error: 'forbidden' });
  const buf = await readBody(req, 40e6);
  if (c.webhookKey) {
    const sig = String(req.headers['x-webhook-signature'] || '');
    const want = crypto.createHmac('sha256', c.webhookKey).update(buf).digest('hex');
    if (!sig || !safeEqual(sig, want)) return json(res, 401, { error: 'bad signature' });
  }
  let raw = buf;
  if (buf[0] === 0x7b /* { */) {
    try {
      const o = JSON.parse(buf.toString('utf8'));
      let r = o.raw || o.message || o.email || o.mime;
      if (r && typeof r === 'object') r = r.raw || r.data || null;
      if (r) raw = Buffer.from(String(r), 'utf8');
      else {   // no raw copy: rebuild a message from the parsed fields
        const addr = v => !v ? '' : typeof v === 'string' ? v : Array.isArray(v) ? v.map(addr).join(', ') : (v.text || v.address || (v.value ? addr(v.value) : ''));
        raw = await new MailComposer({
          from: addr(o.from) || 'unknown@unknown.invalid', to: addr(o.to) || cfg.address(c), cc: addr(o.cc) || undefined, subject: o.subject || '',
          date: o.date ? new Date(o.date) : new Date(), messageId: o.messageId || undefined, text: o.text || undefined, html: o.html || undefined,
          attachments: (o.attachments || []).map(a => ({ filename: a.filename, contentType: a.contentType, content: a.content?.data ? Buffer.from(a.content.data) : Buffer.from(String(a.content || ''), 'base64') })),
        }).compile().build();
      }
    } catch (e) { /* not JSON after all: keep the bytes as they came */ }
  }
  if (!raw.length) return json(res, 400, { error: 'empty body' });
  const w = await store.store('inbox', raw, '', true);
  console.log(`inbound: stored ${w.base} (${raw.length} bytes)`);
  json(res, 200, { ok: true, stored: w.base, bytes: raw.length });
}
route('POST', '/inbound/:secret', inbound, { open: true });
route('GET', '/inbound/:secret/ping', (req, res, p) => {
  const c = cfg.load();
  if (!c.inboundSecret || !safeEqual(p.secret, c.inboundSecret)) return json(res, 403, { error: 'forbidden' });
  json(res, 200, { ok: true, ready: true, version: VERSION });
}, { open: true });

// ---------------------------------------------------------------- session --
route('POST', '/api/login', async (req, res) => {
  const ip = auth.clientIp(req);
  if (!auth.allowed(ip)) fail(429, 'Too many failed sign-ins. Wait 15 minutes and try again.');
  const b = await body(req, 10e3);
  const user = String(b.user || '').trim(), pass = String(b.pass || '');
  if (!user || !pass || !auth.verify(user, pass)) { auth.failed(ip); await new Promise(r => setTimeout(r, 400)); fail(401, 'Wrong username or password.'); }
  auth.succeeded(ip);
  const sid = auth.create(user, req);
  json(res, 200, { ok: true }, { 'Set-Cookie': auth.cookie(sid, req) });
}, { open: true });
route('POST', '/api/logout', (req, res, p, s) => { auth.destroy(s.id); json(res, 200, { ok: true }, { 'Set-Cookie': auth.cookie('', req, true) }); });

route('GET', '/api/state', async (req, res, p, s) => {
  const c = cfg.load();
  json(res, 200, {
    user: s.user, version: VERSION, address: cfg.address(c), domain: c.domain, mailbox: c.mailbox, fromName: c.fromName, signature: c.signature,
    mode: c.mode, configured: !!(c.domain && c.mxhost), cloudflare: !!c.cloudflare.token, domains: cfg.domains(c), hosted: !!s.host,
    agreement: !!(c.agreement && c.agreement.version >= agreement.VERSION),
  });
});

// ---------------------------------------------------------- logos, contacts --
// Sender logos: fetched once by the server (so the browser never contacts a
// third party), cached for a week. Personal mail providers get initials instead.
const AV_DIR = path.join(cfg.VAR, 'avatars');
const PERSONAL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.net', 'mail.com', 'yandex.ru', 'yandex.com', 'zoho.com', 'fastmail.com', 'hey.com', 'tutanota.com', 'qq.com', '163.com', 'mail.ru']);
route('GET', '/api/avatar/:domain', async (req, res, p) => {
  const d = isp.registrable(String(p.domain).toLowerCase());
  if (!isDomain(d) || PERSONAL.has(d) || cfg.domains().some(x => isp.registrable(x) === d)) return json(res, 404, { error: 'none' });
  const base = path.join(AV_DIR, d);
  const send = buf => { res.writeHead(200, { ...SEC, 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=604800' }); res.end(buf); };
  try { return send(fs.readFileSync(base + '.png')); } catch (e) { /* not cached */ }
  try { if (Date.now() - fs.statSync(base + '.none').mtimeMs < 7 * 864e5) return json(res, 404, { error: 'none' }); } catch (e) { /* not tried yet */ }
  fs.mkdirSync(AV_DIR, { recursive: true });
  try {
    const r = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`, { signal: AbortSignal.timeout(6000) });
    const buf = Buffer.from(await r.arrayBuffer());
    if (r.ok && /^image\//.test(r.headers.get('content-type') || '') && buf.length > 150 && buf.length < 100e3) { fs.writeFileSync(base + '.png', buf); return send(buf); }
  } catch (e) { /* offline */ }
  fs.writeFileSync(base + '.none', '');
  json(res, 404, { error: 'none' });
});
route('GET', '/api/contacts', async (req, res) => {
  const c = cfg.load(), rows = await store.all(), map = new Map();
  const add = (a, at, w) => {
    if (!a || !a.address || cfg.domainOf(a.address, c)) return;
    const x = map.get(a.address) || { name: '', address: a.address, score: 0, last: 0 };
    if (a.name && !x.name) x.name = a.name; x.score += w; x.last = Math.max(x.last, at); map.set(a.address, x);
  };
  for (const r of rows) {
    if (r.folder === 'sent') for (const a of r.to) add(a, r.date, 3);
    else if (r.folder !== 'spam' && r.folder !== 'trash') add(r.from, r.date, 1);
  }
  json(res, 200, [...map.values()].sort((a, b) => b.score - a.score || b.last - a.last).slice(0, 400));
});

// ------------------------------------------------------------------- mail --
route('GET', '/api/folders', async (req, res) => json(res, 200, await store.counts()));
route('GET', '/api/messages', async (req, res, p, s, url) => {
  const q = url.searchParams;
  json(res, 200, await store.list({ folder: q.get('folder') || 'inbox', q: (q.get('q') || '').slice(0, 200), alias: q.get('alias') || '', unread: q.get('unread') === '1', offset: +q.get('offset') || 0, limit: Math.min(200, +q.get('limit') || 60) }));
});
route('GET', '/api/messages/:id', async (req, res, p, s, url) => {
  const raw = await md.read(p.id); if (!raw) fail(404, 'This message no longer exists.');
  const c = cfg.load();
  const { info, parsed } = await mime.view(raw, cfg.domains(c));
  let loc = await md.locate(p.id);
  if (loc?.folder === 'drafts') info.html = parsed.html || '';
  if (url.searchParams.get('peek') !== '1' && loc && !loc.flags.includes('S')) { loc = await md.setFlags(p.id, 'S', ''); events.emit('changed'); }
  json(res, 200, { id: p.id, folder: loc?.folder, flags: loc?.flags || '', ...info });
});
route('GET', '/api/messages/:id/frame', async (req, res, p, s, url) => {
  const raw = await md.read(p.id); if (!raw) fail(404, 'Gone.');
  const { parsed } = await mime.view(raw, cfg.domains());
  const images = url.searchParams.get('images') === '1';
  const mono = url.searchParams.has('mono') ? url.searchParams.get('mono') === '1' : null;
  const f = mime.frameDoc(parsed, { images, mono });
  const src = images ? ' https: http:' : '';
  res.writeHead(200, {
    ...SEC, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store',
    // Even opened directly in a tab, mail content can never run script.
    'Content-Security-Policy': `sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox; default-src 'none'; img-src data:${src}; style-src 'unsafe-inline'${src}; font-src data:${src}; media-src data:; frame-ancestors 'self'`,
    'X-Frame-Options': 'SAMEORIGIN', 'X-Remote-Content': f.remote ? '1' : '0', 'X-Text-Mono': f.isText ? (f.mono ? '1' : '0') : '',
  });
  res.end(f.doc);
});
route('GET', '/api/messages/:id/raw', async (req, res, p) => {
  const raw = await md.read(p.id); if (!raw) fail(404, 'Gone.');
  res.writeHead(200, { ...SEC, 'Content-Type': 'message/rfc822', 'Content-Disposition': `attachment; filename="message-${p.id.split('~')[1].slice(0, 20)}.eml"`, 'Cache-Control': 'private, no-store' });
  res.end(raw);
});
route('GET', '/api/messages/:id/attachments/:i', async (req, res, p, s, url) => {
  const raw = await md.read(p.id); if (!raw) fail(404, 'Gone.');
  const a = await mime.attachment(raw, +p.i); if (!a) fail(404, 'No such attachment.');
  const name = (a.filename || `attachment-${+p.i + 1}`).replace(/[\r\n"\\/]/g, '_');
  const inlineOk = url.searchParams.get('view') === '1' && /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain)$/i.test(a.contentType);
  res.writeHead(200, {
    ...SEC, 'Content-Type': inlineOk ? a.contentType : 'application/octet-stream', 'Cache-Control': 'private, no-store',
    'Content-Disposition': `${inlineOk ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Content-Security-Policy': "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
  });
  res.end(a.content);
});
route('POST', '/api/messages/flags', async (req, res) => {
  const b = await body(req); const ok = s => String(s || '').replace(/[^SFR]/g, '');
  await store.mark(ids(b.ids), ok(b.add), ok(b.remove)); json(res, 200, { ok: true });
});
route('POST', '/api/messages/move', async (req, res) => {
  const b = await body(req); if (!md.byId[b.folder]) fail(400, 'Unknown folder.');
  json(res, 200, { ok: true, ids: await store.move(ids(b.ids), b.folder) });
});
route('POST', '/api/messages/delete', async (req, res) => { const b = await body(req); await store.trash(ids(b.ids)); json(res, 200, { ok: true }); });
route('POST', '/api/folders/:id/empty', async (req, res, p) => {
  if (!['trash', 'spam'].includes(p.id)) fail(400, 'Only Trash and Spam can be emptied.');
  json(res, 200, { ok: true, removed: await store.emptyFolder(p.id) });
});

route('POST', '/api/send', async (req, res) => {
  const b = await body(req, 36e6);
  try {
    const r = await mailer.send(b);
    if (b.draft && ids([b.draft]).length) { await md.remove(String(b.draft)).catch(() => {}); events.emit('changed'); }
    json(res, 200, r);
  } catch (e) { fail(e.status || 500, e.message, { diagnosis: e.diagnosis }); }
});
route('POST', '/api/drafts', async (req, res) => {
  const b = await body(req, 36e6);
  const c = cfg.load();
  const raw = await new MailComposer({
    from: { name: c.fromName || '', address: String(b.from || cfg.address(c)) }, to: b.to || undefined, cc: b.cc || undefined, bcc: b.bcc || undefined,
    subject: b.subject || '', html: b.html || undefined, text: b.text || mailer.htmlToText(b.html || ''), headers: { 'X-Selfmail-Draft': '1' },
    attachments: (b.attachments || []).slice(0, 20).map(a => ({ filename: a.name, contentType: a.type, content: Buffer.from(String(a.data || ''), 'base64') })),
  }).compile().build();
  if (b.draft) await md.remove(String(b.draft)).catch(() => {});
  const w = await store.store('drafts', raw, 'DS');
  json(res, 200, { ok: true, id: w.id });
});

// -------------------------------------------------------------- agreement --
route('GET', '/api/agreement', async (req, res) => {
  const i = await isp.detect().catch(() => ({ name: 'your internet provider' }));
  const c = cfg.load();
  json(res, 200, { version: agreement.VERSION, terms: agreement.terms(i.name || 'your internet provider'), isp: { name: i.name, network: i.network, asn: i.asn, ip: i.ip, logo: i.logo, domain: i.domain }, signed: c.agreement || null });
});
route('POST', '/api/agreement', async (req, res, p, s) => {
  const b = await body(req, 10e3);
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  if (b.agree !== true) fail(400, 'Tick the box to agree.');
  if (name.length < 3 || name.length > 100 || !/\p{L}/u.test(name)) fail(400, 'Type your full name to sign.');
  const i = await isp.detect().catch(() => ({}));
  const rec = { version: agreement.VERSION, name, at: Date.now(), user: s.user, ip: i.ip || '', isp: i.name || '', from: auth.clientIp(req), via: 'web' };
  cfg.update(c => { c.agreement = rec; });
  console.log(`agreement v${rec.version} signed by "${name}" (${s.user})`);
  json(res, 200, { ok: true, signed: rec });
});

// --------------------------------------------------------------- settings --
const publicSettings = c => ({
  domain: c.domain, mxhost: c.mxhost, mailbox: c.mailbox, selector: c.selector, fromName: c.fromName, signature: c.signature,
  publicIp: c.publicIp, autoIp: c.autoIp, mode: c.mode, webhookUrl: c.webhookUrl, webhookEndpoint: cfg.webhookEndpoint(c), hasWebhookKey: !!c.webhookKey,
  outbound: { mode: c.outbound.mode, host: c.outbound.host, port: c.outbound.port, using: c.outbound.using || 0, active: c.outbound.active || 'direct', user: c.outbound.user, spfInclude: c.outbound.spfInclude || '', notes: c.outbound.notes || [], checked: c.outbound.checked || 0, probes: c.outbound.probes || [] },
  agreement: c.agreement || null,
  dmarcPolicy: c.dmarcPolicy, dmarcRua: c.dmarcRua, tunnelUnit: c.tunnelUnit || 'selfmail-tunnel', listen: c.listen, port: c.port,
  cloudflare: { connected: !!c.cloudflare.token, zone: c.cloudflare.zoneName, account: c.cloudflare.account },
});
route('GET', '/api/settings', (req, res) => json(res, 200, publicSettings(cfg.load())));
route('POST', '/api/settings', async (req, res) => {
  const b = await body(req);
  const before = cfg.load();
  if (b.publicIp !== undefined && b.publicIp !== '' && !isIPv4(b.publicIp)) fail(400, 'The public IP must be an IPv4 address like 203.0.113.7.');
  if (b.mxhost !== undefined && !isDomain(b.mxhost)) fail(400, 'The server name must be a full host name like mx.example.com.');
  if (b.dmarcRua && !isEmail(b.dmarcRua)) fail(400, 'The DMARC report address isn’t a valid email address.');
  if (b.webhookUrl && !/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(b.webhookUrl)) fail(400, 'The webhook URL must start with https://');
  const next = cfg.update(c => {
    for (const k of ['fromName', 'signature']) if (typeof b[k] === 'string') c[k] = b[k].slice(0, k === 'signature' ? 4000 : 100);
    if (typeof b.publicIp === 'string') c.publicIp = b.publicIp.trim();
    if (typeof b.mxhost === 'string') c.mxhost = b.mxhost.trim().toLowerCase();
    if (['none', 'quarantine', 'reject'].includes(b.dmarcPolicy)) c.dmarcPolicy = b.dmarcPolicy;
    if (typeof b.dmarcRua === 'string') c.dmarcRua = b.dmarcRua.trim();
    if (['relay', 'direct'].includes(b.mode)) c.mode = b.mode;
    if (typeof b.webhookUrl === 'string') { c.webhookUrl = b.webhookUrl.trim().replace(/\/+$/, '').replace(/\/inbound\/.*$/, ''); try { const h = new URL(c.webhookUrl).hostname; if (h && !c.webhookHosts.includes(h)) c.webhookHosts.push(h); } catch (e) { /* blank */ } }
    if (typeof b.autoIp === 'boolean') c.autoIp = b.autoIp && !!c.cloudflare.token;
    if (typeof b.webhookKey === 'string') c.webhookKey = b.webhookKey.trim();
  });
  if (next.mxhost !== before.mxhost) await root('hostname-set', [next.mxhost]);
  json(res, 200, publicSettings(next));
});
route('POST', '/api/settings/outbound', async (req, res) => {
  const b = await body(req);
  try { await outbound.configure(b); } catch (e) { fail(e.status || 500, e.message, { probes: e.probes }); }
  json(res, 200, publicSettings(cfg.load()));
});
route('GET', '/api/outbound/probe', async (req, res, p, s, url) => {
  const host = String(url.searchParams.get('host') || '').trim().toLowerCase();
  if (!isDomain(host)) fail(400, 'Enter a server name first.');
  json(res, 200, { host, results: await outbound.probeAll(host) });
});
route('POST', '/api/settings/rotate-secret', async (req, res) => {
  const next = cfg.update(c => { c.inboundSecret = token(24); });
  let dnsResult = null;
  if (next.cloudflare.token && next.mode === 'relay') dnsResult = await cloudflare.apply(['hook']).catch(e => ({ ok: false, error: e.message }));
  json(res, 200, { ...publicSettings(next), dns: dnsResult });
});
route('POST', '/api/account/password', async (req, res, p, s) => {
  const b = await body(req, 10e3);
  if (!auth.verify(s.user, String(b.current || ''))) fail(400, 'Your current password is wrong.');
  if (String(b.next || '').length < 10) fail(400, 'Use at least 10 characters.');
  auth.setPassword(s.user, String(b.next)); auth.destroyOthers(s.id);
  json(res, 200, { ok: true });
});
route('GET', '/api/account/sessions', (req, res, p, s) => json(res, 200, auth.list().map(x => ({ ...x, current: s.id.startsWith(x.id) }))));
route('POST', '/api/account/signout-others', (req, res, p, s) => { auth.destroyOthers(s.id); json(res, 200, { ok: true }); });

// -------------------------------------------------------------------- dns --
// Which of our domains a request means (?domain= or a body field); the main one by default.
function pickDomain(v) {
  const c = cfg.load(), d = String(v || '').toLowerCase().trim();
  if (!d) return c.domain;
  if (!cfg.domains(c).includes(d)) fail(404, `${d} isn’t one of this server’s domains.`);
  return d;
}
route('GET', '/api/dns', async (req, res, p, s, url) => json(res, 200, await dns.desired(cfg.load(), pickDomain(url.searchParams.get('domain')))));
route('GET', '/api/dns/check', async (req, res, p, s, url) => json(res, 200, await dns.check(cfg.load(), pickDomain(url.searchParams.get('domain')))));
route('POST', '/api/cloudflare/connect', async (req, res) => {
  const b = await body(req, 10e3);
  try { const r = await cloudflare.connect(b.token); gate.forgetDns(); json(res, 200, { ok: true, ...r }); } catch (e) { fail(e.status || 502, e.message); }
});
route('GET', '/api/cloudflare/zones', async (req, res) => { try { json(res, 200, await cloudflare.zones()); } catch (e) { fail(e.status || 502, e.message); } });
route('GET', '/api/cloudflare/plan', async (req, res, p, s, url) => { const d = pickDomain(url.searchParams.get('domain')); try { json(res, 200, await cloudflare.plan(null, d)); } catch (e) { fail(e.status || 502, e.message); } });
route('POST', '/api/cloudflare/apply', async (req, res) => { const d = pickDomain((await body(req, 10e3)).domain); try { const r = await cloudflare.apply(null, d); gate.forgetDns(); json(res, 200, r); } catch (e) { fail(e.status || 502, e.message); } });

// ---------------------------------------------------------------- domains --
// Every domain delivers into the one mailbox (catch-all) and signs with its own DKIM key.
function domainList(c = cfg.load()) {
  return cfg.domains(c).map((d, i) => ({ domain: d, main: i === 0, at: (c.extraDomains.find(x => x.domain === d) || {}).at || 0,
    address: `${c.mailbox}@${d}`, cloudflare: !!cloudflare.zoneFor(c, d) }));
}
route('GET', '/api/domains', (req, res) => json(res, 200, { domains: domainList() }));
route('POST', '/api/domains', async (req, res) => {
  const b = await body(req, 10e3), c = cfg.load();
  const d = String(b.domain || '').toLowerCase().trim().replace(/^@/, '').replace(/\.$/, '');
  if (!isDomain(d)) fail(400, 'That doesn’t look like a domain name (for example example.com or mail.example.com).');
  if (cfg.domains(c).includes(d)) fail(409, `${d} is already set up.`);
  const r = await root('domain-add', [d, c.selector, cfg.address(c)]);
  if (r.code) fail(500, (r.err || r.out).trim() || 'Could not set up the domain.');
  cfg.update(x => { x.extraDomains = [...x.extraDomains.filter(e => e.domain !== d), { domain: d, at: Date.now() }]; });
  await cloudflare.remap(); gate.forgetDns();
  events.emit('changed');
  json(res, 200, { ok: true, domains: domainList() });
});
route('DELETE', '/api/domains/:d', async (req, res, p) => {
  const c = cfg.load(), d = String(p.d).toLowerCase();
  if (d === c.domain) fail(400, 'The main domain can’t be removed.');
  if (!c.extraDomains.some(e => e.domain === d)) fail(404, 'Not one of this server’s domains.');
  const r = await root('domain-remove', [d]);
  if (r.code) fail(500, (r.err || r.out).trim() || 'Could not remove the domain.');
  cfg.update(x => { x.extraDomains = x.extraDomains.filter(e => e.domain !== d); if (x.cloudflare.zones) delete x.cloudflare.zones[d]; });
  gate.forgetDns();
  json(res, 200, { ok: true, domains: domainList() });
});
route('POST', '/api/cloudflare/disconnect', (req, res) => { cloudflare.disconnect(); json(res, 200, { ok: true }); });

// ----------------------------------------------------------------- status --
route('GET', '/api/status', async (req, res) => json(res, 200, await status.overview()));
route('GET', '/api/status/blocklists', async (req, res) => json(res, 200, await status.blocklists()));
route('GET', '/api/queue', async (req, res) => json(res, 200, await status.queue()));
route('POST', '/api/queue', async (req, res) => {
  const b = await body(req);
  let r;
  if (b.action === 'flush') r = await root('queue-flush');
  else if (b.action === 'delete' && (b.id === 'ALL' || /^[A-F0-9]{6,20}$/.test(String(b.id)))) r = await root('queue-delete', [b.id]);
  else fail(400, 'Unknown queue action.');
  if (r.code) fail(500, (r.err || r.out).trim() || 'Failed.');
  json(res, 200, { ok: true });
});
route('GET', '/api/log', async (req, res, p, s, url) => {
  res.writeHead(200, { ...SEC, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(await status.log(+url.searchParams.get('n') || 300));
});
route('POST', '/api/services/restart', async (req, res) => {
  const b = await body(req);
  if (!['postfix', 'opendkim', 'tunnel'].includes(b.name)) fail(400, 'Unknown service.');
  const r = await root('restart', [b.name === 'tunnel' ? (cfg.load().tunnelUnit || 'selfmail-tunnel') : b.name]);
  if (r.code) fail(500, (r.err || r.out).trim());
  json(res, 200, { ok: true });
});
route('GET', '/api/events', (req, res) => events.attach(req, res));

// ------------------------------------------------------------ the gate --
route('GET', '/health', (req, res) => json(res, 200, { app: 'selfmail', ok: true, version: VERSION }), { open: true });
route('POST', '/api/notify', async (req, res, p, s) => {
  if (!s.host) fail(403, 'Only apps on this machine (with the gate’s key) can send alerts.');
  try { json(res, 200, await gate.notify(await body(req, 2e6))); } catch (e) { fail(e.status || 502, e.message); }
});
route('POST', '/api/host/unlink', (req, res, p, s) => {
  if (!s.host) fail(403, 'Only the gate itself can unlink.');
  cfg.update(x => { x.hostKey = ''; });
  json(res, 200, { ok: true });
});
route('GET', '/api/host/overview', async (req, res, p, s, url) => json(res, 200, await gate.overview(url.searchParams.get('fresh') === '1')));

// ---------------------------------------------------------------- statics --
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const staticCache = new Map();
function serveStatic(req, res, file, base = '/') {
  const fp = path.join(PUBLIC, file);
  if (!fp.startsWith(PUBLIC + path.sep)) return false;
  let hit = staticCache.get(fp);
  if (!hit || !IS_PROD) {
    try { const buf = fs.readFileSync(fp); hit = { buf, etag: '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 16) + '"' }; } catch (e) { return false; }
    if (file === 'index.html') hit.buf = Buffer.from(hit.buf.toString('utf8').replaceAll('{{V}}', VERSION));
    staticCache.set(fp, hit);
  }
  if (file === 'index.html') hit = { buf: Buffer.from(hit.buf.toString('utf8').replace('<head>', `<head><base href="${base}">`)), etag: hit.etag.slice(0, -1) + base.length + '"' };
  const headers = { ...SEC, 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream', ETag: hit.etag, 'Cache-Control': file === 'index.html' ? 'no-store' : IS_PROD ? 'public, max-age=31536000, immutable' : 'no-cache' };
  if (file === 'index.html') headers['Content-Security-Policy'] = APP_CSP;
  if (req.headers['if-none-match'] === hit.etag) { res.writeHead(304, headers); return res.end(), true; }
  res.writeHead(200, headers); res.end(hit.buf); return true;
}

// ---------------------------------------------------------------- dispatch --
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  const c = cfg.load();
  // The public webhook hostname exists for the relay only: nothing else is served there.
  if (c.webhookHosts.includes(host) && !url.pathname.startsWith('/inbound/')) return json(res, 404, { error: 'not found' });

  for (const r of routes) {
    if (r.method !== req.method && !(r.method === 'GET' && req.method === 'HEAD')) continue;
    const m = r.re.exec(url.pathname); if (!m) continue;
    const p = {}; r.keys.forEach((k, i) => { p[k] = decodeURIComponent(m[i + 1]); });
    let s = null;
    if (!r.open) {
      s = gate.isHost(req, c) ? { id: 'host', user: Object.keys(auth.users())[0] || c.mailbox, host: true } : auth.get(req);
      if (!s) return json(res, 401, { error: 'Please sign in.' });
      // Cross-site requests can't set custom headers without a preflight we never approve.
      if (req.method !== 'GET' && req.headers['x-selfmail'] !== '1') return json(res, 403, { error: 'Missing request header.' });
      // Nothing but the agreement itself until it's signed (incoming mail keeps arriving meanwhile).
      if (!(c.agreement && c.agreement.version >= agreement.VERSION) && !['/api/state', '/api/agreement', '/api/logout', '/api/events', '/api/host/overview'].includes(url.pathname)) {
        return json(res, 403, { error: 'Please read and sign the responsible-use agreement first.', needsAgreement: true });
      }
    } else if (req.method === 'POST' && url.pathname === '/api/login' && req.headers['x-selfmail'] !== '1') {
      return json(res, 403, { error: 'Missing request header.' });
    }
    return r.handler(req, res, p, s, url);
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      // Under a gate's dashboard (/__gate/selfmail/) every link must stay below that path.
      const base = String(req.headers['x-selfmail-base'] || '');
      return serveStatic(req, res, 'index.html', gate.isHost(req, c) && /^\/[\w/-]{0,80}\/$/.test(base) ? base : '/');
    }
    if (/^\/assets\/[\w.-]+$/.test(url.pathname) && serveStatic(req, res, url.pathname.slice(8))) return;
  }
  json(res, 404, { error: 'not found' });
}

function onRequest(req, res) {
  Promise.resolve(handle(req, res)).catch(e => {
    const code = e.status || 500;
    if (code >= 500) console.error(`${req.method} ${req.url}: ${e.stack || e.message}`);
    if (!res.headersSent) json(res, code, { error: code >= 500 && !(e instanceof HttpError) ? 'Something went wrong on the server: ' + e.message : e.message, diagnosis: e.diagnosis });
    else try { res.end(); } catch (x) { /* closed */ }
  });
}

// ------------------------------------------------------------- background --
// Direct mode: Postfix drops new mail into Maildir new/ — tell open browsers at once.
function watchInbox() {
  try {
    const dir = path.join(md.folderPath('inbox'), 'new');
    fs.mkdirSync(dir, { recursive: true });
    fs.watch(dir, { persistent: false }, (ev, name) => { if (ev === 'rename' && name && !name.startsWith('.')) events.emit('new', {}); });
  } catch (e) { console.error('watch: ' + e.message); }
}
// Keep the A and SPF records in step with a changing home IP.
async function ipWatch() {
  const c = cfg.load();
  if (!c.autoIp || !c.cloudflare.token) return;
  const ip = await status.publicIp();
  if (!ip || ip === c.publicIp) return;
  console.log(`public IP changed ${c.publicIp} -> ${ip}: updating DNS`);
  cfg.update(x => { x.spfIp = x.spfIp || x.publicIp; x.publicIp = ip; });
  for (const d of cfg.domains()) {
    if (!cloudflare.zoneFor(cfg.load(), d)) continue;
    const r = await cloudflare.apply(['a', 'spf'], d).catch(e => ({ ok: false, error: e.message }));
    console.log(`DNS update for ${d}: ` + (r.ok ? 'done' : (r.error || JSON.stringify(r.results?.filter(x => !x.done)))));
  }
}

function listenAddrs(c) {
  if (c.listen === 'all') return ['::'];
  if (c.listen === 'localhost') return ['127.0.0.1', '::1'];
  if (c.listen && c.listen !== 'private') return String(c.listen).split(',').map(s => s.trim()).filter(Boolean);
  // Loopback plus every private/LAN/VPN address. Never a wildcard: many home
  // connections have a global IPv6 on the same interface, and a wildcard bind
  // would put the UI on the open internet.
  const out = new Set(['127.0.0.1', '::1']);
  const priv = a => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|f[cd])/i.test(a);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if (/^fe[89ab]/i.test(a.address)) continue;
    if (a.internal || priv(a.address)) out.add(a.address);
  }
  return [...out];
}

if (require.main === module) {
  const c = cfg.load();
  if (!c.inboundSecret) cfg.update(x => { x.inboundSecret = token(24); });
  if (c.webhookUrl) { try { const h = new URL(c.webhookUrl).hostname; if (!c.webhookHosts.includes(h)) cfg.update(x => { x.webhookHosts.push(h); }); } catch (e) { /* ignore */ } }
  if (!Object.keys(auth.users()).length) console.warn('No accounts yet. Create one with:  sudo selfmail passwd <name>');
  md.ensure().catch(e => console.error('maildir: ' + e.message));
  store.all().then(r => console.log(`index ready: ${r.length} messages`)).catch(e => console.error('index: ' + e.message));
  watchInbox();
  setInterval(() => ipWatch().catch(e => console.error('ipWatch: ' + e.message)), 10 * 60e3).unref();
  setInterval(() => outbound.watch(), 5 * 60e3).unref();
  setTimeout(() => outbound.watch(), 60e3).unref();
  setTimeout(() => ipWatch().catch(() => {}), 30e3).unref();
  for (const addr of listenAddrs(c)) {
    const srv = http.createServer(onRequest);
    srv.headersTimeout = 30e3; srv.requestTimeout = 300e3;
    srv.on('error', e => console.log(`skipped ${addr} (${e.code})`));
    srv.listen(+process.env.SELFMAIL_PORT || c.port, addr, () => console.log(`selfmail ${VERSION} on ${addr.includes(':') ? `[${addr}]` : addr}:${+process.env.SELFMAIL_PORT || c.port}`));
  }
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { store.flush(); process.exit(0); });
}

module.exports = { onRequest, routes };
