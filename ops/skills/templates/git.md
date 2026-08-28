# {{name}} Git Workflow

Git operations for the repo(s).

## Repos and remotes
- **Main repo**: at `/path/to/repo`
  - Remote: `origin` → your git host
  - Push: `git push origin main`
- **Agent repo** (if separate): at `/path/to/agent-repo`
  - Push: `git push origin main`

If your remote uses an SSH host alias (e.g. defined in `~/.ssh/config`), remember
it is NOT a remote name — it only ever appears inside a remote URL. Pushing to
the alias name directly fails with "does not appear to be a git repository."
Always push to `origin`; run `git remote -v` if unsure.

## SSH key
Whatever key is authorized for your git host account — check `~/.ssh/config` for the alias.

## Commit rules
- Never add `Co-Authored-By: Claude` trailers unless your git host account allows it
- Conventional commits: `feat:`, `fix:`, `perf:`, `chore:`, `docs:`
- Keep messages concise; describe WHY not WHAT when non-obvious

## Deploy after every portal/astro change
After committing portal changes → always run `./scripts/deploy.sh portal`
After committing astro changes → always run `./scripts/deploy.sh astro`
Changes are NOT live until deployed. Push to your git host is not enough.

## Common workflow
```bash
cd /path/to/repo
git add app/path/to/changed/files
git commit -m "fix(area): description of what and why"
git push origin main
./scripts/deploy.sh portal  # or astro
```

## Check what's uncommitted
```bash
cd /path/to/repo && git status
cd /path/to/agent-repo && git status
```

## GitHub Actions
Not used for cron jobs (use cron-job.org instead — see `/{{id}}-crons`). Keep
Actions only for scheduled data pulls (e.g. nightly reviews fetch) that don't
need the cron-auth secret model.

## Arguments: optional operation (status/push/log)
$ARGUMENTS
