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
# Portal root redirects unauthenticated users to /login (307) — that is correct
STATUS=$(http_status "https://portal.greenguard-usa.com/")
if [[ "$STATUS" == "200" || "$STATUS" == "307" || "$STATUS" == "302" ]]; then
  ok "portal.greenguard-usa.com → $STATUS"
else
  fail "portal.greenguard-usa.com → $STATUS (expected 200 or 30x redirect)"
fi
# Login page itself must return 200
STATUS=$(http_status "https://portal.greenguard-usa.com/login")
if [[ "$STATUS" == "200" ]]; then
  ok "portal.greenguard-usa.com/login → $STATUS"
else
  fail "portal.greenguard-usa.com/login → $STATUS (expected 200)"
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
  # Stripe returns "object": "list" with a space — match both forms
  if echo "$BODY" | grep -q '"object"'; then
    ok "Stripe API reachable"
  else
    fail "Stripe API — unexpected response"
  fi

  # Validate all 24 STRIPE_PRICE_* vars are non-empty
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

# ── 4. Cal.com API (v2) ───────────────────────────────────────────────────────
echo -e "\n${CYAN}── Cal.com ───────────────────────────────────────────────${NC}"
if [[ -z "${CALCOM_API_KEY:-}" ]]; then
  fail "CALCOM_API_KEY not set"
else
  # Cal.com v1 was decommissioned — use v2 with Bearer auth
  BODY=$(curl -s --max-time 10 "https://api.cal.com/v2/event-types" \
    -H "Authorization: Bearer ${CALCOM_API_KEY}" \
    -H "cal-api-version: 2024-06-14")
  COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l | tr -d ' ')
  if echo "$BODY" | grep -q '"status":"success"'; then
    ok "Cal.com API v2 reachable ($COUNT event types)"
    if [[ "$COUNT" -lt 13 ]]; then
      warn "Expected at least 13 event types, found $COUNT"
    fi
  else
    fail "Cal.com API v2 — unexpected response"
  fi
fi

# Cal.com webhook endpoint was removed — bookings sync via Google Calendar.
# Twilio webhook accepts POST and returns 200 even on empty bodies.
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  -X POST "https://portal.greenguard-usa.com/api/webhooks/twilio" -d "From=ping&Body=ping")
if [[ "$STATUS" == "200" ]]; then
  ok "Twilio inbound webhook reachable → $STATUS"
else
  fail "Twilio inbound webhook → $STATUS (expected 200)"
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
  # GOOGLE_API_KEY is only required in GitHub Actions (secret: GOOGLE_PLACES_API_KEY)
  # Not needed locally — skip as warning, not failure
  warn "GOOGLE_API_KEY not set locally (only required in GitHub Actions)"
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
  # Our key is send-only — POST /emails with empty body returns 422 (valid key)
  # An invalid key returns 401. GET /emails always returns 401 for send-only keys.
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -X POST "https://api.resend.com/emails" \
    -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{}')
  if [[ "$HTTP" == "422" || "$HTTP" == "200" ]]; then
    ok "Resend API key valid (send-only)"
  elif [[ "$HTTP" == "401" ]]; then
    fail "Resend API — 401 Unauthorized (check RESEND_API_KEY)"
  else
    ok "Resend API reachable → $HTTP"
  fi
fi

# ── 8. GitHub Actions ─────────────────────────────────────────────────────────
echo -e "\n${CYAN}── GitHub Actions ────────────────────────────────────────${NC}"
if ! command -v gh &>/dev/null; then
  warn "gh CLI not installed — skipping GitHub Actions check"
elif ! gh auth status &>/dev/null 2>&1; then
  warn "gh CLI not authenticated — skipping GitHub Actions check"
else
  GH_LIST=$(gh workflow list --repo greenguard-usa/greenguard-usa-web 2>/dev/null || echo "")
  # Match by display name (gh list shows names, not filenames)
  for name in "Fetch Google Reviews" "Weekly Route Optimizer" "Health Check"; do
    if echo "$GH_LIST" | grep -q "$name"; then
      STATE=$(echo "$GH_LIST" | grep "$name" | awk '{print $2}')
      ok "Workflow active: $name ($STATE)"
    else
      fail "Workflow not found or disabled: $name"
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
