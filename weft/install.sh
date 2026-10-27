#!/usr/bin/env bash
# Install or link selfmail. Needs root (Postfix, OpenDKIM, a system service): the host
# asked you first, and sudo gets the password from the host (sudo -A), never from here.
set -euo pipefail
cd "$(dirname "$0")/.."
. weft/lib.sh
mkdir -p "$DATA"; chmod 700 "$DATA"

# The gate's key: its dashboard opens the web mail with it, and Bulwark uses it for alert emails.
if [ ! -s "$KEY" ]; then ( umask 077; head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | head -c 48 > "$KEY" ); fi

# Already linked (selfmail's own installer did it): nothing needs root, just confirm.
if installed && [ "${ADDON_UPDATE:-0}" != 1 ]; then
  lp="$(port)"; lp="${lp:-8088}"
  if curl -fsS --max-time 6 -H "x-selfmail-key: $(cat "$KEY")" "http://127.0.0.1:$lp/api/host/overview" >/dev/null 2>&1; then
    [ -s "$LINK" ] || printf '{"port": %s, "linkedAt": %s}\n' "$lp" "$(date +%s)" > "$LINK"
    [ -n "${ADDON_HOST_URL:-}" ] && echo "::open ${ADDON_HOST_URL%/}/__gate/selfmail/"
    echo "::progress 100 Linked"
    echo "selfmail $(app_version) is linked to this dashboard."
    exit 0
  fi
fi

echo "::phase Checking administrator access"
"${SUDO[@]}" true 2>/dev/null || { echo "::warn selfmail needs root to configure Postfix and OpenDKIM, and sudo didn't allow it. Install it again from the dashboard and enter your password when asked."; exit 1; }

if installed; then
  [ -f "$DATA/linked" ] || [ "${ADDON_UPDATE:-0}" = 1 ] || echo yes > "$DATA/linked"   # it was here before the addon
  echo "::phase Updating selfmail and linking it to this dashboard"
  echo "::progress 20 Updating"
  "${SUDO[@]}" bash ./setup.sh --update --yes --no-aegis --host-key-file "$KEY"
else
  [ -n "${ADDON_SETTING_DOMAIN:-}" ] || { echo "::warn Set “Mail domain” in the addon settings first (for example mail.example.com) — nothing was installed."; exit 1; }
  [ -n "${ADDON_SETTING_AGREE_NAME:-}" ] || { echo "::warn Type your full name in “Your full name” (settings) to accept the responsible-use agreement — nothing was installed."; exit 1; }
  echo "::phase Installing Postfix, OpenDKIM and selfmail"
  echo "::progress 10 Installing"
  pw="$DATA/.pw"; ( umask 077; printf '%s' "${ADDON_SETTING_WEB_PASSWORD:-}" > "$pw" )
  args=(--yes --agree "$ADDON_SETTING_AGREE_NAME" --domain "$ADDON_SETTING_DOMAIN" --mailbox "${ADDON_SETTING_MAILBOX:-me}"
        --mode "${ADDON_SETTING_INBOUND:-relay}" --user "${ADDON_SETTING_MAILBOX:-me}" --host-key-file "$KEY" --tunnel no --no-aegis)
  [ -s "$pw" ] && args+=(--password-file "$pw")
  "${SUDO[@]}" bash ./setup.sh "${args[@]}" || { rm -f "$pw"; exit 1; }
  rm -f "$pw"
fi

echo "::progress 90 Linking"
p="$("${SUDO[@]}" sed -n 's/.*"port": *\([0-9]*\).*/\1/p' /etc/selfmail/config.json | head -1)"
printf '{"port": %s, "linkedAt": %s}\n' "${p:-8088}" "$(date +%s)" > "$LINK"
for i in $(seq 1 20); do curl -fsS --max-time 2 "$(url)/health" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS --max-time 3 "$(url)/health" >/dev/null || echo "::warn selfmail isn't answering yet — check: journalctl -u selfmail -n 30"
[ -n "${ADDON_HOST_URL:-}" ] && echo "::open ${ADDON_HOST_URL%/}/__gate/selfmail/"
echo "::progress 100 Done"
echo "selfmail $(app_version) is linked: open it from the dashboard's home or the Burrow page."
