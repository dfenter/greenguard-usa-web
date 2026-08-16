# Galecrests

Controls: tap the training cards, the plan cards and the round call button.
Keys 1 to 5 pick training, 6 rests, B bonds, Space or Enter confirms, R
restarts the current race or turn, Esc or S opens settings.
Goal: raise a crest-bird through a twelve turn season, win the eight scheduled
races, and take the Galecrest Cup.
Loop: each turn you pick training, deep rest or bonding with the exact stat
gain, fatigue cost and strain risk shown before you commit. On race turns you
choose a positioning plan, then time three tactical calls (hold, surge, kick)
against a stamina budget while the pack jostles for the rail.
Retiring a crest at the end of a season passes stat bonuses and a trait to the
next one. Crests, leagues, course bests and records persist. Portrait only; the
rotate overlay pauses the race and every timer.

## AAA rebuild

Implemented: full Phaser 3 portrait rebuild with GGKit as the only lifecycle,
input identity, guarded save, audio bus, loading screen, settings and juice
layer. The engine loads from absolute `/play/_shared/` paths and `index.html`
carries `<base href="/play/galecrests/">`.

Raising sim: five trainable stats (speed, stamina, power, guts, wit), a five
step mood ladder, a 0 to 100 fatigue track, steady and push training options
with the exact gain, resulting fatigue and strain percentage printed on the
card before commit, deep rest and bonding turns, and a strain outcome that
costs most of the gain instead of silently failing.

Race: a stepped 60 Hz simulation of six runners with per bird stamina budgets,
economy pace, surface drain, lane changes, real pack blocking, and a wall state
when the tank empties. The player spends one positioning plan (lead, press,
stalk, close) and three timed calls; each call has a visible window band on the
timeline and a widened window driven by the wit stat and the Wide Eye trait.
Clean calls give the full effect, early or late calls give sixty percent and
cost extra stamina, and a window that closes untouched expires with a chip so
the next call is never blocked behind it. Post race analysis reads the telemetry back to the player:
where the tank ran dry, how the kick landed, seconds spent boxed in, ground
drain, and the winner's closing quarter against yours.

Meta: three leagues, a hall of records with per course bests, six crests with
authored aptitudes unlocked by career results, and Legacy inheritance with an
explicit leaves and stays and gains summary before the irreversible step. No
currency, no gacha, no timers. Every persisted field is range validated on load
and the current season is snapshotted each turn so an interrupted run resumes
from the title screen.

Presentation: authored per venue skies, skylines, crowd bands and track
surfaces baked to textures at load; six animation states for every runner
(idle, two run frames, surge, tired, win); six particle systems (surface kick,
weather, feather bursts, confetti, kick sparks, training sparkles); GGKit shake
and hitstop on clean calls and finishes; reduced motion gating throughout.
Transient UI follows the noise law: one transient at a time, corner chips for
in play events, centre banners only at the countdown and the finish, a thin
fading coach strip, forty four pixel minimum touch targets, and a race HUD that
occupies under ten percent of the screen.

### Content

| League | Rivals | Unlock |
|---|---|---|
| Fledge | rating 34, +3.0 per race | open |
| Gale | rating 48, +3.8 per race | win the Fledge cup |
| Tempest | rating 62, +4.6 per race | win the Gale cup |

| Turn | Race | Course | Ground | Distance |
|---:|---|---|---|---:|
| 2 | Verdant Opener | Verdant Mile | grass x1.00 | 1600m |
| 3 | Emberflat Trial | Emberflat Sprint | dirt x1.20 | 1000m |
| 5 | Harborline Stakes | Harborline Turn | grass x1.04 | 1800m |
| 6 | Duneglass Dash | Duneglass Dash | dirt x1.22 | 1200m |
| 8 | Mistlow Endurance | Mistlow Long | rain soaked x1.32 | 2400m |
| 9 | Verdant Classic | Verdant Mile | grass x1.00 | 1600m |
| 11 | Mistlow Night Long | Mistlow Long | rain soaked x1.32 | 2400m |
| 12 | Galecrest Cup | Galecrest Cup | championship turf x1.10 | 2000m |

| Crest | Style | Ground | Trait | Unlock |
|---|---|---|---|---|
| Emberquill | Lead | dirt sprint | Gate Fire | open |
| Marshpiper | Stalk | wet long | Rain Lung | open |
| Sunkeel | Press | grass mile | Even Keel | open |
| Thornwake | Close | dirt mile | Late Fire | win any race |
| Pondprism | Stalk | wet mile, widest calls | Wide Eye | finish a season |
| Galecrown | Press | championship turf | Crown Air | win the Galecrest Cup |

Training: Wind Sprints (speed), Marsh Circuits (stamina), Dune Climbs (power),
Storm Drills (guts), Stillwater (wit), plus Deep Rest and Bonding.
Plans: Lead, Press, Stalk, Close. Calls: Hold, Surge, Kick.

Session length: a season is twelve decision turns plus eight races of roughly
seventeen to forty seconds, about seven to nine minutes. Three leagues, six
crests and the legacy chain carry the title well past twenty minutes.

### Audio

Three music beds (`theme`, `race`, `cup`) and fifteen SFX (`tap`, `train`,
`strain`, `rest`, `bond`, `gate`, `call_good`, `call_late`, `surge`, `block`,
`wall`, `win`, `lose`, `unlock`, `legacy`), all original synthesis, all MP3,
all routed through the GGKit music and sfx buses. Music is lazy: nothing is
fetched or started until the first pointer or key gesture.

### Verification

`node --check` on `game.js` and `sw.js`. Headless Chrome at 390x844 dpr 2:
boot renders the title screen with zero console errors and zero failed
requests; forced probes through `window.__gc.forceMode` cover title, crest,
season, train, prep, race, result, seasonend, legacy and records; a scripted
tap-only run plays title to crest to training to race to result to season end
to legacy and the save round trips through GGKit validation.

### Deferred and known limitations

- Frame trace at 4x CPU throttle: median 16.7 ms (target 17.5 ms), but the
  headless harness reports a high long-frame count for every title measured on
  this machine, including the shipped controls (meridian-row 94/580,
  sporeling-saga 128/580, galecrests title 90/580, galecrests mid-race
  143/570). The long-frame figure looks environmental rather than title
  specific; the deployed-URL gate run is the authority.
- Rival crests use the shared runner rig with per rival colour rather than six
  bespoke silhouettes.
- The season snapshot resumes at turn granularity, so a race abandoned midway
  restarts that race rather than resuming mid run.

## Retina pass 2026-08-16

- Measured before/after canvas-to-CSS ratio: no per-title live measurement was available. The fleet baseline measured 1.00x for 62 titles and 1.10x to 2.46x for the remainder. The after audit was blocked when the prescribed runner could not bind its private port (`listen EPERM`), and no browser backend was available. Static target at DPR3 is 3.00x.
- Recipe: `GGKit.hiDpi.factor(390, 844)`, dense FIT scale dimensions, `GGKit.renderDefaults`, camera zoom in the scene create method, and matching Text resolution.
- Factor cap: none beyond GGKit's default [1, 3] clamp.
- Could not capture the required gameplay screenshot, backing-store ratio, or gameplay color metrics in this sandbox. `node --check game.js` passes.
