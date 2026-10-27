#!/usr/bin/env bash
# selfmail doctor — finds and fixes the usual reasons mail stops working.
set -u
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo:  sudo selfmail doctor"; exit 1; }
if [ -t 1 ]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; Z=$'\e[0m'; else B= G= Y= R= C= Z=; fi
step() { printf '\n%s▸%s %s%s%s\n' "$C" "$Z" "$B" "$*" "$Z"; }
ok()   { printf '  %s✓%s %s\n' "$G" "$Z" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$Z" "$*"; }
bad()  { printf '  %s✗%s %s\n' "$R" "$Z" "$*"; }
greets() { timeout 10 bash -c 'exec 3<>/dev/tcp/127.0.0.1/25 || exit 1; IFS= read -r -t 8 l <&3 || exit 2; echo "$l"; [[ "$l" == 220* ]]' 2>/dev/null; }

step "Port 25"
for m in exim4 exim sendmail nullmailer opensmtpd citadel; do
  systemctl is-active --quiet "$m" 2>/dev/null && { warn "$m holds port 25 — stopping and disabling it"; systemctl disable --now "$m" >/dev/null 2>&1; }
done
if command -v docker >/dev/null 2>&1 && ss -lntp 2>/dev/null | awk '$4 ~ /:25$/' | grep -q docker-proxy; then
  docker ps --format '{{.ID}} {{.Names}} {{.Ports}}' | grep -E ':25->' | while read -r id name _; do warn "container $name publishes port 25 — stopping it"; docker update --restart=no "$id" >/dev/null; docker stop "$id" >/dev/null; done
fi
if ! postfix status >/dev/null 2>&1 && ss -lntp 2>/dev/null | awk '$4 ~ /:25$/' | grep -q master; then warn "a dead Postfix still holds port 25 — clearing it"; fuser -k 25/tcp >/dev/null 2>&1; sleep 2; fi
owner="$(ss -lntp 2>/dev/null | awk '$4 ~ /:25$/' | grep -oE '"[^"]+"' | head -1 | tr -d '"')"
[ -z "$owner" ] || [ "$owner" = master ] && ok "nothing else is on port 25" || bad "port 25 is held by $owner"

step "Postfix settings"
if [ ! -f /proc/net/if_inet6 ] || [ "$(cat /proc/sys/net/ipv6/conf/all/disable_ipv6 2>/dev/null || echo 0)" = 1 ]; then
  [ "$(postconf -h inet_protocols)" = ipv4 ] || { warn "IPv6 is off but Postfix wanted it — switching Postfix to IPv4"; postconf -e "inet_protocols = ipv4"; }
fi
[ "$(postconf -h milter_connect_timeout)" = 5s ] || { postconf -e "milter_connect_timeout = 5s" "milter_command_timeout = 10s"; ok "capped the OpenDKIM wait (a stuck OpenDKIM no longer blocks sending)"; }
chk="$(postfix check 2>&1)"; [ -z "$chk" ] && ok "postfix check is clean" || { warn "postfix check says:"; echo "$chk" | sed 's/^/      /'; }
for m in vmailbox virtual; do [ -f /etc/postfix/$m ] && postmap /etc/postfix/$m; done; newaliases 2>/dev/null || true

step "OpenDKIM"
mkdir -p /var/spool/postfix/opendkim; chown opendkim:postfix /var/spool/postfix/opendkim 2>/dev/null; chmod 750 /var/spool/postfix/opendkim
id -nG postfix | grep -qw opendkim || usermod -aG opendkim postfix
systemctl restart opendkim; sleep 1
systemctl is-active --quiet opendkim && ok "running" || { bad "won't start:"; journalctl -u opendkim -n 8 --no-pager | sed 's/^/      /'; }

step "Postfix"
systemctl reset-failed postfix >/dev/null 2>&1; systemctl restart postfix; sleep 3
if banner="$(greets)"; then ok "answers: $banner"; else bad "doesn't greet on port 25"; timeout 3 postfix start-fg 2>&1 | head -12 | sed 's/^/      /'; journalctl -u 'postfix*' -n 15 --no-pager | sed 's/^/      /'; fi

step "selfmail"
systemctl restart selfmail; sleep 2
p="$("$(cat /opt/selfmail/.node)" -e 'console.log(JSON.parse(require("fs").readFileSync("/etc/selfmail/config.json","utf8")).port||8088)' 2>/dev/null)"
curl -fsS --max-time 5 "http://127.0.0.1:${p:-8088}/" >/dev/null && ok "web mail answers on port ${p:-8088}" || { bad "web mail isn't answering"; journalctl -u selfmail -n 15 --no-pager | sed 's/^/      /'; }
[ -f /etc/systemd/system/selfmail-tunnel.service ] && { systemctl restart selfmail-tunnel; ok "tunnel restarted"; }
echo
