#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
installed || { echo '{"state":"stopped","detail":"selfmail is not installed"}'; exit 0; }
p="$(port)"; p="${p:-8088}"
if j="$(curl -fsS --max-time 3 "http://127.0.0.1:$p/health" 2>/dev/null)" && [[ "$j" == *'"selfmail"'* ]]; then
  printf '{"state":"running","port":%s,"version":"%s","url":"%s/__gate/selfmail/","detail":"Web mail, Postfix and OpenDKIM"}\n' "$p" "$(app_version)" "${ADDON_HOST_URL%/}"
else
  printf '{"state":"error","port":%s,"version":"%s","detail":"The web mail isn’t answering on port %s"}\n' "$p" "$(app_version)" "$p"
fi
