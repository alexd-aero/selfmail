#!/usr/bin/env bash
#
# selfmail installer
#
#   sudo ./setup.sh                 fresh install (asks a few questions)
#   sudo ./setup.sh --update        install new code over an existing install (keeps settings and mail)
#   sudo ./setup.sh --adopt         put the app on a server whose Postfix/OpenDKIM are already set up
#                                   (--secret KEEPS an existing webhook secret so the relay keeps delivering)
#
# Non-interactive install: pass answers as flags, e.g.
#   sudo ./setup.sh --yes --agree "Your Full Name" --domain mail.example.com --host mx.example.com --mailbox me \
#        --mode relay --tunnel-host mailhook.example.com --user me --password 'long password'
#   (--agree signs the responsible-use agreement, which every install must accept)
#
set -euo pipefail
umask 022

SM_VERSION="2.1.0"
APP_DIR=/opt/selfmail
ETC=/etc/selfmail
VAR=/var/lib/selfmail
MAILROOT=/var/mail/vhosts
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_MIN=18

# ------------------------------------------------------------------ output --
if [ -t 1 ]; then B=$'\e[1m'; D=$'\e[2m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; Z=$'\e[0m'; else B= D= G= Y= R= C= Z=; fi
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s▸%s %s%s%s\n' "$C" "$Z" "$B" "$*" "$Z"; }
ok()   { printf '  %s✓%s %s\n' "$G" "$Z" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$Z" "$*"; }
die()  { printf '\n%s✗ %s%s\n' "$R" "$*" "$Z" >&2; exit 1; }
trap 'die "setup stopped at line $LINENO (command: $BASH_COMMAND)"' ERR

[ "$(id -u)" -eq 0 ] || die "Run with sudo:  sudo ./setup.sh"
command -v systemctl >/dev/null 2>&1 || die "systemd is required."

# ------------------------------------------------------------------- flags --
MODE_RUN=install; YES=0
DOMAIN=""; MXHOST=""; MAILBOX=""; SELECTOR=""; INMODE=""; PUBLIC_IP=""; WEBHOOK_URL=""; TUNNEL=""; TUNNEL_HOST=""
UI_USER=""; UI_PASS=""; PORT=""; TUNNEL_UNIT=""; SECRET=""; AGREE_NAME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --update) MODE_RUN=update ;; --adopt) MODE_RUN=adopt ;; --yes|-y) YES=1 ;;
    --domain) DOMAIN="$2"; shift ;; --host) MXHOST="$2"; shift ;; --mailbox) MAILBOX="$2"; shift ;; --selector) SELECTOR="$2"; shift ;;
    --mode) INMODE="$2"; shift ;; --public-ip) PUBLIC_IP="$2"; shift ;; --webhook-url) WEBHOOK_URL="$2"; shift ;;
    --tunnel) TUNNEL="$2"; shift ;; --tunnel-host) TUNNEL_HOST="$2"; TUNNEL=${TUNNEL:-yes}; shift ;; --tunnel-unit) TUNNEL_UNIT="$2"; shift ;;
    --user) UI_USER="$2"; shift ;; --password) UI_PASS="$2"; shift ;; --port) PORT="$2"; shift ;; --secret) SECRET="$2"; shift ;; --agree) AGREE_NAME="$2"; shift ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
  shift
done

INTERACTIVE=0; [ "$YES" = 0 ] && [ -t 0 ] && INTERACTIVE=1
ask() { # ask VAR "question" "default"
  local __v="$1" __q="$2" __d="${3:-}" __a=""
  if [ -n "${!__v:-}" ]; then return; fi
  if [ "$INTERACTIVE" = 1 ]; then
    if [ -n "$__d" ]; then printf '  %s %s[%s]%s: ' "$__q" "$D" "$__d" "$Z"; else printf '  %s: ' "$__q"; fi
    read -r __a </dev/tty || true
  fi
  printf -v "$__v" '%s' "${__a:-$__d}"
}
is_domain() { [[ "$1" =~ ^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$ ]]; }

# --------------------------------------------------------------- platform --
PM=""
if command -v apt-get >/dev/null 2>&1; then PM=apt; elif command -v dnf >/dev/null 2>&1; then PM=dnf; elif command -v yum >/dev/null 2>&1; then PM=yum; else die "Need apt, dnf or yum."; fi
. /etc/os-release 2>/dev/null || true
ARCH="$(uname -m)"

pkg_install() {
  if [ "$PM" = apt ]; then
    export DEBIAN_FRONTEND=noninteractive
    local waited=0
    while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || fuser /var/lib/dpkg/lock >/dev/null 2>&1; do
      [ $waited = 0 ] && warn "another package install is running — waiting for it"; sleep 5; waited=$((waited+5)); [ $waited -lt 600 ] || die "dpkg stayed locked for 10 minutes"
    done
    apt-get update -qq
    apt-get install -y -qq "$@" >/dev/null
  else
    $PM install -y -q "$@" >/dev/null
  fi
}

node_major() { "$1" -e 'process.stdout.write(process.versions.node.split(".")[0])' 2>/dev/null || echo 0; }
find_node() {
  for n in "$APP_DIR/node/bin/node" /usr/local/bin/node /usr/bin/node; do
    if [ -x "$n" ] && [ "$(node_major "$n")" -ge $NODE_MIN ] && [ -x "$(dirname "$n")/npm" ]; then echo "$n"; return 0; fi
  done
  return 1
}
install_node() {
  local a; case "$ARCH" in x86_64|amd64) a=x64 ;; aarch64|arm64) a=arm64 ;; armv7l) a=armv7l ;; *) die "No Node.js build for $ARCH — install Node $NODE_MIN+ (with npm) and re-run." ;; esac
  local base=https://nodejs.org/dist/latest-v22.x
  local file; file="$(curl -fsSL --max-time 30 "$base/SHASUMS256.txt" | awk -v s="linux-$a.tar.xz" '$2 ~ s {print $2; exit}')"
  [ -n "$file" ] || die "Could not find a Node.js download for linux-$a."
  say "  downloading $file"
  curl -fsSL --max-time 300 "$base/$file" -o /tmp/selfmail-node.tar.xz
  curl -fsSL --max-time 30 "$base/SHASUMS256.txt" | grep " $file\$" | sed "s# $file\$# /tmp/selfmail-node.tar.xz#" | sha256sum -c --quiet - || die "Node.js download failed its checksum."
  rm -rf "$APP_DIR/node"; mkdir -p "$APP_DIR/node"
  tar -xJf /tmp/selfmail-node.tar.xz -C "$APP_DIR/node" --strip-components=1
  rm -f /tmp/selfmail-node.tar.xz
}

# ------------------------------------------------------- things to reuse --
clear_port25() {
  for m in exim4 exim sendmail nullmailer opensmtpd citadel; do
    if systemctl is-active --quiet "$m" 2>/dev/null; then warn "$m was using port 25 — stopping and disabling it"; systemctl disable --now "$m" >/dev/null 2>&1 || true; fi
  done
  if command -v docker >/dev/null 2>&1 && ss -lntp 2>/dev/null | awk '$4 ~ /:25$/' | grep -q docker-proxy; then
    docker ps --format '{{.ID}} {{.Names}} {{.Ports}}' | grep -E ':25->' | while read -r id name _; do warn "Docker container $name publishes port 25 — stopping it"; docker update --restart=no "$id" >/dev/null; docker stop "$id" >/dev/null; done
  fi
}
smtp_greets() { timeout 10 bash -c 'exec 3<>/dev/tcp/127.0.0.1/25 || exit 1; IFS= read -r -t 8 l <&3 || exit 2; [[ "$l" == 220* ]]' 2>/dev/null; }

ensure_user() {
  getent group vmail >/dev/null || groupadd -g 5000 vmail 2>/dev/null || groupadd vmail
  getent passwd vmail >/dev/null || useradd -g vmail -u 5000 -d "$MAILROOT" -s /usr/sbin/nologin -M vmail 2>/dev/null || useradd -g vmail -d "$MAILROOT" -s /usr/sbin/nologin -M vmail
  VUID="$(id -u vmail)"; VGID="$(id -g vmail)"
}

node_cfg() { # node_cfg <js expression on c>   — reads /etc/selfmail/config.json
  "$NODE" -e "const c=JSON.parse(require('fs').readFileSync('$ETC/config.json','utf8')); const v=($1); process.stdout.write(v==null?'':String(v))" 2>/dev/null || true
}

write_config() { # merges the given JSON object into config.json (creates it when missing)
  local patch="$1"
  mkdir -p "$ETC"
  PATCH="$patch" "$NODE" -e '
    const fs=require("fs"), f=process.argv[1];
    let c={}; try{c=JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){}
    const p=JSON.parse(process.env.PATCH);
    for (const [k,v] of Object.entries(p)) if (v!==undefined && v!=="" && v!==null) c[k]=v;
    if (!c.inboundSecret) c.inboundSecret=require("crypto").randomBytes(24).toString("base64url");
    if (c.webhookUrl) { try { const h=new URL(c.webhookUrl).hostname; c.webhookHosts=[...new Set([...(c.webhookHosts||[]),h])]; } catch(e){} }
    fs.writeFileSync(f+".tmp", JSON.stringify(c,null,2)+"\n",{mode:0o600}); fs.renameSync(f+".tmp", f);
  ' "$ETC/config.json"
}

set_password() { # set_password user pass
  printf '%s' "$2" | SELFMAIL_ETC="$ETC" SELFMAIL_VAR="$VAR" "$NODE" -e '
    let p=""; process.stdin.on("data",d=>p+=d).on("end",()=>{ require(process.argv[1]+"/lib/auth").setPassword(process.argv[2], p); });
  ' "$APP_DIR/app" "$1"
}

deploy_app() {
  step "Installing the app"
  mkdir -p "$APP_DIR"
  rm -rf "$APP_DIR/app.new"; cp -r "$SRC/app" "$APP_DIR/app.new"
  rm -rf "$APP_DIR/app.new/node_modules"
  if [ -d "$APP_DIR/app/node_modules" ] && cmp -s "$APP_DIR/app/package.json" "$APP_DIR/app.new/package.json"; then
    cp -r "$APP_DIR/app/node_modules" "$APP_DIR/app.new/"
  else
    ( cd "$APP_DIR/app.new" && PATH="$(dirname "$NODE"):$PATH" npm install --omit=dev --no-audit --no-fund --no-update-notifier --loglevel=error >/dev/null ) || die "npm install failed"
  fi
  rm -rf "$APP_DIR/app.prev"; [ -d "$APP_DIR/app" ] && mv "$APP_DIR/app" "$APP_DIR/app.prev"
  mv "$APP_DIR/app.new" "$APP_DIR/app"
  mkdir -p "$APP_DIR/bin"
  install -m 755 "$SRC/bin/selfmail-root" "$APP_DIR/bin/selfmail-root"
  install -m 755 "$SRC/bin/selfmail" "$APP_DIR/bin/selfmail"
  for f in setup.sh doctor.sh uninstall.sh; do install -m 755 "$SRC/$f" "$APP_DIR/$f"; done
  ln -sf "$APP_DIR/bin/selfmail" /usr/local/bin/selfmail
  echo "$NODE" > "$APP_DIR/.node"
  [ -d "$SRC/.git" ] && echo "$SRC" > "$APP_DIR/.source" || true
  chown -R root:root "$APP_DIR"; chmod 755 "$APP_DIR"
  ok "app $SM_VERSION in $APP_DIR/app (node $("$NODE" -v))"
}

install_service() {
  step "Service and permissions"
  mkdir -p "$ETC" "$VAR"
  chown -R vmail:vmail "$ETC" "$VAR"; chmod 700 "$ETC" "$VAR"
  [ -f "$ETC/config.json" ] && chmod 600 "$ETC/config.json"
  # the app may run exactly one program as root: the validated helper
  cat > /etc/sudoers.d/selfmail <<SUDO
# selfmail: the web app (user vmail) may run only its validated root helper
vmail ALL=(root) NOPASSWD: $APP_DIR/bin/selfmail-root
Defaults:vmail !requiretty
SUDO
  chmod 440 /etc/sudoers.d/selfmail
  visudo -cf /etc/sudoers.d/selfmail >/dev/null || { rm -f /etc/sudoers.d/selfmail; die "sudoers rule was rejected"; }
  cat > /etc/systemd/system/selfmail.service <<UNIT
[Unit]
Description=selfmail web mail
After=network-online.target postfix.service
Wants=network-online.target

[Service]
User=vmail
Group=vmail
WorkingDirectory=$APP_DIR/app
Environment=NODE_ENV=production SELFMAIL_ETC=$ETC SELFMAIL_VAR=$VAR SELFMAIL_ROOT_HELPER=$APP_DIR/bin/selfmail-root
ExecStart=$NODE $APP_DIR/app/server.js
Restart=always
RestartSec=3
# No NoNewPrivileges-style sandboxing here: it would stop sudo (the root helper)
# and Postfix's own setgid tools (postqueue, postdrop) from working.
PrivateTmp=yes
ProtectHome=yes

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable selfmail >/dev/null 2>&1
  ok "selfmail.service runs as user vmail; one sudo rule for the helper"
}

health_timer() {
  local host="$1"
  cat > /usr/local/bin/selfmail-health <<'HEALTH'
#!/usr/bin/env bash
# Restarts selfmail or its tunnel when the mail drop-off stops answering (a hung
# tunnel keeps its process alive, so systemd alone can't notice).
NODE="$(cat /opt/selfmail/.node 2>/dev/null || command -v node)"
read -r SECRET PORT HOST UNIT < <("$NODE" -e 'const c=JSON.parse(require("fs").readFileSync("/etc/selfmail/config.json","utf8")); let h=""; try{h=new URL(c.webhookUrl).hostname}catch(e){} console.log(c.inboundSecret||"-", c.port||8088, h||"-", c.tunnelUnit||"selfmail-tunnel")' 2>/dev/null)
[ -n "${SECRET:-}" ] && [ "$SECRET" != - ] || exit 0
D=/run/selfmail-health; mkdir -p "$D"
strike() { local n; n=$(( $(cat "$D/$1" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$D/$1"; echo "$n"; }
if curl -fsS --max-time 10 "http://127.0.0.1:$PORT/inbound/$SECRET/ping" | grep -q '"ready":true'; then rm -f "$D/local"
else n=$(strike local); logger -t selfmail-health "app did not answer (strike $n)"; [ "$n" -ge 2 ] && { systemctl restart selfmail; rm -f "$D/local"; }; exit 0; fi
[ "$HOST" != - ] || exit 0
if curl -fsS --max-time 25 "https://$HOST/inbound/$SECRET/ping" | grep -q '"ready":true'; then rm -f "$D/public"
else n=$(strike public); logger -t selfmail-health "public URL $HOST did not answer (strike $n)"; [ "$n" -ge 2 ] && { systemctl restart "$UNIT"; rm -f "$D/public"; }; fi
HEALTH
  chmod 755 /usr/local/bin/selfmail-health
  printf '[Unit]\nDescription=Check that selfmail can receive mail\n\n[Service]\nType=oneshot\nExecStart=/usr/local/bin/selfmail-health\n' > /etc/systemd/system/selfmail-health.service
  printf '[Unit]\nDescription=Check selfmail every 2 minutes\n\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=2min\n\n[Install]\nWantedBy=timers.target\n' > /etc/systemd/system/selfmail-health.timer
  systemctl daemon-reload; systemctl enable --now selfmail-health.timer >/dev/null 2>&1 || true
}

configure_postfix() {
  step "Configuring Postfix"
  [ -f /etc/postfix/main.cf.selfmail-backup ] || cp /etc/postfix/main.cf /etc/postfix/main.cf.selfmail-backup 2>/dev/null || true
  printf '%s@%s\t%s/%s/\n' "$MAILBOX" "$DOMAIN" "$DOMAIN" "$MAILBOX" > /etc/postfix/vmailbox
  printf '@%s\t%s@%s\n' "$DOMAIN" "$MAILBOX" "$DOMAIN" > /etc/postfix/virtual   # catch-all: every address @domain lands in one mailbox
  postmap /etc/postfix/vmailbox; postmap /etc/postfix/virtual
  local proto=all
  if [ ! -f /proc/net/if_inet6 ] || [ "$(cat /proc/sys/net/ipv6/conf/all/disable_ipv6 2>/dev/null || echo 0)" = 1 ]; then proto=ipv4; fi
  postconf -e \
    "myhostname = $MXHOST" "smtpd_banner = \$myhostname ESMTP" "mydestination = localhost" \
    "mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128" "inet_interfaces = all" "inet_protocols = $proto" \
    "smtp_address_preference = ipv4" "disable_vrfy_command = yes" "smtpd_helo_required = yes" \
    "smtpd_relay_restrictions = permit_mynetworks defer_unauth_destination" \
    "smtpd_recipient_restrictions = permit_mynetworks, reject_unauth_destination" \
    "smtpd_client_connection_count_limit = 10" "smtpd_client_connection_rate_limit = 30" \
    "smtp_tls_security_level = may" "smtpd_tls_security_level = may" \
    "virtual_mailbox_domains = $DOMAIN" "virtual_mailbox_base = $MAILROOT" \
    "virtual_mailbox_maps = hash:/etc/postfix/vmailbox" "virtual_alias_maps = hash:/etc/postfix/virtual" \
    "virtual_minimum_uid = 100" "virtual_uid_maps = static:$VUID" "virtual_gid_maps = static:$VGID" \
    "message_size_limit = 41943040" \
    "milter_default_action = accept" "milter_protocol = 6" \
    "smtpd_milters = local:/opendkim/opendkim.sock" "non_smtpd_milters = local:/opendkim/opendkim.sock" \
    "milter_connect_timeout = 5s" "milter_command_timeout = 10s" "milter_content_timeout = 30s"
  postconf -P 'smtp/unix/inet_protocols=ipv4' 2>/dev/null || true
  ok "Postfix delivers @$DOMAIN (every address) to $MAILBOX@$DOMAIN"
}

configure_opendkim() {
  step "DKIM signing"
  mkdir -p "/etc/opendkim/keys/$DOMAIN"
  if [ ! -f "/etc/opendkim/keys/$DOMAIN/$SELECTOR.private" ]; then
    ( cd "/etc/opendkim/keys/$DOMAIN" && opendkim-genkey -b 2048 -d "$DOMAIN" -s "$SELECTOR" ); ok "new 2048-bit key"
  else ok "keeping the existing key"; fi
  cat > /etc/opendkim.conf <<CONF
Syslog                  yes
UMask                   007
Mode                    sv
Canonicalization        relaxed/simple
OversignHeaders         From
Socket                  local:/var/spool/postfix/opendkim/opendkim.sock
PidFile                 /run/opendkim/opendkim.pid
UserID                  opendkim:postfix
KeyTable                /etc/opendkim/key.table
SigningTable            refile:/etc/opendkim/signing.table
ExternalIgnoreList      /etc/opendkim/trusted.hosts
InternalHosts           /etc/opendkim/trusted.hosts
CONF
  echo "$SELECTOR._domainkey.$DOMAIN $DOMAIN:$SELECTOR:/etc/opendkim/keys/$DOMAIN/$SELECTOR.private" > /etc/opendkim/key.table
  echo "*@$DOMAIN $SELECTOR._domainkey.$DOMAIN" > /etc/opendkim/signing.table
  printf '127.0.0.1\n::1\nlocalhost\n' > /etc/opendkim/trusted.hosts
  mkdir -p /var/spool/postfix/opendkim /run/opendkim
  chown opendkim:postfix /var/spool/postfix/opendkim; chmod 750 /var/spool/postfix/opendkim
  chown -R opendkim:opendkim /etc/opendkim /run/opendkim; chmod 700 "/etc/opendkim/keys/$DOMAIN"; chmod 600 "/etc/opendkim/keys/$DOMAIN/$SELECTOR.private"
  id -nG postfix | grep -qw opendkim || usermod -aG opendkim postfix
  # Debian's unit writes its own socket path into /etc/default; make it agree
  [ -f /etc/default/opendkim ] && sed -i 's|^SOCKET=.*|SOCKET=local:/var/spool/postfix/opendkim/opendkim.sock|' /etc/default/opendkim || true
  systemctl enable opendkim >/dev/null 2>&1; systemctl restart opendkim
  ok "OpenDKIM signs mail from @$DOMAIN (selector $SELECTOR)"
}

copy_dkim_public() {
  local d s; d="$(node_cfg c.domain)"; s="$(node_cfg c.selector)"
  [ -n "$d" ] && [ -f "/etc/opendkim/keys/$d/$s.txt" ] && install -o vmail -g vmail -m 600 "/etc/opendkim/keys/$d/$s.txt" "$ETC/dkim.txt" || true
}

setup_tunnel() {
  step "Cloudflare Tunnel for incoming mail"
  if ! command -v cloudflared >/dev/null 2>&1; then
    local a; case "$ARCH" in x86_64|amd64) a=amd64 ;; aarch64|arm64) a=arm64 ;; armv7l|armv6l) a=arm ;; *) die "No cloudflared build for $ARCH" ;; esac
    curl -fsSL --max-time 180 "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$a" -o /tmp/cloudflared
    install -m 755 /tmp/cloudflared /usr/local/bin/cloudflared; rm -f /tmp/cloudflared
  fi
  mkdir -p /etc/cloudflared
  export TUNNEL_ORIGIN_CERT=/etc/cloudflared/cert.pem
  if [ ! -f /etc/cloudflared/cert.pem ]; then
    say ""; say "  ${B}Approve Cloudflare in your browser.${Z} Open the link below, sign in, and pick the domain for $TUNNEL_HOST."; say ""
    cloudflared tunnel login
    for c in /root/.cloudflared/cert.pem "${SUDO_USER:+$(getent passwd "$SUDO_USER" | cut -d: -f6)/.cloudflared/cert.pem}"; do [ -n "$c" ] && [ -f "$c" ] && install -m 600 "$c" /etc/cloudflared/cert.pem && break; done
    [ -f /etc/cloudflared/cert.pem ] || die "Cloudflare sign-in didn't finish."
  fi
  local name="selfmail-${TUNNEL_HOST//./-}" id
  cloudflared tunnel list 2>/dev/null | awk '{print $2}' | grep -qx "$name" || cloudflared tunnel create "$name" >/dev/null
  id="$(cloudflared tunnel list 2>/dev/null | awk -v n="$name" '$2==n {print $1}' | head -1)"; [ -n "$id" ] || die "Couldn't create the tunnel."
  for d in /root/.cloudflared "${SUDO_USER:+$(getent passwd "$SUDO_USER" | cut -d: -f6)/.cloudflared}"; do [ -n "$d" ] && [ -f "$d/$id.json" ] && install -m 600 "$d/$id.json" "/etc/cloudflared/$id.json" && break; done
  [ -f "/etc/cloudflared/$id.json" ] || die "Tunnel credentials not found."
  cloudflared tunnel route dns --overwrite-dns "$name" "$TUNNEL_HOST" >/dev/null 2>&1 || warn "Couldn't add the DNS name — add a CNAME $TUNNEL_HOST → $id.cfargotunnel.com"
  # Only the mail drop-off path goes through the tunnel; the web UI never does.
  cat > /etc/cloudflared/selfmail.yml <<CFG
tunnel: $id
credentials-file: /etc/cloudflared/$id.json
ingress:
  - hostname: $TUNNEL_HOST
    path: ^/inbound/
    service: http://127.0.0.1:$PORT
  - service: http_status:404
CFG
  cat > /etc/systemd/system/selfmail-tunnel.service <<UNIT
[Unit]
Description=Cloudflare Tunnel for selfmail incoming mail
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/cloudflared --no-autoupdate --config /etc/cloudflared/selfmail.yml tunnel run
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload; systemctl enable --now selfmail-tunnel >/dev/null 2>&1
  WEBHOOK_URL="https://$TUNNEL_HOST"; TUNNEL_UNIT=selfmail-tunnel
  ok "https://$TUNNEL_HOST → this server (mail drop-off only)"
}

migrate_v1() { # selfmail 1.x kept the secret in /etc/selfmail/env and ran as user "selfmail" with a broad sudo rule
  local s=""
  [ -f "$ETC/env" ] && s="$(sed -n 's/^SELFMAIL_INBOUND_SECRET=//p' "$ETC/env" | head -1)"
  if [ -n "$s" ]; then write_config "{\"inboundSecret\":\"$s\"}"; ok "kept the webhook secret from version 1"; fi
  if [ -f "$ETC/users.json" ] && grep -qE '"[^"]+": *"[0-9a-f]{64}"' "$ETC/users.json"; then
    mv "$ETC/users.json" "$ETC/users.v1.json"; warn "version-1 logins can't be carried over (they used plain SHA-256) — set a new password below"
  fi
  [ -f "$ETC/config.json" ] && "$NODE" -e '
    const fs=require("fs"),f=process.argv[1]; const c=JSON.parse(fs.readFileSync(f,"utf8")); let ch=false;
    if (c.webhookUrl && /\/inbound\//.test(c.webhookUrl)) { c.webhookUrl=c.webhookUrl.replace(/\/inbound\/.*$/,""); ch=true; }
    for (const k of ["defaultTo","relayProvider"]) if (k in c) { delete c[k]; ch=true; }
    if (ch) fs.writeFileSync(f, JSON.stringify(c,null,2)+"\n",{mode:0o600});' "$ETC/config.json"
  rm -f "$ETC/env"
  if [ -f /etc/cloudflared/config.yml ] && grep -q 'selfmail' /etc/systemd/system/selfmail-tunnel.service 2>/dev/null && ! grep -q '/inbound/' /etc/cloudflared/config.yml; then
    warn "your tunnel (/etc/cloudflared/config.yml) still sends every path to the app — the app now refuses everything but /inbound on that host"
  fi
  id selfmail >/dev/null 2>&1 && { userdel selfmail 2>/dev/null || true; }
  return 0
}

agreement_signed() { [ -f "$ETC/config.json" ] && [ "$(node_cfg 'c.agreement&&c.agreement.version>=1?1:0')" = 1 ]; }
sign_agreement() { # required for a fresh install; offered on --update/--adopt (otherwise the web mail asks)
  local required="$1"
  agreement_signed && { ok "responsible-use agreement already signed"; return; }
  local j isp ip
  j="$(curl -fsS --max-time 8 'http://ip-api.com/json/?fields=status,query,isp' 2>/dev/null || true)"
  isp="$(printf '%s' "$j" | "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write((j.isp||"").replace(/,?\s+(inc|llc|ltd|corp)\.?$/i,""))}catch(e){}})')"
  ip="$(printf '%s' "$j" | "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).query||"")}catch(e){}})')"
  isp="${isp:-your internet provider}"
  if [ "$INTERACTIVE" = 1 ] || [ -z "$AGREE_NAME" ]; then
    step "Responsible-use agreement"
    say "  This server's internet connection: ${B}$isp${Z}${ip:+ ($ip)}"
    say ""
    say "  1. ${B}You are responsible for this server${Z} — every message sent or received through it, who can"
    say "     use it, and keeping it secure."
    say "  2. ${B}No spam or abuse${Z} — no bulk or unsolicited mail, phishing, scams, malware, harassment or"
    say "     anything illegal, by you or anyone you let use it."
    say "  3. ${B}You follow $isp's terms of service.${Z} If abuse is reported from your address, $isp can warn"
    say "     you, block mail ports, or suspend or end your service, and your address can be blocklisted."
    say "     Any such conflict is between you and $isp."
    say "  4. ${B}Mail providers can refuse your mail${Z}; delivery isn't guaranteed."
    say "  5. ${B}No warranty, no liability.${Z} selfmail is free software provided \"as is\" (MIT). Its authors"
    say "     are not responsible for how you use it or for anything that results from running it."
    say "  6. Under 18? Ask a parent or guardian to read this with you."
    say ""
  fi
  if [ -z "$AGREE_NAME" ] && [ "$INTERACTIVE" = 1 ]; then
    local yes=""
    printf '  Type %sI AGREE%s to accept: ' "$B" "$Z"; read -r yes </dev/tty || true
    [ "$yes" = "I AGREE" ] || { [ "$required" = 1 ] && die "The agreement wasn't accepted — nothing was installed."; warn "not signed here — the web mail will ask"; return; }
    while [ ${#AGREE_NAME} -lt 3 ]; do printf '  Type your full name to sign: '; read -r AGREE_NAME </dev/tty || true; done
  fi
  if [ -z "$AGREE_NAME" ]; then
    [ "$required" = 1 ] && die "Pass --agree \"Your Full Name\" to accept the responsible-use agreement (see above)."
    warn "agreement not signed yet — the web mail will ask on first sign-in"; return
  fi
  AGREE_NAME="$AGREE_NAME" AGREE_ISP="$isp" AGREE_IP="$ip" "$NODE" -e '
    const fs=require("fs"),f=process.argv[1]; let c={}; try{c=JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){}
    c.agreement={version:1,name:process.env.AGREE_NAME.trim(),at:Date.now(),ip:process.env.AGREE_IP,isp:process.env.AGREE_ISP,via:"installer"};
    fs.writeFileSync(f+".tmp",JSON.stringify(c,null,2)+"\n",{mode:0o600}); fs.renameSync(f+".tmp",f);' "$ETC/config.json"
  [ -n "${VUID:-}" ] && chown vmail:vmail "$ETC/config.json" 2>/dev/null || true
  ok "signed by $AGREE_NAME"
}

ensure_login() {
  if SELFMAIL_ETC="$ETC" "$NODE" -e 'process.exit(Object.keys(JSON.parse(require("fs").readFileSync(process.env.SELFMAIL_ETC+"/users.json","utf8"))).length?0:1)' 2>/dev/null && [ -z "$UI_PASS" ]; then
    ok "existing web login kept"; return
  fi
  ask UI_USER "Username for the web mail" "${MAILBOX:-admin}"
  UI_USER="${UI_USER:-${MAILBOX:-admin}}"
  [[ "$UI_USER" =~ ^[A-Za-z0-9._@-]{1,64}$ ]] || die "Usernames can use letters, numbers and . _ - @"
  if [ -z "$UI_PASS" ] && [ "$INTERACTIVE" = 1 ]; then
    while :; do
      printf '  Password (10+ characters): '; read -rs UI_PASS </dev/tty; echo
      printf '  Again: '; read -rs p2 </dev/tty; echo
      [ "$UI_PASS" = "$p2" ] && [ ${#UI_PASS} -ge 10 ] && break; warn "they didn't match or were too short"; UI_PASS=""
    done
  fi
  GEN=""
  if [ -z "$UI_PASS" ]; then UI_PASS="$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"; GEN=1; fi
  set_password "$UI_USER" "$UI_PASS"
  chown vmail:vmail "$ETC/users.json"; chmod 600 "$ETC/users.json"
  ok "web login: $UI_USER"
}

start_and_check() {
  step "Starting"
  systemctl restart postfix 2>/dev/null || systemctl restart postfix@- 2>/dev/null || true
  systemctl restart selfmail
  local i; for i in $(seq 1 20); do curl -fsS --max-time 2 "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 1; done
  curl -fsS --max-time 3 "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && ok "web mail answers on port $PORT" || warn "web mail isn't answering yet — check: journalctl -u selfmail -n 30"
  if smtp_greets; then ok "Postfix answers on port 25"; else warn "Postfix isn't greeting on port 25 — run: sudo selfmail doctor"; fi
}

summary() {
  local ips; ips="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|100\.)' | head -3)"
  say ""; say "  ${B}${G}selfmail is ready.${Z}"; say ""
  say "  Open the web mail:"
  for ip in $ips; do say "    http://$ip:$PORT"; done
  say "    http://localhost:$PORT   (on this machine)"
  [ -n "${GEN:-}" ] && say "" && say "  Login: ${B}$UI_USER${Z} / ${B}$UI_PASS${Z}   ← generated, write it down (change it in Settings)"
  say ""; say "  Next: in the web mail, open ${B}Domain & DNS${Z}. Connect Cloudflare there and every record is"
  say "  added for you — or copy them to your DNS host by hand."
  say "  Day to day: ${B}selfmail status${Z} · ${B}selfmail logs${Z} · ${B}sudo selfmail doctor${Z} · ${B}sudo selfmail update${Z}"
  say ""
}

# ================================================================= run ====
say "${B}selfmail $SM_VERSION${Z} — ${PRETTY_NAME:-Linux} ($ARCH)"

step "Node.js"
if NODE="$(find_node)"; then ok "using $NODE ($("$NODE" -v))"; else
  command -v curl >/dev/null 2>&1 && command -v xz >/dev/null 2>&1 || pkg_install curl xz-utils ca-certificates 2>/dev/null || pkg_install curl xz ca-certificates
  install_node; NODE="$APP_DIR/node/bin/node"; ok "installed Node.js $("$NODE" -v) in $APP_DIR/node"; fi

if [ "$MODE_RUN" = update ]; then
  [ -f "$ETC/config.json" ] || die "No existing install found in $ETC — run without --update."
  ensure_user
  PORT="$(node_cfg 'c.port||8088')"; MAILBOX="$(node_cfg c.mailbox)"
  migrate_v1
  deploy_app; install_service; copy_dkim_public
  [ -f /etc/systemd/system/selfmail-health.timer ] && health_timer ""
  sign_agreement 0
  ensure_login
  start_and_check
  ok "updated to $SM_VERSION — settings and mail untouched"
  exit 0
fi

if [ "$MODE_RUN" = adopt ]; then
  step "Adopting the existing mail setup"
  command -v postconf >/dev/null || die "Postfix isn't installed — use a normal install instead."
  ensure_user
  DOMAIN="${DOMAIN:-$(postconf -h virtual_mailbox_domains | cut -d, -f1 | xargs)}"
  is_domain "$DOMAIN" || die "Couldn't work out the mail domain — pass --domain."
  MXHOST="${MXHOST:-$(postconf -h myhostname)}"
  if [ -z "$MAILBOX" ]; then MAILBOX="$(postmap -s hash:/etc/postfix/vmailbox 2>/dev/null | awk -v d="@$DOMAIN" 'index($1,d) {split($1,a,"@"); print a[1]; exit}')"; fi
  [ -n "$MAILBOX" ] || die "Couldn't work out the mailbox — pass --mailbox."
  SELECTOR="${SELECTOR:-$(awk '{print $1}' /etc/opendkim/key.table 2>/dev/null | head -1 | cut -d. -f1)}"; SELECTOR="${SELECTOR:-mail}"
  PORT="${PORT:-8088}"
  [ -n "$PUBLIC_IP" ] || PUBLIC_IP="$(curl -4 -fsS --max-time 8 https://api.ipify.org || true)"
  INMODE="${INMODE:-relay}"
  [[ -z "$SECRET" || "$SECRET" =~ ^[A-Za-z0-9_-]{12,}$ ]] || die "--secret may only use letters, numbers, - and _"
  write_config "$(printf '{"domain":"%s","mxhost":"%s","mailbox":"%s","selector":"%s","publicIp":"%s","mode":"%s","webhookUrl":"%s","port":%s,"tunnelUnit":"%s","inboundSecret":"%s"}' "$DOMAIN" "$MXHOST" "$MAILBOX" "$SELECTOR" "$PUBLIC_IP" "$INMODE" "$WEBHOOK_URL" "$PORT" "${TUNNEL_UNIT:-selfmail-tunnel}" "$SECRET")"
  ok "$MAILBOX@$DOMAIN · host $MXHOST · DKIM selector $SELECTOR"
  chown -R vmail:vmail "$MAILROOT/$DOMAIN" 2>/dev/null || true
  deploy_app; install_service; copy_dkim_public
  [ "$INMODE" = relay ] && [ -n "$WEBHOOK_URL" ] && health_timer ""
  sign_agreement 0; ensure_login; start_and_check; summary
  exit 0
fi

# ----- fresh install -----
step "A few questions"
[ "$INTERACTIVE" = 1 ] && say "  Press Enter to accept the ${D}[default]${Z}."
while :; do ask DOMAIN "Mail domain — the part after the @ (e.g. mail.example.com)"; is_domain "$DOMAIN" && break; warn "that isn't a domain"; DOMAIN=""; [ "$INTERACTIVE" = 1 ] || die "--domain is required"; done
ask MXHOST "This server's host name" "mx.${DOMAIN#*.}"
ask MAILBOX "Your mailbox name (before the @)" "me"
ask SELECTOR "DKIM selector" "mail"
ask PORT "Web mail port" "8088"
if [ -z "$INMODE" ]; then
  say ""; say "  How should incoming mail reach this machine?"
  say "    ${B}1) relay${Z}  — a free relay (Forward Email) receives on port 25 and posts mail here over HTTPS."
  say "                Works on any home connection; no port forwarding. ${G}Recommended.${Z}"
  say "    ${B}2) direct${Z} — this machine receives on port 25 itself (needs port 25 open to the internet)."
  ask CHOICE "Choose 1 or 2" "1"; [ "${CHOICE:-1}" = 2 ] && INMODE=direct || INMODE=relay
fi
if [ "$INMODE" = relay ] && [ -z "$WEBHOOK_URL" ] && [ -z "$TUNNEL" ]; then
  say ""; say "  Relay mode needs a public HTTPS address for this machine. The installer can make one with a free"
  say "  Cloudflare Tunnel (your domain must be on Cloudflare). Only the mail drop-off is reachable through it."
  ask TUNNEL "Create a Cloudflare Tunnel now? (y/n)" "y"
fi
case "${TUNNEL:-n}" in y|Y|yes) TUNNEL=yes; ask TUNNEL_HOST "Public host name for the tunnel" "mailhook.${DOMAIN#*.}" ;; *) TUNNEL=no; [ "$INMODE" = relay ] && ask WEBHOOK_URL "Public HTTPS URL that reaches this machine (blank = later)" "" ;; esac
DETECTED="$(curl -4 -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"
ask PUBLIC_IP "Public IPv4 address" "$DETECTED"
say ""; say "  ${B}$MAILBOX@$DOMAIN${Z} (and every other @$DOMAIN address) · host $MXHOST · $INMODE mode"
if [ "$INTERACTIVE" = 1 ]; then ask GO "Install now? (y/n)" "y"; case "$GO" in y|Y|yes) ;; *) die "Stopped — nothing was changed." ;; esac; fi

mkdir -p "$ETC"; [ -f "$ETC/config.json" ] || echo "{}" > "$ETC/config.json"
sign_agreement 1

step "Packages"
clear_port25
[ "$PM" = apt ] && { echo "postfix postfix/main_mailer_type select Internet Site" | debconf-set-selections; echo "postfix postfix/mailname string $MXHOST" | debconf-set-selections; }
if [ "$PM" = apt ]; then pkg_install postfix opendkim opendkim-tools libsasl2-modules ca-certificates curl sudo psmisc iproute2
else pkg_install postfix opendkim opendkim-tools cyrus-sasl-plain ca-certificates curl sudo psmisc iproute; fi
ok "Postfix and OpenDKIM installed"

ensure_user
step "Mailbox"
for f in "" .Sent .Drafts .Archive .Spam .Trash; do mkdir -p "$MAILROOT/$DOMAIN/$MAILBOX/$f"/{cur,new,tmp}; done
chown -R vmail:vmail "$MAILROOT"; chmod 750 "$MAILROOT"
ok "$MAILROOT/$DOMAIN/$MAILBOX"

configure_postfix
configure_opendkim
[ "$TUNNEL" = yes ] && setup_tunnel
write_config "$(printf '{"domain":"%s","mxhost":"%s","mailbox":"%s","selector":"%s","publicIp":"%s","mode":"%s","webhookUrl":"%s","port":%s,"tunnelUnit":"%s"}' "$DOMAIN" "$MXHOST" "$MAILBOX" "$SELECTOR" "$PUBLIC_IP" "$INMODE" "$WEBHOOK_URL" "$PORT" "${TUNNEL_UNIT:-selfmail-tunnel}")"
deploy_app
install_service
copy_dkim_public
[ "$TUNNEL" = yes ] && health_timer "$TUNNEL_HOST"
ensure_login
systemctl enable postfix >/dev/null 2>&1 || true
start_and_check
summary
