'use strict';
// Server-sent events: the UI keeps one /api/events stream open and refreshes
// the moment mail arrives, instead of polling.
const clients = new Set();
let pending = null;

function attach(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 4000\n\n');
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
}

/** Coalesces bursts (a bulk move fires many changes) into one event per 300 ms. */
function emit(type, data = {}) {
  if (type === 'new') return send('new', data);
  if (pending) return;
  pending = setTimeout(() => { pending = null; send('changed', {}); }, 300);
}
function send(type, data) { const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`; for (const c of clients) c.write(msg); }

module.exports = { attach, emit, send };
