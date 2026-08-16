# Carnival Reels

Controls: tap SPIN (or press space) to play a spin, and tap again to slam the reels home. Use minus and plus (or the left and right arrows) to change your bet. ODDS opens the posted maths and session stats for the machine you are on, MAP opens the Carnival Tour, RUSH opens the challenge ladder, and the double arrow toggles fast spin. Keys 1 to 5 jump between unlocked machines, F toggles fast spin, I, T, R and C open odds, tour, rush and prizes, P opens settings, M mutes, and escape backs out.

Goal: work the Carnival Tour. Play a machine to fill its level bar, reach level 3 to open the next machine, and collect all six prize tickets on every machine. Work the Bonus Rush ladder for coin payouts, take the daily wheel spin, and win coins by hand in Ring Toss and High Striker.

Every machine posts its real return, hit frequency, volatility and full outcome table before you bet. Coins are play money: nothing is for sale, the free top up refills you when you fall below 250, and your balance is always recoverable.

---

## Dev notes

### Preserved prototype behaviour (regression checks)

The 2026-08-05 prototype is the design document. These carried over verbatim:

- **Orchard Classic**: 38 stop strip built from weights `CH 11, LE 8, PL 7, BE 5, ST 4, SE 3`, triple pay table `SE 420, ST 120, BE 50, PL 18, LE 12, CH 4`, two cherries 0.5x, one cherry 0.2x. Exactly enumerated over all 54,872 outcomes.
- **Ghost Train**: five cells, count anywhere pays for Ghost, Skull, Key and Lantern, coin value table `2/3/5/8/15/38/120` on weights `34/24/16/12/8/4/2`, per empty cell lock chance 0.11, three respins that reset on any new lock, 40x full vault bonus.
- **Gem Cascade**: 5x5 grid, gem weights `24/21/18/15/12/10`, base pays `0.8/1.1/1.6/2.4/3.8/6.5`, cluster size factor ladder (5 -> 1x up to 15+ -> 150x), tumble multiplier ladder `1/2/3/5/8`, 40 tumble safety cap.
- **The 2000 slot wheel**: segment table and weights unchanged, grand 500x at exactly 1 in 2000. It is now the Grand Carousel bonus wheel and is still enumerated exactly.
- Bet ladder `1, 2, 5, 10, 20, 50, 100`, starting bank 1,000, free recovery forever, no fail state, no purchases anywhere.
- Live transparency: exact or simulated return, hit frequency, volatility, and the full outcome table with true frequencies, plus your own observed return, peak and low for the session and for the machine lifetime.
- The ten oddity badge ids: `triple_crown, ghost_train, full_vault, deep_chain, mega_cluster, grand_ring, high_road, big_hit, ladder_v, century`.
- Keyboard parity with touch, persistent best peak and lifetime per machine results.

### Content inventory

| Machine | Type | Grid | Features | Posted return | Hit frequency |
|---|---|---|---|---|---|
| Orchard Classic | 3 reel classic | 3x3, one line | none | 95.90% exact | 66.1% |
| Ghost Train | hold and spin | 5 cells | 3+ coins wake a 3 respin lock round, full vault | ~95.5% sim | ~40% |
| Gem Cascade | cascading clusters | 5x5 | tumble multiplier ladder | ~95.5% sim | ~25.6% |
| Midway Ways | 243 ways | 5x3 | ringmaster wilds on reels 2 to 4, 6 free spins on a 1/1/2/2/3/5 trail | ~95.2% sim | ~62.9% |
| Grand Carousel | wheel and pick, finale | 3x3, five lines | Grand Wheel (16x stake, 500x grand at 1 in 2000), pick 3 of 9 prize booths, 6 doubled free spins | ~94.9% sim | ~39.5% |

Simulated machines are monte carlo sampled at boot (40,000 spins each) and the paytable posts the 95% sampling interval alongside the figure, rather than a false precision number.

Progression:

- **Carnival Tour**: 5 machines unlocked in sequence, level 3 on the current machine opens the next.
- **Level tracks**: 12 levels per machine on cumulative spins `0, 8, 20, 36, 58, 86, 120, 162, 212, 272, 342, 424`, each paying `250 ... 5,000` coins. 60 levels and 2,120 spins to max the parlour.
- **Prize sets**: 6 named prize tickets per machine awarded at even levels, 30 total, each completed set pays 6,000 coins.
- **Bonus Rush**: 12 sequential rungs from "spin 12 times" to "win 60x on one spin", paying 400 up to 6,000 coins.
- **Badges**: 16 (the prototype ten plus `free_run, midway_king, pick_bonus, carousel_wheel, tour_complete, collector`).
- **Skill games**: Ring Toss and High Striker, 3 throws each, up to 2,700 and 3,600 coins per run, speeds ramping per throw.
- **Daily wheel**: 8 prize tiers from 250 to 10,000 coins on a 4 hour cooldown, odds posted before the spin.
- **Free top up**: 300 coins every 90 seconds while under 250, capped at 1,500, plus the always available balance recovery.

Roughly 20 minutes to reach the finale machine and several hours to exhaust the level tracks, prize sets and rush ladder.

### Audio inventory

All original, generated procedurally offline and shipped as mono mp3 at 96 kbps.

- Music (4 loops, lazy loaded after the first interaction): `mus_menu` (night music box), `mus_parlour` (carnival organ waltz, Orchard and Cascade), `mus_feature` (driving loop, Ghost Train, Midway and every free spin or hold round), `mus_finale` (bell led carousel theme, Grand Carousel, wheel and pick bonuses).
- SFX (16): `tap, spin_start, reel_stop, near_miss, win_small, win_mid, win_big, coin_lock, cascade_pop, wheel_tick, wheel_stop, level_up, collect, denied, toss, fanfare`. All routed through the GGKit sfx bus with touch unlock and persistent mute.

### Art

Every pixel is generated into canvas textures during the loading screen (`art.js`): 5 authored backdrops, 5 cabinets with marquees and bulb strings, 31 symbols across the five symbol sets, the 40 wedge wheel face (hand tessellated, never `Graphics.arc`), Pip the barker in five parts, six particle sprites, and the whole UI kit. Nothing is drawn with Phaser Graphics on the hot path; the only Graphics objects in the scene are the two static geometry masks.

Six particle systems: confetti, coin fountain, sparks, expanding rings, reel dust puffs, and the drifting ambient bokeh in the backdrop.

Pip the barker has five animation states: idle sway, anticipation jitter while the reels run, cheer on a big win, nod on an ordinary win, shrug on a loss.

### Feel

- Weighted reel stops with a real ease out back settle and a per reel dust puff.
- Anticipation is honest: a reel only slows and glows when the preceding reels genuinely leave a trigger live (two matching high symbols on Orchard, two coins on Ghost Train, two scatters or trigger symbols on Midway and the Carousel). Losses are never dressed up as near wins.
- Win tiers escalate: under 2x is a chip and a chirp, 2x to 10x adds a coin fountain, 10x and up earns a centre banner, 25x adds hitstop and a heavier shake, 75x plays the full fanfare. All shake and hitstop go through the GGKit juice budget and the accessibility toggle.
- Bonus transitions are a 400 ms curtain wipe with the cabinet still visible behind, and the feature is interactive on the first frame after it.
- Fast spin halves every duration and cuts the reel stagger; a second tap on SPIN slams the reels home.
- Reduced motion: if the device asks for reduced motion and the player has not chosen yet, the GGKit juice toggle starts off, which drops shake, hitstop, banner overshoot and two thirds of the particle budget. The settings row owns the preference after that.
- Nothing is drawn with Phaser Graphics on the hot path. All chrome, symbols and the wheel face are baked textures; the only Graphics objects in the scene are the two static geometry masks, which are rewritten on resize only.

### Verification hook

`window.__cr.state` exposes `mode, stage, machine, progress, score, health, coins, bet, spinning, feature, unlocked, rush, ready`.
`window.__cr.forceMode(m)` accepts `title, play, tour, paytable, rush, collection, daily, skill`.
`window.__cr.forceStage(i)` selects and unlocks machine 0 to 4 even mid spin.
`window.__cr.spin()` requests a spin.
`window.__cr.forceFeature(kind)` is test only: it re-rolls the next spin until it lands `hold`, `free`, `wheel`, `pick` or `big` (25x or more) so a harness can drive each bonus. Nothing in the game calls it and the shipped odds are untouched.
Boot switches `?mode=play&stage=3` are read from the boot fallback and honoured by the live scene.

### Known limitations

- The prototype's per spin bank curve chart is not redrawn as a chart. The information it carried (peak, low, net, realised return) is preserved as numbers on the odds sheet, because a live line chart is a Graphics heavy widget and the screen budget belongs to the play area.
- Simulated machines carry monte carlo sampling error of roughly plus or minus 0.5 to 1.5 points at the shipped sample size; the interval is posted rather than hidden.
- Wins are rounded up to a whole coin, so very small multipliers pay slightly better than the raw table at the lowest bet.
- Local frame traces at 390x844 under 4x CPU throttle hold a 16.7 ms median on every machine, but the over-33 ms spike count swings between roughly 20 and 170 out of 600 run to run on a contended box, and a shipped reference title measured 64 out of 600 sitting idle in the same rig. The spike figure needs an uncontended machine and the deployed URL to mean anything; the authoritative capture belongs to the gate harness.

---

## AAA rebuild

Implemented: full rebuild on Phaser 3 from `/play/_shared` with GGKit as the only lifecycle, input, save, audio and juice layer. Five machines (three of them the prototype's, plus the 2000 slot wheel folded into a new finale machine, plus a new 243 ways machine), the Carnival Tour progression, per machine level tracks and prize sets, the Bonus Rush ladder, a daily wheel, two skill mini games, a free top up timer, four music loops, sixteen SFX, six particle systems, a five state mascot, an interactive first run coach strip, and a complete odds and session stats sheet on every machine.

Content tables: see the machine, progression and audio tables above.

Deferred: the bank curve chart (folded into session stat rows), and per machine leaderboards (no backend, and nothing here is competitive). Gate 6 (deployed URL run) belongs to the orchestrator; this build was verified booting and playing locally at 390x844 with zero console errors and zero failed requests.

## Retina pass 2026-08-16

- Before ratio: 1.00x source baseline at DPR 3. After ratio: 3.00x configured
  through `GGKit.hiDpi.resize(game, cssW, cssH)`; a live canvas ratio could
  not be measured because Chrome aborted in this sandbox and the private HTTP
  bind was denied.
- Recipe: applied Phaser Scale.RESIZE hi-DPI sizing at boot, resize,
  orientation-change, and visibility events. Applied `GGKit.renderDefaults`
  and `resolution: GGKit.hiDpi.dpr()` to the wheel, HUD, and card text.
- Factor cap: none beyond the GGKit maximum of 3. No title-specific cap was
  needed.
- Could not complete the live DPR 3 gameplay screenshot or layout check.
  Existing authored canvas bakes were left at their logical sizes because a
  frame-unit migration to `GGKit.hiDpi.canvas(...)` could not be live-verified.
