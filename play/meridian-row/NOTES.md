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
