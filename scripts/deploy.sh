#!/usr/bin/env bash
# deploy.sh — always deploy the right project to Vercel
# Usage:
#   ./scripts/deploy.sh portal     → deploys portal.greenguard-usa.com (Next.js app)
#   ./scripts/deploy.sh site       → deploys greenguard-usa.com (static marketing site)
#   ./scripts/deploy.sh astro      → deploys www.greenguard-usa.com (Astro rebuild)
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

case "${1:-all}" in
  portal) deploy_portal ;;
  site)   deploy_site ;;
  astro)  deploy_astro ;;
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
