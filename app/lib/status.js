'use strict';
// Health checks, written to answer "is mail working, and if not, why?" in plain words.
const fs = require('fs');
const net = require('net');
const dnsP = require('dns').promises;
const { Resolver } = dnsP;
const cfg = require('./config');
const { run, root, isIPv4 } = require('./util');
const send = require('./send');
const outbound = require('./outbound');

async function publicIp() {
  for (const u of ['https://api.ipify.org', 'https://ipv4.icanhazip.com']) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(6000) }); const t = (await r.text()).trim(); if (isIPv4(t)) return t; } catch (e) { /* next */ }
  }
  return '';
}

async function unit(name) { const r = await run('systemctl', ['is-active', name], { timeout: 5000 }); return r.out.trim() || 'unknown'; }
/** selfmail's own Cloudflare tunnel, if it has one: 'n/a' when none is configured or the service doesn't exist. */
async function tunnelState(c) {
  if (c.mode !== 'relay' || !c.tunnelUnit) return 'n/a';
  const r = await run('systemctl', ['show', '-p', 'LoadState', '--value', c.tunnelUnit], { timeout: 5000 });
  if (r.out.trim() === 'not-found') return 'n/a';
  return unit(c.tunnelUnit);
}

function tcp(host, port, ms = 6000) {
  return new Promise(resolve => {
    const s = net.createConnection({ host, port, family: 4 });
    const done = ok => { try { s.destroy(); } catch (e) { /* gone */ } resolve(ok); };
    s.setTimeout(ms); s.on('connect', () => done(true)); s.on('timeout', () => done(false)); s.on('error', () => done(false));
  });
}

async function reverse(ip) {
  if (!ip) return { names: [], confirmed: false };
  try {
    const names = await dnsP.reverse(ip);
    let confirmed = false;
    for (const n of names) { try { if ((await dnsP.resolve4(n)).includes(ip)) confirmed = true; } catch (e) { /* no A */ } }
    return { names, confirmed };
  } catch (e) { return { names: [], confirmed: false }; }
}

async function queue() {
  const r = await run('postqueue', ['-j'], { timeout: 10000 });
  const items = r.out.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean)
    .map(q => ({ id: q.queue_id, queue: q.queue_name, at: q.arrival_time * 1000, size: q.message_size, from: q.sender, to: (q.recipients || []).map(x => ({ address: x.address, reason: x.delay_reason || '' })) }));
  return { ok: r.code === 0, items, error: r.code ? (r.err || r.out).trim().slice(0, 300) : '' };
}

async function webhook(c) {
  const ep = cfg.webhookEndpoint(c);
  if (c.mode !== 'relay' || !ep) return { ok: null, detail: c.mode === 'relay' ? 'No public webhook URL is set.' : 'Not used in direct mode.' };
  try {
    const r = await fetch(ep + '/ping', { signal: AbortSignal.timeout(12000) });
    const j = await r.json().catch(() => ({}));
    return { ok: !!j.ready, detail: j.ready ? 'The relay can reach this server.' : `The public URL answered ${r.status}.` };
  } catch (e) { return { ok: false, detail: 'The public URL did not answer: ' + (e.cause?.code || e.message) }; }
}

async function overview() {
  const c = cfg.load();
  const [postfix, opendkim, tunnel, smtp, ip, q, hook] = await Promise.all([
    unit('postfix'), unit('opendkim'), tunnelState(c),
    send.probe(8000), publicIp(), queue(), webhook(c),
  ]);
  const [ptr, out25] = await Promise.all([reverse(ip), c.outbound?.active === 'relay' ? Promise.resolve(null) : outbound.direct25()]);
  let disk = null;
  try { const s = fs.statfsSync(c.mailroot); disk = { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch (e) { /* old node */ }
  return {
    services: { postfix, opendkim, tunnel, tunnelUnit: c.tunnelUnit || '' },
    smtp: { ...smtp, detail: send.explain(smtp) },
    ip: { current: ip, configured: c.publicIp, matches: !ip || ip === c.publicIp },
    ptr, outbound25: out25, queue: q, webhook: hook, disk,
    outbound: c.outbound,
  };
}

// ---- blocklists ----
const LISTS = [
  { id: 'spamhaus', name: 'Spamhaus ZEN', zone: 'zen.spamhaus.org', remove: 'https://check.spamhaus.org/', authoritative: true },
  { id: 'barracuda', name: 'Barracuda', zone: 'b.barracudacentral.org', remove: 'https://www.barracudacentral.org/rbl/removal-request' },
  { id: 'spamcop', name: 'SpamCop', zone: 'bl.spamcop.net', remove: 'https://www.spamcop.net/bl.shtml', note: 'Clears itself within 24 hours of the spam stopping.' },
  { id: 'uceprotect', name: 'UCEPROTECT L1', zone: 'dnsbl-1.uceprotect.net', remove: 'https://www.uceprotect.net/en/rblcheck.php', note: 'Clears itself after 7 days. Never pay for “express delisting”.' },
  { id: 'psbl', name: 'PSBL', zone: 'psbl.surriel.com', remove: 'https://psbl.org/' },
  { id: 'mailspike', name: 'Mailspike', zone: 'bl.mailspike.net', remove: 'https://mailspike.org/iplookup.html' },
  { id: 'sorbs', name: 'SORBS', zone: 'dnsbl.sorbs.net', remove: 'http://www.sorbs.net/lookup.shtml' },
];
const SPAMHAUS = {
  '127.0.0.2': ['SBL', 'Spamhaus Block List — a known spam source or spam operation.'],
  '127.0.0.3': ['CSS', 'Spam was seen coming from this IP recently. Common for home connections that send mail directly — fix the cause (or send through a relay), then request removal.'],
  '127.0.0.4': ['XBL', 'Infected or proxy traffic was seen from this IP (bots, proxy apps, malware). Remove the cause, then request removal.'],
  '127.0.0.9': ['DROP', 'A hijacked network range.'],
  '127.0.0.10': ['PBL', 'A home (residential) range. Not a penalty — it just means “shouldn’t send mail directly”. Microsoft rejects mail from PBL addresses; Spamhaus lets you remove your own IP for free.'],
  '127.0.0.11': ['PBL', 'A home (residential) range. Not a penalty — it just means “shouldn’t send mail directly”. Microsoft rejects mail from PBL addresses; Spamhaus lets you remove your own IP for free.'],
};

let spamhausNs = null;
async function spamhausResolver() {
  if (spamhausNs) return spamhausNs;
  const names = await dnsP.resolveNs('zen.spamhaus.org');
  const ips = [];
  for (const n of names.slice(0, 3)) { try { ips.push(...await dnsP.resolve4(n)); } catch (e) { /* skip */ } }
  const r = new Resolver({ timeout: 5000, tries: 2 }); r.setServers(ips.slice(0, 3));
  spamhausNs = r; setTimeout(() => { spamhausNs = null; }, 3600e3).unref();
  return r;
}

async function blocklists(ip) {
  ip = ip || cfg.load().publicIp || await publicIp();
  if (!isIPv4(ip)) return { ip, results: [] };
  const rev = ip.split('.').reverse().join('.');
  const pub = new Resolver({ timeout: 5000, tries: 2 }); pub.setServers(['1.1.1.1', '8.8.8.8']);
  const results = await Promise.all(LISTS.map(async l => {
    const base = { id: l.id, name: l.name, remove: l.remove, note: l.note || '' };
    try {
      // Spamhaus refuses queries relayed by public resolvers (answers 127.255.255.254), so ask its own servers.
      const R = l.authoritative ? await spamhausResolver() : pub;
      const codes = await R.resolve4(`${rev}.${l.zone}`);
      if (codes.some(x => x.startsWith('127.255.255.'))) return { ...base, status: 'unknown', detail: 'The list refused to answer this query.' };
      if (l.id === 'spamhaus') {
        const lists = [...new Set(codes.map(x => SPAMHAUS[x]?.[0]).filter(Boolean))];
        const onlyPbl = lists.every(x => x === 'PBL');
        return { ...base, status: onlyPbl ? 'info' : 'listed', codes, lists, detail: [...new Set(codes.map(x => SPAMHAUS[x]?.[1]).filter(Boolean))].join(' ') };
      }
      return { ...base, status: 'listed', codes, detail: '' };
    } catch (e) {
      if (['ENOTFOUND', 'ENODATA'].includes(e.code)) return { ...base, status: 'clean' };
      return { ...base, status: 'unknown', detail: e.code || e.message };
    }
  }));
  return { ip, results };
}

async function log(n = 300) { const r = await root('log', [Math.min(2000, Math.max(20, n | 0))]); return r.code === 0 ? r.out : (r.err || r.out || 'The mail log could not be read.'); }

module.exports = { overview, blocklists, queue, publicIp, log, reverse };
