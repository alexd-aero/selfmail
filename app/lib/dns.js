'use strict';
// The DNS records this server needs, generated from the live settings, and a
// checker that asks public resolvers directly (a local stub can cache "doesn't
// exist" for minutes after you add a record).
const fs = require('fs');
const path = require('path');
const { Resolver } = require('dns').promises;
const cfg = require('./config');
const { root } = require('./util');

const pub = new Resolver({ timeout: 4000, tries: 2 });
try { pub.setServers(['1.1.1.1', '8.8.8.8', '9.9.9.9']); } catch (e) { /* keep system */ }

let dkimCache = { key: '', at: 0 };
/** Public DKIM key as one "v=DKIM1; k=rsa; p=..." string. */
async function dkimRecord(c = cfg.load()) {
  const k = `${c.domain}/${c.selector}`;
  if (dkimCache.key === k && dkimCache.val && Date.now() - dkimCache.at < 600e3) return dkimCache.val;
  let txt = '';
  try { txt = fs.readFileSync(path.join(cfg.ETC, 'dkim.txt'), 'utf8'); } catch (e) { /* ask root */ }
  if (!txt) { const r = await root('dkim-public', [c.domain, c.selector]); if (r.code === 0) txt = r.out; }
  const parts = (txt.match(/"([^"]*)"/g) || []).map(s => s.slice(1, -1));
  const val = (parts.length ? parts.join('') : txt.trim()).replace(/\s+/g, ' ').replace(/;\s*/g, '; ').trim();
  dkimCache = { key: k, val, at: Date.now() };
  return val;
}

const RELAY_MX = [{ host: 'mx1.forwardemail.net', prio: 10 }, { host: 'mx2.forwardemail.net', prio: 20 }];

/** Our SPF mechanisms merged into whatever SPF record already exists. */
function spfValue(c, existing = '') {
  const keep = String(existing || '').trim().startsWith('v=spf1') ? existing.trim().split(/\s+/).slice(1) : [];
  let mech = keep.filter(m => !/^[~?+-]?all$/i.test(m) && !/^redirect=/i.test(m));
  if (c.spfIp && c.spfIp !== c.publicIp) mech = mech.filter(m => m !== `ip4:${c.spfIp}`);   // our previous IP
  if (c.publicIp && !mech.includes(`ip4:${c.publicIp}`)) mech.unshift(`ip4:${c.publicIp}`);
  const inc = (c.outbound?.mode === 'relay' && c.outbound.spfInclude) ? `include:${c.outbound.spfInclude}` : '';
  if (inc && !mech.includes(inc)) mech.push(inc);
  const all = (keep.find(m => /^[~?+-]?all$/i.test(m)) || '~all');
  return ['v=spf1', ...mech, all].join(' ');
}

/** The full list of records, with plain-language notes. */
async function desired(c = cfg.load()) {
  const recs = [];
  if (c.mxhost && c.publicIp) recs.push({ key: 'a', type: 'A', name: c.mxhost, content: c.publicIp, note: 'This server’s address. On Cloudflare it must be grey-cloud (“DNS only”).' });
  if (c.mode === 'relay') {
    for (const [i, m] of RELAY_MX.entries()) recs.push({ key: 'mx' + (i + 1), type: 'MX', name: c.domain, content: m.host, priority: m.prio, note: i ? 'Backup relay.' : 'Forward Email takes mail on port 25 for you and posts it to this server.' });
    recs.push({ key: 'hook', type: 'TXT', name: c.domain, content: 'forward-email=' + (cfg.webhookEndpoint(c) || 'https://YOUR-PUBLIC-URL/inbound/SECRET'), note: 'Tells the relay where to deliver. Keep it separate from the SPF record.' });
  } else {
    recs.push({ key: 'mx1', type: 'MX', name: c.domain, content: c.mxhost, priority: 10, note: 'Mail is delivered straight to this server on port 25.' });
  }
  recs.push({ key: 'spf', type: 'TXT', name: c.domain, content: spfValue(c), note: 'Allows this server to send for @' + c.domain + '.' });
  const dk = await dkimRecord(c);
  recs.push({ key: 'dkim', type: 'TXT', name: `${c.selector}._domainkey.${c.domain}`, content: dk || '(no DKIM key found on this server)', note: 'Lets receivers check that mail really came from you.' });
  recs.push({ key: 'dmarc', type: 'TXT', name: `_dmarc.${c.domain}`, content: `v=DMARC1; p=${c.dmarcPolicy || 'none'}${c.dmarcRua ? `; rua=mailto:${c.dmarcRua}` : ''}`, note: 'Tells receivers what to do with mail that fails the checks.' });
  return recs;
}

const unq = s => String(s).replace(/^"|"$/g, '').replace(/"\s*"/g, '');
const host = s => String(s).replace(/\.$/, '').toLowerCase();

async function check(c = cfg.load()) {
  const recs = await desired(c);
  const out = [];
  for (const r of recs) {
    const row = { ...r, status: 'missing', found: '', detail: '' };
    try {
      if (r.type === 'A') {
        const v = await pub.resolve4(r.name); row.found = v.join(', ');
        row.status = v.includes(r.content) ? 'ok' : 'wrong';
        if (row.status === 'wrong') row.detail = v.some(ip => /^(104\.|172\.6[4-7]\.|188\.114\.)/.test(ip)) ? 'Points at Cloudflare — switch the record to “DNS only” (grey cloud).' : 'Points somewhere else.';
      } else if (r.type === 'MX') {
        const v = await pub.resolveMx(r.name); row.found = v.map(x => `${x.priority} ${x.exchange}`).join(', ');
        row.status = v.some(x => host(x.exchange) === host(r.content)) ? 'ok' : 'wrong';
      } else {
        const v = (await pub.resolveTxt(r.name)).map(x => x.join(''));
        row.found = v.join('  |  ');
        if (r.key === 'spf') {
          const spf = v.filter(x => x.startsWith('v=spf1'));
          if (spf.length > 1) { row.status = 'wrong'; row.detail = 'There is more than one SPF record. Receivers then ignore SPF entirely — merge them into one.'; }
          else if (spf.length) { row.status = c.publicIp && spf[0].split(/\s+/).includes(`ip4:${c.publicIp}`) ? 'ok' : 'wrong'; if (row.status === 'wrong') row.detail = `The SPF record doesn’t include ip4:${c.publicIp}.`; }
        } else if (r.key === 'dkim') {
          const want = (/p=([A-Za-z0-9+/=]+)/.exec(r.content) || [])[1];
          row.status = want && v.some(x => x.replace(/\s+/g, '').includes(want)) ? 'ok' : v.length ? 'wrong' : 'missing';
          if (row.status === 'wrong') row.detail = 'A DKIM record exists but holds a different key.';
        } else if (r.key === 'hook') {
          const hook = v.filter(x => x.startsWith('forward-email='));
          row.status = hook.some(x => unq(x).trim() === r.content) ? 'ok' : hook.length ? 'wrong' : 'missing';
        } else if (r.key === 'dmarc') {
          row.status = v.some(x => x.startsWith('v=DMARC1')) ? 'ok' : 'missing';
        }
      }
    } catch (e) {
      row.detail = ['ENOTFOUND', 'ENODATA'].includes(e.code) ? '' : String(e.code || e.message);
    }
    out.push(row);
  }
  return { records: out, ok: out.filter(r => r.status === 'ok').length, total: out.length };
}

module.exports = { desired, check, dkimRecord, spfValue, RELAY_MX, unq, host, pub };
