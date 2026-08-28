#!/usr/bin/env bash
#
# OPS appliance installer — turns a fresh Mac into a One Person Show appliance.
#
# Idempotent: safe to re-run. It never overwrites an existing app/.env, and
# re-running simply re-renders the plists and re-bootstraps the launchd jobs.
#
#   bash ops/appliance/install.sh
#   OPS_TENANT=lawnpro bash ops/appliance/install.sh
#   OPS_DRY_RUN=1 bash ops/appliance/install.sh        # print, execute nothing
#
# Flags mirror the env vars: --tenant X --repo DIR --agent-dir DIR --dry-run
#
set -euo pipefail

OPS_TENANT="${OPS_TENANT:-greenguard}"
OPS_REPO="${OPS_REPO:-$HOME/greenguard-usa-web}"
OPS_AGENT_DIR="${OPS_AGENT_DIR:-$HOME/greenguard_agent}"
OPS_DRY_RUN="${OPS_DRY_RUN:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --tenant)    OPS_TENANT="$2"; shift 2 ;;
    --repo)      OPS_REPO="$2"; shift 2 ;;
    --agent-dir) OPS_AGENT_DIR="$2"; shift 2 ;;
    --dry-run)   OPS_DRY_RUN=1; shift ;;
    -h|--help)   sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMPL_DIR="$SCRIPT_DIR/plists"
LA_DIR="$HOME/Library/LaunchAgents"
APP_DIR="$OPS_REPO/app"
UID_NUM="$(id -u)"
USER_NAME="$(id -un)"

# Every launchd job this appliance runs. Label: com.ops.<tenant>.<name>
JOBS="chat-daemon notify-daemon agent dailyroute reminder reminder2h postappointment winback tailscaled"

# ── output helpers ───────────────────────────────────────────────────────────
c_info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
c_ok()    { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
c_warn()  { printf '\033[1;33m  !!\033[0m %s\n' "$*"; }
c_die()   { printf '\033[1;31m ERR\033[0m %s\n' "$*" >&2; exit 1; }

# run CMD... — executes, or prints it when OPS_DRY_RUN is set.
run() {
  if [ -n "$OPS_DRY_RUN" ]; then
    printf '\033[0;36m  DRY\033[0m %s\n' "$*"
  else
    "$@"
  fi
}
# Same, for a shell snippet that needs redirection/pipes.
run_sh() {
  if [ -n "$OPS_DRY_RUN" ]; then
    printf '\033[0;36m  DRY\033[0m sh -c %s\n' "$1"
  else
    sh -c "$1"
  fi
}

echo
c_info "OPS appliance install"
echo "    tenant     : $OPS_TENANT"
echo "    repo       : $OPS_REPO"
echo "    agent dir  : $OPS_AGENT_DIR"
echo "    launchagents: $LA_DIR"
echo "    user       : $USER_NAME (uid $UID_NUM)"
[ -n "$OPS_DRY_RUN" ] && c_warn "DRY RUN — nothing will be executed"
echo

# ── 1. prerequisites ─────────────────────────────────────────────────────────
c_info "Checking prerequisites"

case "$OPS_TENANT" in
  *[!a-z0-9-]*|'') c_die "OPS_TENANT must match [a-z0-9-]{1,32}: got '$OPS_TENANT'" ;;
esac
[ "${#OPS_TENANT}" -le 32 ] || c_die "OPS_TENANT too long (max 32)"

[ -d "$OPS_REPO" ]  || c_die "repo not found: $OPS_REPO (clone it, or pass --repo)"
[ -d "$APP_DIR" ]   || c_die "app dir not found: $APP_DIR"

TENANT_CONFIG="$APP_DIR/lib/businesses/$OPS_TENANT/config.js"
[ -f "$TENANT_CONFIG" ] || c_die "no tenant config at $TENANT_CONFIG — create it first"
c_ok "tenant config: $TENANT_CONFIG"

NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || c_die "node not found on PATH — install Node 18+ first"
c_ok "node: $NODE_BIN ($("$NODE_BIN" --version))"

PY_BIN="$(command -v python3 || true)"
[ -n "$PY_BIN" ] || c_die "python3 not found on PATH"
c_ok "python3: $PY_BIN"

CLAUDE_BIN="$HOME/.local/bin/claude"
if [ -x "$CLAUDE_BIN" ]; then
  c_ok "claude CLI: $CLAUDE_BIN"
else
  c_die "claude CLI not found at $CLAUDE_BIN — install it and log in to the subscription first"
fi

TS_BIN="$(command -v tailscale || true)"
if [ -n "$TS_BIN" ]; then
  c_ok "tailscale: $TS_BIN"
elif [ -x "$HOME/go/bin/tailscale" ]; then
  c_ok "tailscale: $HOME/go/bin/tailscale (userspace build)"
else
  c_warn "tailscale not found — the chat daemon will be reachable on localhost only (no Funnel)"
fi

if [ -d "$OPS_AGENT_DIR" ]; then
  c_ok "agent dir: $OPS_AGENT_DIR"
else
  c_warn "agent dir missing: $OPS_AGENT_DIR — its launchd jobs will be installed but will fail until it exists"
fi

# ── 2. node dependencies ─────────────────────────────────────────────────────
echo
c_info "Node dependencies"
if [ -d "$APP_DIR/node_modules" ]; then
  c_ok "node_modules present — skipping npm ci"
else
  c_info "node_modules missing — installing production deps"
  run_sh "cd '$APP_DIR' && npm ci --omit=dev"
fi

# ── 3. environment file ──────────────────────────────────────────────────────
echo
c_info "Environment file"
ENV_FILE="$APP_DIR/.env"
ENV_EXAMPLE="$APP_DIR/.env.example"
if [ -f "$ENV_FILE" ]; then
  c_ok ".env already exists — left untouched"
else
  if [ ! -f "$ENV_EXAMPLE" ]; then
    c_die "no $ENV_FILE and no $ENV_EXAMPLE to seed from"
  fi
  run cp "$ENV_EXAMPLE" "$ENV_FILE"
  run chmod 600 "$ENV_FILE"
  echo
  c_warn "Created $ENV_FILE from .env.example."
  cat <<EOF

  Fill it in before the daemons can run. At minimum:

    CHAT_DAEMON_SECRET   shared secret; generate with: openssl rand -hex 32
                         (the same value must be set in the portal's Vercel env)
    BUSINESS_ID          $OPS_TENANT
    DATABASE_URL, STRIPE_SECRET_KEY, HUBSPOT_ACCESS_TOKEN,
    GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN,
    JWT_SECRET, RESEND_API_KEY, CALENDAR_TIMEZONE

  Then re-run this installer to finish setting up launchd.

EOF
  [ -z "$OPS_DRY_RUN" ] && exit 1
  c_warn "(dry run: continuing past the stop-and-configure point)"
fi

# ── 4. render launchd plists ─────────────────────────────────────────────────
echo
c_info "Rendering launchd plists into $LA_DIR"
run mkdir -p "$LA_DIR"

for job in $JOBS; do
  tmpl="$TMPL_DIR/$job.plist.tmpl"
  label="com.ops.$OPS_TENANT.$job"
  dest="$LA_DIR/$label.plist"
  if [ ! -f "$tmpl" ]; then
    c_warn "template missing, skipping: $tmpl"
    continue
  fi
  if [ -n "$OPS_DRY_RUN" ]; then
    printf '\033[0;36m  DRY\033[0m render %s -> %s\n' "$tmpl" "$dest"
  else
    sed -e "s#__HOME__#$HOME#g" \
        -e "s#__REPO__#$OPS_REPO#g" \
        -e "s#__AGENT__#$OPS_AGENT_DIR#g" \
        -e "s#__TENANT__#$OPS_TENANT#g" \
        -e "s#__USER__#$USER_NAME#g" \
        "$tmpl" > "$dest"
    plutil -lint "$dest" >/dev/null || c_die "rendered plist is invalid: $dest"
    c_ok "$label"
  fi
done

# ── 5. (re)load launchd jobs ─────────────────────────────────────────────────
echo
c_info "Loading launchd jobs (gui/$UID_NUM)"
for job in $JOBS; do
  label="com.ops.$OPS_TENANT.$job"
  dest="$LA_DIR/$label.plist"
  if [ ! -f "$dest" ] && [ -z "$OPS_DRY_RUN" ]; then continue; fi
  # bootout first so a re-run picks up a changed plist; it fails harmlessly
  # when the job was not loaded, hence the `|| true`.
  if [ -n "$OPS_DRY_RUN" ]; then
    printf '\033[0;36m  DRY\033[0m launchctl bootout gui/%s/%s (ignore failure)\n' "$UID_NUM" "$label"
    printf '\033[0;36m  DRY\033[0m launchctl bootstrap gui/%s %s\n' "$UID_NUM" "$dest"
  else
    launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
    if launchctl bootstrap "gui/$UID_NUM" "$dest" 2>/dev/null; then
      c_ok "bootstrapped $label"
    else
      c_warn "bootstrap failed for $label (see: launchctl print gui/$UID_NUM/$label)"
    fi
  fi
done

# ── 6. verify ────────────────────────────────────────────────────────────────
echo
c_info "Verifying the chat daemon"
PORT="${CHAT_DAEMON_PORT:-8787}"
if [ -n "$OPS_DRY_RUN" ]; then
  printf '\033[0;36m  DRY\033[0m curl -fsS --max-time 5 http://127.0.0.1:%s/healthz\n' "$PORT"
else
  ok=""
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if out="$(curl -fsS --max-time 5 "http://127.0.0.1:$PORT/healthz" 2>/dev/null)"; then
      c_ok "healthz: $out"
      ok=1
      break
    fi
    sleep 2
  done
  if [ -z "$ok" ]; then
    c_warn "chat daemon did not answer on 127.0.0.1:$PORT after 20s"
    echo "      logs: $APP_DIR/scripts/chat-daemon.error.log"
    echo "      check CHAT_DAEMON_SECRET is set in $ENV_FILE"
  fi
fi

echo
c_info "Done."
cat <<EOF

  Tenant '$OPS_TENANT' is installed. Next steps:

    Expose the chat daemon to the portal (public HTTPS):
      tailscale funnel 8787
    then set CHAT_DAEMON_URL in the portal's Vercel env to the funnel host,
    with CHAT_DAEMON_SECRET matching $ENV_FILE.

    Status:   launchctl list | grep com.ops.$OPS_TENANT
    Restart:  launchctl kickstart -k gui/$UID_NUM/com.ops.$OPS_TENANT.chat-daemon
    Remove:   bash ops/appliance/uninstall.sh --tenant $OPS_TENANT

  A SECOND tenant on this same Mac does NOT need a second chat daemon: one
  daemon serves them all. Callers just send the 'x-ops-tenant' header. See
  ops/appliance/README.md.

EOF
