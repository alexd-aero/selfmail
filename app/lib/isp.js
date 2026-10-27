'use strict';
// Who provides this server's internet connection — shown in the responsible-use
// agreement, because that provider is who acts on abuse coming from its addresses.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const FILE = path.join(cfg.VAR, 'isp.json');
// Brand sites for big providers (their network names rarely match their website).
const BRANDS = [
  [/google fiber/i, 'Google Fiber', 'fiber.google.com'], [/comcast|xfinity/i, 'Xfinity (Comcast)', 'xfinity.com'],
  [/charter|spectrum/i, 'Spectrum', 'spectrum.com'], [/at&t|att services|sbc/i, 'AT&T', 'att.com'], [/verizon/i, 'Verizon', 'verizon.com'],
  [/t-mobile|tmobile/i, 'T-Mobile', 't-mobile.com'], [/cox communications|cox\b/i, 'Cox', 'cox.com'], [/frontier/i, 'Frontier', 'frontier.com'],
  [/centurylink|lumen|qwest/i, 'CenturyLink', 'centurylink.com'], [/altice|optimum|cablevision|suddenlink/i, 'Optimum', 'optimum.com'],
  [/spacex|starlink/i, 'Starlink', 'starlink.com'], [/mediacom/i, 'Mediacom', 'mediacomcable.com'], [/windstream|kinetic/i, 'Kinetic (Windstream)', 'windstream.com'],
  [/astound|rcn|wave broadband|grande/i, 'Astound', 'astound.com'], [/sonic/i, 'Sonic', 'sonic.com'], [/wideopenwest|\bwow\b/i, 'WOW!', 'wowway.com'],
  [/ziply/i, 'Ziply Fiber', 'ziplyfiber.com'], [/metronet/i, 'Metronet', 'metronet.com'], [/brightspeed/i, 'Brightspeed', 'brightspeed.com'],
  [/british telecom|\bbt\b/i, 'BT', 'bt.com'], [/virgin media/i, 'Virgin Media', 'virginmedia.com'], [/sky (uk|broadband)/i, 'Sky', 'sky.com'],
  [/deutsche telekom/i, 'Telekom', 'telekom.de'], [/vodafone/i, 'Vodafone', 'vodafone.com'], [/orange/i, 'Orange', 'orange.com'],
  [/rogers/i, 'Rogers', 'rogers.com'], [/bell canada/i, 'Bell', 'bell.ca'], [/telus/i, 'TELUS', 'telus.com'], [/shaw/i, 'Shaw', 'shaw.ca'],
  [/rostelecom/i, 'Rostelecom', 'rt.ru'], [/telstra/i, 'Telstra', 'telstra.com.au'], [/jio|reliance/i, 'Jio', 'jio.com'],
];
const SECOND_LEVEL = /\.(co|com|net|org|ne|or|ac)\.[a-z]{2}$/i;
function registrable(host) {
  const parts = String(host || '').toLowerCase().replace(/\.$/, '').split('.');
  if (parts.length < 2) return '';
  return parts.slice(SECOND_LEVEL.test(host) ? -3 : -2).join('.');
}

async function getJson(url) { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); return r.json(); }
async function logoFor(domain) {
  for (const u of [`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`, `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`]) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
      const type = r.headers.get('content-type') || '';
      const buf = Buffer.from(await r.arrayBuffer());
      if (r.ok && /^image\//.test(type) && buf.length > 120 && buf.length < 200e3) return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
    } catch (e) { /* next source */ }
  }
  return '';
}

/** { ip, name, network, asn, domain, hostname, logo } — cached for a day. */
async function detect(force = false) {
  try {
    const c = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!force && Date.now() - c.at < 864e5 && c.name) return c;
  } catch (e) { /* none yet */ }
  let info = {};
  try { info = await getJson('http://ip-api.com/json/?fields=status,query,isp,org,as,reverse'); } catch (e) { /* try the next */ }
  if (info.status !== 'success') {
    try { const j = await getJson('https://ipinfo.io/json'); info = { query: j.ip, isp: String(j.org || '').replace(/^AS\d+\s+/, ''), as: j.org, reverse: j.hostname }; } catch (e) { /* offline */ }
  }
  const network = info.isp || info.org || '';
  const brand = BRANDS.find(([re]) => re.test(`${network} ${info.org || ''} ${info.as || ''}`));
  const name = brand ? brand[1] : network.replace(/,?\s+(inc|llc|ltd|corp|corporation|co)\.?$/i, '') || 'your internet provider';
  const domain = brand ? brand[2] : registrable(info.reverse);
  const out = { at: Date.now(), ip: info.query || '', name, network, asn: (/^AS\d+/.exec(info.as || '') || [''])[0], hostname: info.reverse || '', domain, logo: domain ? await logoFor(domain) : '' };
  try { fs.mkdirSync(cfg.VAR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(out)); } catch (e) { /* read-only */ }
  return out;
}

module.exports = { detect, registrable };
