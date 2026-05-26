# GitHub Suspension Appeal — submission text

Submit at: https://support.github.com → "I can't access my account" → "My account has been suspended"

Account: `greenguard-usa`
Email associated: admin@greenguard-usa.com

---

## Subject

Appeal: Suspension of @greenguard-usa — single-developer account with heavy CI activity, not abuse

## Body

Hi GitHub team,

My personal/organization account **@greenguard-usa** was suspended sometime around May 25–26, 2026. I'd like to appeal — this is a legitimate single-developer account for my Austin, TX mosquito-control business, **GreenGuard USA**.

I think your automation-abuse system may have flagged me for any of these reasons, all of which are normal development activity:

1. **Heavy commit volume (~47 commits in 48h)** — I had a focused 2-day sprint shipping multiple internal automation agents (failed-payment recovery, quote follow-up, voicemail webhook, photo-QA, etc.) for the business. Solo developer, normal feature-work cadence.

2. **`Co-Authored-By: Claude` footers on many commits** — I use Anthropic's Claude Code as my coding assistant. The Co-Authored-By trailers are GitHub's recommended convention for AI-assisted commits. Happy to remove the trailers if that helps.

3. **A scheduled GitHub Actions workflow committed as `GreenGuard Bot <bot@greenguard-usa.com>`** — this is my own CI account that commits weekly route plans and daily Google reviews JSON. I've already renamed it to `GreenGuard CI <ci@greenguard-usa.com>` to look less like a generic bot.

4. **Bulk `gh` CLI operations** — last night I used `gh workflow run` to test 6 of my own scheduled crons in quick succession (manual workflow_dispatch on cron-email-agent, cron-daily-route, etc.) plus `gh secret set` to populate a few env vars when I provisioned Supabase. All against my own private repo.

5. **Multiple short-lived `claude/*` branches** — Claude Code's worktree feature creates these. I've cleaned them up locally and will delete the remote ones once the suspension lifts.

## Context

- All repos are private (greenguard-usa/greenguard-usa-web, greenguard-usa/greenguard-agent)
- I'm the sole owner and committer
- No secrets are committed to any of my repos (verified via `git log -p -S sk_live_` and similar)
- The repos drive a real Austin-based mosquito-control business with paying customers
- Production infrastructure (Vercel + Stripe + HubSpot + Supabase) is unaffected by this suspension, but I can't push fixes or trigger workflows

## What I've already done to reduce the false-positive pattern

- Renamed the CI committer identity from "GreenGuard Bot" to "GreenGuard CI" (commit `68a0128`, queued to push)
- Deleted local `claude/*` worktree branches
- Have a cleanup script ready to delete remote stale branches once unblocked

## Ask

Please reinstate the account. Happy to provide any verification (business email, Stripe account confirmation, payment receipts from my private GitHub plan, etc.).

If there's a specific commit or activity pattern that triggered this, I'd appreciate knowing what it was so I can avoid it in the future.

Thanks,
[YOUR NAME]
admin@greenguard-usa.com
