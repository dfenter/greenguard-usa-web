#!/usr/bin/env bash
# scripts/env-sync.sh
#
# Syncs environment variables from app/.env (local master) to:
#   - Vercel (portal project, production environment)
#   - GitHub Actions secrets
#   - Render (active service)
#
# Prerequisites:
#   vercel CLI authenticated : vercel whoami
#   gh CLI authenticated     : gh auth status  (needs repo + secrets scope)
#   render CLI authenticated : render whoami
#
# Usage:
#   ./scripts/env-sync.sh               # sync to all targets
#   ./scripts/env-sync.sh --vercel-only
#   ./scripts/env-sync.sh --github-only
#   ./scripts/env-sync.sh --render-only
#   ./scripts/env-sync.sh --dry-run     # print what would be synced
#
# Note: RENDER_SERVICE_ID must be set in app/.env (local-only, never synced).
#       Find it with: render services list

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/app/.env"
GITHUB_REPO="greenguard-usa/greenguard-usa-web"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

DRY_RUN=false
TARGET_VERCEL=true
TARGET_GITHUB=true
TARGET_RENDER=true

for arg in "$@"; do
  case $arg in
    --dry-run)     DRY_RUN=true ;;
    --vercel-only) TARGET_GITHUB=false; TARGET_RENDER=false ;;
    --github-only) TARGET_VERCEL=false; TARGET_RENDER=false ;;
    --render-only) TARGET_VERCEL=false; TARGET_GITHUB=false ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}ERROR: $ENV_FILE not found. Create it from app/.env.example first.${NC}"
  exit 1
fi

# Load all vars from app/.env into an associative array
declare -A VARS
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue
  if [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]]; then
    VARS["${BASH_REMATCH[1]}"]="${BASH_REMATCH[2]}"
  fi
done < "$ENV_FILE"

echo -e "${CYAN}Loaded ${#VARS[@]} variables from $ENV_FILE${NC}"
[[ "$DRY_RUN" == true ]] && echo -e "${YELLOW}DRY RUN — no changes will be made${NC}"

# ── Helpers ───────────────────────────────────────────────────────────────────

push_vercel() {
  local key="$1" val="$2"
  if [[ "$DRY_RUN" == true ]]; then
    echo -e "  ${YELLOW}[dry-run] vercel env add $key production${NC}"
  else
    echo "$val" | vercel env add "$key" production --force --yes 2>/dev/null \
      && echo -e "  ${GREEN}✓ $key${NC}" \
      || echo -e "  ${RED}✗ $key (failed)${NC}"
  fi
}

push_github() {
  local key="$1" val="$2"
  if [[ "$DRY_RUN" == true ]]; then
    echo -e "  ${YELLOW}[dry-run] gh secret set $key${NC}"
  else
    gh secret set "$key" --body "$val" --repo "$GITHUB_REPO" 2>/dev/null \
      && echo -e "  ${GREEN}✓ $key${NC}" \
      || echo -e "  ${RED}✗ $key (failed)${NC}"
  fi
}

push_render() {
  local key="$1" val="$2" service_id="$3"
  if [[ "$DRY_RUN" == true ]]; then
    echo -e "  ${YELLOW}[dry-run] render env set $key${NC}"
  else
    render env set "$service_id" "$key=$val" 2>/dev/null \
      && echo -e "  ${GREEN}✓ $key${NC}" \
      || echo -e "  ${RED}✗ $key (failed)${NC}"
  fi
}

# ── Vercel ────────────────────────────────────────────────────────────────────
# All portal env vars go to Vercel.
# RENDER_API_KEY, VERCEL_TOKEN, GITHUB_TOKEN are local-only — never synced.

VERCEL_SKIP=(RENDER_API_KEY VERCEL_TOKEN GITHUB_TOKEN RENDER_SERVICE_ID
             GOOGLE_API_KEY GOOGLE_MAPS_API_KEY)

if [[ "$TARGET_VERCEL" == true ]]; then
  echo -e "\n${CYAN}── Vercel ────────────────────────────────────────────────${NC}"
  if ! vercel whoami &>/dev/null; then
    echo -e "${RED}ERROR: Not authenticated with Vercel. Run: vercel login${NC}"
    exit 1
  fi
  for key in "${!VARS[@]}"; do
    skip=false
    for s in "${VERCEL_SKIP[@]}"; do [[ "$key" == "$s" ]] && skip=true && break; done
    [[ "$skip" == true ]] && continue
    push_vercel "$key" "${VARS[$key]}"
  done
fi

# ── GitHub Secrets ────────────────────────────────────────────────────────────
# Only the subset needed by GitHub Actions workflows.
# NOTE: GOOGLE_API_KEY is pushed under the secret name GOOGLE_PLACES_API_KEY
#       because fetch-reviews.yml references secrets.GOOGLE_PLACES_API_KEY.

GITHUB_VARS=(
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  GOOGLE_REFRESH_TOKEN
  GOOGLE_MAPS_API_KEY
  CALCOM_API_KEY
)

if [[ "$TARGET_GITHUB" == true ]]; then
  echo -e "\n${CYAN}── GitHub Secrets ────────────────────────────────────────${NC}"
  if ! gh auth status &>/dev/null; then
    echo -e "${RED}ERROR: Not authenticated with GitHub. Run: gh auth login${NC}"
    exit 1
  fi

  for key in "${GITHUB_VARS[@]}"; do
    if [[ -n "${VARS[$key]+_}" ]]; then
      push_github "$key" "${VARS[$key]}"
    else
      echo -e "  ${YELLOW}⚠ $key not found in $ENV_FILE — skipping${NC}"
    fi
  done

  # Special rename: GOOGLE_API_KEY → GOOGLE_PLACES_API_KEY
  if [[ -n "${VARS[GOOGLE_API_KEY]+_}" ]]; then
    push_github "GOOGLE_PLACES_API_KEY" "${VARS[GOOGLE_API_KEY]}"
  else
    echo -e "  ${YELLOW}⚠ GOOGLE_API_KEY not found — GOOGLE_PLACES_API_KEY not synced${NC}"
  fi
fi

# ── Render ────────────────────────────────────────────────────────────────────
# Syncs the vars the Render service needs. Run `render services list` to find
# your service ID, then add RENDER_SERVICE_ID=<id> to app/.env.

RENDER_VARS=(
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_PRICE_BG1 STRIPE_PRICE_BG2 STRIPE_PRICE_BG3
  STRIPE_PRICE_MQ_RENT STRIPE_PRICE_MQ_SVC STRIPE_PRICE_OWN_BG STRIPE_PRICE_OWN_MQ
  STRIPE_PRICE_MQ_INST STRIPE_PRICE_MQ_TSHOOT
  STRIPE_PRICE_TANK1 STRIPE_PRICE_TANK2 STRIPE_PRICE_TANK3
  STRIPE_PRICE_TANK4 STRIPE_PRICE_TANK6 STRIPE_PRICE_TANK10
  STRIPE_PRICE_BARRIER STRIPE_PRICE_BAIT STRIPE_PRICE_BG_SWEETSCENT
  STRIPE_PRICE_CO2_ADDON STRIPE_PRICE_TRAP_INSTALL
  STRIPE_PRICE_TRAP_MAINT_1 STRIPE_PRICE_TRAP_MAINT_2
  STRIPE_PRICE_TIMER_INSTALL STRIPE_PRICE_WKD_SURCH
  HUBSPOT_ACCESS_TOKEN
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  GOOGLE_REFRESH_TOKEN
  CALCOM_API_KEY
)

if [[ "$TARGET_RENDER" == true ]]; then
  echo -e "\n${CYAN}── Render ────────────────────────────────────────────────${NC}"
  if ! render whoami &>/dev/null; then
    echo -e "${RED}ERROR: Not authenticated with Render. Run: render login${NC}"
    exit 1
  fi
  SERVICE_ID="${VARS[RENDER_SERVICE_ID]:-}"
  if [[ -z "$SERVICE_ID" ]]; then
    echo -e "${RED}ERROR: RENDER_SERVICE_ID not set in $ENV_FILE${NC}"
    echo -e "${YELLOW}Find your service ID with: render services list${NC}"
    exit 1
  fi
  for key in "${RENDER_VARS[@]}"; do
    if [[ -n "${VARS[$key]+_}" ]]; then
      push_render "$key" "${VARS[$key]}" "$SERVICE_ID"
    else
      echo -e "  ${YELLOW}⚠ $key not found in $ENV_FILE — skipping${NC}"
    fi
  done
fi

echo -e "\n${GREEN}Done.${NC}"
