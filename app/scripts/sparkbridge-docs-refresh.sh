#!/bin/bash
# Refresh the SparkBridge chat assistant's document snapshot.
#
# The public site chat (chat-daemon.js /chat/sparkbridge) grounds its answers in
# ~/.sparkbridge-chat-docs, a read-only snapshot of the customer-facing docs from
# the SparkBridge repo. The snapshot exists so the public endpoint's MCP server
# can never read the live repo (or anything else): it serves exactly these files.
#
# Run after every SparkBridge release:  bash app/scripts/sparkbridge-docs-refresh.sh
set -euo pipefail
REPO="/Users/lucille/Github/SparkBridge"
DEST="$HOME/.sparkbridge-chat-docs"
mkdir -p "$DEST"
chmod 700 "$DEST"
rm -f "$DEST"/*.md "$DEST"/*.txt 2>/dev/null || true

# Customer-facing docs only. Never docs/internal (review ledgers, research memos).
cp "$REPO/README.md"          "$DEST/README.md"
cp "$REPO/ARCHITECTURE.md"    "$DEST/ARCHITECTURE.md"
cp "$REPO/INSTALL.md"         "$DEST/INSTALL.md"
cp "$REPO/PRODUCTION.md"      "$DEST/PRODUCTION.md"
cp "$REPO/PERFORMANCE.md"     "$DEST/PERFORMANCE.md"
cp "$REPO/COMPETITIVE.md"     "$DEST/COMPETITIVE.md"
cp "$REPO/ROADMAP.md"         "$DEST/ROADMAP.md"
cp "$REPO/SIGNING.md"         "$DEST/SIGNING.md"
cp "$REPO/docs/BROKER.md"     "$DEST/BROKER.md"
cp "$REPO/docs/WHITEPAPER.md" "$DEST/WHITEPAPER.md"
cp "$REPO/docs/SB-MQTT5-SPEC.md" "$DEST/SB-MQTT5-SPEC.md"
cp "$REPO/docs/CONFIG_PAGES.md"  "$DEST/CONFIG_PAGES.md"
cp "$REPO/docs/DEVICE_MODELING.md" "$DEST/DEVICE_MODELING.md" 2>/dev/null || true

chmod 600 "$DEST"/*.md
echo "snapshot refreshed: $(ls "$DEST" | wc -l | tr -d ' ') files in $DEST"
echo "NOTE: SITE-FACTS.md is hand-maintained and was left alone."
