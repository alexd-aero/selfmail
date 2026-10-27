// selfmail ⇄ Aegis × Burrow, from the installer (run as root by setup.sh).
//
//   node hook.mjs find                       -> {socket, user, home, version, mainHost, mode} | {}
//   node hook.mjs prepare  --socket S --user U --home H
//        adds the selfmail addon to that Aegis (if it isn't there) and makes the gate's key
//        (H/data/addons/selfmail/data/host.key, owned by U, 600) -> {keyFile}
//   node hook.mjs webhook  --socket S --port P
//        a public tunnel for the mail drop-off (only /inbound is served on it; Host is kept so
//        selfmail can tell) -> {url} | {skip}
//   node hook.mjs finish   --socket S --user U --home H --port P
//        writes link.json and has Aegis finish "installing" the addon (it's already linked, so its
//        install script only confirms) -> {linked} | {manual: "command to run"}
//
// Talks to Aegis over its control socket (plain HTTP on a unix socket, same user = owner; root here).
import { request } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, chownSync, statSync, readlinkSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";

const SOURCE = process.env.SELFMAIL_ADDON_SOURCE || "https://github.com/alexd-aero/selfmail";
const args = process.argv.slice(3), cmd = process.argv[2];
const opt = (k, d = "") => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const out = (o) => { process.stdout.write(JSON.stringify(o) + "\n"); process.exit(0); };

function call(socket, method, path, body, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const r = request({ socketPath: socket, method, path, timeout,
      headers: { "X-Burrow-Client": "selfmail-setup", ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}) } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { let j = null; try { j = JSON.parse(b); } catch { j = { raw: b }; } resolve({ status: res.statusCode, json: j }); });
    });
    r.on("timeout", () => r.destroy(new Error("timeout"))); r.on("error", reject);
    if (data) r.write(data); r.end();
  });
}
const vge = (v, w) => { const a = String(v).split(".").map(Number), b = w.split(".").map(Number); for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; } return true; };

// ---- find a running Aegis: the node process that listens on a control.sock ----
async function find() {
  let ss = "";
  try { ss = execFileSync("ss", ["-xlpn"], { encoding: "utf8" }); } catch { return {}; }
  for (const line of ss.split("\n")) {
    const m = /(\/\S*control\.sock)\b.*pid=(\d+)/.exec(line); if (!m) continue;
    const [, socket, pid] = m;
    let env = {}; try { env = Object.fromEntries(readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").filter(Boolean).map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)])); } catch { /* gone */ }
    let cmdline = ""; try { cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " "); } catch { /* gone */ }
    if (!/aegis|burrow|server\.mjs|gate\.mjs/.test(cmdline + " " + (env.AEGIS_HOME || ""))) continue;
    const uid = statSync(`/proc/${pid}`).uid;
    let user = ""; try { user = execFileSync("id", ["-nu", String(uid)], { encoding: "utf8" }).trim(); } catch { continue; }
    // the gate's home: AEGIS_HOME, else the folder above data/ that holds a control.sock link to this socket
    let home = env.AEGIS_HOME || "";
    if (!home) { try { const cwd = readlinkSync(`/proc/${pid}/cwd`); for (const c of [cwd, dirname(cwd), dirname(dirname(cwd))]) if (existsSync(join(c, "data", "addons.json")) || existsSync(join(c, "data", "control.sock"))) { home = c; break; } } catch { /* no access */ } }
    if (!home) { const def = join(env.HOME || `/home/${user}`, ".local/share/aegis"); if (existsSync(join(def, "data"))) home = def; }
    try {
      const st = await call(socket, "GET", "/status", undefined, 5000);
      if (st.status !== 200 || st.json?.engine !== "burrow") continue;
      return { socket, user, home, pid: Number(pid), version: st.json.version, mainHost: st.json.mainHost || "", mode: st.json.mode || "" };
    } catch { continue; }
  }
  return {};
}

async function addonRec(socket) {
  const r = await call(socket, "GET", "/addons");
  const list = Array.isArray(r.json?.addons) ? r.json.addons : Array.isArray(r.json) ? r.json : Object.values(r.json?.addons || {});
  return list.find((a) => a && a.id === "selfmail") || null;
}

async function prepare() {
  const socket = opt("socket"), user = opt("user"), home = opt("home");
  if (!(await addonRec(socket))) {
    const r = await call(socket, "POST", "/addons/add", { source: SOURCE }, 180000);
    if (r.status !== 200) throw new Error("Aegis couldn't add the addon: " + (r.json?.error || r.status));
  }
  const dir = join(home, "data", "addons", "selfmail", "data");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const uid = Number(execFileSync("id", ["-u", user], { encoding: "utf8" })), gid = Number(execFileSync("id", ["-g", user], { encoding: "utf8" }));
  const keyFile = join(dir, "host.key");
  if (!existsSync(keyFile) || readFileSync(keyFile, "utf8").trim().length < 24) writeFileSync(keyFile, randomBytes(36).toString("base64url"), { mode: 0o600 });
  for (const p of [join(home, "data", "addons", "selfmail"), dir]) try { chownSync(p, uid, gid); } catch { /* fine */ }
  chownSync(keyFile, uid, gid); chmodSync(keyFile, 0o600);
  out({ keyFile, dir });
}

async function webhook() {
  const socket = opt("socket"), port = Number(opt("port", "8088"));
  const st = (await call(socket, "GET", "/status")).json || {};
  if (st.mode !== "domain" || !st.mainHost) out({ skip: "Aegis has no domain of its own yet, so it can't give the relay a lasting address." });
  const list = (await call(socket, "GET", "/tunnels")).json?.tunnels || [];
  let t = list.find((x) => x.app === "selfmail" && Number(x.targetPort || x.port) === port);
  if (!t) {
    let key = port; const used = new Set(list.map((x) => Number(x.port)));
    if (used.has(key)) { key = 18088; while (used.has(key)) key++; }
    const r = await call(socket, "POST", "/tunnels", { port: key, targetPort: port, targetHost: "127.0.0.1", sub: "mailhook", name: "selfmail mail drop-off",
                                                       access: "public", preserveHost: true, app: "selfmail", scheme: "http" }, 120000);
    if (r.status !== 200) { const r2 = await call(socket, "POST", "/tunnels", { port: key, targetPort: port, targetHost: "127.0.0.1", name: "selfmail mail drop-off", access: "public", preserveHost: true, app: "selfmail", scheme: "http" }, 120000);
      if (r2.status !== 200) out({ skip: "Aegis couldn't make the tunnel: " + (r2.json?.error || r.json?.error || r2.status) }); }
    t = ((await call(socket, "GET", "/tunnels")).json?.tunnels || []).find((x) => x.app === "selfmail" && Number(x.targetPort || x.port) === port);
  }
  const url = t?.url || (t?.host ? "https://" + t.host : "");
  if (!/^https:\/\//.test(url)) out({ skip: "The tunnel has no https address yet." });
  out({ url: url.replace(/\/+$/, ""), port: t.port });
}

async function finish() {
  const socket = opt("socket"), user = opt("user"), home = opt("home"), port = Number(opt("port", "8088"));
  const dir = join(home, "data", "addons", "selfmail", "data");
  const uid = Number(execFileSync("id", ["-u", user], { encoding: "utf8" })), gid = Number(execFileSync("id", ["-g", user], { encoding: "utf8" }));
  writeFileSync(join(dir, "link.json"), JSON.stringify({ port, linkedAt: Math.floor(Date.now() / 1000), by: "setup" }) + "\n", { mode: 0o644 });
  chownSync(join(dir, "link.json"), uid, gid);
  const rec = await addonRec(socket);
  if (rec?.installed) out({ linked: true, already: true });
  const st = (await call(socket, "GET", "/status")).json || {};
  if (!vge(st.version || "0", "2.35.0")) out({ manual: "aegis addons install selfmail", why: `Aegis ${st.version || "?"} can't finish this by itself (2.35 or newer can).` });
  // Aegis prepares the install job and hands us its script; it finds selfmail already linked and only confirms.
  const spec = await call(socket, "POST", "/addons/selfmail/runspec", { op: "install" }, 120000);
  if (spec.status !== 200) out({ manual: "aegis addons install selfmail", why: spec.json?.error || `Aegis answered ${spec.status}` });
  if (spec.json.done) out({ linked: true });
  const { job, token, script, cwd, env } = spec.json;
  const envList = Object.entries({ ...env, HOME: execFileSync("sh", ["-c", `getent passwd ${user} | cut -d: -f6`], { encoding: "utf8" }).trim(), PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" }).map(([k, v]) => `${k}=${v}`);
  const child = spawn("runuser", ["-u", user, "--", "env", "-i", ...envList, "bash", script], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let buf = [], sent = Promise.resolve();
  const flush = () => { if (!buf.length) return; const lines = buf; buf = []; sent = sent.then(() => call(socket, "POST", `/addons/jobs/${job}/line`, { token, lines }).catch(() => {})); };
  const onData = (d) => { for (const l of String(d).split("\n")) if (l.trim()) { buf.push(l); process.stderr.write("    " + l + "\n"); } flush(); };
  child.stdout.on("data", onData); child.stderr.on("data", onData);
  const code = await new Promise((r) => child.on("close", (c) => r(c ?? 1)));
  flush(); await sent;
  await call(socket, "POST", `/addons/jobs/${job}/done`, { token, code });
  out(code === 0 ? { linked: true } : { manual: "aegis addons install selfmail", why: `the addon's install step ended with ${code}` });
}

try {
  if (cmd === "find") out(await find());
  else if (cmd === "prepare") await prepare();
  else if (cmd === "webhook") await webhook();
  else if (cmd === "finish") await finish();
  else out({ error: "usage: find | prepare | webhook | finish" });
} catch (e) { out({ error: e.message }); }
