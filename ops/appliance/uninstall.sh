#!/usr/bin/env bash
#
# OPS appliance uninstaller — boots out this tenant's launchd jobs and removes
# their plists. Leaves the repo, app/.env, and all data completely untouched.
#
#   bash ops/appliance/uninstall.sh
#   OPS_TENANT=lawnpro bash ops/appliance/uninstall.sh
#   OPS_DRY_RUN=1 bash ops/appliance/uninstall.sh
#
set -euo pipefail

OPS_TENANT="${OPS_TENANT:-greenguard}"
OPS_DRY_RUN="${OPS_DRY_RUN:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --tenant)  OPS_TENANT="$2"; shift 2 ;;
    --dry-run) OPS_DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

LA_DIR="$HOME/Library/LaunchAgents"
UID_NUM="$(id -u)"
JOBS="chat-daemon notify-daemon agent dailyroute reminder reminder2h postappointment winback tailscaled"

c_info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
c_ok()   { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
c_warn() { printf '\033[1;33m  !!\033[0m %s\n' "$*"; }

echo
c_info "OPS appliance uninstall — tenant '$OPS_TENANT'"
[ -n "$OPS_DRY_RUN" ] && c_warn "DRY RUN — nothing will be executed"
echo

# This installer only ever creates com.ops.<tenant>.* labels, so the legacy
# com.greenguard.* jobs on the original production Mac are never touched here.
found=0
for job in $JOBS; do
  label="com.ops.$OPS_TENANT.$job"
  dest="$LA_DIR/$label.plist"
  if [ -n "$OPS_DRY_RUN" ]; then
    printf '\033[0;36m  DRY\033[0m launchctl bootout gui/%s/%s (ignore failure)\n' "$UID_NUM" "$label"
    printf '\033[0;36m  DRY\033[0m rm -f %s\n' "$dest"
    found=1
    continue
  fi
  if [ -f "$dest" ]; then
    found=1
    launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
    rm -f "$dest"
    c_ok "removed $label"
  fi
done

[ "$found" = 0 ] && c_warn "nothing installed for tenant '$OPS_TENANT'"

echo
c_info "Done. The repo, app/.env, logs and data were left untouched."
echo
