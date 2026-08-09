#!/bin/bash
# Retry `tailscale funnel` until the tailnet funnel attribute is enabled
# (one-time click at https://login.tailscale.com/f/funnel?node=nX8F9XuB4g11CNTRL).
TS="tailscale --socket=/Users/lucille/.tailscale-state/tailscaled.sock"
LOG=/Users/lucille/greenguard-usa-web/app/scripts/funnel-setup.log
for i in $(seq 1 720); do
  $TS funnel --bg 8787 >> "$LOG" 2>&1 &
  PID=$!
  ( sleep 15; kill $PID 2>/dev/null ) &
  WATCHER=$!
  if wait $PID 2>/dev/null; then
    kill $WATCHER 2>/dev/null
    if $TS funnel status 2>/dev/null | grep -q 8787; then
      echo "$(date) funnel enabled and serving 8787" >> "$LOG"
      exit 0
    fi
  fi
  kill $WATCHER 2>/dev/null
  sleep 60
done
echo "$(date) gave up after 12h" >> "$LOG"
