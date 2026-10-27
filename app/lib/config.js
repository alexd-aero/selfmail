'use strict';
// Settings live in one JSON file (/etc/selfmail/config.json), owned by the
// service user and readable by nobody else: it holds the webhook secret and,
// if linked, the Cloudflare API token.
const fs = require('fs');
const path = require('path');

const ETC = process.env.SELFMAIL_ETC || '/etc/selfmail';
const VAR = process.env.SELFMAIL_VAR || '/var/lib/selfmail';
const FILE = path.join(ETC, 'config.json');

const DEFAULTS = {
  domain: '',              // right-hand side of addresses, e.g. mail.example.com
  mxhost: '',              // this server's name, used as the SMTP HELO name
  mailbox: 'admin',        // local part of the mailbox everything is delivered to
  selector: 'mail',        // DKIM selector
  fromName: '',
  signature: '',
  publicIp: '',
  autoIp: false,           // keep A + SPF in step with the public IP (needs Cloudflare)
  mode: 'relay',           // inbound: 'relay' (webhook) | 'direct' (own port 25)
  webhookUrl: '',          // public base URL that reaches /inbound, e.g. https://mailhook.example.com
  inboundSecret: '',
  webhookHosts: [],        // host names that may ONLY reach /inbound (the public tunnel)
  outbound: { mode: 'direct', host: '', port: 'auto', using: 0, user: '', spfInclude: '', active: 'direct', notes: [] },   // mode direct|auto|relay; the relay password lives in Postfix's sasl_passwd only
  agreement: null,         // { version, name, at, ip, isp, ... } once the responsible-use agreement is signed
  dmarcPolicy: 'none',
  dmarcRua: '',
  port: 8088,
  listen: 'private',       // 'private' (loopback + LAN/VPN addresses) | 'localhost' | 'all' | "ip,ip"
  mailroot: '/var/mail/vhosts',
  extraDomains: [],        // more domains delivered into the same mailbox: [{ domain, at }]
  hostKey: '',             // set when an Aegis × Burrow gate hosts selfmail (x-selfmail-key on its requests)
  cloudflare: { token: '', zoneId: '', zoneName: '', account: '', zones: {} },   // zones: { domain: { id, name } } for the other domains
};

function merge(def, val) {
  if (Array.isArray(def)) return Array.isArray(val) ? val : def.slice();
  if (def && typeof def === 'object') {
    const out = {};
    const v = val && typeof val === 'object' && !Array.isArray(val) ? val : {};
    for (const k of Object.keys(def)) out[k] = merge(def[k], v[k]);
    for (const k of Object.keys(v)) if (!(k in out)) out[k] = v[k];
    return out;
  }
  return val === undefined || val === null ? def : val;
}

let cache = null, stamp = 0;
function load() {
  try {
    const st = fs.statSync(FILE);
    if (!cache || st.mtimeMs !== stamp) {
      cache = merge(DEFAULTS, JSON.parse(fs.readFileSync(FILE, 'utf8')));
      stamp = st.mtimeMs;
    }
  } catch (e) {
    if (!cache) cache = merge(DEFAULTS, {});
  }
  return cache;
}

function save(next) {
  fs.mkdirSync(ETC, { recursive: true });
  const tmp = FILE + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, FILE);
  cache = next;
  stamp = fs.statSync(FILE).mtimeMs;
  return next;
}

function update(fn) { const c = JSON.parse(JSON.stringify(load())); fn(c); return save(c); }

const address = (c = load()) => `${c.mailbox}@${c.domain}`;
/** Every domain this server takes mail for: the main one first. */
const domains = (c = load()) => [c.domain, ...(c.extraDomains || []).map(d => d.domain)].filter(Boolean).map(d => d.toLowerCase());
/** The domain an address belongs to, if it's one of ours (longest match wins: a.example.com before example.com). */
const domainOf = (addr, c = load()) => { const a = String(addr || '').toLowerCase(); return domains(c).filter(d => a.endsWith('@' + d)).sort((x, y) => y.length - x.length)[0] || ''; };
const webhookEndpoint = (c = load()) => c.webhookUrl && c.inboundSecret ? `${c.webhookUrl.replace(/\/+$/, '')}/inbound/${c.inboundSecret}` : '';

module.exports = { ETC, VAR, FILE, DEFAULTS, load, save, update, address, domains, domainOf, webhookEndpoint };
