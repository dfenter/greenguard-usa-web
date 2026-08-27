#!/usr/bin/env bash
# deploy.sh — always deploy the right project to Vercel
# Usage:
#   ./scripts/deploy.sh portal     → deploys portal.greenguard-usa.com (Next.js app)
#   ./scripts/deploy.sh site       → deploys greenguard-usa.com (static marketing site)
#   ./scripts/deploy.sh ops        → deploys ops.greenguard-usa.com (One Person Show, static, ops/)
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

deploy_ops() {
  echo -e "${CYAN}▲ Deploying One Person Show → https://ops.greenguard-usa.com ...${NC}"
  cd "$REPO_ROOT/ops"
  vercel --prod --scope "$SCOPE" --yes
  echo -e "${GREEN}✓ OPS deployed → https://ops.greenguard-usa.com${NC}"
}

deploy_preview() {
  # Preview deploy pinned to ONE stable URL so the 90-day session cookie
  # survives across deploys — log in once, no fresh magic link each time.
  echo -e "${CYAN}▲ Deploying portal PREVIEW → https://gg-portal-preview.vercel.app ...${NC}"
  cd "$REPO_ROOT/app"
  echo -e "${CYAN}  Running lint check...${NC}"
  if ! npx next lint --quiet 2>&1; then
    echo -e "${RED}✗ Lint errors found — fix before deploying${NC}"
    exit 1
  fi
  DEPLOY_URL=$(vercel --scope "$SCOPE" 2>&1 | grep -oE 'https://app-[a-z0-9]+-green-guard-usa-s-projects\.vercel\.app' | head -1)
  if [ -z "$DEPLOY_URL" ]; then
    echo -e "${RED}✗ Could not determine preview deployment URL${NC}"; exit 1
  fi
  vercel alias set "$DEPLOY_URL" gg-portal-preview.vercel.app --scope "$SCOPE" > /dev/null 2>&1
  echo -e "${GREEN}✓ Portal preview deployed → https://gg-portal-preview.vercel.app${NC}"
}

deploy_site() {
  echo -e "${CYAN}▲ Deploying greenguard-usa.com ...${NC}"
  cd "$REPO_ROOT"
  if [ -d "$REPO_ROOT/redesign" ]; then
    # prototypes viewer is canonical in astro/public (shared two-session file) — sync before build
    cp "$REPO_ROOT/astro/public/prototypes.html" "$REPO_ROOT/redesign/public/prototypes.html"
    rsync -a --delete "$REPO_ROOT/astro/public/models/" "$REPO_ROOT/redesign/public/models/"
    echo -e "${CYAN}  Building redesign (new.greenguard-usa.com marketing overlay)...${NC}"
    (cd "$REPO_ROOT/redesign" && npx astro build) || { echo -e "${RED}✗ Redesign build failed${NC}"; exit 1; }
    rm -rf "$REPO_ROOT/redesign-dist"
    cp -Rc "$REPO_ROOT/redesign/dist" "$REPO_ROOT/redesign-dist" 2>/dev/null || cp -R "$REPO_ROOT/redesign/dist" "$REPO_ROOT/redesign-dist"
  fi
  vercel --prod --scope "$SCOPE"
  # mqtt.greenguard-usa.com is a MANUAL ALIAS, not a project domain: without this re-alias it
  # stays pinned to whatever deployment it was last pointed at and silently serves stale
  # content (cost a day of "why is the site not updating" on 2026-08-15).
  LATEST=$(vercel ls --prod --scope "$SCOPE" 2>/dev/null | grep -Eo 'https://greenguard-usa-[a-z0-9]+-green-guard-usa-s-projects.vercel.app' | head -1)
  if [ -n "$LATEST" ]; then
    vercel alias set "$LATEST" mqtt.greenguard-usa.com --scope "$SCOPE" >/dev/null 2>&1 \
      && echo -e "${GREEN}✓ mqtt.greenguard-usa.com re-aliased → $LATEST${NC}" \
      || echo -e "${RED}! mqtt re-alias failed — run: vercel alias set <deployment> mqtt.greenguard-usa.com${NC}"
  fi
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
  preview) deploy_preview ;;
  poolpro) deploy_poolpro ;;
  lawnpro) deploy_lawnpro ;;
  site)    deploy_site ;;
  ops)     deploy_ops ;;
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
    echo -e "${RED}Usage: $0 [portal|preview|site|astro|photos|all]${NC}"
    exit 1
    ;;
esac
