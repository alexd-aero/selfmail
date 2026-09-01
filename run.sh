#!/usr/bin/env bash
# Start selfmail and its tunnel (if configured), then report status.
set -u
[ "$(id -u)" -eq 0 ] || { echo "run with sudo: sudo ./run.sh"; exit 1; }

UNITS="postfix opendkim selfmail"
[ -f /etc/systemd/system/selfmail-tunnel.service ] && UNITS="$UNITS selfmail-tunnel"

for u in $UNITS; do systemctl start "$u" 2>/dev/null; done
[ -f /etc/systemd/system/selfmail-health.timer ] && systemctl start selfmail-health.timer 2>/dev/null
sleep 2

echo "service status:"
for u in $UNITS; do printf '  %-18s %s\n' "$u" "$(systemctl is-active "$u")"; done

PORT="$(awk -F= '/^SELFMAIL_PORT=/{print $2}' /etc/selfmail/env 2>/dev/null)"
echo
echo "web UI: http://$(hostname -I 2>/dev/null | awk '{print $1}'):${PORT:-8088}"
HOST_PUB="$(awk '/hostname:/ {print $3; exit}' /etc/cloudflared/config.yml 2>/dev/null)"
[ -n "$HOST_PUB" ] && echo "public: https://$HOST_PUB"
