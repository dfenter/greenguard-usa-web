# Runeline Depths

Hold an orb and drag it. Every orb you pass swaps places with it, and the ring
around your finger is how long you have. Let go and the whole board resolves at
once: three or more in a row clears, each clear is one combo, and combos
multiply the damage your five runeguards deal.

Rose heart orbs heal the party instead of attacking. Your leader sits in slot
one and its skill shapes the whole run. Tap a runeguard portrait to read its
active skill, tap again to spend it.

Twenty four depths, five or six rooms each, always ending with a boss. There is
no retreat: clear the depth or fall. If the party falls you can retry that room
instantly with a full party, or abandon the run.

Keyboard: arrows or WASD move the selector, Space or Enter picks up and drops
an orb, 1 to 5 spend runeguard skills, P or Escape pauses.

---

## Dev notes

### Preserved prototype behaviours

The 2026-08-05 prototype is the design document. These are carried over
unchanged and are regression checkable:

- Six by five board, orbs move by dragging one orb through neighbours and
  displacing what it passes, resolving on release.
- Six second move timer (`TUNE.moveTime = 6.0`), path capped at 30 steps
  (`TUNE.maxPath`), cascade chain capped at 5 (`TUNE.maxCascade`).
- Damage maths: on-element members strike at 1.22x, off-element at 0.58x,
  combo multiplier `1 + (combo - 1) * 0.16`.
- Enemy curve: `hp = 92 + 31 * level`, `atk = 10 + 2 * level`, incoming hit
  scaled by `1 + level * 0.035` and split across living party members.
- Leader skills carried over by name and value: Warm start, Clear current,
  Soft bark, Quick spark, Singe logic, Rain ledger, Deep hold, Static count,
  Many sight, Coalheart, Low tide cut, Green echo, Pressure feast, Prism rule,
  Bright rake, Quiet math.
- The sixteen runeguards keep their prototype names, elements, base HP and
  base attack.
- The fifteen prototype floor names and fifteen guardian names all survive as
  dungeon names and boss names inside the twenty four dungeon ladder.
- Team wipe restarts the current floor rather than the run; progress and roster
  persist locally.
- Keyboard fallback is arrows plus Space, as in the prototype.

Two deliberate changes from the prototype, both required by the brief: the
party is five runeguards rather than four, and heart orbs exist as a sixth
family that heals instead of attacking.

### Content inventory

| Layer | Count |
|---|---|
| Depths (authored identities) | 4: Moss Vault, Magma Seam, Drowned Library, The Runeline Core |
| Dungeons | 24, six per depth, 5 or 6 rooms each |
| Authored encounters | 147 rooms including 24 boss rooms |
| Enemy archetypes | 32, eight per depth family |
| Bosses | 24, each with two to five authored mechanics |
| Boss mechanics | preemptive, bind, damage shield with a combo break threshold, armour, mend, enrage, time lock |
| Runeguards | 16 (4 starters always owned, 12 recruited from boss drops) |
| Evolutions | 12, one per recruitable runeguard, bought with runes |
| Active skills | 16, one per runeguard, turn cooldowns |
| Daily Descent | six rooms from a date seeded pool, one of 7 modifiers, resets daily |
| Orb families | 6, each triple coded by hue, silhouette and centre glyph |

Time to exhaust: 147 authored rooms at roughly five turns each is about 95
minutes of first-clear play before the evolution grind or any Descent, well
past the twenty minute bar.

Progression is persisted through the GGKit guarded save at schema version 3:
runes, roster, evolutions, party, per dungeon clear counts, tutorial step,
today's Descent result, and lifetime stats. Every id is validated against the
content registries on load and unknown or unowned entries are dropped, so a
hand edited or stale save degrades to a valid profile rather than crashing.

### Audio inventory

Twenty files, all mono MP3, all original procedural synthesis. No OGG.

Music (3, lazy loaded after the first interaction): `music_vault` calm depth
loop, `music_deep` deep and boss loop, `music_hall` menu and victory loop.

SFX (17): `ui_click`, `orb_pick`, `orb_move`, `invalid`, `match`, `cascade`
(pitched up per cascade step), `combo`, `heal`, `strike`, `enemy_hit`, `bind`,
`shield_break`, `room_clear`, `boss_down`, `recruit`, `evolve`, `fail`.

Everything routes through the GGKit audio buses, unlocks on first gesture, and
respects the persistent mute and volume settings.

### Art and effects

All art is procedural: `js/art.js` bakes orbs, bind chains, board frames, sky
strips, vignette, ambient motes, particles, UI cards, buttons, icons, depth
badges, sixteen runeguard portraits with evolved variants, and fifty six enemy
portraits into canvas textures. Enemy portraits are baked once on first sight
and cached. Nothing is generated per frame.

Five pooled particle systems, all preallocated in `js/fx.js`: clear fragments,
line and cascade streaks, impact sparks, reward celebration, and the orb trail
behind the held orb. A pooled bank of ten float texts handles damage and heal
numbers.

Player entity (the orb selector) ships five authored states: Ready (breathing
focus ring on the cursor cell), Lift (raised orb, move timer ring, trail),
Warning (amber clock mark when the timer drops under 1.2s), Resolve (pop and
spring settle through the cascade), and Charged (a runeguard ring turns cyan
when its skill is armed and awaiting the confirming tap).

Board and HUD chrome are baked into textures rather than drawn with Phaser
Graphics, because Graphics replays its whole command list every frame. The only
live Graphics objects are the two hand tessellated rings (move timer, enemy
charge, runeguard cooldown), each drawn with a bounded segment count and a
change guard on both value and colour.

### UI law compliance

One transient at a time through a single notice queue. In-play events use a
right edge corner chip with an icon, at most a one second hold. Centre banners
are reserved for run boundaries: depth start, boss entry, depth cleared, run
end. The coach strip is a single thin line under the HUD row that fades after a
few seconds and shows one instruction at a time. HUD is one compact top line
plus icon chips; meters and rings carry state instead of labels. All touch
targets are at least 44px and the layout reads the safe area insets.

### Known limitations

- The Descent leaderboard is local only: there is no server, so the daily
  result is a personal best for that date.
- Enemy portraits are stylised emblem creatures rather than animated sprites;
  they breathe, lunge and recoil but have no frame animation.
- Evolution is a single step per runeguard. There is no second evolution tier.
- The four starter runeguards cannot evolve, by design, so the evolution track
  is exactly the twelve recruitable runeguards.

---

## AAA rebuild

Rebuilt in place 2026-08-13 from the archived prototype, on Phaser 3 from
`/play/_shared/` with GGKit as the sole lifecycle, input identity, save, audio,
loading, settings and juice implementation.

### Implemented

- **Mechanics.** Move-one-orb displacement with a visible move timer ring that
  follows the finger, a clean single orb trail that fades before the next
  decision, a combo counter chip that ticks up as each cascade beat resolves,
  cascades animated beat by beat from explicit sim snapshots so skyfall reads
  clearly, leader skill surfaced at run start and in the pause panel, active
  skills surfaced by a first tap before a confirming second tap, and instant
  retry of a failed room.
- **Loop.** 24 dungeons over 4 tiers with authored per-room enemy sets and boss
  mechanics (binds, combo-break shields, turn preemptives, armour, mend,
  enrage, time lock), a date seeded daily Descent with seven modifiers, and an
  evolution track for the twelve recruitable runeguards. No stamina, no gacha.
  Drops are posted on the clear screen and validated against the registry on
  every save load.
- **World.** Four authored depth identities, each with its own board frame
  material, cell field, orb rim skin, sky gradient, ambient motif and eight
  enemy archetypes: Moss Vault (slate and verdigris, spores), Magma Seam
  (basalt and brass, embers), Drowned Library (wet stone and teal glass,
  drifting pages), The Runeline Core (obsidian and white gold, rune marks).
- **Presentation.** Five pooled particle systems, shake and hit stop inside the
  GGKit juice budget and behind the accessibility toggle, run boundary banners
  at 60 percent width with an overshoot, three music states and seventeen SFX
  through the GGKit buses.
- **Verification hook.** `window.__rd` exposes `state` (mode, phase, stage,
  room, rooms, progress, combo, health, foeHp, board geometry), `profile`,
  `run`, plus `forceMode(mode, stage)`, `forceStage(n)`, `unlockAll()` and
  `reset()`. `?mode=play&stage=N`, `?mode=descent`, `?mode=map|roster|descent`
  are read from the boot fallback as well as from a live scene.

### Content tables

Depth 1, Moss Vault: Silt Door, Lantern Vein, Fernlock Gate, Murmur Shelf,
Hollow Orchard, Glassroot. Bosses The Pebble Choir, Mire-Needle, Gallowvine,
Old Sparkjaw, Cask of Vines, Cradleback. Drops Cinder Crown, Brine Bloom,
Root Rumbler.

Depth 2, Magma Seam: Copper Wound, Cinder Stair, Blue Ember, Bellows Hollow,
Ash Archive, Cloud Scar. Bosses The Quiet Kiln, Emberlash, Soot Regent,
Cloud-Eater, The Copper Hush, Aster Moth. Drops Thunder Mite, Veil Vireo,
Ash Antler.

Depth 3, Drowned Library: Wickwater, Tidewell, The Slow Stair, Quiet Index,
Night Reservoir, Saltglass Hall. Bosses The Drowned Bell, Marrowtide, The Index
Keeper, Fathom Choir, Nine-Knot, Vesper Maw. Drops Rill Raven, Fern Fang,
Gale Gourmand.

Depth 4, The Runeline Core: The Underbough, Meridian Shelf, Last Switchback,
The Thin Seam, First Line, Runeline Heart. Bosses Root of Noon, Null Meridian,
The Long Glint, The Sundered Line, First Rune, The Depth That Listens. Drops
Opal Owl, Flare Fawn, Moon Marrow.

### Deferred

- No second evolution tier and no runeguard levelling curve: evolution is one
  authored step, so power growth stays legible against the enemy curve.
- No online Descent ranking; the daily result is stored locally only.
- Enemy portraits are procedural emblem creatures, not multi frame sprites.
- The meta scene grammar from the lane bible (a restored room or garden) is
  represented by the depth map and roster rather than a separate diorama
  screen, because the dungeon ladder is this title's meta.

## Retina pass 2026-08-16

- Target 390x844 CSS at DPR 3. Before ratio: 1.00x CSS-sized RESIZE baseline. After target: 3.00x, 1170/390, via `GGKit.hiDpi.resize`. Live canvas read was unavailable because no browser surface or private local listener was available.
- Recipe: `Phaser.Scale.RESIZE`, `GGKit.renderDefaults`, `GGKit.hiDpi.canvas` texture baking, and DPR-matched Phaser text. No factor cap.
- Gameplay screenshot and runtime backing-store measurement remain deferred. No palette change was made because the retina law identifies density, not colour depth, as the defect.

## Retina pass 2

- Measured ratio after the required delayed DPR-3 sample: unavailable. The corrected configuration targets 3.00x, or 1170/390.
- Converted the parented game in `js/main.js` to `GGKit.hiDpi.phaser`, `Phaser.Scale.NONE`, and `cfg.ggDpr`; boot, menu, and play cameras are centered, and menu/play layout use `RD.viewW` and `RD.viewH` derived from the scale dimensions. Removed the old resize and text-resolution paths.
- Could not do: delayed `retina_audit.mjs`, gameplay screenshot, live input/core-mechanic check, or `live_probe.mjs`. The harness could not bind its private port (`listen EPERM`), and no browser surface was available. Node syntax and diff checks passed.
