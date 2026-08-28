# OPS Appliance

Turns one Mac into a **One Person Show** appliance: the always-on machine that
answers portal AI chat, sends notifications, and runs the scheduled agent jobs.
One Mac can serve **several tenants**, and a fresh Mac is set up by one script.

```bash
bash ops/appliance/install.sh                     # greenguard (default)
OPS_TENANT=lawnpro bash ops/appliance/install.sh  # another tenant
OPS_DRY_RUN=1 bash ops/appliance/install.sh       # print every action, run none
bash ops/appliance/uninstall.sh --tenant lawnpro  # remove
```

Inputs, via env var or flag:

| Variable | Flag | Default |
|---|---|---|
| `OPS_TENANT` | `--tenant` | `greenguard` |
| `OPS_REPO` | `--repo` | `$HOME/greenguard-usa-web` |
| `OPS_AGENT_DIR` | `--agent-dir` | `$HOME/greenguard_agent` |
| `OPS_DRY_RUN` | `--dry-run` | unset |

The installer is **idempotent**: re-running re-renders the plists and
re-bootstraps the jobs. It never overwrites an existing `app/.env`.

## What the installer does

1. **Checks prerequisites** — `node`, `python3`, the `claude` CLI at
   `$HOME/.local/bin/claude`, and `tailscale` (a warning, not a failure: without
   it the daemon is localhost-only). Also verifies the tenant actually exists at
   `app/lib/businesses/<tenant>/config.js`.
2. **Installs Node deps** — `npm ci --omit=dev` in `app/`, only when
   `node_modules` is missing.
3. **Seeds `app/.env`** from `app/.env.example` when absent, then **stops** with
   instructions. An existing `.env` is never touched. Fill it in and re-run.
4. **Renders launchd plists** from `ops/appliance/plists/*.plist.tmpl` into
   `~/Library/LaunchAgents`, substituting `__HOME__`, `__REPO__`, `__AGENT__`,
   `__TENANT__`, `__USER__`. Each rendered file is validated with `plutil -lint`.
5. **Loads them** — `launchctl bootout` then `bootstrap gui/$UID` for each.
6. **Verifies** — polls `http://127.0.0.1:8787/healthz` for up to 20 seconds.

## What runs

Labels are `com.ops.<tenant>.<job>`. (The original production Mac's legacy
`com.greenguard.*` jobs are a separate set and are never touched by these
scripts.)

| Job | What it does | Schedule |
|---|---|---|
| `chat-daemon` | Portal AI chat + `/complete`, via the Claude CLI | always on, port **8787** |
| `notify-daemon` | Drains the email/SMS queue; sends via Resend/Gmail/iMessage | always on |
| `tailscaled` | Userspace Tailscale; SOCKS5 on **1055** | always on |
| `agent` | Gmail agent (draft-only) | always on |
| `dailyroute` | Builds the day's route | daily 00:00 |
| `reminder` | Day-before appointment reminder | daily 13:00 |
| `reminder2h` | 2-hour-out reminder | every 15 min |
| `postappointment` | Post-visit thank-you / review ask | hourly 07:00–18:00 |
| `winback` | Lapsed-customer outreach | Mondays 09:30 |

### Ports

- **8787** — chat daemon HTTP, bound to `127.0.0.1` only.
- **1055** — tailscaled SOCKS5 proxy, localhost only.

Nothing binds a public interface directly; the only external exposure is via
Tailscale Funnel, below.

## Enabling Funnel

The chat daemon listens on `127.0.0.1` only. To let the Vercel portal reach it,
publish it through Tailscale Funnel:

```bash
tailscale funnel 8787
```

That prints a public `https://<machine>.<tailnet>.ts.net` URL. Then, in the
portal's Vercel environment:

- `CHAT_DAEMON_URL` = that Funnel URL
- `CHAT_DAEMON_SECRET` = the same value as in `app/.env`

Requests carry the secret in the `x-gg-chat-secret` header and are rejected with
a timing-safe comparison when it does not match. If the Mac is asleep or the
daemon is down, the portal transparently falls back to its metered API path.

## Adding a second tenant to the same Mac

**You do not need a second chat daemon.** One daemon serves every tenant. It
picks the tenant per request:

1. `x-ops-tenant: <tenant>` request header, else
2. a `tenant` field in the JSON body, else
3. `greenguard`.

The value must match `^[a-z0-9-]{1,32}$` **and** have a config at
`app/lib/businesses/<tenant>/config.js`; anything else is a `400`. The daemon
passes the tenant to the spawned `claude` process and to the MCP server as both
`BUSINESS_ID` and `NEXT_PUBLIC_BUSINESS_ID`, so `business.config.js` and every
lib it requires resolve that tenant. System prompts use the tenant's own name,
city, and phone. Sessions, per-user locks, and rate-limit buckets are all keyed
by `<tenant>:<audience>:<email>`, so tenants never share state.

Callers send it automatically: `app/lib/chat-local.js` and
`app/lib/claude-local.js` send `x-ops-tenant: <biz.id>` from
`business.config.js`, and `greenguard_agent/claude_local.py` sends the
`OPS_TENANT` env var (default `greenguard`).

Since the header is optional and defaults to `greenguard`, an older caller that
sends no header keeps working exactly as before.

So, to add a tenant:

```bash
# 1. Create the tenant config
#    app/lib/businesses/lawnpro/config.js
# 2. Point that tenant's callers at the same daemon, with the header set.
#    Nothing else is required — the running daemon picks it up.
```

Run `install.sh --tenant lawnpro` only if that tenant also needs **its own
scheduled jobs** (its own reminders, route, win-back). That installs a second
set of `com.ops.lawnpro.*` launchd jobs. In that case give the second chat
daemon a different port with `CHAT_DAEMON_PORT` in its environment, or simply
skip it and share the one daemon.

### Security note (v1.0)

`CHAT_DAEMON_SECRET` is **per-Mac, not per-tenant**. Anyone holding the Mac's
secret can address any tenant configured on it. That is acceptable for v1.0
(one operator, one appliance). Per-tenant secrets are a v1.1 concern.

## Troubleshooting

```bash
launchctl list | grep com.ops.<tenant>            # is it loaded?
launchctl print gui/$(id -u)/com.ops.<tenant>.chat-daemon
launchctl kickstart -k gui/$(id -u)/com.ops.<tenant>.chat-daemon
curl 127.0.0.1:8787/healthz
tail -f app/scripts/chat-daemon.error.log
```

A daemon that exits immediately almost always means `CHAT_DAEMON_SECRET` is
missing from `app/.env`, or the `claude` CLI is not installed at
`$HOME/.local/bin/claude`.
