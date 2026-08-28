# ops CLI

Tenant management for OPS (One Person Show) — the white-label packaging of
the `app/` Next.js portal. Tenants live in `app/lib/businesses/<id>/`.

No install step needed beyond the repo's existing `app/node_modules`
(the CLI requires `js-yaml` from there). Run via:

```
node ops/cli/ops.js <command> ...
```

Or, if you `npm link` / add `ops/cli` to your PATH via its `bin` entry:

```
ops <command> ...
```

## Commands

### `ops init <id> --name "..." --email ... --phone ... --city "..." [--from <tenant>] [--force]`

Creates `app/lib/businesses/<id>/` by copying an existing tenant (default
`_template`), then:

- Rewrites the identity fields (`id`, `name`, `email`, `ownerEmail`,
  `calendarId`, `phone`, `city`) in the copied `config.js`.
- Writes `business.yaml` (from `_template/business.yaml.example`) with the
  given values — this file is deep-merged over `config.js` at runtime
  (YAML wins), so you can hand-edit it later without touching JS.
- Prints the environment variables to set (locally and in Vercel) and the
  matching `vercel env add` commands.

Refuses to overwrite an existing tenant directory unless `--force` is given.

```
ops init demo-pool --name "Demo Pool Co" --email owner@demopool.test \
  --phone 512-555-0100 --city "Austin, TX"

ops init acme --from lawnpro --name "Acme Lawns" --email admin@acmelawns.com \
  --phone 512-555-0199 --city "Round Rock, TX"
```

### `ops list`

Lists every tenant directory under `app/lib/businesses/` (skipping
`_template`) with its display name and email.

```
ops list
```

### `ops validate <id>`

Loads the tenant's modules with `BUSINESS_ID=<id>` (and
`NEXT_PUBLIC_BUSINESS_ID=<id>`) set, and checks:

- `config.js` exports the required identity/policy fields (`id`, `name`,
  `nameShort`, `email`, `ownerEmail`, `calendarId`, `phone`, `city`,
  `depot.full`, `taxRate`, `taxRateDecimal`, `bookingTag`).
- `lib/sku-engine.js` (dispatched to the tenant) exports `SKU_PRICES` and
  `resolveSKU`.
- `lib/catalog.js` (dispatched to the tenant) exports `ADDONS`, `PRODUCTS`,
  `productsForQuote`, `addonsForQuote`.
- `service-plans.js` and `upgrade-paths.js` load without error.
- `lib/business.config.js` and `lib/quote-pricing.js` load under this
  tenant; prints the resolved pricing tables.

Exits non-zero (with a list of what failed) if any check fails.

```
ops validate greenguard
```

### `ops doctor [id]`

Reads `app/.env` (simple `KEY=VALUE` parsing, no shell expansion), reports
which required environment variables are present or missing — **values are
never printed** — and pings, each with an 8s timeout, printing OK/FAIL with
status codes only (never response bodies):

- Stripe — `GET https://api.stripe.com/v1/balance` (bearer `STRIPE_SECRET_KEY`)
- HubSpot — `GET https://api.hubapi.com/crm/v3/objects/contacts?limit=1` (bearer `HUBSPOT_ACCESS_TOKEN`)
- Resend — `GET https://api.resend.com/domains` (bearer `RESEND_API_KEY`)
- Chat daemon — `GET $CHAT_DAEMON_URL/healthz`
- Portal — `GET $NEXT_PUBLIC_APP_URL/api/ping`

A check is skipped (not failed) if its required key/URL isn't configured.

```
ops doctor
ops doctor greenguard
```

### `ops skills [id]`

Shells out to `node ops/skills/build.js <id>` if that file exists. Otherwise
prints `skills builder not installed`.

```
ops skills greenguard
```

## Notes

- `init`'s `config.js` rewrite is a best-effort line-level substitution —
  always review the generated file. `business.yaml` is the authoritative
  place to override identity/policy fields after `init`; it wins over
  `config.js` at runtime.
- `validate` mutates `process.env.BUSINESS_ID` / `NEXT_PUBLIC_BUSINESS_ID`
  for the duration of the process and clears the relevant `require` cache
  entries so it reflects the tenant under test, not whatever the shell had
  set.
