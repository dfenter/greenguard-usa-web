Controls: hold anywhere on the field to rise from cover and fire, release to duck. Drag while holding to aim; recoil walks a fixed pattern, so pull back down against it. Tap when the shrinking ring reaches the green marker for a perfect reload. Tap a squad portrait to fire that unit's burst when its gauge is full, or to put that unit on point when it is not.
Keyboard: space or W holds fire, arrows aim, R reloads and takes the perfect cue, 1 to 5 use squad slots, Esc pauses, Enter deploys and skips the stage card.
Loop: hold the cover line through each wave. Thirty campaign stages across five chapters with elite and boss encounters, a twenty floor tower with stacking modifiers, and a daily seeded simulation run.
Progress, credits, cores, unit levels, gear tiers, squad selection, stage stars and best scores persist locally; no network, currency, ads, or energy.

## AAA rebuild

Rebuilt from the prototype into a Phaser 3 title on GGKit. GGKit is the sole
implementation of pause and resume, the rotate overlay, visibility pause,
pointer identity, guarded saves, audio buses, the loading screen, settings and
the juice budget.

### Implemented

**Mechanics.** Hold to rise, release to duck, with separate rise and duck
ramps so the transition is felt. Aim is a reticle that eases to the finger over
the first moments of a hold and then tracks it one to one. Recoil walks a fixed
per weapon pattern (`RECOIL_PATTERNS`) plus a small random component, so the
climb is learnable rather than noise, and it decays three times faster off the
trigger than on it. Weak-point cores are tested before the body at a slightly
generous radius and pay a per weapon crit multiplier with their own particle
burst, hit-stop, shake and sound. Ducking mitigates 72 percent of incoming
damage and starts repairing cover after 0.75s, which is the whole tension: you
cannot shoot and heal at the same time. Reloads run a shrinking ring against a
fixed window marker; hitting it finishes instantly and buffs the next twelve
shots, missing it costs 0.22s. Every enemy telegraphs with a closing ring plus
a chevron on the parapet at its screen column that reddens as impact nears, so
the player always knows which enemy is about to break cover. Burst cut-ins are
a corner card, never a takeover, and cannot eat input because the game takes no
canvas input at all.

**Loop.** Thirty authored campaign stages in five chapters (elite at stage 3,
boss at stage 6 of each), a twenty floor tower with a modifier per floor and
boss floors at 10 and 20, and a date-seeded daily simulation with two stacked
modifiers. Eight squad members with eight distinct weapon classes and eight
distinct burst skills, unlocked at campaign stages 0, 0, 0, 4, 8, 13, 19 and
25. Two earned progression tracks, level 1 to 20 on credits and gear Field to
Mk V on credits plus cores. No gacha, no currency purchase, no energy. All of
it persists through GGKit's guarded save behind a validator that range checks
every number and checks every persisted id against the live registry, plus a
normalise pass that repairs the deployed team.

**World.** Five authored chapter identities, each with its own sky ramp,
silhouette family, structure language, signature light treatment, ambient
weather system and enemy tint: Ruined Overpass (low sun rim, ash), Tidewall
Harbor (overcast bounce, rain), Snowline Base (flat snow key, snowfall), Hive
Interior (bioluminescent pulse, spores) and Aegis Core (hard gold key, embers).
Backdrops are three parallax layers over a composited sky, with the mid
structures standing on the ground plane the enemy line walks down.

**Presentation.** Every pixel is generated procedurally in `al_art.js` and
baked into canvas textures during the loading screen: a packed atlas with 40
operator poses, 24 portraits and enemy frames, 10 boss frames, HUD parts,
icons and particle sprites, plus per chapter sky, glow, far, mid, ground and
cover-band textures and the logotype. Six pooled particle emitters (impact
spark, crit flare, debris, smoke, muzzle smoke, shell eject) plus a seventh
ambient weather emitter per chapter. Screen shake and hit-stop through the
GGKit juice budget with the accessibility toggle honoured, and reduced-motion
gating on banner overshoot, cut-in slide, shake and screen flash.

### Content tables

| Chapter | Stages | Identity | Light | Weather | Boss |
|---|---|---|---|---|---|
| 1 Ruined Overpass | 1-1 to 1-6 | collapsed ring road at dusk | low sun rim | ash | Overpass Titan |
| 2 Tidewall Harbor | 2-1 to 2-6 | container yard in cold rain | overcast bounce | rain | Harbor Dredge |
| 3 Snowline Base | 3-1 to 3-6 | research domes on a white ridge | flat snow key | snow | Glacier Maw |
| 4 Hive Interior | 4-1 to 4-6 | chitin arches and living light | bioluminescent pulse | spores | Hive Queen |
| 5 Aegis Core | 5-1 to 5-6 | the reactor ring | hard gold key | embers | Aegis Sentinel |

| Squad | Weapon | Role | Burst | Unlock |
|---|---|---|---|---|
| Venn | Assault | breaker | Overwatch Volley, doubled fire rate and pinned recoil | start |
| Ossa | Suppress | bulwark | Bulwark Screen, cover damage cut 80 percent | start |
| Kite | Railgun | breaker | Pierce Mark, rail lance with auto crits | start |
| Rook | Shotgun | bulwark | Shatter Wall, stagger and push the front rank | stage 4 |
| Hush | Subgun | medic | Field Suture, repair plus a regen field | stage 8 |
| Nova | Rocket | breaker | Skyfall Salvo, five rockets on the densest cluster | stage 13 |
| Wren | Marksman | medic | Target Sync, cores exposed and enlarged | stage 19 |
| Idris | Grenade | bulwark | Aegis Anchor, advance frozen and fire reflected | stage 25 |

Enemy families: Crawler, Lancer, Shielder (core only reachable while it fires),
Spitter (arcing fire), Warden (elite, two cores), Sapper (charger). Tower
modifiers: Brittle Cover, Swift Advance, Plated, Dry Mags, Surge, Blackout,
Dense Ranks.

Content length: 30 campaign stages at roughly 45 to 90 seconds each, 20 tower
floors, and a daily run, comfortably past the 20 minute floor before any
repeat play for gear and levels.

### Audio inventory

Three music tracks through the GGKit music bus with crossfade:
`music_command` (title and command screens), `music_field` (normal stages),
`music_siege` (elite and boss stages). Eighteen distinct effects through the
sfx bus: shot, heavy shot, hit, crit, kill, boss kill, reload, perfect reload,
burst, hurt, shield, alarm, ui, confirm, unlock, stage clear, fail, advance.
All mp3, mono, no ogg anywhere. Effects are decoded during the loading screen;
music is fetched and decoded in the background once the title screen is up, so
no decode ever lands mid-fight.

### UI_LAW compliance

One persistent HUD line at the top: pause, cover integrity meter, magazine,
wave pips, stage label and score, icons and meters rather than words, and the
stage label is dropped below 720px wide. In-play events are single corner chips
at most 30px tall with a one second hold and a queue that never stacks. The 60
percent centre banner appears only at run boundaries (stage card, line held,
line broken) and is skippable with a tap. The tutorial is one 34px strip at the
top edge, one line at a time, fading to 22 percent after three seconds, six
steps gated on the player actually performing each action. Squad portraits are
the only bottom-edge controls, centred so both bottom corners stay free for
thumbs, at least 44px with an extra 6px of hit slop. All readable text is 13px
or larger, with everything the player must read at 14px or more. Safe-area
insets are read at runtime and applied by the HUD; the canvas keeps the whole
viewport.

### Known bug classes deliberately avoided

Phaser input is switched off entirely in the game config and every pointer and
key goes through GGKit plus a window-level tap queue installed after
`GGKit.create`, so no canvas-level handler can fire first and have its claim
overwritten. No gameplay decision is made inside an event handler: taps are
queued and consumed once inside the fixed step. The harness state object holds
preallocated records and never aliases a live pool. Every keyed lookup against
variant content (`ENEMIES`, `BOSSES`, `CHAPTERS`, `MOD_BY_KEY`, `SQUAD_BY_ID`,
`GEAR_TIERS`) has a guarded fallback. Force switches are read both by the boot
fallback and by every live scene. Scene literals are promoted to real Scene
subclasses so custom methods survive. `parent: document.body` is set, not null.
Hit-stop freezes the frame whole and drops the accumulated time rather than
replaying it, so no clock can run ahead of the stepped sim. `setText` and
`setColor` share the same change guard. Nothing in the per-frame path uses
Phaser Graphics or `Graphics.arc`: all board and HUD chrome is baked into
canvas textures at load. `Texture.add` is called with source index 0. Pools
start small and grow one record at a time so scene start never builds hundreds
of objects in a single frame. The sw.js precache lists only files that exist,
asserted at generation time.

### Verification hook

`window.__al.state` exposes mode, phase, chapter, stage, floor, wave, waves,
enemies alive, boss hp, score, cover integrity, magazine, reload state, popped
state, lead unit and weapon, per-slot burst gauges, campaign and tower
progress, credits, cores and tutorial step. Force switches: `forceMode`
(title, command, campaign, tower, daily), `forceStage`, `forceFloor`,
`forceSkipIntro`, `forceSkipTutorial`, `forceClear`, `forceFail`,
`forceUnlockAll`, `forceGrant`.

### Deferred

Fill-rate work was done blind on feel: the build box was running a dozen other
headless Chrome lanes throughout this session, so no frame trace taken here is
meaningful. The structural fixes the trace would have asked for were applied
anyway on the documented house rules: the sky gradient, the signature light
wash and the far silhouette are composited once per layout into a single
opaque half-resolution quad instead of three full-screen layers, one of them
additive; the damage vignette and the screen flash are switched off rather than
held at alpha zero, because a full-screen quad at zero alpha still costs a
full-screen blend. A real 4x-throttle trace on an uncontended box is still
owed.

Cut-ins are a corner card rather than the full-screen character animation the
genre usually uses, because a takeover cannot be reconciled with the 10 percent
transient budget during live play.

## Retina pass 2026-08-16

- Before ratio: 1.00x source baseline at DPR 3. After ratio: 3.00x configured
  through `GGKit.hiDpi.resize(game, cssW, cssH)`; a live canvas ratio could
  not be measured because Chrome aborted in this sandbox and the private HTTP
  bind was denied.
- Recipe: applied Phaser Scale.RESIZE hi-DPI sizing at boot, resize,
  orientation-change, and visibility events. Applied `GGKit.renderDefaults`
  and `resolution: GGKit.hiDpi.dpr()` to Phaser text.
- Factor cap: none beyond the GGKit maximum of 3. No title-specific cap was
  needed.
- Could not complete the live DPR 3 gameplay screenshot or layout check.
  Existing atlas and canvas bakes were left at their logical sizes because a
  frame-unit migration to `GGKit.hiDpi.canvas(...)` could not be live-verified.

## Retina pass 2

- Measured canvas ratio at DPR 3: unavailable. `retina_audit.mjs` could not start because its private port was rejected with `listen EPERM`; the in-app browser was unavailable too. Static configuration expects 3.00x through `config.ggDpr` at DPR 3.
- Converted the parented `Scale.RESIZE` setup to `Scale.NONE` through `GGKit.hiDpi.phaser()`. Title, command, play, and boot camera views are centered at the factor zoom, while scene layout dimensions remain CSS-sized. Existing render defaults, text resolution, and art bakes were retained.
- Gameplay screenshot, render-loop probe, and fire/reload input resolution could not be live-verified because no browser or private local server was available.
