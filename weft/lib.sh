# Shared bits for selfmail's Weft scripts (Aegis × Burrow addon).
APP=/opt/selfmail
DATA="${ADDON_DATA:-$HOME/.local/share/selfmail-addon}"
KEY="$DATA/host.key"
LINK="$DATA/link.json"
installed() { [ -f "$APP/app/package.json" ]; }
app_version() { sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$APP/app/package.json" 2>/dev/null | head -1; }
port() { sed -n 's/.*"port": *\([0-9]*\).*/\1/p' "$LINK" 2>/dev/null | head -1; }
url() { echo "http://127.0.0.1:$(port || true)"; }
# Root goes through the host: it asked you first and hands sudo the password itself (sudo -A).
SUDO=(sudo -n)
[ -n "${SUDO_ASKPASS:-}" ] && SUDO=(sudo -A)
api() { # api METHOD PATH [JSON]
  curl -fsS --max-time 20 -X "$1" -H "x-selfmail-key: $(cat "$KEY" 2>/dev/null)" -H 'X-Selfmail: 1' -H 'Content-Type: application/json' \
       ${3:+--data "$3"} "$(url)$2"
}
