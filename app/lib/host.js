'use strict';
// selfmail as an addon of an Aegis × Burrow gate: the gate's own requests carry
// x-selfmail-key (from this machine only), get a monitoring overview for its
// dashboard, and other addons (Bulwark) can send the owner an alert email.
const cfg = require('./config');
const dns = require('./dns');
const status = require('./status');
const store = require('./store');
const mailer = require('./send');
const cloudflare = require('./cloudflare');
const { safeEqual } = require('./util');

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
/** True when a request comes from this machine with the gate's key. */
function isHost(req, c = cfg.load()) {
  const k = String(req.headers['x-selfmail-key'] || '');
  return !!(c.hostKey && k && LOOPBACK.has(req.socket.remoteAddress) && safeEqual(k, c.hostKey));
}

// ---- alerts from other addons ----
const sentBy = new Map();   // app -> [timestamps]
const PER_HOUR = 30;
async function notify(b) {
  const c = cfg.load();
  const app = String(b.app || '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,29}$/.test(app)) throw Object.assign(new Error('Say which app is sending ("app": "bulwark").'), { status: 400 });
  const now = Date.now(), list = (sentBy.get(app) || []).filter(t => now - t < 3600e3);
  if (list.length >= PER_HOUR) throw Object.assign(new Error(`${app} already sent ${PER_HOUR} emails this hour.`), { status: 429 });
  const subject = String(b.subject || '').trim().slice(0, 200);
  if (!subject) throw Object.assign(new Error('An alert needs a subject.'), { status: 400 });
  const level = ['info', 'warn', 'critical'].includes(b.level) ? b.level : 'info';
  const name = app.replace(/(^|-)([a-z])/g, (_, s, ch) => (s ? ' ' : '') + ch.toUpperCase());
  const r = await mailer.send({
    from: `${app}@${c.domain}`, fromName: name, to: String(b.to || cfg.address(c)).slice(0, 300),
    subject: (level === 'critical' ? '🚨 ' : level === 'warn' ? '⚠️ ' : '') + subject,
    text: String(b.text || '').slice(0, 200e3), html: b.html ? String(b.html).slice(0, 500e3) : '', noSentCopy: true,
  });
  list.push(now); sentBy.set(app, list);
  return { ok: true, id: r.id || '', via: r.via };
}

// ---- the overview for the gate's dashboard ----
let dnsCache = { at: 0, val: {} }, blCache = { at: 0, val: null }, ovCache = { at: 0, val: null, busy: null };
async function dnsAll(c) {
  if (Date.now() - dnsCache.at < 15 * 60e3) return dnsCache.val;
  const out = {};
  for (const d of cfg.domains(c)) {
    try { const r = await dns.check(c, d); out[d] = { ok: r.ok, total: r.total, bad: r.records.filter(x => x.status !== 'ok').map(x => `${x.type} ${x.name}`) }; }
    catch (e) { out[d] = { ok: 0, total: 0, error: e.message }; }
  }
  dnsCache = { at: Date.now(), val: out };
  return out;
}
async function lists() {
  if (blCache.val && Date.now() - blCache.at < 30 * 60e3) return blCache.val;
  const r = await status.blocklists().catch(() => null);
  blCache = { at: Date.now(), val: r };
  return r;
}
function mailStats(rows) {
  const day = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const today = day(Date.now()), week = [];
  for (let i = 6; i >= 0; i--) week.push({ day: today - i * 864e5, in: 0, out: 0 });
  let unread = 0, total = 0, lastIn = 0;
  for (const r of rows) {
    if (r.folder === 'inbox') { total++; if (r.unread) unread++; lastIn = Math.max(lastIn, r.date); }
    const w = week.find(x => x.day === day(r.date)); if (!w) continue;
    if (r.folder === 'sent') w.out++; else if (!['drafts', 'trash'].includes(r.folder)) w.in++;
  }
  return { unread, inbox: total, lastIn, today: { in: week[6].in, out: week[6].out }, week };
}
function problems(o) {
  const p = [], s = o.services;
  for (const n of ['postfix', 'opendkim']) if (s[n] !== 'active') p.push({ key: 'svc-' + n, level: 'critical', title: `${n === 'postfix' ? 'Postfix' : 'OpenDKIM'} isn’t running`, body: n === 'postfix' ? 'No mail goes out or comes in directly until it runs again.' : 'Outgoing mail isn’t signed, so it may land in spam.' });
  if (s.postfix === 'active' && o.smtp && !o.smtp.ok) p.push({ key: 'smtp', level: 'critical', title: 'The mail server doesn’t answer', body: o.smtp.detail || '' });
  if (o.mode === 'relay' && s.tunnel !== 'active' && s.tunnel !== 'n/a' && o.webhook?.ok === false) p.push({ key: 'hook', level: 'critical', title: 'Incoming mail can’t reach this server', body: o.webhook.detail });
  else if (o.webhook?.ok === false) p.push({ key: 'hook', level: 'critical', title: 'Incoming mail can’t reach this server', body: o.webhook.detail });
  const old = (o.queue.items || []).filter(q => q.queue === 'deferred' && Date.now() - q.at > 30 * 60e3);
  if (old.length) p.push({ key: 'queue', level: 'warn', title: `${old.length} message${old.length > 1 ? 's are' : ' is'} stuck in the queue`, body: (old[0].to?.[0]?.reason || '').slice(0, 200) });
  if ((o.outbound25 === false || o.outbound25?.ok === false) && o.outbound?.mode === 'direct') p.push({ key: 'port25', level: 'warn', title: 'Port 25 out is blocked', body: 'Mail can’t be delivered directly. Add a relay as a backup in Settings → Sending.' });
  const listed = (o.blocklists?.results || []).filter(r => r.status === 'listed');
  if (listed.length) p.push({ key: 'bl', level: 'warn', title: `This server’s IP is on ${listed.map(r => r.name).join(', ')}`, body: 'Some providers may refuse or junk your mail.' });
  for (const [d, r] of Object.entries(o.dnsByDomain || {})) if (r.total && r.ok < r.total) p.push({ key: 'dns-' + d, level: 'warn', title: `${r.total - r.ok} DNS record${r.total - r.ok > 1 ? 's' : ''} for ${d} need attention`, body: (r.bad || []).slice(0, 3).join(', ') });
  if (o.disk && o.disk.free / o.disk.total < 0.05) p.push({ key: 'disk', level: 'warn', title: 'Disk almost full', body: `${(o.disk.free / 1e9).toFixed(1)} GB left.` });
  if (!o.agreement) p.push({ key: 'agree', level: 'info', title: 'Sign the responsible-use agreement', body: 'Web mail opens after it’s signed.' });
  return p;
}
async function build() {
  const c = cfg.load();
  const [st, rows, dnsByDomain, bl] = await Promise.all([status.overview(), store.all(), dnsAll(c), lists()]);
  const o = {
    version: require('../package.json').version, address: cfg.address(c), mode: c.mode, at: Date.now(),
    domains: cfg.domains(c).map((d, i) => ({ domain: d, main: !i, cloudflare: !!cloudflare.zoneFor(c, d), dns: dnsByDomain[d] || null })),
    services: st.services, smtp: st.smtp, webhook: st.webhook, ip: st.ip, ptr: st.ptr, outbound25: st.outbound25, disk: st.disk,
    queue: { total: st.queue.items.length, deferred: st.queue.items.filter(q => q.queue === 'deferred').length, items: st.queue.items.slice(0, 20) },
    outbound: { mode: c.outbound.mode, active: c.outbound.active, host: c.outbound.host, port: c.outbound.using || c.outbound.port },
    mail: mailStats(rows), blocklists: bl ? { ip: bl.ip, results: bl.results.map(r => ({ name: r.name, status: r.status, lists: r.lists })) } : null,
    agreement: !!(c.agreement && c.agreement.version >= 1), cloudflare: !!c.cloudflare.token, dnsByDomain,
  };
  o.problems = problems({ ...o, queue: st.queue, blocklists: bl });
  delete o.dnsByDomain;
  return o;
}
async function overview(fresh = false) {
  if (!fresh && ovCache.val && Date.now() - ovCache.at < 30e3) return ovCache.val;
  if (!ovCache.busy) ovCache.busy = build().then(v => { ovCache = { at: Date.now(), val: v, busy: null }; return v; }, e => { ovCache.busy = null; throw e; });
  return ovCache.busy;
}
function forgetDns() { dnsCache.at = 0; }

module.exports = { isHost, notify, overview, forgetDns };
