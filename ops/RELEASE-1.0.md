# OPS v1.0 — Release Notes

One Person Show v1.0: the GreenGuard USA operating stack, generalized into a
tenant-parameterized product. GreenGuard is tenant 1 (production); lawnpro
and poolpro are demo/reference tenants.

## What's new in this lane (skills + docs)

- `ops/skills/build.js` — dependency-free renderer that turns
  `app/lib/businesses/<tenantId>/config.js` + `ops/skills/templates/*.md`
  into a tenant's 28 Claude Code skills plus a generated `CLAUDE.md`, with a
  hard failure on any unresolved `{{token}}`.
- 28 tenant-neutral skill templates (`ops/skills/templates/*.md`), covering
  ops scaffolding (deploy, env, health, security, crons, debug, git, infra),
  business workflows (onboard, quote, invoice, add-sku, upgrade, inventory,
  customer, schedule, gcal, rounds, route, email-agent, stripe, books,
  weekly, hubspot), and marketing (analytics, seo, new-page), plus
  `digest-session` unchanged. `gg-photos` is intentionally excluded — it's
  personal, not part of the product.
- `ops/CLAUDE.md.tmpl` — tenant CLAUDE.md template with a generated
  `## Policy` section.
- `ops/policy.yaml.example` — the GreenGuard operating rulebook as editable
  config (scheduling, notifications, data model, billing, rhythm,
  compliance).

## Acceptance checklist (v1.0)

Each item is a command or check you can run directly.

- [ ] **Build succeeds for the reference tenant:**
      `node ops/skills/build.js greenguard --out /tmp/ops-skills-test` exits 0
      and reports 29 files built.
- [ ] **Correct file count:** `ls /tmp/ops-skills-test | wc -l` → `29`
      (28 skills + `CLAUDE.md`).
- [ ] **Unknown-token guard works:** temporarily add `{{bogus}}` to any
      template and re-run the build — it must fail with the file name and
      token named, not silently emit `{{bogus}}` into the output.
- [ ] **No leakage across tenants:** `node ops/skills/build.js lawnpro --out
      /tmp/ops-skills-lawn` then
      `grep -rn "GreenGuard\|greenguard-usa.com" /tmp/ops-skills-lawn/`
      returns matches ONLY inside lines preceded by a
      `<!-- tenant-catalog: edit for your catalog -->` marker.
- [ ] **Workflow parity:** diffing 3 generated GreenGuard skill files against
      their `~/.claude/commands/gg-*.md` originals shows differences limited
      to tokenization (paths/URLs/brand strings) and added
      `tenant-catalog`/policy-reference notes — no workflow step, gotcha, or
      rule dropped.
- [ ] **Policy renders:** the generated `CLAUDE.md`'s `## Policy` section
      reflects `ops/policy.yaml.example` defaults, and is overridden
      correctly when a tenant's `business.yaml` supplies a `policy:` block.
- [ ] **CLI surface exists** (owned by `ops/cli` lane): `ops init`,
      `ops validate`, `ops doctor`, `ops skills` all resolve to real
      commands, not just documentation.
- [ ] **Appliance installer exists** (owned by `ops/appliance` lane):
      `ops/appliance/install.sh` provisions chat-daemon, notify daemon, and
      the Gmail agent as launchd services and prints the Tailscale Funnel
      URL to put in `CHAT_DAEMON_URL`.
- [ ] **Tenant config loads cleanly:** `node -e "console.log(require('./app/lib/businesses/greenguard/config.js').name)"`
      prints `GreenGuard USA` (and the same pattern works for any tenant id).

## Known limitations (v1.0)

- **Single shared daemon secret.** `CHAT_DAEMON_SECRET` is one secret per
  Mac appliance, not scoped per tenant. Running more than one tenant off a
  single appliance means every tenant's portal shares that secret. Fine for
  a single owner-operator; not yet a multi-tenant SaaS credential model.
- **iMessage is Mac-only.** The 2-hour text reminder channel depends on the
  Mac's Messages app; there is no non-Mac SMS path wired into policy
  defaults (a Twilio adapter exists in the codebase but is not the default).
- **Self-serve signup and Stripe Connect are post-1.0.** Onboarding a tenant
  today is white-glove (see `ops/README.md` checklist) — there is no signup
  flow, and each tenant uses its own Stripe account rather than a Connect
  platform account.
- **Gemini/Groq exist only as a Mac-down fallback.** All AI traffic is
  designed to run through the Mac appliance's `claude` CLI on a flat
  subscription. Gemini and Groq client libraries remain in the codebase
  solely as a fallback path for `/complete`-style calls when the appliance
  is unreachable — they are not a supported primary runtime and should be
  treated as deletable once a second Mac/runtime exists for redundancy.

## Upgrade notes: from the GreenGuard-only stack

- Any hardcoded `ADMIN_EMAIL` / depot / tax / industry / brand-name literal
  in application code should now come from `lib/businesses/<id>/config.js` —
  this was largely completed upstream (v0.2/v0.3 of the OPS product work);
  if you find a literal that isn't tenant-derived, it's a bug in that lane,
  not in the skills.
- Every ops-scaffolding/business/marketing skill you rely on daily was a
  `gg-*` command scoped to GreenGuard only. The equivalent tenant-neutral skill is
  now `{{id}}-<name>.md` (e.g. `gg-deploy` → `greenguard-deploy` once built
  for the `greenguard` tenant), generated by
  `node ops/skills/build.js greenguard --out ~/.claude/commands`. Existing
  `gg-*.md` files in `~/.claude/commands` are untouched by this build unless
  you explicitly point `--out` at that directory — the verify commands in
  this repo always use a scratch `/tmp` directory for exactly this reason.
- `policy.yaml` is new: rules that previously lived only in the operator's
  memory (booking hours, no-Saturday, radius gate, notification channels,
  quote follow-up windows, etc.) are now config, sourced by
  `ops/policy.yaml.example` and overridable per tenant in `business.yaml`.
- The generated `CLAUDE.md` per tenant replaces hand-maintained,
  GreenGuard-specific `CLAUDE.md` files as the reference doc for a new
  tenant's repo — rebuild it after any `config.js`/`business.yaml`/
  `CLAUDE.md.tmpl`/`policy.yaml` change.
