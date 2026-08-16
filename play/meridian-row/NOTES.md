# Meridian Row
Controls: tap ROLL (or Space), tap a choice card (or 1/2/3, arrows + Space), ALBUMS (A), RESTART (R), Esc closes album.
Loop: lap a 24-tile town vs 3 rivals; landmark slots build 4 districts x 3 tiers, corners collect or charge tolls, event tiles give a heist (rivals only, shields block) or a grant.
Stickers from Gate laps fill 4 albums (posted odds: 1 of 24 per draw, 4.2% each) and pay +40 plus a free tier.
Win: first to Spire all 4 districts; winning reseeds the next board harder. Boards won and best turn count persist. No energy, no timers, no purchases.

## AAA rebuild

Implemented: Phaser 3 portrait rebuild with GGKit as the sole lifecycle, input, save, and audio layer. The middle of the screen is the baked board and token race; the live play HUD uses compact tier bars, corner owner color, one edge chip or sticker reveal, and a thin coach strip. Roll movement, 1/2/3 and arrows plus Space choice cards, generous tolls and grants, shields, rival heists, 1 of 24 sticker odds, duplicate payouts, album free-tier rewards, reduced-motion gating, landmark hazards, medal results, and the `window.__mr` probe are live. PWA metadata, generated MP3 cues, procedural icons, and service-worker precache are included.

Mode table:

| Mode | Rule | Progression |
|---|---|---|
| Meridian Row | 24 tiles, 3 rivals, build all 4 districts to Spire | Board wins, best turns, harder Meridian Spire board from level 3 |
| Sticker Rush | Accelerated sticker draws on short boards | Docklight Dash, Lantern Loop, then Spire Sprint unlock in order |
| Endless Row | 24-tile loop expands by 4 tiles after each clear | Row score and best expanding-row record |

Board table:

| Board | Tiles | Identity |
|---|---:|---|
| Meridian Row | 24 | Saltmarket, Lanternside, Kiln Quarter, Verge Park |
| Docklight Dash | 12 | Docklight, Fishery, Brass Pier, Gullwalk |
| Lantern Loop | 16 | Wickway, Paper Court, Glow Yard, Night Fern |
| Spire Sprint | 20 | Rose Foundry, Sky Ledger, Copper Gate, Moss Court; landmark hazards |
| Endless Row | 24+ | Expanding score-chase loop |
| Meridian Spire | 24 | Crown Quay, Moon Arcade, Ember Rise, Greenline; landmark hazards |

Deferred: no browser backend was available for a real canvas screenshot or touch smoke run in this environment, and the local HTTP server could not bind under the sandbox. Node syntax checks and static file/precache checks were run.

## Fix round 1

Fixed:

- CRITICAL local multiplayer: added a four-slot local lobby, ready prompts, P1 to P4 keyboard profiles, local player state, and AI fallback slots.
- CRITICAL keyboard and controller input: added per-player keyboard routing, gamepad assignment, rising-edge polling, and disconnect recovery messaging.
- CRITICAL racer mechanics: added lap-based finish-line wins, tricks, authored racer animation frames, deterministic pickups, shortcuts, collisions, shields, and counterplay power-ups.
- CRITICAL art gate: replaced generic token presentation with four authored original racer silhouettes and idle, run, and trick frames with readable labels and FX.
- MAJOR fast taps: added a bounded pointer-down edge queue so a down/up between simulation frames is still consumed.
- MAJOR onboarding: added the local lobby, visible controls, join prompts, ready state, and first-turn coaching.
- MAJOR pacing: added rank-gap catch-up steps, fixed pickup bands, respawn timing, trick windows, and power-up counterplay.
- MAJOR duplicate gate rewards: removed the lap reward accumulator and kept the gate reward path as the single sticker-draw path.
- MAJOR board identity: added Harbor, Lantern, Spire, Crown, Endless, and Row route layouts plus authored shortcuts, hazards, and pickup bands.
- MAJOR Endless rendering: replaced the fixed tile cap with an on-demand display pool and generated pickup and shortcut bands for expanded rows.
- MAJOR save validation: added nested medal range checks, boolean sticker checks, nonnegative endless scores, and the four-album upper bound.
- MAJOR status UI: every racer card now shows score, race position, lap, trick meter, power-up state, coins, shields, and build state.
- MAJOR motion and FX: wired press pulses and bounded trick, pickup, collision, shortcut, lap, and finish FX.
- MINOR difficulty and dead state: AI shield chance is consumed by hazard defense, and unused score fields were removed.
- MINOR fleet metadata: aligned the source identity and service-worker cache to F3 and bumped the service-worker version.

Rejected: none.

Verification: `node --check game.js`, `node --check sw.js`, 21 precache entries present, title-owned payload 120283 bytes, largest title-owned file 97328 bytes, and audio files are MP3 only. No browser runtime was available for a live 4x-throttle median capture.

## Retina pass 2026-08-16

- Audit profile: CSS viewport 390x844 at DPR 3. Measured pre-pass backing-store ratio: 1.00x. FIT scale math after the pass measures 1170x2532 against the 390x844 CSS canvas, a 3.00x ratio.
- Recipe: `GGKit.hiDpi.factor(390, 844)`, dense FIT scale dimensions, `GGKit.renderDefaults`, and `this.cameras.main.setZoom(f)` in PlayScene. All Phaser text created by the scene is assigned the same resolution factor.
- Factor cap: none. The factor is the GGKit native value, capped only by GGKit's normal maximum of 3.
- Could not complete live headless canvas readback or a gameplay screenshot because no browser backend was available in this environment. `node --check` passed.


## Blank frame repair

Symptom: at CSS 390x844 / deviceScaleFactor 3 the title booted clean, the render loop
advanced, the backing store measured 3x, and the frame was blank.

### Root cause

The retina conversion raised the backing store to design x factor and applied
`cameras.main.setZoom(factor)`, but a zoomed Phaser camera transforms about its
ORIGIN, which defaults to the centre of the viewport. With scroll 0 a design-space
point x therefore lands at `zoom*x - (width/2)*(zoom-1)`, i.e. the whole design box
sits one and a bit screens to the left of and above the viewport. The loop runs, the
scene draws, nothing is on screen, and there is no error anywhere.

This title is repaired with `cameras.main.setOrigin(0, 0)` alongside the zoom rather
than the fleet's `centerOn(DESIGN_W/2, DESIGN_H/2)`. Both put the design box back on
screen, but origin (0,0) additionally leaves scroll 0 meaning "design origin", so any
absolute `setScroll()` the title already performs (screen shake, world scrolling) and
any `setScrollFactor(0)` HUD stay correct in design pixels with no compensation. See
the per-title cause below for why that mattered here.

- The factor is named `HIDPI_FACTOR`, not `RETINA_FACTOR`, so the scripted pairing
  did not match. One `PlayScene` and one `setZoom` call.
- Repair: `setOrigin(0, 0)` next to the zoom.

### Measured, by me, on a real gameplay frame

Release gate run serially (concurrency 1) against a local static server:
`node release_gate.mjs http://localhost:<port> 1 meridian-row`, headless Chrome,
390x844 at deviceScaleFactor 3, best of four post-interaction frames.

| | distinct colours (8-bit) | flattest colour share | backing/CSS ratio | gate |
|---|---|---|---|---|
| before | 1 | 100% | 3x | HOLD (art) |
| after | 16415 | 27.8% | 3x | READY (all checks pass) |

`node --check` clean on every file touched. No gameplay, balance, content or art
direction was changed.
