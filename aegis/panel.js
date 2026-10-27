// selfmail's card on the Burrow page. The host calls card(ctx) on every paint
// (synchronous, from what was last fetched) and wire(el, ctx) after it.
// ctx.api talks to /__gate/api/x/selfmail/…, which the extension proxies to selfmail.

const S = { ov: null, at: 0, loading: false, error: null, busy: "" };
const OPEN = "/__gate/selfmail/";
const LOGO = '<svg viewBox="0 0 64 64"><defs><linearGradient id="smg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset=".55" stop-color="#1e3a8a"/><stop offset="1" stop-color="#0e7490"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#smg)"/><rect x="14" y="19" width="36" height="26" rx="4" fill="none" stroke="#fff" stroke-width="4"/><path d="m16 22 16 11 16-11" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CF = '<svg viewBox="0 0 64 32" width="20" height="10"><path fill="#f6821f" d="M43.6 22.4l.5-1.7c.6-2 .4-3.8-.6-5.1-.9-1.2-2.3-1.9-4.1-2l-17.4-.2c-.2 0-.3-.2-.2-.4.1-.2.2-.3.4-.3l17.6-.2c2.1-.1 4.3-1.8 5.1-3.8l1-2.6C44.6 2.5 40.4 0 35.6 0c-5.5 0-10.2 3.6-11.9 8.5-1.1-.8-2.5-1.3-4-1.1-2.6.3-4.7 2.4-5 5-.1.7 0 1.3.1 2C10.5 14.5 7 18.1 7 22.5c0 .4 0 .8.1 1.2 0 .2.2.3.3.3h35.5c.2 0 .4-.1.4-.3z"/></svg>';

const style = document.createElement("style");
style.textContent = `
.sm { padding:0; overflow:hidden; border-color:rgba(59,130,246,.28); margin-bottom:14px;
  background:radial-gradient(120% 140% at 0% 0%, rgba(59,130,246,.10), transparent 55%), radial-gradient(90% 120% at 100% 100%, rgba(14,116,144,.10), transparent 60%), var(--card,#0b1220); }
.sm-head { display:flex; align-items:center; gap:13px; padding:16px 18px; }
.sm-logo { width:36px; height:36px; flex:none; filter:drop-shadow(0 6px 14px rgba(30,58,138,.5)); }
.sm-head .grow { flex:1; min-width:0; }
.sm-name { font-weight:650; letter-spacing:-.01em; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.sm-sub { color:var(--muted); font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sm-acts { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.sm-probs { border-top:1px solid var(--line); }
.sm-prob { display:flex; gap:10px; align-items:baseline; padding:9px 18px; font-size:13px; border-bottom:1px solid var(--line); }
.sm-prob:last-child { border-bottom:0; }
.sm-prob.critical { background:rgba(248,113,113,.08); }
.sm-prob.warn { background:rgba(251,191,36,.06); }
.sm-prob .faint { color:var(--faint); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; flex:1; }
.sm-grid { display:grid; grid-template-columns:1.25fr 1fr; gap:1px; background:var(--line); border-top:1px solid var(--line); }
.sm-cell { background:var(--card,#0b1220); padding:14px 18px; min-width:0; }
.sm-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:12px 10px; }
.sm-stat b { font-size:19px; font-weight:700; display:block; letter-spacing:-.02em; }
.sm-stat b.hot { color:#f87171; } .sm-stat b.good { color:#34d399; } .sm-stat b.warm { color:#fbbf24; }
.sm-stat span { font-size:10.5px; color:var(--faint); text-transform:uppercase; letter-spacing:.06em; }
.sm-chart { margin-top:12px; }
.sm-chart svg { width:100%; height:64px; display:block; }
.sm-legend { display:flex; gap:12px; font-size:11px; color:var(--faint); margin-top:4px; }
.sm-legend i { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:5px; vertical-align:middle; }
.sm-h { font-size:10.5px; color:var(--faint); text-transform:uppercase; letter-spacing:.07em; margin:0 0 8px; font-weight:650; }
.sm-svc { display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; font-size:12.5px; }
.sm-svc div { display:flex; align-items:center; gap:7px; min-width:0; }
.sm-svc div span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--muted); }
.sm-dot { width:8px; height:8px; border-radius:50%; flex:none; background:#64748b; }
.sm-dot.ok { background:#34d399; box-shadow:0 0 0 3px rgba(52,211,153,.15); }
.sm-dot.warn { background:#fbbf24; box-shadow:0 0 0 3px rgba(251,191,36,.14); }
.sm-dot.bad { background:#f87171; box-shadow:0 0 0 3px rgba(248,113,113,.15); }
.sm-doms { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
.sm-dom { display:inline-flex; align-items:center; gap:6px; padding:4px 9px; border-radius:9px; border:1px solid var(--line); font:12px ui-monospace,monospace; color:inherit; text-decoration:none; }
.sm-dom:hover { border-color:rgba(59,130,246,.5); }
.sm-dom em { font-style:normal; color:var(--faint); font-family:inherit; }
.sm-dom.add { border-style:dashed; color:var(--muted); font-family:inherit; }
.sm-foot { display:flex; gap:8px; align-items:center; padding:10px 18px; border-top:1px solid var(--line); font-size:12px; color:var(--faint); flex-wrap:wrap; }
.sm-foot .grow { flex:1; }
@media (max-width:820px){ .sm-grid{grid-template-columns:1fr;} .sm-head{flex-wrap:wrap;} .sm-acts{width:100%; justify-content:flex-start;} }`;
document.head.appendChild(style);

const fmt = (n) => (n == null ? "–" : n >= 1e4 ? (n / 1e3).toFixed(1) + "k" : Math.round(n).toLocaleString());
const gb = (b) => (b / 1e9 >= 100 ? Math.round(b / 1e9) : (b / 1e9).toFixed(1)) + " GB";

function load(ctx, fresh) {
  if (S.loading || (!fresh && Date.now() - S.at < 20000)) return;
  S.loading = true;
  ctx.api("/overview" + (fresh ? "?fresh=1" : ""))
    .then((ov) => { S.ov = ov; S.error = null; })
    .catch((e) => { S.error = e.message; })
    .finally(() => { S.at = Date.now(); S.loading = false; ctx.render(); });
}

function chart(week) {
  const W = 300, H = 64, n = week.length, max = Math.max(4, ...week.map((d) => Math.max(d.in, d.out)));
  const bw = W / n, y = (v) => H - 4 - (v / max) * (H - 12);
  let bars = "";
  week.forEach((d, i) => {
    const x = i * bw;
    bars += `<rect x="${x + bw * 0.16}" y="${y(d.in)}" width="${bw * 0.32}" height="${H - 4 - y(d.in)}" rx="2" fill="url(#smIn)"><title>${new Date(d.day).toLocaleDateString([], { weekday: "short" })}: ${d.in} in</title></rect>`;
    bars += `<rect x="${x + bw * 0.52}" y="${y(d.out)}" width="${bw * 0.32}" height="${H - 4 - y(d.out)}" rx="2" fill="#14b8a6" opacity=".85"><title>${d.out} sent</title></rect>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="smIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs>
    <line x1="0" y1="${H - 4}" x2="${W}" y2="${H - 4}" stroke="currentColor" opacity=".12"/>${bars}</svg>`;
}

export function card(ctx) {
  load(ctx);
  const o = S.ov, h = ctx.h;
  if (!o) {
    return `<section class="card sm"><div class="sm-head"><div class="sm-logo">${LOGO}</div><div class="grow"><div class="sm-name">selfmail</div>
      <div class="sm-sub">${S.error ? `selfmail isn't answering (${h(S.error)}).` : "Reading your mail server…"}</div></div>
      <div class="sm-acts"><a class="btn sm primary" href="${OPEN}" target="_blank" rel="noopener">Open web mail</a></div></div></section>`;
  }
  const crit = o.problems.filter((p) => p.level === "critical"), warn = o.problems.filter((p) => p.level === "warn");
  const dnsOk = o.domains.reduce((a, d) => a + (d.dns?.ok || 0), 0), dnsTotal = o.domains.reduce((a, d) => a + (d.dns?.total || 0), 0);
  const listed = (o.blocklists?.results || []).filter((r) => r.status === "listed");
  const svc = (name, state) => `<div><span class="sm-dot ${state === "active" ? "ok" : state === "n/a" ? "" : "bad"}"></span><span>${h(name)}</span><span>${h(state === "active" ? "running" : state)}</span></div>`;
  const state = crit.length ? `<span class="pill err">${crit.length} critical</span>` : warn.length ? `<span class="pill warn">${warn.length} to check</span>` : `<span class="pill ok">healthy</span>`;
  const week = o.mail.week || [];
  return `<section class="card sm">
    <div class="sm-head"><div class="sm-logo">${LOGO}</div>
      <div class="grow"><div class="sm-name">selfmail <span class="pill">v${h(o.version)}</span>${state}</div>
        <div class="sm-sub">${h(o.address)} · ${o.domains.length} domain${o.domains.length > 1 ? "s" : ""} · incoming via ${o.mode === "relay" ? "relay" : "port 25"} · sending ${h(o.outbound.active === "relay" ? "through " + (o.outbound.host || "a relay") : "directly")}</div></div>
      <div class="sm-acts">
        <button class="btn sm" data-sm="refresh" ${S.busy ? "disabled" : ""}>${S.busy === "refresh" ? "Checking…" : "Check now"}</button>
        <a class="btn sm" href="${OPEN}#/status" target="_blank" rel="noopener">Status</a>
        <a class="btn sm primary" href="${OPEN}" target="_blank" rel="noopener">Open web mail</a></div></div>
    ${o.problems.length ? `<div class="sm-probs">${o.problems.slice(0, 4).map((p) => `<div class="sm-prob ${h(p.level)}"><span class="pill ${p.level === "critical" ? "err" : p.level === "warn" ? "warn" : ""}">${h(p.level)}</span><b>${h(p.title)}</b><span class="faint">${h(p.body || "")}</span></div>`).join("")}</div>` : ""}
    <div class="sm-grid">
      <div class="sm-cell">
        <div class="sm-stats">
          <div class="sm-stat"><b>${fmt(o.mail.unread)}</b><span>unread</span></div>
          <div class="sm-stat"><b>${fmt(o.mail.today.in)}</b><span>received today</span></div>
          <div class="sm-stat"><b>${fmt(o.mail.today.out)}</b><span>sent today</span></div>
          <div class="sm-stat"><b class="${o.queue.deferred ? "warm" : ""}">${fmt(o.queue.total)}</b><span>queued${o.queue.deferred ? ` · ${o.queue.deferred} waiting` : ""}</span></div>
          <div class="sm-stat"><b class="${dnsTotal && dnsOk === dnsTotal ? "good" : "warm"}">${dnsTotal ? `${dnsOk}/${dnsTotal}` : "–"}</b><span>DNS records ok</span></div>
          <div class="sm-stat"><b class="${listed.length ? "hot" : "good"}">${o.blocklists ? (listed.length ? listed.length : "clean") : "–"}</b><span>${listed.length ? "blocklists" : "blocklists"}</span></div>
        </div>
        ${week.length ? `<div class="sm-chart">${chart(week)}<div class="sm-legend"><span><i style="background:#3b82f6"></i>received</span><span><i style="background:#14b8a6"></i>sent</span><span style="margin-left:auto">last 7 days</span></div></div>` : ""}
      </div>
      <div class="sm-cell">
        <p class="sm-h">Services</p>
        <div class="sm-svc">
          ${svc("Postfix", o.services.postfix)}${svc("OpenDKIM", o.services.opendkim)}
          <div><span class="sm-dot ${o.smtp?.ok ? "ok" : "bad"}"></span><span>SMTP</span><span>${o.smtp?.ok ? `answers in ${o.smtp.ms} ms` : "no answer"}</span></div>
          <div><span class="sm-dot ${o.outbound25 === false || o.outbound25?.ok === false ? "warn" : "ok"}"></span><span>Port 25 out</span><span>${o.outbound25 === false || o.outbound25?.ok === false ? "blocked" : "open"}</span></div>
          ${o.mode === "relay" ? `<div><span class="sm-dot ${o.webhook?.ok ? "ok" : o.webhook?.ok === false ? "bad" : ""}"></span><span>Incoming</span><span>${o.webhook?.ok ? "relay reaches you" : o.webhook?.ok === false ? "relay can't reach you" : "no public URL"}</span></div>` : ""}
          ${o.disk ? `<div><span class="sm-dot ${o.disk.free / o.disk.total < 0.05 ? "bad" : "ok"}"></span><span>Disk</span><span>${gb(o.disk.free)} free</span></div>` : ""}
        </div>
        <div class="sm-doms">${o.domains.map((d) => `<a class="sm-dom" href="${OPEN}#/domain" target="_blank" rel="noopener" title="${d.dns ? `${d.dns.ok} of ${d.dns.total} DNS records correct` : ""}"><span class="sm-dot ${!d.dns ? "" : d.dns.ok === d.dns.total ? "ok" : "warn"}"></span>${h(d.domain)}${d.main ? " <em>main</em>" : ""}${d.cloudflare ? CF : ""}</a>`).join("")}
          <a class="sm-dom add" href="${OPEN}#/domain" target="_blank" rel="noopener">+ Add domain</a></div>
      </div>
    </div>
    <div class="sm-foot"><span>IP ${h(o.ip?.current || "?")}${o.ptr?.names?.[0] ? ` · ${h(o.ptr.names[0])}` : ""}</span><span class="grow"></span>
      ${o.queue.total ? `<button class="btn sm" data-sm="flush" ${S.busy ? "disabled" : ""}>${S.busy === "flush" ? "Retrying…" : "Retry the queue"}</button>` : ""}
      <span>checked ${ctx.ago ? ctx.ago(o.at) : new Date(o.at).toLocaleTimeString()}</span></div>
  </section>`;
}

export function wire(el, ctx) {
  for (const b of el.querySelectorAll("[data-sm]")) b.onclick = async () => {
    const what = b.dataset.sm;
    S.busy = what; ctx.render();
    try {
      if (what === "flush") { await ctx.api("/queue", { method: "POST", body: JSON.stringify({ action: "flush" }) }); ctx.toast?.("Postfix is retrying every queued message"); }
      S.at = 0; load(ctx, true);
    } catch (e) { ctx.toast?.(e.message); }
    finally { S.busy = ""; }
  };
}
