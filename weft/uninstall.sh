#!/usr/bin/env bash
# Unlink from this dashboard. A selfmail that was here before the addon keeps running;
# one the addon installed has its app removed. Mail and settings always stay.
set -uo pipefail
cd "$(dirname "$0")/.."
. weft/lib.sh
api POST /api/host/unlink '{}' >/dev/null 2>&1 || true
if [ -f "$DATA/linked" ]; then
  echo "selfmail stays installed (it was here before the addon); only the dashboard link was removed."
elif installed; then
  echo "::phase Removing the selfmail app"
  "${SUDO[@]}" bash "$APP/uninstall.sh" --yes || "${SUDO[@]}" bash ./uninstall.sh --yes
fi
rm -f "$KEY" "$LINK"
