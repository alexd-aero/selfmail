'use strict';
// Turns raw messages into what the UI shows. mailparser does the hard parts
// correctly - every charset (UTF-8, ISO-8859-x, Windows-125x, Shift_JIS ...),
// quoted-printable and base64, encoded-word headers, nested multiparts,
// attachments and inline (cid:) images - which is exactly what the old
// hand-written parser got wrong (emoji and symbols came out as "ðŸ˜€").
const { simpleParser } = require('mailparser');
const { escHtml } = require('./util');

const PARSE_OPTS = { skipImageLinks: true, keepCidLinks: true, maxHtmlLengthToParse: 4e6 };

const addrList = v => {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.flatMap(x => (x.value || [])).flatMap(a => a.group ? a.group : [a])
    .filter(a => a.address || a.name).map(a => ({ name: a.name || '', address: (a.address || '').toLowerCase() }));
};

function snippetOf(m) {
  let t = m.text || '';
  if (!t && m.html) t = String(m.html).replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
  return t.replace(/\[(image|cid):[^\]]*\]/gi, '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

/** The address a catch-all message was actually sent to. */
function recipientOf(m, domain) {
  const doms = (Array.isArray(domain) ? domain : [domain]).filter(Boolean).map(d => '@' + String(d).toLowerCase());
  const ours = a => doms.some(d => String(a).toLowerCase().replace(/[<>\s]/g, '').endsWith(d));
  const h = m.headers;
  for (const k of ['x-original-to', 'delivered-to', 'x-forwarded-to', 'envelope-to']) {
    const v = h.get(k); const s = (Array.isArray(v) ? v[0] : v);
    const a = typeof s === 'string' ? s : s?.value?.[0]?.address || s?.text;
    if (a && ours(a)) return String(a).toLowerCase().replace(/[<>]/g, '').trim();
  }
  for (const a of [...addrList(m.to), ...addrList(m.cc)]) if (ours(a.address)) return a.address;
  return '';
}

/** Header summary for the message list (cached by the index). */
async function summarize(raw, domain) {
  const m = await simpleParser(raw, { ...PARSE_OPTS, skipHtmlToText: false, skipTextToHtml: true, skipTextLinks: true });
  const from = addrList(m.from)[0] || { name: '', address: '' };
  return {
    from, to: addrList(m.to), cc: addrList(m.cc),
    subject: m.subject || '',
    date: (m.date && !isNaN(m.date)) ? m.date.getTime() : 0,
    snippet: snippetOf(m),
    attach: (m.attachments || []).some(a => a.contentDisposition !== 'inline' || !a.cid),
    msgid: m.messageId || '', inReplyTo: m.inReplyTo || '',
    refs: Array.isArray(m.references) ? m.references : (m.references ? [m.references] : []),
    rcpt: recipientOf(m, domain),
    size: raw.length,
  };
}

function authResults(m) {
  const raw = [].concat(m.headers.get('authentication-results') || []).join(' ; ');
  const pick = k => { const x = new RegExp(`\\b${k}=(\\w+)`, 'i').exec(raw); return x ? x[1].toLowerCase() : ''; };
  return { spf: pick('spf'), dkim: pick('dkim'), dmarc: pick('dmarc') };
}

// Strip the dangerous parts even though the frame can't run scripts anyway
// (it is sandboxed and served with a no-script CSP): defence in depth.
function cleanHtml(html) {
  return String(html)
    .replace(/<(script|iframe|frame|frameset|object|embed|applet|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|iframe|frame|object|embed|applet|link|base|meta)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|action|formaction|background)\s*=\s*(["']?)\s*(javascript|vbscript|data:text\/html)[^"'\s>]*\2/gi, '$1="#"')
    .replace(/<form\b/gi, '<div data-form').replace(/<\/form>/gi, '</div>');
}

const REMOTE_RE = /(<img\b[^>]*\bsrc\s*=\s*["']?\s*https?:|url\(\s*["']?\s*https?:|<image\b[^>]*https?:|\bbackground\s*=\s*["']?\s*https?:)/i;

// Plain text that is laid out with spaces (tables, ASCII art, code) needs a
// fixed-width font, or the columns fall apart.
function looksMonospace(text) {
  const lines = String(text || '').split('\n').slice(0, 400);
  let hits = 0;
  for (const l of lines) if (/ {3,}\S/.test(l.trimStart() === l ? l : l.trim()) || /[│┃┌┐└┘├┤┬┴┼─━═║╔╗╚╝]|^[\s|+\-=_*#]{8,}$|\|.*\|.*\|/.test(l)) hits++;
  return hits >= 3 && hits / Math.max(1, lines.length) > 0.12;
}

const FRAME_STYLE = `
:root{color-scheme:light}
html,body{margin:0;padding:0;background:#fff}
body{padding:22px 26px;color:#1f2328;font:15px/1.6 -apple-system,"Segoe UI",Roboto,"Noto Sans",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji";overflow-wrap:anywhere;word-break:normal}
img{max-width:100%;height:auto}
table{max-width:100%}
a{color:#0b57d0}
blockquote{margin:0 0 0 .6em;padding-left:.9em;border-left:3px solid #d0d7de;color:#57606a}
pre,code{font-family:ui-monospace,"Cascadia Mono",Consolas,"DejaVu Sans Mono",monospace,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji";font-size:13.5px}
.sm-text{white-space:pre-wrap;margin:0;font:inherit}
.sm-text.mono{font-family:ui-monospace,"Cascadia Mono",Consolas,"DejaVu Sans Mono",monospace,"Segoe UI Emoji","Noto Color Emoji";font-size:13.5px;line-height:1.45;white-space:pre;overflow-x:auto}
.sm-text p{margin:0}
`;

/**
 * Builds the HTML document shown inside the reader's sandboxed frame.
 * Links open in a new tab; remote images stay blocked until the user allows them.
 */
function frameDoc(m, { images = false, mono = null } = {}) {
  let body, isText = false, monoOn = false;
  if (m.html) {
    let html = cleanHtml(m.html);
    // inline images: cid:xyz -> data: URI of that attachment
    const cids = new Map();
    for (const a of m.attachments || []) if (a.cid && a.content && a.content.length < 8e6) cids.set(a.cid.replace(/^<|>$/g, '').toLowerCase(), `data:${a.contentType || 'application/octet-stream'};base64,${a.content.toString('base64')}`);
    html = html.replace(/cid:([^"'\s)>]+)/gi, (all, id) => cids.get(decodeURIComponent(id).toLowerCase()) || all);
    body = html;
  } else {
    isText = true;
    const text = m.text || '';
    monoOn = mono === null ? looksMonospace(text) : !!mono;
    // textAsHtml escapes everything and turns URLs and emails into links
    body = `<div class="sm-text${monoOn ? ' mono' : ''}">${m.textAsHtml || escHtml(text)}</div>`;
  }
  const remote = !isText && REMOTE_RE.test(body);
  const img = images ? 'data: https: http:' : 'data:';
  const csp = `default-src 'none'; img-src ${img}; style-src 'unsafe-inline' ${images ? 'https: http:' : ''}; font-src data: ${images ? 'https: http:' : ''}; media-src data:`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><base target="_blank"><style>${FRAME_STYLE}</style></head><body>${body}</body></html>`;
  return { doc, remote, isText, mono: monoOn };
}

/** Everything the reader needs about one message. */
async function view(raw, domain) {
  const m = await simpleParser(raw, PARSE_OPTS);
  const atts = (m.attachments || []).map((a, i) => ({ i, name: a.filename || `attachment-${i + 1}`, type: a.contentType || 'application/octet-stream', size: a.size || (a.content ? a.content.length : 0), inline: !!(a.cid && a.contentDisposition === 'inline' && m.html && m.html.includes('cid:')), cid: a.cid || '' }));
  const unsub = [].concat(m.headers.get('list-unsubscribe') || []).join(', ');
  return {
    parsed: m,
    info: {
      from: addrList(m.from)[0] || { name: '', address: '' },
      to: addrList(m.to), cc: addrList(m.cc), replyTo: addrList(m.replyTo),
      subject: m.subject || '', date: m.date && !isNaN(m.date) ? m.date.getTime() : 0,
      msgid: m.messageId || '', inReplyTo: m.inReplyTo || '',
      refs: Array.isArray(m.references) ? m.references : (m.references ? [m.references] : []),
      rcpt: recipientOf(m, domain), auth: authResults(m),
      hasHtml: !!m.html, attachments: atts.filter(a => !a.inline),
      unsubscribe: (/<(https?:[^>]+)>/i.exec(unsub) || [])[1] || '',
      text: (m.text || '').slice(0, 400000),
    },
  };
}

async function attachment(raw, i) {
  const m = await simpleParser(raw, PARSE_OPTS);
  return (m.attachments || [])[i] || null;
}

module.exports = { summarize, view, frameDoc, attachment, snippetOf, addrList, looksMonospace };
