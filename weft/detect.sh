#!/usr/bin/env bash
# Read-only: is selfmail already on this machine?
. "$(dirname "$0")/lib.sh"
installed || exit 1
v="$(app_version)"
p=8088; h="$(curl -fsS --max-time 3 http://127.0.0.1:8088/health 2>/dev/null || true)"
printf '{"version":"%s","url":"http://127.0.0.1:%s/","detail":"selfmail %s is installed in /opt/selfmail"}\n' "$v" "$p" "$v"
