#!/usr/bin/env bash
#
# selfmail login helper - manage who can sign in to the web interface
#
#   sudo ./update.sh            add or change a login, interactively
#   sudo ./update.sh <user> <pass>   set one non-interactively
#   sudo ./update.sh --list     show configured usernames
#   sudo ./update.sh --remove <user>
#
# Credentials live in /etc/selfmail/users.json as username -> sha256(password).
# The built-in default login below also works until you disable it.
#
set -u
[ "$(id -u)" -eq 0 ] || { echo "run with sudo:  sudo ./update.sh"; exit 1; }

CFG_DIR="/etc/selfmail"
USERS_FILE="$CFG_DIR/users.json"
ENV_FILE="$CFG_DIR/env"

if [ -t 1 ]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; C=$'\e[36m'; Z=$'\e[0m'
else B=""; G=""; Y=""; C=""; Z=""; fi
ok()   { printf '  %s+%s %s\n' "$G" "$Z" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$Z" "$*"; }

sha256() { printf '%s' "$1" | sha256sum | awk '{print $1}'; }

mkdir -p "$CFG_DIR"
[ -f "$USERS_FILE" ] || echo '{}' > "$USERS_FILE"

# Minimal JSON get/set/delete without depending on jq being installed.
users_set() { # user hash
  python3 - "$USERS_FILE" "$1" "$2" <<'PY'
import json,sys
f,u,h=sys.argv[1],sys.argv[2],sys.argv[3]
try: d=json.load(open(f))
except Exception: d={}
d[u]=h
json.dump(d,open(f,'w'),indent=2)
PY
}
users_del() {
  python3 - "$USERS_FILE" "$1" <<'PY'
import json,sys
f,u=sys.argv[1],sys.argv[2]
try: d=json.load(open(f))
except Exception: d={}
d.pop(u,None)
json.dump(d,open(f,'w'),indent=2)
PY
}
users_list() {
  python3 - "$USERS_FILE" <<'PY'
import json,sys
try: d=json.load(open(sys.argv[1]))
except Exception: d={}
for k in d: print("  -", k)
PY
}

finish() {
  chown root:selfmail "$USERS_FILE" 2>/dev/null || true
  chmod 640 "$USERS_FILE"
  systemctl restart selfmail 2>/dev/null || true
  echo
  ok "Saved. The web interface will accept the new login immediately."
  PORT="$(awk -F= '/^SELFMAIL_PORT=/{print $2}' "$ENV_FILE" 2>/dev/null)"
  HOST_PUB="$(awk '/hostname:/ {print $3; exit}' /etc/cloudflared/config.yml 2>/dev/null)"
  echo "  web UI: http://$(hostname -I 2>/dev/null | awk '{print $1}'):${PORT:-8088}"
  [ -n "$HOST_PUB" ] && echo "  public: https://$HOST_PUB"
}

case "${1:-}" in
  --list)
    echo "${B}Configured logins:${Z}"; users_list
    echo "  (the built-in default 'adminpass' also works unless disabled)"
    exit 0 ;;
  --remove)
    [ -n "${2:-}" ] || { echo "usage: sudo ./update.sh --remove <user>"; exit 1; }
    users_del "$2"; ok "removed $2"; finish; exit 0 ;;
  --disable-default)
    # persist the kill switch for the published default credential
    grep -q '^SELFMAIL_DISABLE_DEFAULT=' "$ENV_FILE" 2>/dev/null \
      && sed -i 's/^SELFMAIL_DISABLE_DEFAULT=.*/SELFMAIL_DISABLE_DEFAULT=1/' "$ENV_FILE" \
      || echo 'SELFMAIL_DISABLE_DEFAULT=1' >> "$ENV_FILE"
    ok "built-in default login disabled"; finish; exit 0 ;;
esac

U="${1:-}"; P="${2:-}"
if [ -z "$U" ]; then
  printf '  %sWeb login username:%s ' "$B" "$Z"
  if [ -e /dev/tty ]; then read -r U </dev/tty; else read -r U; fi
fi
if [ -z "$P" ]; then
  printf '  Password: '
  if [ -e /dev/tty ]; then read -r -s P </dev/tty; else read -r P; fi
  printf '\n'
fi
[ -n "$U" ] && [ -n "$P" ] || { echo "username and password are both required"; exit 1; }

users_set "$U" "$(sha256 "$P")"
ok "login '$U' set"
finish
