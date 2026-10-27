#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib.sh"
"${SUDO[@]}" systemctl restart selfmail postfix opendkim
echo "Restarted selfmail, Postfix and OpenDKIM."
