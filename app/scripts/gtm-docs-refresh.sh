#!/bin/bash
# Refresh the GTM (MBA) chat assistant's document snapshot.
#
# The internal GTM portal chat (chat-daemon.js /chat/gtm) grounds its answers in
# ~/.gtm-chat-docs, a read-only snapshot of the MBA handoff bundle from the
# SparkBridge repo, plus the shared ~/.sparkbridge-chat-docs SITE-FACTS.md. The
# snapshot exists so the gtm endpoint's MCP server can never read the live repo
# (or anything else): it serves exactly these files.
#
# Run after any GTM handoff bundle or pricing update: bash app/scripts/gtm-docs-refresh.sh
set -euo pipefail
REPO_DOCS="/Users/lucille/Github/SparkBridge/docs/gtm/mba-handoff"
DEST="$HOME/.gtm-chat-docs"
SB_DEST="$HOME/.sparkbridge-chat-docs"

mkdir -p "$DEST"
chmod 700 "$DEST"
mkdir -p "$SB_DEST"
chmod 700 "$SB_DEST"

# Wipe the copied docs and rebuild from the live bundle.
find "$DEST" -maxdepth 1 -type f -delete 2>/dev/null || true

# Every markdown file in the bundle, flattened to a safe basename. Never PDFs.
# Never anything under a docs/internal path (the bundle's own *-INTERNAL.md
# files at the top level of the bundle ARE part of the bundle and DO get
# copied; only a docs/internal/ directory is excluded).
while IFS= read -r -d '' f; do
  rel="${f#"$REPO_DOCS"/}"
  case "$rel" in
    docs/internal/*|*/docs/internal/*) continue ;;
  esac
  base="$(echo "$rel" | sed 's#/#__#g')"
  cp "$f" "$DEST/$base"
done < <(find "$REPO_DOCS" -name '*.md' -print0)

# The one CSV in 06-targets/, renamed to a fixed name the MCP server expects.
CSV="$REPO_DOCS/06-targets/integrator-targets.csv"
if [ -f "$CSV" ]; then
  cp "$CSV" "$DEST/integrator-targets.csv"
fi

chmod 600 "$DEST"/* 2>/dev/null || true

# Rewrite the hand-maintained SITE-FACTS.md with current facts. This file is
# shared with the public sparkbridge chat too, so both assistants ground on
# the same numbers.
cat > "$SB_DEST/SITE-FACTS.md" <<'EOF'
# SparkBridge — current facts

SparkBridge 2.9.0 released 2026-09-06, on Ignition 8.1 and 8.3.

## Pricing

- Edge: $995
- Host: $1,495 (includes SparkCalc + SparkID)
- Provider: $1,995
- Passage: $1,995
- SparkInject: $2,995 per family
- SparkVault: $3,995
- SparkRecord: $7,995 (early access 0.1.0)
- FleetOps: $4,995
- Sentinel: $4,995 (+ pack $2,495)
- GitOps: $9,995 (pilot)
- SparkFlow: $995
- Drivers: $695 each
- SparkInflux: $1,495
- SparkValidate: $2,495 ($995 CLI pilot)
- SparkNotify: $695
- SparkGantt: $695

Support: 20% per year, optional. Development licenses: free.

## Reference architecture (40-site shapes)

- $40,300
- $49,780
- $69,765

## Site

mqtt.greenguard-usa.com/sparkbridge — pricing, compare, architecture, benchmarks, roadmap, partners, architecture-review pages.

## Honest limits

- No "certified" claim.
- No reference customer yet.
- Early access and pilot labels as shown on the site.
- "Certificate issuance," not mTLS, until 3.0.0.
- Mixed-vendor pairing is by specification.
- Own signing cert (not a third-party CA).
EOF
chmod 600 "$SB_DEST/SITE-FACTS.md"

echo "gtm snapshot refreshed: $(ls "$DEST" | wc -l | tr -d ' ') files in $DEST"
echo "sparkbridge SITE-FACTS.md rewritten in $SB_DEST"
