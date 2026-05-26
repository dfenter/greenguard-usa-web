#!/usr/bin/env bash
# Run after the GitHub suspension is lifted.
set -e
cd "$(dirname "$0")/.."
echo "Pushing pending commits..."
git push origin main
echo
echo "Deleting stale claude/* worktree branches..."
for b in apply-sticky-nav-all-pages-7bgzg automate-biogents-orders-oP1Sj \
         automate-stripe-billing-YbPWG migrate-squarespace-vercel-stripe-lOhNM \
         plan-greenguard-integration-JbjCP plan-service-integration-l8tI1; do
  echo "  → claude/$b"
  git push origin --delete "claude/$b" 2>/dev/null || echo "    (already gone)"
done
echo "✓ done"
