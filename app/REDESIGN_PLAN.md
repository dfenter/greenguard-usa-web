# Portal Legibility Redesign — "Clarity" (light theme) — v2, post Sol review

## Goal
Portal-wide restyle of portal.greenguard-usa.com (Next.js app in `app/`) for MAXIMUM legibility.
The field tech has very poor eyesight. Current dark-green theme fails him. Requirements from owner:

1. Light, Apple-like appearance: white/near-white surfaces, near-black text, hairline-but-visible borders, soft shadows.
2. Green demoted: no longer the dominant surface color. Green lives in borders, thin accents, and the primary button only.
3. Forms standard white background with black text.
4. Contrast targets: body text >= 7:1 (AAA), all UI text >= 4.5:1 (AA), non-text UI (borders/focus) >= 3:1.
5. Uniform across ALL portal pages including PWA surfaces (manifest, offline page).
6. Zero functional change. Styling only. No layout restructuring, no logic edits, no new dependencies.

## Architecture (verified + corrected by Sol)
- Palette chain: `lib/business.config.js` selects `lib/businesses/${BUSINESS_ID}/config.js` (default greenguard) -> `pages/_document.js` `buildCssVars()` injects `:root` CSS vars.
- The accent var is **`--green`** (mapped from `c.accent`). There is NO `--accent` var. Use `var(--green)`.
- Multi-tenant: `lawnpro` and `poolpro` configs share `_document.js` and `globals.css`. Any NEW color fields read in `buildCssVars()` MUST have fallback defaults (`c.ok || '#176f2b'` style) so other business builds don't throw (`hx()` calls `.replace()` unconditionally).
- `styles/tokens.css` is a static mirror; the ACTIVE design-sync stylesheet is `styles/ds-combined.css` (per `.design-sync/config.json`) - both must be updated.
- `styles/globals.css` holds shared classes (.card, .btn-gold, .btn-outline, .btn-green, .badge, .tag, forms, scrollbars, admin dock). It is shared across businesses: keep every rule expressed in tokens, never greenguard literals.

## New token values — `lib/businesses/greenguard/config.js` ONLY
```js
colors: {
  bg:          '#f5f5f7',               // page background
  bgDeep:      '#ffffff',               // nav bar, docks, sheets: solid white
  bgCard:      '#ffffff',               // cards: solid white, no translucency
  bgAlt:       '#eef2ef',               // subtle green-tinted panel/alt rows
  border:      'rgba(27,94,32,0.65)',   // green border, >=3:1 non-text on white (Sol-corrected)
  borderGold:  'rgba(120,88,0,0.60)',
  accent:      '#1b5e20',               // deep green, 7.87:1 on white
  accentMuted: '#3f6e47',               // 5.94:1
  gold:        '#785800',               // Sol-corrected: 5.9:1+ on white, passes on tints
  text:        '#111111',               // 18.9:1
  textMuted:   'rgba(17,17,17,0.78)',
  textDim:     'rgba(17,17,17,0.62)',   // Sol-corrected: >=4.5:1 on bg/bgAlt
  themeColor:  '#f5f5f7',
  // NEW semantic status colors (add to ALL THREE business configs)
  ok:          '#176f2b',               // Sol-corrected
  danger:      '#b3261e',
  info:        '#0b57d0',
  warn:        '#8a5300',
  textOnAccent:'#ffffff',               // button/status-fill label color
}
```
Also add `ok/danger/info/warn/textOnAccent` to `lawnpro` and `poolpro` configs (same status values; `textOnAccent` chosen per their accent luminance: lawnpro/poolpro get `#0d1a10`-style dark if their accents are light).

## `_document.js` changes
- Inject new vars WITH fallbacks: `--ok`, `--danger`, `--info`, `--warn`, `--text-on-accent`, plus `--ok-rgb`, `--danger-rgb`, `--info-rgb`, `--warn-rgb` (fallback defaults inline so lawnpro/poolpro build even before their configs gain fields).
- iOS status bar: `apple-mobile-web-app-status-bar-style` `black-translucent` -> `default` (white glyphs would vanish on a light header).
- Keep Inter <link> (fallback font).

## globals.css changes (token-expressed, business-agnostic)
- Font stack: `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif`.
- `body::before` radial gradients: remove (plain `var(--bg)`).
- Shadows: `0 1px 3px rgba(0,0,0,0.10)` / `0 4px 16px rgba(0,0,0,0.10)` / `0 12px 32px rgba(0,0,0,0.14)`.
- `.card`: solid `var(--bg-card)`, DELETE `backdrop-filter` and `--surface-grad` usage.
- Gradients `--gold-grad`/`--green-grad` -> flat fills. `.btn-gold` (primary): solid `var(--green)` bg + `var(--text-on-accent)` text. `.btn-green` same. `.btn-outline`: `var(--bg-card)` bg, `1.5px solid var(--border)`, `var(--text)` text. Keep all class NAMES.
- Focus ring: `0 0 0 3px rgba(var(--green-rgb),0.70)` (>=3:1, Sol-corrected alpha).
- Forms baseline: `background: var(--bg-card)`, `color: var(--text)`, `border: 1.5px solid var(--border)`; focus border `var(--green)`; `option` uses `var(--bg-card)`/`var(--text)`.
- Scrollbars: `rgba(0,0,0,0.30)`.
- `.tag`: `var(--gold)`. `.badge`: `var(--gold)` on `rgba(var(--gold-rgb),0.10)` + `1px solid var(--border-gold)` (border carries the boundary, not the tint). `.badge-green` -> `var(--green)` text.
- `.admin-dock`: keep no-backdrop-filter guard, add `border-top: 1px solid var(--border)`.
- `.hamburger span`: `rgba(var(--text-rgb),0.75)`.

## PWA / design-sync surfaces (B0)
- `public/manifest.json`: `background_color`/`theme_color` -> `#f5f5f7`.
- `public/offline.html`: restyle to light palette.
- `public/sw.js`: BUMP the cache version constant so installed PWAs fetch fresh assets.
- `styles/tokens.css` AND `styles/ds-combined.css`: mirror the new :root values.

## Chart palette (analytics + maps)
Categorical series need distinction, not status semantics. 8-color accessible-on-white set:
`#0b57d0 #b3261e #176f2b #785800 #6a1b9a #00696d #8f3e00 #444746`
Analytics (`pages/admin/analytics.js:55-60`) swaps its categorical array for this. Map markers (CustomerMap, admin/map, route) use literal values from this palette or status tokens - Canvas and Google Maps APIs need RESOLVED literals, never `var(--x)` strings.

## Hex -> token mapping table (sweep)
SEMANTIC, not blind sed - judge each use site:

| Found | Replace with |
|---|---|
| `#0d1a10` `#1a2e1f` `#111c13` `#1a3320` `#051a08` `#13251a` `#243627` as background | `var(--bg-deep)`/`var(--bg)`/`var(--bg-alt)` per role |
| same dark hexes as TEXT on gold/green fills | `var(--text-on-accent)` |
| `rgba(13,26,16,x)` / `rgba(26,46,31,x)` translucent dark surfaces | solid `var(--bg-card)` or `var(--bg-alt)`; delete blur |
| `#e3f0db` `#d4e6ca` `#dde8de` (light text on dark) | `var(--text)` or `var(--text-muted)` per emphasis |
| `#7dffaa` `#a8edc0` | `var(--green)` |
| `#7aab82` | `var(--green-muted)` |
| `#c9a84c` `#e3c878` | `var(--gold)` |
| `#ff8080` `#ff6b6b` + error reds | `var(--danger)` |
| `#5bc4ff` + info blues | `var(--info)` |
| `#ffb060` `#f57c00` + warn oranges | `var(--warn)` |
| `#4caf50` `#64b5a6` + success greens | `var(--ok)` |
| `rgba(125,255,170,x)` | `rgba(var(--green-rgb),x')`, tint alphas ~0.08-0.14 |
| `rgba(201,168,76,x)` | `rgba(var(--gold-rgb),x')` |
| grays `#555 #888 #999` (dim text) | `var(--text-dim)`/`var(--text-muted)` |
| `#f0f0f0 #e0e0e0 #f5f5f5` fills | `var(--bg-alt)` or `rgba(0,0,0,0.06)` |
| `#fff/#ffffff` as text on colored fill | `var(--text-on-accent)` |
| `#000/#000000` text | `var(--text)`; true scrims keep rgba black |
| `rgba(255,255,255,x)` glass highlights | delete or `rgba(0,0,0,0.04)` |
| `colorScheme: 'dark'` (e.g. rounds date input) | `'light'` |
| inline `fontFamily: 'Inter, sans-serif'` etc. | remove property (inherit) unless monospace |

Status tint chips: text uses the STRONG token, background `rgba(var(--x-rgb),0.10)` max, plus a 1px token border. If a combination cannot hit 4.5:1, use solid token bg + `var(--text-on-accent)`.
Anything ambiguous: pick the highest-contrast option and leave a one-line comment.

## File batches (Luna, IN ORDER, one run per batch, commit + `npm run build` after EVERY batch)
- **B0 foundation:** `lib/businesses/greenguard/config.js`, `lib/businesses/lawnpro/config.js`, `lib/businesses/poolpro/config.js` (status fields only), `pages/_document.js`, `styles/tokens.css`, `styles/ds-combined.css`, `styles/globals.css`, `pages/_app.js`, `pages/_error.js`, `public/manifest.json`, `public/offline.html`, `public/sw.js` (cache bump).
- **B1 components:** `components/{PortalLayout,AdminChat,CustomerChat,AppointmentDetailDock,CustomerPanel,CustomerMap,SignaturePad,StopCard,TankCalendar,useLazyData}.js`. PortalLayout: dark translucent nav + blur -> solid `var(--bg-deep)` + bottom `var(--border)` hairline. SignaturePad canvas: literal dark ink `#111111` on literal `#ffffff` (Canvas needs literals).
- **B2 admin core:** `pages/admin/{home,tech,rounds,clients,clients/[email]}.js`. rounds.js: `colorScheme:'light'` on date control.
- **B3 admin ops:** `pages/admin/{quote,invoice,invoices,booking,calendar,tank-calendar,route,map,inventory}.js`. calendar.js styled-JSX blocks included. map/route markers: literal chart-palette values.
- **B4 admin rest:** `pages/admin/{analytics,books,books/chat,books/upload,health,reports,legacy-migration,upgrade,visit-complete}.js` + `pages/admin/invoice-pdf.js` NON-PRINT chrome only (lines ~94-175; the printable sheet from ~line 177 stays as-is).
- **B5 customer:** `pages/{login,prospect,auth-success,auth/verify}.js`, `pages/dashboard/{index,history,map,settings,upgrade}.js`, `pages/quote/{new,[token]}.js`.
- **EXCLUDED:** all of `pages/api/**` (email HTML + server code).

## Rules for the implementer
1. Styling changes only. Never touch JSX structure, handlers, data fetching, or copy text.
2. Never touch `pages/api/**`.
3. Keep class names; restyle, don't rename. Use `var(--green)` (NOT `var(--accent)` - it doesn't exist).
4. Canvas/Maps/chart configs: resolved literal colors only, never `var()` strings.
5. Inline `style={{}}`: replace values in place; do not migrate to CSS files.
6. After each batch, audit YOUR files: `grep -nE '#(0d1a10|1a2e1f|111c13|1a3320|051a08|13251a|243627|7dffaa|a8edc0|e3f0db|d4e6ca|dde8de|c9a84c|e3c878|ff8080|5bc4ff|ffb060)|rgba\(1[23]?,2?6,' <files>` -> must be zero, and check for leftover `colorScheme: 'dark'`, `backdrop-filter`, dark gradients.
7. `cd app && npm run build` must pass BEFORE committing each batch.
8. Commit per batch: `git commit -m "clarity: <batch>"` - NO Co-Authored-By trailers (hard org rule).
9. Do not deploy. The orchestrator deploys after review.

## Verification (orchestrator)
- Build green after every batch; repo-wide `rg` audit for hex/rgb/gradients/colorScheme in UI files; `pages/api/**` diff empty.
- Visual checks on preview: iPhone status bar, native date/select controls, maps, charts, signature canvas, offline page, invoice print.
- Deploy `./scripts/deploy.sh preview`; owner approves before prod promote.
