// selfmail inside Aegis × Burrow: the extension the gate loads (forge-addon.json
// "burrow.extension"). selfmail itself is a system service (Postfix, OpenDKIM and
// the web mail on 127.0.0.1); this module only connects it to the dashboard:
//
//   mount()          the whole web mail under the gate's login (/__gate/selfmail/),
//                    signed with the gate's key, plus a tile on the home page
//   handle(...)      /__gate/api/x/selfmail/… -> selfmail's API (the Burrow page's card)
//   every minute     the overview: problems become notices on the gate's bell
//                    (and clear themselves when fixed)
//   the Weft mesh    ~/.config/weft/mesh/selfmail.json: other addons (Bulwark) find the
//                    notify API there and can email you, only while selfmail is installed
//
// The key lives in this addon's data folder (host.key, mode 600, written by install.sh);
// selfmail accepts it only from this machine.

import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

let ctx = null, tick = null, beat = null, last = null;
const open = new Map();   // problem key -> level, while it lasts

const key = () => { try { return readFileSync(join(ctx.dataDir, "host.key"), "utf8").trim(); } catch { return ""; } };
const port = () => { try { return JSON.parse(readFileSync(join(ctx.dataDir, "link.json"), "utf8")).port || 8088; } catch { return 8088; } };
const base = () => `http://127.0.0.1:${port()}`;
const meshDir = () => process.env.MESH || join(process.env.HOME || homedir(), ".config", "weft", "mesh");
const meshFile = () => join(meshDir(), "selfmail.json");

async function call(method, path, body) {
  const r = await fetch(base() + path, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "x-selfmail-key": key(), "X-Selfmail": "1", "Content-Type": "application/json", "X-Burrow-Client": "selfmail" },
    signal: AbortSignal.timeout(25000),
  });
  const type = r.headers.get("content-type") || "";
  return { status: r.status, json: type.includes("json") ? await r.json().catch(() => ({})) : null, text: type.includes("json") ? null : await r.text() };
}

// ---- warnings on the bell ----
async function check() {
  if (!ctx || !key()) return;
  try {
    const r = await call("GET", "/api/host/overview");
    if (r.status !== 200) return;
    last = r.json;
    const now = new Set();
    for (const p of last.problems || []) {
      now.add(p.key);
      if (open.get(p.key) === p.level) continue;           // already on the bell
      open.set(p.key, p.level);
      if (p.level === "info") continue;                     // the card shows these; no bell
      ctx.notify({ level: p.level, key: "p-" + p.key, title: `selfmail: ${p.title}`, body: p.body || "", link: "/__gate/selfmail/#/status" });
    }
    for (const [k, level] of open) if (!now.has(k)) {
      open.delete(k);
      if (level !== "info") ctx.notify({ level: "info", key: "ok-" + k, title: "selfmail: fixed — " + (k.startsWith("dns-") ? `DNS for ${k.slice(4)} is correct` : { "svc-postfix": "Postfix is running", "svc-opendkim": "OpenDKIM is running", smtp: "the mail server answers", hook: "incoming mail reaches this server", queue: "the queue is moving", port25: "port 25 out is open", bl: "the IP is off the blocklists", disk: "there's disk space again" }[k] || k), link: "/__gate/selfmail/#/status" });
    }
  } catch (e) { /* selfmail down: the status script and card show it */ }
}

// ---- the Weft mesh (spec §8): one file, refreshed every 20 s, removed on stop ----
async function announce() {
  if (!ctx || !key()) return;
  let health = null;
  try { const r = await fetch(base() + "/health", { signal: AbortSignal.timeout(4000) }); health = await r.json(); } catch { /* down */ }
  if (health?.app !== "selfmail") return withdraw();
  const entry = {
    spec: 1, id: "selfmail", name: "selfmail", version: health.version, host: "burrow",
    url: base() + "/", health: base() + "/health", port: port(), provides: ["mail", "notify"],
    items: last?.address ? [{ name: last.address }] : [],
    notify: { url: base() + "/api/notify", keyFile: join(ctx.dataDir, "host.key"), to: last?.address || "", domains: (last?.domains || []).map((d) => d.domain) },
    dashboard: "/__gate/selfmail/", updated: Math.floor(Date.now() / 1000),
  };
  try {
    mkdirSync(meshDir(), { recursive: true });
    const tmp = meshFile() + ".tmp-" + process.pid;
    writeFileSync(tmp, JSON.stringify(entry, null, 2) + "\n", { mode: 0o644 });
    renameSync(tmp, meshFile());
  } catch (e) { ctx.log("mesh:", e.message); }
}
function withdraw() { try { rmSync(meshFile(), { force: true }); } catch { /* gone */ } }

export function start(c) {
  ctx = c;
  setTimeout(() => { check(); announce(); }, 3000);
  tick = setInterval(check, 60e3); beat = setInterval(announce, 20e3);
  tick.unref?.(); beat.unref?.();
}
export function stop() { clearInterval(tick); clearInterval(beat); withdraw(); ctx = null; }

export function mount() {
  const k = ctx && key();
  return k ? { prefix: "/__gate/selfmail", upstream: base(), name: "selfmail",
               headers: { "x-selfmail-key": k, "x-selfmail-base": "/__gate/selfmail/" },
               tile: { text: "Your mail, every domain, with live health." } } : null;
}

// /__gate/api/x/selfmail/<path> -> selfmail's /api/<path> (the card on the Burrow page)
export async function handle({ method, path, query, json }) {
  if (!key()) return { status: 503, json: { error: "selfmail isn't linked yet — install the addon." } };
  if (!/^\/[\w\-/.]*$/.test(path) || path.includes("..")) return { status: 400, json: { error: "Bad path." } };
  const q = query ? (typeof query === "string" ? query : new URLSearchParams(query).toString()) : "";
  const target = (path === "/overview" ? "/api/host/overview" : "/api" + path) + (q ? (q.startsWith("?") ? q : "?" + q) : "");
  const body = method === "GET" || method === "HEAD" ? undefined : (json ? await json().catch(() => ({})) : {});
  try {
    const r = await call(method, target, body);
    if (path === "/overview" && r.status === 200) last = r.json;
    return r.json ? { status: r.status, json: r.json } : { status: r.status, body: r.text, type: "text/plain; charset=utf-8" };
  } catch (e) { return { status: 503, json: { error: `selfmail isn't answering (${e.cause?.code || e.message}).` } }; }
}
