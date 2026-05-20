#!/usr/bin/env bash
# setup-vercel-env.sh
#
# Pushes all required environment variables to Vercel in one shot.
# Run from the repo root AFTER you have the values from setup-google-service-account.sh
#
# Prerequisites:
#   npm install -g vercel
#   vercel login
#   vercel link   (run inside the /app directory first to connect the project)
#
# Usage:
#   chmod +x _scripts/setup-vercel-env.sh
#   ./_scripts/setup-vercel-env.sh

set -euo pipefail

APP_DIR="$(dirname "$0")/../app"
cd "${APP_DIR}"

vercel_env() {
  local name="$1"
  local value="$2"
  local env="${3:-production,preview,development}"
  echo "${value}" | vercel env add "${name}" "${env}" --force 2>/dev/null || \
    echo "  ⚠ Could not set ${name} — set it manually in the Vercel dashboard"
}

echo ""
echo "══════════════════════════════════════════════════"
echo "  GreenGuard Vercel Environment Setup"
echo "══════════════════════════════════════════════════"
echo ""
echo "You will be prompted to paste values for each variable."
echo "Press Ctrl+C to skip any optional variable."
echo ""

prompt_and_set() {
  local name="$1"
  local hint="$2"
  local optional="${3:-false}"

  echo "─────────────────────────────────"
  echo "  ${name}"
  echo "  ${hint}"
  if [[ "${optional}" == "true" ]]; then
    echo "  (optional — press Enter to skip)"
  fi
  read -r -p "  Value: " value
  if [[ -z "${value}" && "${optional}" == "true" ]]; then
    echo "  Skipped."
    return
  fi
  echo "${value}" | vercel env add "${name}" production --force
  echo "  ✓ Set"
}

# ── Google ────────────────────────────────────────────────────────────────────
prompt_and_set "GOOGLE_SERVICE_ACCOUNT_KEY" \
  "Base64-encoded service account JSON from setup-google-service-account.sh"

# ── Stripe ────────────────────────────────────────────────────────────────────
prompt_and_set "STRIPE_SECRET_KEY" \
  "Stripe → Developers → API keys → Secret key (sk_live_...)"

prompt_and_set "STRIPE_WEBHOOK_SECRET" \
  "Stripe → Developers → Webhooks → your endpoint → Signing secret (whsec_...)"

echo ""
echo "Stripe Price IDs — Stripe Dashboard → Products → [each product] → Prices → copy ID"
echo ""

for sku in BG1 BG2 BG3 MQ_RENT MQ_SVC OWN_BG OWN_MQ MQ_INST MQ_TSHOOT \
           TANK1 TANK2 TANK3 TANK4 TANK6 TANK10 \
           BARRIER BAIT BG_SWEETSCENT CO2_ADDON \
           TRAP_INSTALL TRAP_MAINT_1 TRAP_MAINT_2 TIMER_INSTALL WKD_SURCH; do
  prompt_and_set "STRIPE_PRICE_${sku}" "Stripe price ID for ${sku}" "true"
done

# ── HubSpot ───────────────────────────────────────────────────────────────────
prompt_and_set "HUBSPOT_ACCESS_TOKEN" \
  "HubSpot → Settings → Integrations → Private Apps → your app → Access token (pat-...)"

# ── Cal.com ───────────────────────────────────────────────────────────────────
prompt_and_set "CALCOM_WEBHOOK_SECRET" \
  "Cal.com → Settings → Developer → Webhooks → your webhook → Secret"

# ── Auth ──────────────────────────────────────────────────────────────────────
JWT_SECRET=$(openssl rand -hex 32)
echo "${JWT_SECRET}" | vercel env add "JWT_SECRET" production --force
echo "  ✓ JWT_SECRET generated and set automatically"

# ── Email ─────────────────────────────────────────────────────────────────────
prompt_and_set "RESEND_API_KEY" \
  "Resend.com → API Keys → Create API key (re_...)"

echo "noreply@greenguard-usa.com" | vercel env add "PORTAL_FROM_EMAIL" production --force
echo "  ✓ PORTAL_FROM_EMAIL set to noreply@greenguard-usa.com"

# ── App URL ───────────────────────────────────────────────────────────────────
echo "https://portal.greenguard-usa.com" | vercel env add "NEXT_PUBLIC_APP_URL" production --force
echo "  ✓ NEXT_PUBLIC_APP_URL set"

echo ""
echo "══════════════════════════════════════════════════"
echo "  All variables set. Run 'vercel --prod' to deploy."
echo "══════════════════════════════════════════════════"
echo ""
