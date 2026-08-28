# {{name}} Deploy

Deploy one or more services. Argument: `portal`, `astro`, `render`, or `all`.
If no argument is given, check `git status` in the repo root to determine what changed and pick the right target automatically.

## Rules
- Always run from the repo root
- Portal deploy: `./scripts/deploy.sh portal` — deploys `app/` to the portal (see {{website}} for the tenant domain)
- Astro deploy: `./scripts/deploy.sh astro` — deploys `astro/` to the marketing site
- Render deploy: push to git (`git push origin main` from the agent repo) then trigger via Render API:
  ```
  RENDER_API_KEY=$(grep RENDER_API_KEY /path/to/agent-repo/.env | cut -d= -f2)
  curl -s -X POST "https://api.render.com/v1/services/{{renderServiceId}}/deploys" -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" -d '{}'
  ```
- Never use bare `vercel --prod`
- Never deploy without first checking git status and confirming what's being deployed
- After portal deploy, verify at {{website}}
- After astro deploy, verify at {{website}}

## Auto-detect logic (no argument)
1. `git diff --name-only HEAD` — if `app/` files changed → portal; if `astro/` files changed → astro
2. If both changed → deploy both in sequence
3. If only agent-repo files changed → render

## Arguments
$ARGUMENTS
