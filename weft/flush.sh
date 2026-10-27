#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib.sh"
api POST /api/queue '{"action":"flush"}' >/dev/null && echo "Asked Postfix to retry every queued message now."
