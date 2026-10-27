#!/usr/bin/env bash
#
# selfmail nuke — removes every trace of selfmail (any version, including half-installed or broken ones),
# frees port 25, and then offers to install the current version.
#
#   curl -fsSL https://raw.githubusercontent.com/alexd-aero/selfmail/main/nuke.sh | sudo bash
#   sudo bash nuke.sh [--yes] [--delete-mail | --keep-mail] [--purge-packages] [--no-install]
#
# It shows everything it found and asks before deleting anything (type NUKE). Your mail
# (/var/mail/vhosts) is only deleted if you say so separately. --yes skips the questions
# (mail is then KEPT unless you also pass --delete-mail).
set -uo pipefail

if [ -t 1 ]; then B=$'\e[1m'; D=$'\e[2m'; G=$'\e[32m'; R=$'\e[31m'; Y=$'\e[33m'; Z=$'\e[0m'; else B= D= G= R= Y= Z=; fi
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s▸ %s%s\n' "$B" "$*" "$Z"; }
ok()   { printf '  %s✓%s %s\n' "$G" "$Z" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$Z" "$*"; }
die()  { printf '\n%s✗ %s%s\n' "$R" "$*" "$Z" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run it as root:  sudo bash nuke.sh"
YES=0; MAIL=ask; PURGE=ask; INSTALL=ask
for a in "$@"; do case "$a" in
  --yes|-y) YES=1 ;; --delete-mail) MAIL=yes ;; --keep-mail) MAIL=no ;; --purge-packages) PURGE=yes ;; --no-install) INSTALL=no ;;
  -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) die "Unknown option: $a" ;;
esac; done
TTY=/dev/tty; [ -r "$TTY" ] && [ -w "$TTY" ] || TTY=""
ask() { # ask "question" default(y|n) -> 0 yes, 1 no
  local q="$1" d="$2" a=""
  if [ "$YES" = 1 ] || [ -z "$TTY" ]; then [ "$d" = y ]; return; fi
  printf '  %s %s ' "$q" "$([ "$d" = y ] && echo '[Y/n]' || echo '[y/N]')" > "$TTY"; read -r a < "$TTY" || true
  a="${a:-$d}"; [[ "$a" =~ ^[Yy] ]]
}

say "${B}selfmail nuke${Z} — finds and removes every selfmail install on this machine"

# ------------------------------------------------------------------- find it all --
step "Looking for selfmail"
UNITS=(); FILES=(); DIRS=(); CLONES=(); USERS=(); PORT25=(); CONTAINERS=()
for u in $(systemctl list-unit-files --no-legend 2>/dev/null | awk '{print $1}' | grep -E '^(selfmail|mailui)[A-Za-z0-9@._-]*\.(service|timer|path|socket)$'); do UNITS+=("$u"); done
for f in /etc/systemd/system/selfmail* /etc/systemd/system/mailui* /lib/systemd/system/selfmail* /usr/lib/systemd/system/selfmail*; do
  [ -e "$f" ] || continue; u="$(basename "$f")"; [[ " ${UNITS[*]-} " == *" $u "* ]] || UNITS+=("$u"); FILES+=("$f")
done
for d in /opt/selfmail /etc/selfmail /var/lib/selfmail /opt/mailui /var/lib/mailui; do [ -e "$d" ] && DIRS+=("$d"); done
for f in /usr/local/bin/selfmail /usr/local/bin/selfmail-health /usr/local/bin/selfmail-root /etc/sudoers.d/selfmail /etc/sudoers.d/mailui \
         /etc/mailui.env /etc/cloudflared/selfmail.yml /etc/postfix/vmailbox /etc/postfix/vmailbox.db /etc/postfix/virtual /etc/postfix/virtual.db \
         /etc/postfix/sasl_passwd /etc/postfix/sasl_passwd.db /etc/postfix/tls_policy /etc/postfix/tls_policy.db; do
  [ -e "$f" ] && FILES+=("$f")
done
# selfmail's own OpenDKIM setup (only when it's selfmail's: its socket path is in the config)
DKIM=0; grep -qs 'opendkim/opendkim.sock' /etc/opendkim.conf && { DKIM=1; FILES+=(/etc/opendkim.conf); for d in /etc/opendkim/keys; do [ -e "$d" ] && DIRS+=("$d"); done
  for f in /etc/opendkim/key.table /etc/opendkim/signing.table /etc/opendkim/trusted.hosts; do [ -e "$f" ] && FILES+=("$f"); done; }
# copies of the selfmail source in home folders (git clones or unpacked downloads)
while IFS= read -r d; do
  d="$(dirname "$d")"
  [[ " ${DIRS[*]-} " == *" $d "* ]] && continue
  { grep -qs 'selfmail' "$d/setup.sh" || git -C "$d" remote -v 2>/dev/null | grep -q 'selfmail'; } && CLONES+=("$d")
done < <(find /home /root /opt /srv -maxdepth 4 -name setup.sh -path '*selfmail*' ! -path '*/data/addons/*' 2>/dev/null; find /home /root -maxdepth 3 -type d -name mailui -exec sh -c 'echo "$1/setup.sh"' _ {} \; 2>/dev/null)
for u in selfmail vmail; do id "$u" >/dev/null 2>&1 && USERS+=("$u"); done
MAILN=0; [ -d /var/mail/vhosts ] && MAILN=$(find /var/mail/vhosts -type f -path '*/cur/*' -o -type f -path '*/new/*' 2>/dev/null | wc -l)
# whatever holds port 25
while IFS= read -r x; do PORT25+=("$x"); done < <(ss -Hltnp 'sport = :25' 2>/dev/null | grep -oE '\("[^"]+",pid=[0-9]+' | sed -E 's/^\("([^"]+)",pid=([0-9]+)$/\2:\1/' | sort -u)
command -v docker >/dev/null 2>&1 && while read -r id n p; do [[ "$p" == *":25->"* ]] && CONTAINERS+=("$id:$n"); done < <(docker ps --format '{{.ID}} {{.Names}} {{.Ports}}' 2>/dev/null)

found=$(( ${#UNITS[@]} + ${#FILES[@]} + ${#DIRS[@]} + ${#CLONES[@]} + ${#USERS[@]} + ${#PORT25[@]} + ${#CONTAINERS[@]} ))
[ "${#UNITS[@]}" -gt 0 ]  && { say "  ${B}Services${Z}";   printf '    %s\n' "${UNITS[@]}"; }
[ "${#DIRS[@]}" -gt 0 ]   && { say "  ${B}Folders${Z}";    printf '    %s\n' "${DIRS[@]}"; }
[ "${#FILES[@]}" -gt 0 ]  && { say "  ${B}Files${Z}";      printf '    %s\n' "${FILES[@]}"; }
[ "${#CLONES[@]}" -gt 0 ] && { say "  ${B}Source copies${Z}"; printf '    %s\n' "${CLONES[@]}"; }
[ "${#USERS[@]}" -gt 0 ]  && { say "  ${B}Users${Z}";      printf '    %s\n' "${USERS[@]}"; }
[ "${#PORT25[@]}" -gt 0 ] && { say "  ${B}Using port 25${Z}"; for x in "${PORT25[@]}"; do say "    ${x#*:} (pid ${x%%:*})"; done; }
[ "${#CONTAINERS[@]}" -gt 0 ] && { say "  ${B}Containers publishing port 25${Z}"; for x in "${CONTAINERS[@]}"; do say "    ${x#*:}"; done; }
[ -d /var/mail/vhosts ] && say "  ${B}Mail${Z}  /var/mail/vhosts — $MAILN message(s) ${D}(asked separately)${Z}"
[ -f /etc/postfix/main.cf.selfmail-backup ] && say "  ${B}Postfix${Z}  main.cf goes back to the copy saved before selfmail"
if [ "$found" -eq 0 ] && [ ! -d /var/mail/vhosts ]; then ok "nothing of selfmail here, and port 25 is free"; else

# ------------------------------------------------------------------- confirm --
  if [ "$YES" = 0 ]; then
    [ -n "$TTY" ] || die "No terminal to ask on — run it again with --yes to go ahead."
    printf '\n  %sThis deletes everything listed above.%s Type %sNUKE%s to go on: ' "$R" "$Z" "$B" "$Z" > "$TTY"; read -r a < "$TTY" || true
    [ "$a" = NUKE ] || die "Stopped — nothing was changed."
  fi
  DELMAIL=0
  if [ -d /var/mail/vhosts ]; then
    case "$MAIL" in yes) DELMAIL=1 ;; no) DELMAIL=0 ;; *) ask "Also delete ALL MAIL in /var/mail/vhosts ($MAILN messages)? This can't be undone." n && DELMAIL=1 ;; esac
  fi

# ------------------------------------------------------------------- remove --
  step "Stopping services"
  for u in "${UNITS[@]}"; do systemctl disable --now "$u" >/dev/null 2>&1; ok "stopped $u"; done
  pkill -u selfmail 2>/dev/null || true

  step "Freeing port 25"
  for x in "${CONTAINERS[@]}"; do id="${x%%:*}"; docker update --restart=no "$id" >/dev/null 2>&1; docker stop "$id" >/dev/null 2>&1 && ok "stopped container ${x#*:}"; done
  pf=0
  for x in "${PORT25[@]}"; do
    pid="${x%%:*}"; name="${x#*:}"
    if [[ "$name" =~ ^(master|smtpd|postscreen)$ ]]; then [ "$pf" = 0 ] && { systemctl stop postfix >/dev/null 2>&1 || postfix stop >/dev/null 2>&1; ok "stopped Postfix"; pf=1; }; continue; fi
    kill -TERM "$pid" 2>/dev/null; for i in 1 2 3 4 5; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
    ok "ended $name (pid $pid)"
  done
  sleep 1
  if ss -Hltn 'sport = :25' 2>/dev/null | grep -q .; then
    pids="$(ss -Hltnp 'sport = :25' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | sort -u)"
    for p in $pids; do kill -KILL "$p" 2>/dev/null; done; sleep 1
  fi
  ss -Hltn 'sport = :25' 2>/dev/null | grep -q . && warn "something still listens on port 25 (a supervisor may have restarted it)" || ok "port 25 is free"

  step "Removing files"
  for f in "${FILES[@]}"; do rm -f "$f" && ok "$f"; done
  for d in "${DIRS[@]}" "${CLONES[@]}"; do rm -rf --one-file-system "$d" && ok "$d"; done
  rm -f /etc/systemd/system/multi-user.target.wants/selfmail* /etc/systemd/system/timers.target.wants/selfmail* 2>/dev/null
  systemctl daemon-reload; systemctl reset-failed 'selfmail*' >/dev/null 2>&1 || true
  if [ -f /etc/postfix/main.cf.selfmail-backup ]; then mv -f /etc/postfix/main.cf.selfmail-backup /etc/postfix/main.cf && ok "Postfix main.cf restored"
  elif command -v postconf >/dev/null 2>&1 && postconf -h virtual_mailbox_maps 2>/dev/null | grep -q vmailbox; then
    postconf -e "virtual_mailbox_domains =" "virtual_mailbox_maps =" "virtual_alias_maps =" "smtpd_milters =" "non_smtpd_milters =" "relayhost =" "smtp_fallback_relay =" "smtp_sasl_auth_enable = no" 2>/dev/null && ok "Postfix: selfmail's settings removed"
  fi
  [ "$DKIM" = 1 ] && [ -f /etc/default/opendkim ] && sed -i 's|^SOCKET=local:/var/spool/postfix/opendkim/opendkim.sock|#&|' /etc/default/opendkim
  rm -rf /var/spool/postfix/opendkim 2>/dev/null
  if [ "$DELMAIL" = 1 ]; then rm -rf --one-file-system /var/mail/vhosts && ok "mail deleted"; elif [ -d /var/mail/vhosts ]; then ok "mail kept in /var/mail/vhosts"; fi
  for u in selfmail vmail; do
    id "$u" >/dev/null 2>&1 || continue
    [ "$u" = vmail ] && [ "$DELMAIL" = 0 ] && [ -d /var/mail/vhosts ] && { ok "kept user vmail (it owns your mail)"; continue; }
    pkill -u "$u" 2>/dev/null; userdel "$u" 2>/dev/null && ok "user $u removed"
  done
  getent group vmail >/dev/null && ! id vmail >/dev/null 2>&1 && groupdel vmail 2>/dev/null || true

  PURGEDO=0
  if command -v postfix >/dev/null 2>&1 || command -v opendkim >/dev/null 2>&1; then
    case "$PURGE" in yes) PURGEDO=1 ;; *) [ "$YES" = 0 ] && ask "Also uninstall Postfix and OpenDKIM themselves? (a new selfmail installs them again)" n && PURGEDO=1 ;; esac
  fi
  if [ "$PURGEDO" = 1 ]; then
    step "Uninstalling Postfix and OpenDKIM"
    if command -v apt-get >/dev/null 2>&1; then DEBIAN_FRONTEND=noninteractive apt-get purge -y -qq postfix opendkim opendkim-tools >/dev/null 2>&1
    elif command -v dnf >/dev/null 2>&1; then dnf remove -y -q postfix opendkim opendkim-tools >/dev/null 2>&1; fi
    ok "removed"
  elif systemctl list-unit-files postfix.service >/dev/null 2>&1; then
    systemctl stop opendkim >/dev/null 2>&1 || true
  fi
  printf '\n%s✓ selfmail is gone.%s\n' "$G" "$Z"
fi

# ------------------------------------------------------------------- reinstall --
[ "$INSTALL" = no ] && exit 0
[ -n "$TTY" ] || { say "To install the current selfmail:  git clone https://github.com/alexd-aero/selfmail && sudo ./selfmail/setup.sh"; exit 0; }
YES=0
if ask "Install the new, stable selfmail now?" y; then
  command -v git >/dev/null 2>&1 || { command -v apt-get >/dev/null 2>&1 && apt-get install -y -qq git >/dev/null 2>&1; command -v dnf >/dev/null 2>&1 && dnf install -y -q git >/dev/null 2>&1; } || true
  dir="$(mktemp -d /tmp/selfmail-XXXX)"
  step "Downloading selfmail"
  if git -c http.version=HTTP/1.1 clone -q --depth 1 https://github.com/alexd-aero/selfmail "$dir/selfmail" 2>/dev/null || { mkdir -p "$dir/selfmail" && curl -fsSL https://codeload.github.com/alexd-aero/selfmail/tar.gz/main | tar -xz -C "$dir/selfmail" --strip-components=1; }; then
    ok "$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$dir/selfmail/app/package.json" | head -1)"
    exec bash "$dir/selfmail/setup.sh" < "$TTY"
  else die "Couldn't download selfmail — check the internet connection."; fi
else
  say "  Later:  git clone https://github.com/alexd-aero/selfmail && sudo ./selfmail/setup.sh"
fi
