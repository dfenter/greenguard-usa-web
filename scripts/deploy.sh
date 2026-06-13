#!/usr/bin/env bash
# deploy.sh — always deploy the right project to Vercel
# Usage:
#   ./scripts/deploy.sh portal     → deploys portal.greenguard-usa.com (Next.js app)
#   ./scripts/deploy.sh site       → deploys greenguard-usa.com (static marketing site)
#   ./scripts/deploy.sh astro      → deploys www.greenguard-usa.com (Astro rebuild)
#   ./scripts/deploy.sh photos     → deploys photos.greenguard-usa.com (family photo gallery)
#   ./scripts/deploy.sh all        → deploys all three in sequence

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCOPE="green-guard-usa-s-projects"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

deploy_portal() {
  echo -e "${CYAN}▲ Deploying portal.greenguard-usa.com ...${NC}"
  cd "$REPO_ROOT/app"
  echo -e "${CYAN}  Running lint check...${NC}"
  if ! npx next lint --quiet 2>&1; then
    echo -e "${RED}✗ Lint errors found — fix before deploying${NC}"
    exit 1
  fi
  vercel --prod --scope "$SCOPE"
  echo -e "${GREEN}✓ Portal deployed → https://portal.greenguard-usa.com${NC}"
}

deploy_site() {
  echo -e "${CYAN}▲ Deploying greenguard-usa.com ...${NC}"
  cd "$REPO_ROOT"
  vercel --prod --scope "$SCOPE"
  echo -e "${GREEN}✓ Site deployed → https://greenguard-usa.com${NC}"
}

deploy_astro() {
  echo -e "${CYAN}▲ Deploying www.greenguard-usa.com ...${NC}"
  cd "$REPO_ROOT/astro"
  vercel --prod --scope "$SCOPE"
  echo -e "${GREEN}✓ Astro site deployed → https://www.greenguard-usa.com${NC}"
}

deploy_poolpro() {
  echo -e "${CYAN}▲ Deploying poolpro.greenguard-usa.com ...${NC}"
  cd "$REPO_ROOT/app"
  echo -e "${CYAN}  Running lint check...${NC}"
  if ! npx next lint --quiet 2>&1; then
    echo -e "${RED}✗ Lint errors found — fix before deploying${NC}"
    exit 1
  fi
  local orig; orig=$(cat .vercel/project.json)
  echo '{"projectId":"prj_a4m5ikASIpraF8quL7wo6oXfCBZx","orgId":"team_wmgMBIorBimWUSRnl2BGcolX","projectName":"poolpro-portal"}' > .vercel/project.json
  vercel --prod --scope "$SCOPE" || { echo "$orig" > .vercel/project.json; exit 1; }
  echo "$orig" > .vercel/project.json
  echo -e "${GREEN}✓ PoolPro deployed → https://poolpro.greenguard-usa.com${NC}"
}

deploy_lawnpro() {
  echo -e "${CYAN}▲ Deploying lawnpro.greenguard-usa.com ...${NC}"
  cd "$REPO_ROOT/app"
  echo -e "${CYAN}  Running lint check...${NC}"
  if ! npx next lint --quiet 2>&1; then
    echo -e "${RED}✗ Lint errors found — fix before deploying${NC}"
    exit 1
  fi
  local orig; orig=$(cat .vercel/project.json)
  echo '{"projectId":"prj_WdqNwToBzlCcwLdfAzwLCCh9jY1r","orgId":"team_wmgMBIorBimWUSRnl2BGcolX","projectName":"lawnpro-portal"}' > .vercel/project.json
  vercel --prod --scope "$SCOPE" || { echo "$orig" > .vercel/project.json; exit 1; }
  echo "$orig" > .vercel/project.json
  echo -e "${GREEN}✓ LawnPro deployed → https://lawnpro.greenguard-usa.com${NC}"
}

deploy_photos() {
  echo -e "${CYAN}▲ Deploying photos.greenguard-usa.com ...${NC}"
  cd "$REPO_ROOT/photos"
  DEPLOY_URL=$(vercel --prod --scope "$SCOPE" 2>&1 | grep -o 'https://photos-[^ ]*\.vercel\.app' | head -1)
  if [ -n "$DEPLOY_URL" ]; then
    vercel alias set "$DEPLOY_URL" photos.greenguard-usa.com --scope "$SCOPE" > /dev/null 2>&1
  fi
  echo -e "${GREEN}✓ Photos deployed → https://photos.greenguard-usa.com${NC}"
}

case "${1:-all}" in
  portal)  deploy_portal ;;
  poolpro) deploy_poolpro ;;
  lawnpro) deploy_lawnpro ;;
  site)    deploy_site ;;
  astro)   deploy_astro ;;
  photos)  deploy_photos ;;
  all)
    deploy_site
    echo ""
    deploy_portal
    echo ""
    deploy_astro
    ;;
  *)
    echo -e "${RED}Usage: $0 [portal|site|all]${NC}"
    exit 1
    ;;
esac
