#!/usr/bin/env bash
# setup-google-service-account.sh
#
# Run this ONCE on your Mac to set up the Google service account.
# After it finishes, it prints everything you need to paste into
# the Vercel dashboard and GitHub secrets — no CLI tools required for those.
#
# Prerequisites (install with Homebrew):
#   brew install google-cloud-sdk
#   gcloud auth login   (sign in as admin@greenguard-usa.com)
#
# Usage (run from the repo root):
#   ./_scripts/setup-google-service-account.sh

set -euo pipefail

PROJECT_ID="greenguard-usa"
SA_NAME="greenguard-calendar-reader"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_FILE="${HOME}/Desktop/greenguard-service-account-key.json"
CALENDAR_SCOPE="https://www.googleapis.com/auth/calendar.readonly"

echo ""
echo "══════════════════════════════════════════════════"
echo "  GreenGuard Google Service Account Setup"
echo "══════════════════════════════════════════════════"
echo ""

# ── 1. Select / create project ────────────────────────────────────────────────
echo "▶ Checking Google Cloud project..."
if ! gcloud projects describe "${PROJECT_ID}" &>/dev/null; then
  echo "  Creating project '${PROJECT_ID}'..."
  gcloud projects create "${PROJECT_ID}" --name="GreenGuard USA"
fi
gcloud config set project "${PROJECT_ID}" --quiet
echo "  ✓ Project: ${PROJECT_ID}"

# ── 2. Enable Calendar API ────────────────────────────────────────────────────
echo ""
echo "▶ Enabling Google Calendar API..."
gcloud services enable calendar-json.googleapis.com --quiet
echo "  ✓ Calendar API enabled"

# ── 3. Create service account ─────────────────────────────────────────────────
echo ""
echo "▶ Creating service account..."
if ! gcloud iam service-accounts describe "${SA_EMAIL}" &>/dev/null; then
  gcloud iam service-accounts create "${SA_NAME}" \
    --display-name="GreenGuard Calendar Reader" \
    --description="Reads GreenGuard bookings from Google Calendar" \
    --quiet
fi
echo "  ✓ Service account: ${SA_EMAIL}"

# ── 4. Create and download key ────────────────────────────────────────────────
echo ""
echo "▶ Creating service account key..."
if [[ ! -f "${KEY_FILE}" ]]; then
  gcloud iam service-accounts keys create "${KEY_FILE}" \
    --iam-account="${SA_EMAIL}" \
    --quiet
  echo "  ✓ Key saved to ${KEY_FILE}"
else
  echo "  ✓ Key already exists at ${KEY_FILE}"
fi

# ── 5. Encode and extract info ────────────────────────────────────────────────
ENCODED=$(base64 -i "${KEY_FILE}" | tr -d '\n')
CLIENT_ID=$(python3 -c "import json; print(json.load(open('${KEY_FILE}'))['client_id'])")
JWT_SECRET=$(openssl rand -hex 32)

# ── 6. Print everything needed ────────────────────────────────────────────────
echo ""
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  SETUP COMPLETE — follow the steps below                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "━━━ STEP A: Enable domain-wide delegation (2 clicks) ━━━━━━━━━"
echo ""
echo "1. Open this URL:"
echo "   https://console.cloud.google.com/iam-admin/serviceaccounts?project=${PROJECT_ID}"
echo "   → Click '${SA_NAME}' → Edit (pencil icon)"
echo "   → Check ☑ 'Enable domain-wide delegation' → Save"
echo ""
echo "2. Open this URL:"
echo "   https://admin.google.com/ac/owl/domainwidedelegation"
echo "   → 'Add new' → paste this Client ID:"
echo "   ${CLIENT_ID}"
echo "   → OAuth Scope: ${CALENDAR_SCOPE}"
echo "   → Click Authorize"
echo ""
echo "━━━ STEP B: Add to Vercel dashboard ━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Go to: vercel.com → your project → Settings → Environment Variables"
echo "Add each of these (copy name + value exactly):"
echo ""
echo "  Name:  GOOGLE_SERVICE_ACCOUNT_KEY"
echo "  Value: ${ENCODED}"
echo ""
echo "  Name:  JWT_SECRET"
echo "  Value: ${JWT_SECRET}"
echo ""
echo "  (All other variables are listed in app/.env.example)"
echo ""
echo "━━━ STEP C: Add to GitHub Secrets ━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Go to: github.com/greenguard-usa/greenguard-usa-web → Settings → Secrets → Actions"
echo ""
echo "  GOOGLE_SERVICE_ACCOUNT_KEY = (same value as above)"
echo "  GOOGLE_MAPS_API_KEY        = (your Google Maps API key)"
echo "  CALCOM_API_KEY             = (your Cal.com API key)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Key file is on your Desktop: greenguard-service-account-key.json"
echo "⚠  Do not share or commit this file."
echo ""
