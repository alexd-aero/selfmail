#!/usr/bin/env bash
#
# selfmail outbound relay (smarthost) configuration
#
#   sudo ./relay.sh          configure or change the relay
#   sudo ./relay.sh --off    go back to sending direct to recipient MX
#
# Why you would want this: mail sent straight from a home connection is
# usually rejected or junked, and that is a property of the IP, not of your
# configuration. Residential ranges sit on Spamhaus's PBL, so Microsoft
# refuses them outright ("550 5.7.1 ... blocked using Spamhaus") and Gmail
# files them as spam. Reverse DNS cannot be fixed on a consumer connection
# either, so `iprev` fails no matter what you do.
#
# Relaying outbound through a provider that has proper reverse DNS and a
# sending reputation fixes both. You still receive on your own hardware;
# only the last hop out changes. Your mail is still signed with your DKIM
# key and still comes from your domain.
#
set -u

[ "$(id -u)" -eq 0 ] || { echo "run with sudo:  sudo ./relay.sh"; exit 1; }
command -v postconf >/dev/null 2>&1 || { echo "postfix is not installed"; exit 1; }

if [ -t 1 ]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; C=$'\e[36m'; Z=$'\e[0m'
else B=""; G=""; Y=""; C=""; Z=""; fi
step() { printf '\n%s==>%s %s%s%s\n' "$C" "$Z" "$B" "$*" "$Z"; }
ok()   { printf '  %s+%s %s\n' "$G" "$Z" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$Z" "$*"; }

# ------------------------------------------------------------------ off ---
if [ "${1:-}" = "--off" ]; then
  step "Disabling relay"
  postconf -e "relayhost =" "smtp_sasl_auth_enable = no"
  rm -f /etc/postfix/sasl_passwd /etc/postfix/sasl_passwd.db
  systemctl restart postfix
  ok "sending direct to recipient MX again"
  exit 0
fi

step "Outbound relay setup"
cat <<'INTRO'
  Mail from a home IP is refused by Microsoft and junked by Gmail because
  the IP is on Spamhaus and has no forward-confirmed reverse DNS. Neither
  is fixable from this machine. Relaying outbound through a provider fixes
  both; you keep receiving mail here.

  Any SMTP provider works. Free tiers that are enough for personal use:

    Brevo      smtp-relay.brevo.com      587    300/day
    SMTP2GO    mail.smtp2go.com          587    1000/month
    Resend     smtp.resend.com           587    3000/month
    Mailgun    smtp.mailgun.org          587    trial
    Gmail      smtp.gmail.com            587    needs an App Password

  Create an account, verify your sending domain there (they will give you
  DKIM/SPF records - add those too), then paste the SMTP credentials below.

INTRO

read_val() { # read_val VAR "prompt" "default"
  local __v="$1" __p="$2" __d="${3:-}" __in=""
  if [ -n "$__d" ]; then printf '  %s [%s]: ' "$__p" "$__d"; else printf '  %s: ' "$__p"; fi
  if [ -t 0 ] && [ -e /dev/tty ]; then read -r __in </dev/tty || true; else read -r __in || true; fi
  [ -z "$__in" ] && __in="$__d"
  printf -v "$__v" '%s' "$__in"
}

RELAY_HOST=""
while [ -z "$RELAY_HOST" ]; do read_val RELAY_HOST "SMTP server hostname"; done
read_val RELAY_PORT "Port" "587"
read_val RELAY_USER "Username"

RELAY_PASS=""
printf '  Password / API key: '
if [ -t 0 ] && [ -e /dev/tty ]; then read -r -s RELAY_PASS </dev/tty || true; else read -r RELAY_PASS || true; fi
printf '\n'
[ -n "$RELAY_PASS" ] || { echo "  a password is required"; exit 1; }

# Debian ships postfix without the SASL client modules; without them auth
# silently fails with "no mechanism available" and every message defers.
step "Installing SASL modules"
if command -v apt-get >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq libsasl2-modules >/dev/null 2>&1 \
    && ok "libsasl2-modules present" || warn "could not install libsasl2-modules"
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y -q cyrus-sasl-plain >/dev/null 2>&1 && ok "cyrus-sasl-plain present" || warn "could not install cyrus-sasl-plain"
fi

step "Configuring Postfix"
printf '[%s]:%s %s:%s\n' "$RELAY_HOST" "$RELAY_PORT" "$RELAY_USER" "$RELAY_PASS" > /etc/postfix/sasl_passwd
chmod 600 /etc/postfix/sasl_passwd
postmap /etc/postfix/sasl_passwd
chmod 600 /etc/postfix/sasl_passwd.db 2>/dev/null || true

postconf -e \
  "relayhost = [$RELAY_HOST]:$RELAY_PORT" \
  "smtp_sasl_auth_enable = yes" \
  "smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd" \
  "smtp_sasl_security_options = noanonymous" \
  "smtp_sasl_tls_security_options = noanonymous" \
  "smtp_tls_security_level = encrypt" \
  "smtp_use_tls = yes"

systemctl restart postfix
sleep 2
ok "relaying through [$RELAY_HOST]:$RELAY_PORT as $RELAY_USER"

step "Testing"
echo "  Sending a probe through the relay..."
TEST_TO=""
read_val TEST_TO "Address to send a test to (blank to skip)" ""
if [ -n "$TEST_TO" ]; then
  DOMAIN="$(sed -n 's/.*"domain"[^"]*"\([^"]*\)".*/\1/p' /etc/selfmail/config.json 2>/dev/null | head -1)"
  MBOX="$(sed -n 's/.*"mailbox"[^"]*"\([^"]*\)".*/\1/p' /etc/selfmail/config.json 2>/dev/null | head -1)"
  FROM="${MBOX:-postmaster}@${DOMAIN:-localhost}"
  printf 'From: %s\nTo: %s\nSubject: selfmail relay test\n\nSent through the outbound relay.\n' "$FROM" "$TEST_TO" \
    | sendmail -f "$FROM" "$TEST_TO"
  sleep 6
  echo
  echo "  Recent delivery lines:"
  { tail -n 40 /var/log/mail.log 2>/dev/null || tail -n 40 /var/log/maillog 2>/dev/null || journalctl -u postfix -n 40 --no-pager 2>/dev/null; } \
    | grep -E "status=|SASL|relay=" | tail -5 | sed 's/^/    /'
  echo
  echo "  A line with status=sent means the relay accepted it."
  echo "  SASL authentication failed means the username or key is wrong."
fi

echo
echo "  Turn this off again with:  sudo ./relay.sh --off"
