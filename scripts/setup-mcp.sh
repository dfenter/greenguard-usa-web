#!/usr/bin/env bash
# scripts/setup-mcp.sh
#
# Writes real API tokens from app/.env into .claude/settings.json so MCP
# servers can connect. The updated settings.json is NOT committed — add
# .claude/settings.json to .gitignore if you prefer, or use this to
# regenerate it locally whenever tokens change.
#
# Run once after cloning, then re-run after any token rotation.
#
# Usage:
#   ./scripts/setup-mcp.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/app/.env"
SETTINGS="$REPO_ROOT/.claude/settings.json"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}ERROR: $ENV_FILE not found. Copy app/.env.example → app/.env and fill it in.${NC}"
  exit 1
fi

# Load env vars
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

STRIPE_KEY="${STRIPE_SECRET_KEY:-}"
RESEND_KEY="${RESEND_API_KEY:-}"
RENDER_KEY="${RENDER_API_KEY:-}"

MISSING=()
[[ -z "$STRIPE_KEY" ]]  && MISSING+=("STRIPE_SECRET_KEY")
[[ -z "$RESEND_KEY" ]]  && MISSING+=("RESEND_API_KEY")
[[ -z "$RENDER_KEY" ]]  && MISSING+=("RENDER_API_KEY (local-only var — add to app/.env)")

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo -e "${YELLOW}Warning: missing vars (those MCPs will not work):${NC}"
  for v in "${MISSING[@]}"; do echo "  - $v"; done
  echo ""
fi

# Rewrite settings.json with real token values
python3 - <<PYEOF
import json, os, sys

settings_path = "$SETTINGS"
with open(settings_path) as f:
    cfg = json.load(f)

stripe_key  = "$STRIPE_KEY"
resend_key  = "$RESEND_KEY"
render_key  = "$RENDER_KEY"

servers = cfg.get("mcpServers", {})

if stripe_key and "stripe" in servers:
    servers["stripe"]["args"] = ["-y", "@stripe/mcp", f"--api-key={stripe_key}"]
    print("  ✓ stripe")

if resend_key and "resend" in servers:
    servers["resend"]["env"]["RESEND_API_KEY"] = resend_key
    print("  ✓ resend")

if render_key and "render" in servers:
    servers["render"]["env"]["RENDER_API_KEY"] = render_key
    print("  ✓ render")

with open(settings_path, "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")

print("  ✓ .claude/settings.json updated")
PYEOF

echo ""
echo -e "${GREEN}Done. Remaining steps:${NC}"
echo "  • HubSpot, Cal.com, Google Calendar: OAuth — Claude Code prompts you on first use"
echo "  • Vercel: use 'vercel' CLI directly (already installed, run 'vercel login')"
echo "  • GitHub: use 'gh' CLI directly (already installed, run 'gh auth login')"
echo "  • Stripe: use 'stripe' CLI or MCP (install stripe CLI: https://stripe.com/docs/stripe-cli)"
echo "  • Render: use 'render' CLI or MCP (install: https://render.com/docs/cli)"
