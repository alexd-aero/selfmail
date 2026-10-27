#!/usr/bin/env bash
# Removes the selfmail app. Postfix, OpenDKIM and your mail stay unless you say otherwise.
set -u
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo:  sudo selfmail uninstall"; exit 1; }
# --yes (used by the Aegis × Burrow addon): remove the app only; settings and mail always stay.
YES=0; [ "${1:-}" = --yes ] && YES=1
if [ "$YES" = 0 ]; then read -rp "Remove the selfmail web app? (y/N) " a; [ "$a" = y ] || exit 0; fi
systemctl disable --now selfmail selfmail-health.timer selfmail-tunnel >/dev/null 2>&1
rm -f /etc/systemd/system/selfmail.service /etc/systemd/system/selfmail-health.* /etc/systemd/system/selfmail-tunnel.service /usr/local/bin/selfmail-health /usr/local/bin/selfmail /etc/sudoers.d/selfmail
systemctl daemon-reload
rm -rf /opt/selfmail /var/lib/selfmail
echo "App removed. Settings are still in /etc/selfmail; mail is still in /var/mail/vhosts."
[ "$YES" = 1 ] && { echo "Postfix and OpenDKIM were left installed."; exit 0; }
read -rp "Also delete the settings (/etc/selfmail)? (y/N) " a; [ "$a" = y ] && rm -rf /etc/selfmail && echo "Settings deleted."
read -rp "Also delete ALL MAIL in /var/mail/vhosts? This cannot be undone. Type DELETE to confirm: " a; [ "$a" = DELETE ] && rm -rf /var/mail/vhosts && echo "Mail deleted."
echo "Postfix and OpenDKIM were left installed."
