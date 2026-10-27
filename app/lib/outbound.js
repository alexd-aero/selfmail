'use strict';
// How mail leaves this server, with automatic port fallbacks.
//
//   direct  — straight to each recipient's mail server on port 25 (the only port
//             mail servers accept mail from each other on)
//   auto    — direct, but a relay service is the backup: Postfix hands any
//             message it can't deliver directly to the relay, and if port 25 is
//             blocked altogether the watchdog sends everything through the relay
//   relay   — everything through a relay service (smarthost)
//
// Relays accept mail on the submission ports 587 (STARTTLS), 465 (TLS from the
// first byte) and 2525 (STARTTLS, for networks that block 587), sometimes 25.
// With port "auto" the first one that answers is used, and the watchdog moves
// to another if it stops answering.
const net = require('net');
const tls = require('tls');
const cfg = require('./config');
const { root, isDomain } = require('./util');

const ORDER = [587, 465, 2525, 25];
const BACKUP_ORDER = [587, 2525];   // a per-message backup must use STARTTLS (465 needs its own transport)

/** Connects and waits for the SMTP greeting ("220 ..."), not just an open port. */
function probe(host, port, ms = 7000) {
  return new Promise(resolve => {
    const t0 = Date.now(); let buf = '', done = false, s;
    const fin = (ok, extra = {}) => { if (done) return; done = true; try { s.destroy(); } catch (e) { /* gone */ } resolve({ port, ok, ms: Date.now() - t0, ...extra }); };
    const onData = d => { buf += d.toString('latin1'); if (buf.includes('\n')) { const l = buf.split('\n')[0].trim(); fin(/^220[ -]/.test(l), { banner: l.slice(0, 120) }); } };
    try {
      s = port === 465 ? tls.connect({ host, port, servername: host, family: 4 }) : net.createConnection({ host, port, family: 4 });
    } catch (e) { return fin(false, { error: e.message }); }
    s.setTimeout(ms);
    s.on('data', onData);
    s.on('timeout', () => fin(false, { error: buf ? 'no greeting' : 'no answer (blocked?)' }));
    s.on('error', e => fin(false, { error: e.code || e.message }));
  });
}
const probeAll = host => Promise.all(ORDER.map(p => probe(host, p)));

/** Can this machine reach other mail servers on port 25? (ISPs often block it.) */
async function direct25() {
  const r = await Promise.all([probe('gmail-smtp-in.l.google.com', 25), probe('mx1.forwardemail.net', 25)]);
  return r.some(x => x.ok);
}

function note(o, text) { o.notes = [{ at: Date.now(), text }, ...(o.notes || [])].slice(0, 12); console.log('outbound: ' + text); }

async function relaySet(host, port, user, role, pass = '') {
  const r = await root('relay-set', [host, port, user, role], { input: pass + '\n' });
  if (r.code) throw Object.assign(new Error('Postfix could not be changed: ' + (r.err || r.out).trim()), { status: 500 });
}

/** Applies a new sending setup from the Settings page. */
async function configure(b) {
  const mode = ['direct', 'auto', 'relay'].includes(b.mode) ? b.mode : 'direct';
  const cur = cfg.load().outbound || {};
  if (mode === 'direct') {
    const r = await root('relay-clear');
    if (r.code) throw Object.assign(new Error('Postfix could not be changed: ' + (r.err || r.out).trim()), { status: 500 });
    cfg.update(c => { c.outbound = { mode: 'direct', host: '', port: 'auto', using: 0, user: '', spfInclude: '', active: 'direct', notes: cur.notes || [] }; note(c.outbound, 'Sending directly on port 25.'); });
    return cfg.load().outbound;
  }
  const host = String(b.host || '').trim().toLowerCase(), user = String(b.user || '').trim();
  const port = b.port === 'auto' || !b.port ? 'auto' : +b.port;
  if (!isDomain(host)) throw Object.assign(new Error('Enter the relay server name, like smtp-relay.brevo.com.'), { status: 400 });
  if (port !== 'auto' && !ORDER.includes(port)) throw Object.assign(new Error('The port must be 587, 465, 2525 or 25.'), { status: 400 });
  if (!user || /[\s:]/.test(user)) throw Object.assign(new Error('Enter the relay username (no spaces).'), { status: 400 });
  if (!b.pass && cur.host !== host) throw Object.assign(new Error('Enter the relay password.'), { status: 400 });

  const probes = await probeAll(host);
  const okPorts = probes.filter(p => p.ok).map(p => p.port);
  const candidates = port === 'auto' ? (mode === 'auto' ? BACKUP_ORDER : ORDER) : [port];
  let using = candidates.find(p => okPorts.includes(p));
  if (!using && mode === 'auto' && port === 'auto' && okPorts.includes(465)) using = 465;   // only 465 answers: use it, the watchdog will switch fully if needed
  if (!using) throw Object.assign(new Error(`${host} didn't answer on ${candidates.join(', ')}. Check the name, or try another port.`), { status: 400, probes });

  let role = mode === 'relay' ? 'primary' : 'backup', active = mode === 'relay' ? 'relay' : 'direct';
  if (role === 'backup' && using === 465) { role = 'primary'; active = 'relay'; }   // 465 can't be a per-message backup
  if (mode === 'auto' && active === 'direct' && !(await direct25())) { role = 'primary'; active = 'relay'; }   // port 25 is blocked right now
  await relaySet(host, using, user, role, String(b.pass || ''));
  cfg.update(c => {
    c.outbound = { mode, host, port, using, user, spfInclude: String(b.spfInclude || '').trim().toLowerCase(), active, probes, checked: Date.now(), notes: cur.notes || [] };
    note(c.outbound, active === 'relay' ? `Sending through ${host} on port ${using}.` : `Sending directly; ${host} on port ${using} is the backup.`);
  });
  return cfg.load().outbound;
}

let running = false;
/** Runs every few minutes: keeps the relay on a port that answers, and switches between direct and relay in "auto" mode. */
async function watch() {
  if (running) return; running = true;
  try {
    const o = cfg.load().outbound || {};
    if (o.mode !== 'relay' && o.mode !== 'auto') return;
    const save = fn => cfg.update(c => { fn(c.outbound); c.outbound.checked = Date.now(); });
    if (o.mode === 'auto') {
      const open25 = await direct25();
      if (!open25 && o.active !== 'relay') {
        const all = await probeAll(o.host); const p = ORDER.find(n => all.some(x => x.port === n && x.ok));
        if (p) { await relaySet(o.host, p, o.user, 'primary'); save(x => { x.active = 'relay'; x.using = p; x.probes = all; note(x, `Port 25 is blocked — now sending everything through ${o.host} on port ${p}.`); }); }
        return;
      }
      if (open25 && o.active === 'relay') {
        const all = await probeAll(o.host); const p = BACKUP_ORDER.find(n => all.some(x => x.port === n && x.ok));
        if (p) { await relaySet(o.host, p, o.user, 'backup'); save(x => { x.active = 'direct'; x.using = p; x.probes = all; note(x, `Port 25 works again — sending directly, ${o.host} on port ${p} is the backup.`); }); }
        return;
      }
    }
    // keep the relay on a port that answers
    const cur = await probe(o.host, o.using);
    if (cur.ok) { save(() => {}); return; }
    const all = await probeAll(o.host);
    const order = o.port === 'auto' ? (o.active === 'relay' ? ORDER : BACKUP_ORDER) : [o.using];
    const p = order.find(n => n !== o.using && all.some(x => x.port === n && x.ok));
    if (p) {
      await relaySet(o.host, p, o.user, o.active === 'relay' ? 'primary' : 'backup');
      save(x => { x.using = p; x.probes = all; note(x, `Port ${o.using} on ${o.host} stopped answering — switched to port ${p}.`); });
    } else save(x => { x.probes = all; note(x, `${o.host} isn't answering on any port${o.port === 'auto' ? '' : ` (${o.using})`} — mail will wait in the queue until it does.`); });
  } catch (e) { console.error('outbound watch: ' + e.message); } finally { running = false; }
}

module.exports = { ORDER, probe, probeAll, direct25, configure, watch };
