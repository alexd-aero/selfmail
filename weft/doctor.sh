#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib.sh"
"${SUDO[@]}" bash "$APP/doctor.sh" 2>&1
