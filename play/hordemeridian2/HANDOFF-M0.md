# Horde Meridian 2, milestone M0 handoff

Plan: `~/.claude/plans/horde-meridian-2.md`. Scope of this lane: fork, fonts, type
system, menu layout engine, hub card, gate. No deploy, no push.

**Slug note:** the directory was renamed mid-lane from `horde-meridian-2` to
`hordemeridian2` (owner wants `new.greenguard-usa.com/play/hordemeridian2`). Every
reference now uses the flat slug: base href, manifest scope, GGKit storage slug,
`PLAY_KEEP`, `PLAY_SHOTS_KEEP`, `.vercelignore`, the hub card and the shot filename.

## Done

### 1. Storage isolation
HM1 and HM2 are served from the same origin, so they share `localStorage`. Every key
moved:

| HM1 | HM2 |
|---|---|
| `gg-horde-meridian` | `gg-hordemeridian2` |
| `gg-horde-meridian-audio` | `gg-hordemeridian2-audio` |
| `gg-horde-meridian-ui` | `gg-hordemeridian2-ui` |
| `hm_blackbox` | `hm2_blackbox` |
| `hm_diag` | `hm2_diag` |

The first three come from one change: `GGKit.create({ slug: 'hordemeridian2' })`, since
GGKit derives its keys as `gg-<slug>`. The `sanitizePrefs` spec list was updated to
match. `PROFILE_VERSION` stays 3 (M5 bumps it to 4 and does the HM1 gem import).

The texture keys `hm_galaxy`, `hm_nebula*`, `hm_planet*` are NOT storage and were
deliberately left alone.

Verified empirically by the gate in one shared browser context: HM1 wrote its save,
HM2 then ran and added only `gg-hordemeridian2`, `gg-hordemeridian2-audio` and
`hm2_diag`. No HM1 key was removed or modified (all four byte-identical afterwards),
and HM1 reloaded with its profile intact.

### 2. Fonts
Display **Chakra Petch Bold**, body **Inter Regular**, both OFL 1.1, subset to the
ASCII range the game uses, variable fonts instanced to a single weight, self-hosted as
woff2 in `assets/`. License texts ship at `assets/OFL-ChakraPetch.txt` and
`assets/OFL-Inter.txt`; `LICENSES.md` is rewritten for them.

The inherited face (Kenney Future, CC0) was the actual bug behind the owner's
"illegible menus" complaint: it is a squared pixel font whose `X` renders as `H`, so
the hangar CODEX tab literally read **CODEH**, and its body copy needed shrinking to
about 10px to fit a card.

Chakra Petch was picked over Rajdhani and Exo 2 on a 13px glyph plate: largest
x-height, widest apertures, and the only candidate whose digit `1` keeps a base serif,
so the `Il1|` run stays separable. That matters because gem costs and tier counts are
set at that size. Rajdhani is condensed and collapses `Il1|` into four near-identical
bars. Comparison shots and the full rationale: `review_evidence/m0/fonts/`.

Verified in the running game that both faces are actually rasterised and not silently
falling back (`document.fonts` reports `loaded`, and each measures a different advance
width from the fallback stack).

### 3. Type scale
`hm_data.js`: `TYPE = { hero:44, title:32, head:24, sub:18, body:15, label:13,
micro:12 }`, `LINE = 1.3`. Fallback stacks now name the real families.

### 4. Menu layout engine
New `hm2_ui.js` (ES5, loaded after `hm_campaign_ui.js`, before the boot block that
injects `game.js`). Exposes `window.__HM2_UI` with `wrapText`, `layoutColumn`, `card`,
`tabBar` and `measureWidth`.

Every text auto-shrink (`setScale(width / text.width)`) is gone: the gate confirms zero
Phaser Text objects with an effective scale below 1.0 and zero under 12px effective,
across all ten captures at both viewports. Image and tween scales were left alone.

Title reads **HORDE MERIDIAN 2**. Hangar tabs are **MODS / GUNS / CODEX / STYLE /
SHIPS**, driven by a single `HANGAR_TABS` array so M5 can reorder them without touching
layout code. SHIPS currently renders the existing core-systems content, as planned.

Screens re-laid: title, co-op, all five hangar tabs, mission select, pause, game-over.

### 5. Hub
Card added to `play/index.html` (header count bumped from two games to three; the page
title carries no count). Shot at `play/_shots/hordemeridian2.jpg`, a real gameplay
frame at 295x640, 42 KB, matching the fleet portrait convention. `build_vercel.py`
(`PLAY_KEEP` + `PLAY_SHOTS_KEEP`) and `.vercelignore` carry the slug; a local
`build_vercel.py` run confirms the game and its shot reach `out/`.

### 6. Gate
An independent Opus gate (not the implementer) captured ten screens at two viewports
and checked overlap, text size, console, storage isolation, fonts, tabs and title.

Round 2 returned PASS. Round 1 returned HOLD with two real findings, both from one root cause, both fixed in
`6bda2ee9`:

1. **Blocker.** `wrapText` decided whether it had truncated by comparing placed
   character count against source length. That is wrong whenever a whole trailing word
   is dropped but the surviving text is a similar length, so `GEM REFINERY` rendered as
   `GEM` and `FIELD MAGNET` as `FIELD`: two different upgrades reduced to labels that
   read as complete and correct. Removing the old shrink had traded small-but-readable
   text for confidently wrong text. `wrapText` now tracks overflow as it consumes words
   and always marks truncation. The SHIPS cards also got their real width back (the
   name budget reserved a flat 54px for a price column that only holds a short gem
   count or `MAXED`; it now reserves the measured width plus a gutter), so all six
   names render in full at 390px.
2. **Should-fix.** A locked gun slot read `OPENS IN`, an unfinished sentence, because
   `OPENS IN RUN` did not fit. Shortened to `IN RUN`.

Round 2 verdict: **PASS**, nothing outstanding. The gate confirmed all six SHIPS names
render in full, the locked slots read `IN RUN`, no new truncation or overlap was
introduced (the text set is identical to round 1 except the six intended strings), and
truncation was not disabled to hide the symptom: adversarial `wrapText` cases still
ellipsise correctly and no returned line exceeds its width budget.

## Residuals (not blocking, carried forward)

- **Landscape is a rotate gate.** The game gates on portrait, so a 1280x800 viewport
  only ever renders "Rotate your device to portrait to play" and any metrics collected
  behind it are void. HM1 behaves identically, so this is inherited, not an M0
  regression. Large-viewport evidence is therefore captured at **800x1280**. If the
  plan's "desktop must also be fine" is meant literally as landscape, that is a real
  piece of work and belongs in its own milestone.
- **Service worker scope error.** `The path of the provided scope ('/play/hordemeridian2')
  is not under the max scope allowed ('/play/hordemeridian2/')` comes from shared
  `play/_shared/ggkit.js` and affects HM1 identically. Out of scope for this lane, but
  it is a real console error on every game in the fleet and someone should fix it.
- **Pause and game-over geometry.** Those screens draw an opaque panel over the live
  run HUD, so the HUD text underneath registers as overlapping in pure geometry while
  being invisible. Confirmed clean by eye. Any future automated gate needs to keep
  judging these two screens visually, or learn to ignore occluded text.
- **SHIPS is still CORE content** under a new label, as M0 intended. M5 consolidates
  META into `HANGAR_TRACKS` and gives SHIPS real ship tiers.
- The debug capture hooks (`__HM2_FORCE_TAB`, `__HM2_FORCE_PAUSE`,
  `__HM2_FORCE_GAMEOVER`) ship in `game.js`. They are inert when unset. The pause and
  game-over hooks take about five seconds to fire because they wait out the opening
  banner storm, so any harness must poll for scene state rather than use a fixed wait.

## Commits (in `greenguard-usa-web`, not pushed)

| Commit | What |
|---|---|
| `f969f87d` | Fork at `play/hordemeridian2`, storage keys isolated, hub card, deploy allowlist |
| `52bf2996` | Menu evidence, capture harness, OFL license record |
| `e6ba802b` | Arcade hub card and gameplay shot |
| `6bda2ee9` | Gate fixes: `wrapText` dropped words instead of marking truncation |

## Evidence

- `review_evidence/m0/fonts/`: three candidate hangar renders, the 13px glyph plate,
  `DECISION.md`.
- `review_evidence/m0/menus/`: ten screens at 390x844 and 800x1280 plus per-text metric
  JSON.
- `review_evidence/m0/capture_harness.mjs`: drives each screen and dumps text bounds,
  font size and effective scale.
- `review_evidence/m0/check_metrics.mjs`: flags shrunk, undersized and overlapping text
  from that JSON. Run as `node check_metrics.mjs <report.json>`.

Re-run the gate with:

    cd /Users/lucille/greenguard-usa-web && python3 -m http.server 8791
    node play/hordemeridian2/review_evidence/m0/capture_harness.mjs 8791 /tmp/out 390 844
    node play/hordemeridian2/review_evidence/m0/check_metrics.mjs /tmp/out/report_390x844.json

## Next

M1 (weapons: 12 archetypes plus evolutions) per the plan. Deploy of M0 was requested in
the plan so the owner can see the font and menus early, but this lane did not deploy.
