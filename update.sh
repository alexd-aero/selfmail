#!/usr/bin/env bash
#
# selfmail updater
#
#   sudo ./update.sh
#
# Pulls the latest code, installs it over the running copy, re-applies the
# Postfix settings that ship with the app, clears anything squatting on port 25,
# restarts everything and verifies the send path really works.
# Your configuration, DKIM key, mailboxes and tunnel are left alone.
#
set -u

APP_DIR="/opt/selfmail"
CFG_DIR="/etc/selfmail"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -t 1 ]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; Z=$'\e[0m'
else B=""; G=""; Y=""; R=""; C=""; Z=""; fi
step() { printf '\n%s==>%s %s%s%s\n' "$C" "$Z" "$B" "$*" "$Z"; }
ok()   { printf '  %s+%s %s\n' "$G" "$Z" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$Z" "$*"; }
die()  { printf '\n%sError:%s %s\n' "$R" "$Z" "$*" >&2; exit 1; }

# `postfix status` only proves the master is alive. Sending needs smtpd to
# actually greet, which fails separately - and silently. Prints the banner;
# returns 0 greeting, 1 nothing listening, 2 connected but no greeting.
smtp_probe() {
  local out rc
  out="$(timeout 8 bash -c '
    exec 3<>/dev/tcp/127.0.0.1/25 2>/dev/null || exit 1
    IFS= read -r -t 6 l <&3 || exit 2
    printf "%s" "$l"' 2>/dev/null)"
  rc=$?
  printf '%s' "${out//$'\r'/}"
  return $rc
}

report_smtp() {
  local banner rc
  banner="$(smtp_probe)"; rc=$?
  case "$rc" in
    0)
      case "$banner" in
        220*) ok "smtpd greets on 127.0.0.1:25 - $banner"; return 0 ;;
        *)    warn "port 25 answered with something that is not SMTP: $banner" ;;
      esac
      ;;
    1) warn "nothing is listening on 127.0.0.1:25 - postfix is not running" ;;
    *)
      warn "port 25 accepted the connection but sent no greeting"
      warn "that is exactly what makes the web UI report \"Greeting never received\""
      warn "smtpd consults the OpenDKIM milter before it greets - check:"
      warn "  systemctl status opendkim ; journalctl -u opendkim -n 30"
      ;;
  esac
  echo "  Holding port 25 right now:"
  ss -lntp 2>/dev/null | awk 'NR==1 || $4 ~ /:25$/' | sed 's/^/    /'
  return 1
}

[ "$(id -u)" -eq 0 ] || die "run with sudo:  sudo ./update.sh"
[ -d "$APP_DIR" ] || die "$APP_DIR not found - run setup.sh first, this only updates an existing install"

# ------------------------------------------------------------ git pull ----
step "Pulling latest code"
if [ -d "$SRC_DIR/.git" ]; then
  # The repo is usually owned by a normal user; running git as root in it
  # trips "detected dubious ownership", so pull as the owner when we can.
  REPO_OWNER="$(stat -c '%U' "$SRC_DIR" 2>/dev/null || echo root)"
  if [ "$REPO_OWNER" != root ] && id "$REPO_OWNER" >/dev/null 2>&1; then
    sudo -u "$REPO_OWNER" git -C "$SRC_DIR" pull --ff-only 2>&1 | sed 's/^/  /' || \
      warn "pull failed - continuing with the files already on disk"
  else
    git config --global --add safe.directory "$SRC_DIR" 2>/dev/null || true
    git -C "$SRC_DIR" pull --ff-only 2>&1 | sed 's/^/  /' || \
      warn "pull failed - continuing with the files already on disk"
  fi
  ok "now at $(git -C "$SRC_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
else
  warn "not a git checkout - installing the files in $SRC_DIR as-is"
fi

# --------------------------------------------------------- install code ---
step "Installing application files"
[ -f "$SRC_DIR/server.js" ] || die "server.js missing from $SRC_DIR"
cp "$SRC_DIR/server.js" "$APP_DIR/server.js"
cp "$SRC_DIR/package.json" "$APP_DIR/package.json" 2>/dev/null || true
mkdir -p "$APP_DIR/public"
cp -r "$SRC_DIR/public/." "$APP_DIR/public/" 2>/dev/null || true

APP_USER="selfmail"
id "$APP_USER" >/dev/null 2>&1 || APP_USER=root
chown -R "$APP_USER":"$APP_USER" "$APP_DIR" 2>/dev/null || true
ok "code copied to $APP_DIR"

if [ -f "$APP_DIR/package.json" ]; then
  ( cd "$APP_DIR" && npm install --omit=dev --silent --no-audit --no-fund >/dev/null 2>&1 ) && \
    ok "dependencies up to date" || warn "npm install had problems - the app may still run"
  chown -R "$APP_USER":"$APP_USER" "$APP_DIR" 2>/dev/null || true
fi

# --------------------------------------------------- postfix / opendkim ---
# update.sh used to copy only application files, so a Postfix setting shipped
# with a fix never reached anyone who had already installed. Re-apply the ones
# this app owns; they are idempotent and leave the rest of main.cf alone.
step "Re-applying mail settings"
if command -v postconf >/dev/null 2>&1; then
  # smtpd asks the milter about a connection *before* it sends the 220 banner,
  # and milter_connect_timeout defaults to 30s. An OpenDKIM that is listening
  # but not answering therefore holds the greeting for half a minute, which
  # clients report as "Greeting never received". milter_default_action does not
  # help - it covers a refused milter connection, not a silent one.
  postconf -e \
    "milter_connect_timeout = 5s" \
    "milter_command_timeout = 10s" \
    "milter_content_timeout = 30s" 2>/dev/null \
    && ok "milter handshake capped at 5s (was Postfix's 30s default)" \
    || warn "could not update main.cf - is postfix installed?"
else
  warn "postconf not found - skipping mail settings"
fi

# The milter socket must exist before Postfix starts handing connections to it.
if [ -S /var/spool/postfix/opendkim/opendkim.sock ]; then
  ok "opendkim milter socket present"
else
  warn "opendkim milter socket missing - mail will send but go unsigned"
  warn "check: journalctl -u opendkim -n 30"
fi

# ------------------------------------------------------------ port 25 -----
step "Checking port 25"
CLEARED=0
for m in exim4 exim sendmail nullmailer opensmtpd citadel; do
  if systemctl is-active --quiet "$m" 2>/dev/null; then
    warn "$m owns port 25 - stopping and disabling it"
    systemctl stop "$m" 2>/dev/null || true
    systemctl disable "$m" >/dev/null 2>&1 || true
    CLEARED=1
  fi
done
[ "$CLEARED" = 1 ] && sleep 2
[ "$CLEARED" = 0 ] && ok "no conflicting mail server running"

# ------------------------------------------------------------ restart -----
step "Restarting services"
systemctl daemon-reload 2>/dev/null || true
UNITS="postfix opendkim selfmail"
[ -f /etc/systemd/system/selfmail-tunnel.service ] && UNITS="$UNITS selfmail-tunnel"
for u in $UNITS; do systemctl restart "$u" 2>/dev/null || true; done
[ -f /etc/systemd/system/selfmail-health.timer ] && systemctl start selfmail-health.timer 2>/dev/null || true
sleep 3

FAILED=0
for u in $UNITS; do
  if [ "$u" = postfix ]; then
    # postfix.service is a wrapper on Debian/Ubuntu and reports active even
    # when the master failed to bind, so ask postfix itself.
    if postfix status >/dev/null 2>&1; then ok "postfix running"
    else warn "postfix NOT running"; FAILED=1; fi
  elif [ "$(systemctl is-active "$u")" = active ]; then ok "$u running"
  else warn "$u NOT running - journalctl -u $u -n 40"; FAILED=1; fi
done

if [ "$FAILED" = 1 ]; then
  echo
  echo "  Holding port 25 right now:"
  ss -lntp 2>/dev/null | awk 'NR==1 || $4 ~ /:25$/' | sed 's/^/    /'
fi

# The units can all be "active" while sending is still broken, so check the one
# thing that actually matters: does smtpd greet?
step "Verifying the send path"
report_smtp || FAILED=1

# ------------------------------------------------------------- report -----
PORT="$(awk -F= '/^SELFMAIL_PORT=/{print $2}' "$CFG_DIR/env" 2>/dev/null)"
HOST_PUB="$(awk '/hostname:/ {print $3; exit}' /etc/cloudflared/config.yml 2>/dev/null)"
LAN="$(hostname -I 2>/dev/null | awk '{print $1}')"

step "Done"
echo "  web UI:  http://${LAN:-localhost}:${PORT:-8088}"
[ -n "$HOST_PUB" ] && echo "  public:  https://$HOST_PUB"
echo
echo "  Open the DNS tab and press Check records to re-verify."

# This script used to delete itself here. It no longer does: an updater that
# removes itself cannot deliver the next fix, and re-running it is the
# documented way to repair an install.
exit 0
