'use strict';
// Cloudflare link: with an API token that can edit DNS for the zone, the app
// works out exactly which records to create, update or remove, shows that plan,
// and applies it only when asked. Records that have nothing to do with mail are
// never touched.
const cfg = require('./config');
const dns = require('./dns');

const API = 'https://api.cloudflare.com/client/v4';

async function call(token, method, path, body) {
  let r;
  try {
    r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  } catch (e) { throw new Error('Could not reach Cloudflare: ' + e.message); }
  const j = await r.json().catch(() => null);
  if (!j || !j.success) {
    const msg = (j?.errors || []).map(e => e.message).join('; ') || `HTTP ${r.status}`;
    throw Object.assign(new Error(/authentication|invalid.*token|9109|10000/i.test(msg) ? 'Cloudflare rejected the token. Check it was copied fully and has “Zone · DNS · Edit” permission.' : msg), { status: r.status === 403 || r.status === 401 ? 400 : 502 });
  }
  return j;
}

/** Every zone the token can see: [{ id, name, account }]. */
async function listZones(token) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const j = await call(token, 'GET', `/zones?per_page=50&page=${page}`);
    out.push(...(j.result || []).map(z => ({ id: z.id, name: z.name.toLowerCase(), account: z.account?.name || '' })));
    if (!j.result_info || page >= j.result_info.total_pages) break;
  }
  return out;
}
/** The zone that holds a domain (mail.example.com lives in example.com). */
const zoneOf = (zones, domain) => zones.filter(z => domain === z.name || domain.endsWith('.' + z.name)).sort((a, b) => b.name.length - a.name.length)[0] || null;

async function findZone(token, domain) {
  const z = zoneOf(await listZones(token), domain.toLowerCase());
  if (z) return z;
  throw Object.assign(new Error(`None of the zones this token can see contain ${domain}. Make sure the token’s “Zone Resources” include that domain.`), { status: 400 });
}

/** Map each of our domains to a zone of the token's. */
function mapZones(c, zones) {
  const map = {};
  for (const d of cfg.domains(c)) { const z = zoneOf(zones, d); if (z) map[d] = { id: z.id, name: z.name }; }
  return map;
}

/**
 * Checks the token and remembers it. Returns which of our domains it covers and the
 * zones it could also manage (so the page can offer to add them as mail domains).
 */
async function connect(token) {
  token = String(token || '').trim();
  if (!/^[A-Za-z0-9_\-]{30,}$/.test(token)) throw Object.assign(new Error('That doesn’t look like a Cloudflare API token.'), { status: 400 });
  const c = cfg.load();
  const zones = await listZones(token);
  if (!zones.length) throw Object.assign(new Error('Cloudflare accepted the token, but it can’t see any domain. Give it “Zone · Zone · Read” and “Zone · DNS · Edit” for your domains.'), { status: 400 });
  const map = mapZones(c, zones);
  for (const z of Object.values(map)) await call(token, 'GET', `/zones/${z.id}/dns_records?per_page=1`);   // proves DNS access
  const main = map[c.domain] || null;
  cfg.update(x => { x.cloudflare = { token, zoneId: main?.id || '', zoneName: main?.name || '', account: zones.find(z => z.id === main?.id)?.account || zones[0].account, zones: map }; });
  return { zone: main ? { id: main.id, name: main.name, account: zones.find(z => z.id === main.id)?.account || '' } : null, covers: Object.keys(map), zones: zones.map(z => z.name), suggest: suggestions(cfg.load(), zones) };
}
/** Zones the token sees that hold none of our domains yet. */
function suggestions(c, zones) {
  const ours = cfg.domains(c);
  return zones.filter(z => !ours.some(d => d === z.name || d.endsWith('.' + z.name))).map(z => ({ zone: z.name, account: z.account }));
}
async function zones() {
  const c = cfg.load();
  if (!c.cloudflare.token) throw Object.assign(new Error('Cloudflare is not connected.'), { status: 400 });
  const all = await listZones(c.cloudflare.token);
  const map = mapZones(c, all);
  cfg.update(x => { x.cloudflare.zones = map; });
  return { zones: all.map(z => z.name), covers: Object.keys(map), suggest: suggestions(c, all) };
}
/** Re-map after domains change (quietly; a domain outside the token's zones simply isn't covered). */
async function remap() { const c = cfg.load(); if (c.cloudflare.token) await zones().catch(() => {}); }
function zoneFor(c, domain) {
  if (domain === c.domain && c.cloudflare.zoneId) return { id: c.cloudflare.zoneId, name: c.cloudflare.zoneName };
  return (c.cloudflare.zones || {})[domain] || null;
}
function disconnect() { cfg.update(x => { x.cloudflare = { token: '', zoneId: '', zoneName: '', account: '', zones: {} }; x.autoIp = false; }); }

async function existing(c, zoneId) {
  const out = []; let page = 1;
  for (;;) {
    const j = await call(c.cloudflare.token, 'GET', `/zones/${zoneId}/dns_records?per_page=500&page=${page}`);
    out.push(...j.result);
    if (!j.result_info || page >= j.result_info.total_pages) break;
    page++;
  }
  return out;
}

const same = (a, b) => dns.host(a) === dns.host(b);
const txt = r => dns.unq(r.content || '');

/**
 * Plan: [{ key, action: 'create'|'update'|'delete'|'ok'|'keep', type, name, content, priority?, before?, id? , why }]
 * `only` limits the plan to some record keys (used by the automatic IP updater).
 */
async function plan(only = null, domain = null) {
  const c = cfg.load();
  domain = domain || c.domain;
  if (!c.cloudflare.token) throw Object.assign(new Error('Cloudflare is not connected.'), { status: 400 });
  const zone = zoneFor(c, domain);
  if (!zone) throw Object.assign(new Error(`The Cloudflare token can’t manage ${domain}. Give it access to that zone, or add the records by hand.`), { status: 400 });
  const want = (await dns.desired(c, domain)).filter(r => !only || only.includes(r.key));
  const have = await existing(c, zone.id);
  const ops = [];
  const at = (type, name) => have.filter(r => r.type === type && same(r.name, name));

  for (const r of want) {
    if (r.key === 'hook' && !cfg.webhookEndpoint(c)) { ops.push({ key: r.key, action: 'skip', type: 'TXT', name: r.name, content: '', why: 'Set the public webhook URL in Settings → Receiving first' }); continue; }
    if (r.key === 'dkim' && !/p=/.test(r.content)) { ops.push({ key: r.key, action: 'skip', type: 'TXT', name: r.name, content: '', why: 'No DKIM key was found on this server' }); continue; }
    if (r.type === 'A') {
      const cur = at('A', r.name);
      if (!cur.length) ops.push({ key: r.key, action: 'create', type: 'A', name: r.name, content: r.content, why: 'Add this server’s address' });
      else {
        const [first, ...rest] = cur;
        if (first.content !== r.content || first.proxied) ops.push({ key: r.key, action: 'update', id: first.id, type: 'A', name: r.name, content: r.content, before: first.content + (first.proxied ? ' (proxied)' : ''), why: first.proxied ? 'Turn off the orange cloud and point at this server' : 'Point at this server’s current address' });
        else ops.push({ key: r.key, action: 'ok', type: 'A', name: r.name, content: r.content });
        for (const x of rest) ops.push({ key: r.key, action: 'delete', id: x.id, type: 'A', name: r.name, content: x.content, why: 'Extra address for the mail host' });
      }
    } else if (r.type === 'MX') {
      if (ops.some(o => o.type === 'MX' && same(o.name, r.name))) continue;   // handled as a set
      const wantMx = want.filter(x => x.type === 'MX' && same(x.name, r.name));
      const cur = at('MX', r.name);
      for (const w of wantMx) {
        const hit = cur.find(x => same(x.content, w.content));
        if (!hit) ops.push({ key: w.key, action: 'create', type: 'MX', name: w.name, content: w.content, priority: w.priority, why: 'Route incoming mail' });
        else if (hit.priority !== w.priority) ops.push({ key: w.key, action: 'update', id: hit.id, type: 'MX', name: w.name, content: w.content, priority: w.priority, before: `${hit.priority} ${hit.content}`, why: 'Fix the priority' });
        else ops.push({ key: w.key, action: 'ok', type: 'MX', name: w.name, content: w.content, priority: w.priority });
      }
      for (const x of cur) if (!wantMx.some(w => same(w.content, x.content))) ops.push({ key: 'mx-old', action: 'delete', id: x.id, type: 'MX', name: x.name, content: x.content, priority: x.priority, why: 'An old mail server record — mail would split between servers' });
    } else if (r.type === 'TXT') {
      const cur = at('TXT', r.name);
      const pick = r.key === 'spf' ? cur.filter(x => txt(x).startsWith('v=spf1')) : r.key === 'hook' ? cur.filter(x => txt(x).startsWith('forward-email=')) : r.key === 'dmarc' ? cur.filter(x => txt(x).startsWith('v=DMARC1')) : cur.filter(x => /v=DKIM1|k=rsa|p=/.test(txt(x)));
      let content = r.content;
      if (r.key === 'spf') content = dns.spfValue(c, pick[0] ? txt(pick[0]) : '');
      if (!pick.length) { ops.push({ key: r.key, action: 'create', type: 'TXT', name: r.name, content, why: { spf: 'Allow this server to send', dkim: 'Publish the signing key', dmarc: 'Add a DMARC policy', hook: 'Tell the relay where to deliver' }[r.key] }); continue; }
      const [first, ...rest] = pick;
      if (r.key === 'dmarc') { ops.push({ key: r.key, action: txt(first) === content ? 'ok' : 'keep', type: 'TXT', name: r.name, content: txt(first), why: 'Your existing DMARC policy is kept' }); }
      else if (txt(first).replace(/\s+/g, ' ') === content.replace(/\s+/g, ' ')) ops.push({ key: r.key, action: 'ok', type: 'TXT', name: r.name, content });
      else ops.push({ key: r.key, action: 'update', id: first.id, type: 'TXT', name: r.name, content, before: txt(first), why: r.key === 'spf' ? 'Add this server to your SPF record (other entries are kept)' : 'Replace with the current value' });
      for (const x of rest) ops.push({ key: r.key, action: 'delete', id: x.id, type: 'TXT', name: r.name, content: txt(x), why: r.key === 'spf' ? 'A second SPF record makes receivers ignore SPF' : 'Duplicate record' });
    }
  }
  return { zone: zone.name, domain, ops };
}

async function apply(only = null, domain = null) {
  const c = cfg.load();
  domain = domain || c.domain;
  const { ops } = await plan(only, domain);
  const zid = zoneFor(c, domain).id;
  const results = [];
  for (const o of ops) {
    if (o.action === 'ok' || o.action === 'keep' || o.action === 'skip') { results.push({ ...o, done: o.action !== 'skip' }); continue; }
    const body = { type: o.type, name: o.name, content: o.content, ttl: 1, ...(o.type === 'MX' ? { priority: o.priority } : {}), ...(o.type === 'A' ? { proxied: false } : {}), comment: 'selfmail' };
    try {
      if (o.action === 'create') await call(c.cloudflare.token, 'POST', `/zones/${zid}/dns_records`, body);
      else if (o.action === 'update') await call(c.cloudflare.token, 'PUT', `/zones/${zid}/dns_records/${o.id}`, body);
      else if (o.action === 'delete') await call(c.cloudflare.token, 'DELETE', `/zones/${zid}/dns_records/${o.id}`);
      results.push({ ...o, done: true });
    } catch (e) { results.push({ ...o, done: false, error: e.message }); }
  }
  if (domain === c.domain && results.some(r => r.key === 'spf' && r.done)) cfg.update(x => { x.spfIp = x.publicIp; });
  return { results, ok: results.every(r => r.done) };
}

module.exports = { connect, disconnect, plan, apply, findZone, zones, remap, zoneFor, listZones };
