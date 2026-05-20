#!/usr/bin/env bash
# setup-google-service-account.sh
#
# Run this ONCE on your local machine (Mac/Linux) to:
#   1. Create a Google Cloud project
#   2. Enable the Calendar API
#   3. Create a service account with domain-wide delegation
#   4. Download and base64-encode the key
#   5. Print the exact values to paste into Vercel + GitHub
#
# Prerequisites:
#   brew install google-cloud-sdk   (Mac)
#   gcloud auth login               (first time only)
#
# Usage:
#   chmod +x _scripts/setup-google-service-account.sh
#   ./_scripts/setup-google-service-account.sh

set -euo pipefail

PROJECT_ID="greenguard-usa"
SA_NAME="greenguard-calendar-reader"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_FILE="greenguard-service-account-key.json"
DISPLAY_NAME="GreenGuard Calendar Reader"
CALENDAR_SCOPE="https://www.googleapis.com/auth/calendar.readonly"

echo ""
echo "══════════════════════════════════════════════════"
echo "  GreenGuard Google Service Account Setup"
echo "══════════════════════════════════════════════════"
echo ""

# ── 1. Select / create project ────────────────────────────────────────────────
echo "▶ Checking Google Cloud project '${PROJECT_ID}'..."
if ! gcloud projects describe "${PROJECT_ID}" &>/dev/null; then
  echo "  Project not found — creating it..."
  gcloud projects create "${PROJECT_ID}" --name="GreenGuard USA"
  echo "  ✓ Project created"
else
  echo "  ✓ Project exists"
fi

gcloud config set project "${PROJECT_ID}"

# ── 2. Enable Calendar API ────────────────────────────────────────────────────
echo ""
echo "▶ Enabling Google Calendar API..."
gcloud services enable calendar-json.googleapis.com
echo "  ✓ Calendar API enabled"

# ── 3. Create service account ─────────────────────────────────────────────────
echo ""
echo "▶ Creating service account '${SA_NAME}'..."
if gcloud iam service-accounts describe "${SA_EMAIL}" &>/dev/null; then
  echo "  ✓ Service account already exists"
else
  gcloud iam service-accounts create "${SA_NAME}" \
    --display-name="${DISPLAY_NAME}" \
    --description="Reads GreenGuard bookings from Google Calendar"
  echo "  ✓ Service account created"
fi

# ── 4. Enable domain-wide delegation ─────────────────────────────────────────
echo ""
echo "▶ Enabling domain-wide delegation on service account..."
gcloud iam service-accounts update "${SA_EMAIL}" \
  --project="${PROJECT_ID}"
# Note: the --domain-wide-delegation flag isn't available via gcloud CLI.
# You must enable it in the Google Cloud Console and grant it in Workspace Admin.
# Instructions are printed at the end of this script.

# ── 5. Create and download key ────────────────────────────────────────────────
echo ""
echo "▶ Creating service account key..."
if [[ -f "${KEY_FILE}" ]]; then
  echo "  Key file already exists at ${KEY_FILE} — skipping creation"
else
  gcloud iam service-accounts keys create "${KEY_FILE}" \
    --iam-account="${SA_EMAIL}"
  echo "  ✓ Key downloaded to ${KEY_FILE}"
fi

# ── 6. Base64 encode ──────────────────────────────────────────────────────────
echo ""
echo "▶ Base64-encoding key..."
ENCODED=$(base64 -i "${KEY_FILE}" | tr -d '\n')

CLIENT_ID=$(python3 -c "import json; print(json.load(open('${KEY_FILE}'))['client_id'])")

# ── 7. Print results ──────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════"
echo "  DONE — copy these values now"
echo "══════════════════════════════════════════════════"
echo ""
echo "Service account email : ${SA_EMAIL}"
echo "Client ID (for Workspace Admin): ${CLIENT_ID}"
echo ""
echo "GOOGLE_SERVICE_ACCOUNT_KEY (base64) — add to Vercel env vars AND GitHub secret:"
echo ""
echo "${ENCODED}"
echo ""
echo "══════════════════════════════════════════════════"
echo "  MANUAL STEPS STILL REQUIRED"
echo "══════════════════════════════════════════════════"
echo ""
echo "1. Enable domain-wide delegation in Google Cloud Console:"
echo "   https://console.cloud.google.com/iam-admin/serviceaccounts?project=${PROJECT_ID}"
echo "   → Click '${SA_NAME}' → Edit → ☑ Enable domain-wide delegation → Save"
echo ""
echo "2. Grant scope in Google Workspace Admin:"
echo "   https://admin.google.com/ac/owl/domainwidedelegation"
echo "   → Add new → Client ID: ${CLIENT_ID}"
echo "   → OAuth Scopes: ${CALENDAR_SCOPE}"
echo "   → Authorize"
echo ""
echo "3. Add GOOGLE_SERVICE_ACCOUNT_KEY to Vercel:"
echo "   https://vercel.com/greenguard-usa/greenguard-portal/settings/environment-variables"
echo "   → Name: GOOGLE_SERVICE_ACCOUNT_KEY"
echo "   → Value: (the long base64 string printed above)"
echo ""
echo "4. Add secrets to GitHub repository:"
echo "   https://github.com/greenguard-usa/greenguard-usa-web/settings/secrets/actions"
echo "   → GOOGLE_SERVICE_ACCOUNT_KEY = (same base64 string)"
echo "   → GOOGLE_MAPS_API_KEY = (your Google Maps API key)"
echo "   → CALCOM_API_KEY = (your Cal.com API key — only needed for rescheduling)"
echo ""
echo "Key file saved at: $(pwd)/${KEY_FILE}"
echo "⚠️  Keep this file private. Add it to .gitignore if not already there."
echo ""
