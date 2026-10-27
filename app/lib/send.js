'use strict';
// Sending: build the message once (MailComposer), keep a copy in Sent, and hand
// it to the local Postfix, which DKIM-signs it and delivers (directly or through
// the configured relay). If smtpd doesn't answer, fall back to the sendmail
// binary, which queues through postdrop and never touches smtpd.
const fs = require('fs');
const net = require('net');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const cfg = require('./config');
const store = require('./store');
const { isEmail } = require('./util');

const smtp = nodemailer.createTransport({ host: '127.0.0.1', port: 25, secure: false, ignoreTLS: true, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 60000 });

function sendmailPath() {
  for (const p of ['/usr/sbin/sendmail', '/usr/lib/sendmail', '/usr/bin/sendmail']) { try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (e) { /* next */ } }
  return '';
}
const unreachable = e => ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED', 'EDNS'].includes(e?.code) || /greeting never received|connection timeout|socket close/i.test(e?.message || '');

function splitAddrs(v) {
  return String(v || '').split(/[,;\n]/).map(s => s.trim()).filter(Boolean).map(s => {
    const m = /^(.*)<([^>]+)>\s*$/.exec(s);
    return m ? { name: m[1].trim().replace(/^"|"$/g, ''), address: m[2].trim() } : { name: '', address: s };
  });
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ').replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, t) => (t.replace(/<[^>]+>/g, '').trim() === href ? href : `${t} (${href})`))
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Probes 127.0.0.1:25 and reads the greeting, to tell "not running" from "running but stalled". */
function probe(ms = 8000) {
  return new Promise(resolve => {
    const t0 = Date.now(); let buf = '', done = false;
    const s = net.createConnection({ host: '127.0.0.1', port: 25 });
    const fin = r => { if (done) return; done = true; try { s.destroy(); } catch (e) { /* gone */ } resolve({ ...r, ms: Date.now() - t0 }); };
    s.setTimeout(ms);
    s.on('data', d => { buf += d.toString('latin1'); if (buf.includes('\n')) { const l = buf.split('\n')[0].trim(); fin({ ok: /^220[ -]/.test(l), banner: l, code: /^220/.test(l) ? '' : 'NOTSMTP' }); } });
    s.on('timeout', () => fin({ ok: false, banner: buf.trim(), code: 'NOGREETING' }));
    s.on('error', e => fin({ ok: false, banner: '', code: e.code || 'ERROR', detail: e.message }));
  });
}
function explain(p) {
  if (p.ok) return '';
  if (p.code === 'NOGREETING') return 'Postfix accepted the connection but never said hello. It asks OpenDKIM about every connection first, so a stuck OpenDKIM causes this. Try: sudo systemctl restart opendkim';
  if (p.code === 'ECONNREFUSED') return 'Nothing is listening on port 25, so Postfix is not running. Try: sudo systemctl restart postfix';
  if (p.code === 'NOTSMTP') return `Something other than Postfix answers on port 25 ("${p.banner.slice(0, 80)}"). Check: sudo ss -lntp | grep :25`;
  return `Could not reach 127.0.0.1:25 (${p.code}).`;
}

async function send(b) {
  const c = cfg.load();
  const fromAddr = String(b.from || cfg.address(c)).trim().toLowerCase();
  if (!fromAddr.endsWith('@' + c.domain)) throw Object.assign(new Error(`You can only send from an @${c.domain} address (otherwise DKIM can't sign it).`), { status: 400 });
  const to = splitAddrs(b.to), cc = splitAddrs(b.cc), bcc = splitAddrs(b.bcc);
  const rcpts = [...to, ...cc, ...bcc];
  if (!rcpts.length) throw Object.assign(new Error('Add at least one recipient.'), { status: 400 });
  const bad = rcpts.find(a => !isEmail(a.address));
  if (bad) throw Object.assign(new Error(`“${bad.address}” isn't a valid email address.`), { status: 400 });

  const html = b.html ? String(b.html) : '';
  const text = b.text ? String(b.text) : htmlToText(html);
  const attachments = (Array.isArray(b.attachments) ? b.attachments : []).slice(0, 20).map(a => ({
    filename: String(a.name || 'file').slice(0, 200), contentType: String(a.type || 'application/octet-stream'), content: Buffer.from(String(a.data || ''), 'base64'),
  }));
  if (attachments.reduce((n, a) => n + a.content.length, 0) > 24e6) throw Object.assign(new Error('Attachments are larger than 24 MB.'), { status: 400 });

  const mail = {
    from: { name: b.fromName ?? c.fromName ?? '', address: fromAddr },
    to, cc: cc.length ? cc : undefined, bcc: bcc.length ? bcc : undefined,
    subject: String(b.subject || ''),
    text, html: html || undefined, attachments,
    inReplyTo: b.inReplyTo || undefined,
    references: b.references || b.inReplyTo || undefined,
    headers: { 'X-Mailer': 'selfmail 2' },
    textEncoding: 'quoted-printable',
  };
  // Same Message-ID and Date for both builds: recipients get a copy WITHOUT the Bcc
  // header; only our own Sent copy keeps it.
  mail.messageId = `<${require('crypto').randomBytes(12).toString('hex')}@${c.domain}>`;
  mail.date = new Date();
  const raw = await new MailComposer(mail).compile().build();
  const forSent = new MailComposer(mail).compile(); forSent.keepBcc = true;
  const rawSent = await forSent.build();
  const envelope = { from: fromAddr, to: rcpts.map(a => a.address) };

  let via = 'smtp', response = '';
  try {
    const info = await smtp.sendMail({ envelope, raw });
    response = info.response;
  } catch (e) {
    if (!unreachable(e)) throw Object.assign(new Error(e.response || e.message), { status: 502 });
    const bin = sendmailPath();
    if (!bin) { const p = await probe(); throw Object.assign(new Error(e.message), { status: 502, diagnosis: explain(p) }); }
    const alt = nodemailer.createTransport({ sendmail: true, path: bin, newline: 'unix' });
    try { await alt.sendMail({ envelope, raw }); via = 'sendmail'; response = 'queued through sendmail (Postfix’s SMTP port did not answer)'; }
    catch (e2) { const p = await probe(); throw Object.assign(new Error(e2.message), { status: 502, diagnosis: explain(p) }); }
  }
  const saved = await store.store('sent', rawSent, 'S');
  if (b.answering) await store.mark([b.answering], 'R', '').catch(() => {});
  return { ok: true, via, response, id: saved.id };
}

module.exports = { send, probe, explain, htmlToText, splitAddrs };
