#!/usr/bin/env bash
# scripts/health-check.sh
#
# Read-only validation of all GreenGuard USA service connections.
# Requires app/.env to be sourced or env vars already set in shell.
# Exit code 0 = all checks passed. Exit code 1 = one or more failures.
#
# Usage:
#   ./scripts/health-check.sh
#   source app/.env && ./scripts/health-check.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/app/.env"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0

# Source app/.env if vars aren't already in the environment
if [[ -f "$ENV_FILE" ]] && [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

ok()   { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }

http_status() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$1"
}

# ── 1. Vercel — Portal ────────────────────────────────────────────────────────
echo -e "\n${CYAN}── Vercel ────────────────────────────────────────────────${NC}"
STATUS=$(http_status "https://portal.greenguard-usa.com/")
if [[ "$STATUS" == "200" ]]; then
  ok "portal.greenguard-usa.com → $STATUS"
else
  fail "portal.greenguard-usa.com → $STATUS (expected 200)"
fi

# ── 2. Vercel — Static Site ───────────────────────────────────────────────────
STATUS=$(http_status "https://www.greenguard-usa.com/")
if [[ "$STATUS" == "200" ]]; then
  ok "www.greenguard-usa.com → $STATUS"
else
  fail "www.greenguard-usa.com → $STATUS (expected 200)"
fi

# ── 3. Stripe ─────────────────────────────────────────────────────────────────
echo -e "\n${CYAN}── Stripe ────────────────────────────────────────────────${NC}"
if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
  fail "STRIPE_SECRET_KEY not set"
else
  BODY=$(curl -s --max-time 10 "https://api.stripe.com/v1/customers?limit=1" \
    -u "${STRIPE_SECRET_KEY}:")
  if echo "$BODY" | grep -q '"object":"list"'; then
    ok "Stripe API reachable"
  else
    fail "Stripe API — unexpected response"
  fi

  # Validate all 23 STRIPE_PRICE_* vars are non-empty
  PRICE_VARS=(BG1 BG2 BG3 MQ_RENT MQ_SVC OWN_BG OWN_MQ MQ_INST MQ_TSHOOT
              TANK1 TANK2 TANK3 TANK4 TANK6 TANK10 BARRIER BAIT BG_SWEETSCENT
              CO2_ADDON TRAP_INSTALL TRAP_MAINT_1 TRAP_MAINT_2 TIMER_INSTALL WKD_SURCH)
  MISSING=()
  for v in "${PRICE_VARS[@]}"; do
    varname="STRIPE_PRICE_${v}"
    [[ -z "${!varname:-}" ]] && MISSING+=("$varname")
  done
  if [[ ${#MISSING[@]} -eq 0 ]]; then
    ok "All 24 STRIPE_PRICE_* vars set"
  else
    fail "Missing STRIPE_PRICE_* vars: ${MISSING[*]}"
  fi
fi

# ── 4. Cal.com API ────────────────────────────────────────────────────────────
echo -e "\n${CYAN}── Cal.com ───────────────────────────────────────────────${NC}"
if [[ -z "${CALCOM_API_KEY:-}" ]]; then
  fail "CALCOM_API_KEY not set"
else
  BODY=$(curl -s --max-time 10 "https://api.cal.com/v1/event-types?apiKey=${CALCOM_API_KEY}")
  COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l | tr -d ' ')
  if echo "$BODY" | grep -q '"event_types"'; then
    ok "Cal.com API reachable ($COUNT event types)"
    if [[ "$COUNT" -lt 13 ]]; then
      warn "Expected at least 13 event types in cal-event-types.json, found $COUNT"
    fi
  else
    fail "Cal.com API — unexpected response"
  fi
fi

# Cal.com webhook endpoint must reject GET (returns 405)
STATUS=$(http_status "https://portal.greenguard-usa.com/api/webhooks/calcom")
if [[ "$STATUS" == "405" ]]; then
  ok "Cal.com webhook endpoint rejects GET → $STATUS"
else
  fail "Cal.com webhook endpoint → $STATUS (expected 405)"
fi

# ── 5. HubSpot ────────────────────────────────────────────────────────────────
echo -e "\n${CYAN}── HubSpot ───────────────────────────────────────────────${NC}"
if [[ -z "${HUBSPOT_ACCESS_TOKEN:-}" ]]; then
  fail "HUBSPOT_ACCESS_TOKEN not set"
else
  BODY=$(curl -s --max-time 10 \
    "https://api.hubapi.com/crm/v3/properties/contacts?archived=false" \
    -H "Authorization: Bearer ${HUBSPOT_ACCESS_TOKEN}")
  if echo "$BODY" | grep -q '"results"'; then
    ok "HubSpot API reachable"
    # Check custom properties exist
    for prop in system_type trap_count tank_count stripe_customer_id; do
      if echo "$BODY" | grep -q "\"$prop\""; then
        ok "  Custom property exists: $prop"
      else
        warn "  Custom property not found: $prop (may need to create in HubSpot)"
      fi
    done
  else
    fail "HubSpot API — unexpected response (check HUBSPOT_ACCESS_TOKEN)"
  fi
fi

# ── 6. Google Places API ──────────────────────────────────────────────────────
echo -e "\n${CYAN}── Google Places ─────────────────────────────────────────${NC}"
GAPI_KEY="${GOOGLE_API_KEY:-}"
if [[ -z "$GAPI_KEY" ]]; then
  fail "GOOGLE_API_KEY not set"
else
  BODY=$(curl -s --max-time 10 \
    "https://maps.googleapis.com/maps/api/place/details/json?place_id=ChIJx8wLC4K11wwRbfe7hhZiHXs&fields=name&key=${GAPI_KEY}")
  if echo "$BODY" | grep -q '"OK"'; then
    NAME=$(echo "$BODY" | grep -o '"name":"[^"]*"' | head -1)
    ok "Google Places API → $NAME"
  else
    STATUS_VAL=$(echo "$BODY" | grep -o '"status":"[^"]*"' | head -1)
    fail "Google Places API → $STATUS_VAL (expected OK)"
  fi
fi

# ── 7. Resend ─────────────────────────────────────────────────────────────────
echo -e "\n${CYAN}── Resend ────────────────────────────────────────────────${NC}"
if [[ -z "${RESEND_API_KEY:-}" ]]; then
  fail "RESEND_API_KEY not set"
else
  BODY=$(curl -s --max-time 10 "https://api.resend.com/domains" \
    -H "Authorization: Bearer ${RESEND_API_KEY}")
  if echo "$BODY" | grep -q '"data"'; then
    ok "Resend API reachable"
  else
    fail "Resend API — unexpected response (check RESEND_API_KEY)"
  fi
fi

# ── 8. GitHub Actions ─────────────────────────────────────────────────────────
echo -e "\n${CYAN}── GitHub Actions ────────────────────────────────────────${NC}"
if ! command -v gh &>/dev/null; then
  warn "gh CLI not installed — skipping GitHub Actions check"
elif ! gh auth status &>/dev/null 2>&1; then
  warn "gh CLI not authenticated — skipping GitHub Actions check"
else
  for workflow in fetch-reviews.yml route-optimizer.yml; do
    if gh workflow list --repo greenguard-usa/greenguard-usa-web 2>/dev/null \
        | grep -q "$workflow"; then
      ok "Workflow active: $workflow"
    else
      fail "Workflow not found or disabled: $workflow"
    fi
  done
fi

# ── 9. Render ─────────────────────────────────────────────────────────────────
echo -e "\n${CYAN}── Render ────────────────────────────────────────────────${NC}"
if ! command -v render &>/dev/null; then
  warn "render CLI not installed — skipping Render check"
elif ! render whoami &>/dev/null 2>&1; then
  warn "render CLI not authenticated — skipping Render check"
else
  OUTPUT=$(render services list 2>/dev/null)
  if [[ -n "$OUTPUT" ]]; then
    ok "Render services reachable"
    echo "$OUTPUT" | while IFS= read -r line; do
      [[ -n "$line" ]] && echo "     $line"
    done
  else
    warn "No Render services found (or render CLI needs auth)"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "─────────────────────────────────────────────────────────"
TOTAL=$((PASS + FAIL))
if [[ "$FAIL" -eq 0 ]]; then
  echo -e "${GREEN}All $TOTAL checks passed.${NC}"
  exit 0
else
  echo -e "${RED}$FAIL/$TOTAL checks failed.${NC}"
  exit 1
fi
