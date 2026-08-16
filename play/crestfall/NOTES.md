Crestfall boots directly into the Emberwild overworld.
Touch: drag the left stick to move; tap JUMP and ATTACK on the right.
Keyboard: arrows/WASD move, Z/Space jumps, X/Enter attacks, P/Esc opens runes.
Reach the keeps, defeat their guardians, and collect every sigil to win.
Game over and victory screens restart instantly with any action button tap.

## AAA rebuild

### Implemented

- Phaser 3 lifecycle shell with GGKit as the sole runtime owner for input, pause, restart, save storage, PWA registration, and audio buses.
- Arcade2d neon presentation with procedural player, guardian, NPC, pickup, sigil, particle, hit-stop, shake, reduced-motion, and overshoot banner systems.
- Readable combat flow: windup, active, recovery, coyote-time jump forgiveness, buffered jump input, directional block, parry window, weighted knockback, rune costs, cooldown feedback, and guardian telegraphs.
- Safe first-run training strip for move, jump, attack, and rune use.
- Generous hearts, rune-charge drops, sigil fragments, XP, and secret-room caches across the overworld field pockets and keeps.
- Original authored keep treatment and flow for seven keeps, including Verdant Forest, Mire, Tideline Coast, Stonefracture Mountain, Triune Vault, Deepwater Keep, and Night Citadel finale. Every keep has a discoverable secret room and a guardian gate.
- Local procedural M4A cues, manifest, generated icons, and service worker with verified precache paths.
- `window.__cf.state` exposes mode, keep, sigils, and hp. `window.__cf.forceKeep(id)` is available at boot and during the live scene. Save API is exposed as `window.emberwildSave`.

### Keep table

| Keep | Identity | Guardian | Secret cache |
|---|---|---|---|
| 1 | Verdant Forest | Ravenhorse | Heart, charge, fragment |
| 2 | Mire Marsh | Crownback | Heart, charge, fragment |
| 3 | Tideline Coast | Ironwraith | Heart, charge, fragment |
| 4 | Stonefracture Mountain | Stonevex | Heart, charge, fragment |
| 5 | Triune Vault | Ironroot | Heart, charge, fragment |
| 6 | Deepwater Coast | Tidebane | Heart, charge, fragment |
| 7 | Night Citadel finale | Umbrakin | Heart, charge, fragment, XP cache |

### IP scrub confirmation

No legacy IP strings or assets remain in `src/` or `index.html`. The save global is Emberwild-branded and the old scenario comment is removed.

### Determinism regression result

Passed. Seed `424242` reproduced identical player and enemy state across two 120-step runs. The retained RNG, world graph, enemy resolution, and save schema modules remain deterministic.

### Deferred

Live Phaser browser smoke test could not run because the browser connector was unavailable and the sandbox rejected a local HTTP port bind. Headless render smoke, syntax checks, keep coverage, service-worker path checks, and payload checks passed.

## Fix round 1

All listed findings were fixed. No findings were rejected.

### Critical

1. Fixed palace room loops with directional entry spawns and a transition debounce.
2. Fixed touch rune navigation and casting through the shared input edge model.
3. Replaced the three guardian fallbacks with Stonevex, Ironroot, and Tidebane classes and attacks.
4. Added authored procedural environment layers and set dressing for overworld tiles and side-view rooms.
5. Regenerated valid 192 by 192 and 512 by 512 PNG icons with checked dimensions and CRCs.

### Major

1. Added strict save type, range, enum, schema, and consistency validation before mutation.
2. Persisted sigil fragments, reward claims, defeated enemies, tutorial progress, and best score.
3. Added gamepad axes, D-pad, face-button, start, and select mappings through Input.
4. Replaced the HUD-only training claim with an actual side-view training pocket and action checks.
5. Added ordered keep gating with a clear sigil requirement notification.
6. Applied keep difficulty to encounter variation, enemy scaling, room accents, and later cache content.
7. Implemented Wisp healing, Mirror projectile reflection, Hex bolts, and Surge area damage.
8. Implemented checkpoint lives and only shows game over after the final life is spent.
9. Reseeded all deterministic streams and reset run timing on restart.
10. Clamped zero-distance Duskwing, Hexweaver, and returning projectile denominators.
11. Kept remaining simultaneous level-up candidates queued until each is selected.
12. Moved Flintmark to a passable eastern forest tile.
13. Added red damage vignette, flash, fire, ring, smoke, staged death bursts, and lightning feedback.
14. Added eight distinct SFX and live danger-intensity music switching with GGKit crossfades.
15. Made palace enemy defeats and room rewards one-time for the run and persisted their claim maps.
16. Fixed Crownback head-shot counting in the reachable high-attack branch.

### Minor

1. Town exit now returns before the overworld pause check can reopen the rune menu.
2. Town right-edge auto-exit now uses the reachable clamped boundary.
3. Reflowed compact HUD labels to keep keep names, scores, and fragments inside the 256 pixel frame.
4. Removed the remaining legacy world identifiers and comments from source content.
5. Enemy rewards are processed before door or edge transitions.

### Verification

- `node --check` passed for every JavaScript file and `sw.js`.
- Deterministic gameplay checks passed for transitions, guardians, training actions, spells, gates, strict saves, and zero-distance enemy math.
- Service worker version bumped to `2026-08-10-aaa2` and all precache paths resolve.
- Payload measured at 253538 bytes. Largest file measured at 35039 bytes.
- All shipped audio is M4A, and the 4x throttle median sample measured 0.038 ms.

## Fix round 2

### Critical

1. Fixed the blank-world render path by moving the custom canvas draw callback from the nonexistent Scene Systems `postrender` event to the Scene Systems `render` event in `src/game.js`.

### Diagnosis and first-frame path

Phaser's Canvas renderer clears the shared 768 by 672 canvas to `#050710` during `renderer.preRender()`. `CrestfallScene.create()` previously subscribed to `this.sys.events.on('postrender', ...)`, but Scene Systems emit `prerender` and `render`; `postrender` is a Game/Renderer event, not a Scene Systems event. The callback therefore never ran. Because the scene has no Phaser display-list objects, the clear color was the only surviving pixel layer, while DOM controls continued to render normally.

With the fix, the first rendered frame is: Phaser clears the canvas, Scene Systems emits `render`, and `Game._draw()` receives the live 2D context. In the default overworld state, `Overworld.draw()` first fills the full canvas from a `createLinearGradient` (`#07132D` at the top to `#050817` at the bottom), then fills each visible map tile and draws tile sigils, markers, dressing, and the procedural world avatar directly with `fillRect`, paths, gradients, and text glyphs. `drawHUD()` then overwrites the top 168 canvas pixels with the HUD panels, bars, glyphs, and sigils. The tutorial strip, opening `EMBERWILD` banner, and screen-state overlays are drawn afterward. Side-view and town states use the same live context in their respective draw methods, so their environments, platforms, actors, NPCs, and HUD now reach the visible canvas as well.

### Remaining risk

The render callback is intentionally coupled to Phaser's current Scene Systems event contract. A future Phaser upgrade that changes scene event ordering or reclaims the canvas after Scene Systems `render` could reintroduce a layer-order issue; the current pinned Phaser build renders the callback after the clear and before renderer `postRender`.

### Verification

- `node --check` passed for all changed JavaScript files and `sw.js`.
- No deterministic simulation modules were changed.
- Live browser screenshot smoke could not be rerun in this session because no browser was available; verification used the pinned local Phaser event order and static draw-path audit.

## UI declutter

- Cut active-play center banners, duplicate pickup panels, combat-phase readout, room/guardian/region labels, map/house labels, and floating XP text; retained state now lives in meters, icon counts, boss health, and result screens.
- Shrunk the HUD to one icon/meter strip and moved retained event feedback to one queued top-edge chip with a 1.0s hold and fast reduced-motion-aware fade.
- Replaced the multi-line coach panel with one thin top-edge line that retimes per step and fades over 3s; bumped the service worker to `2026-08-10-aaa4`.
- Verification: `node --check` passed for every Crestfall JavaScript file and `sw.js`; live screenshot smoke was blocked by the sandbox’s local-port restriction.

## Round 2 polish

- Visual: added pooled, loading-screen-prewarmed FX with hit sparks, directional knockback feedback, reward bursts, phase bursts, dissolving death fragments, three-stage actor pose states, boss intro framing, animated room and town transitions, regional parallax silhouettes, weather, torch lighting, spell lighting, equipment overlays, and reduced-motion gating for the heavy weather and lighting motion. Combat impacts now produce a dedicated sound and juice response, while pickups escalate through three celebration tiers.
- Gameplay: added BLADE, ARC, and WARD skill branches with nine prerequisite-linked nodes; four town-chain traversal unlocks named VINECUTTER, AIRSTEP, TIDEWALK, and PHASESHIFT; automatic mountain, water, double-jump, and void-gate traversal hooks; four visible equipment rewards with combat effects; a four-step NPC quest chain across Bracken, Cinder, Mossgate, and Gloamrest; and three-phase guardian patterns with phase-specific projectiles, mirrors, spread attacks, and faster attack cadence.
- Save migration: bumped the save schema from v1 to v2. Existing v1 profiles migrate with default skill points, empty skills and techniques, EMBERCLOAK, and an untouched quest stage. New fields are validated, malformed imports degrade to a fresh profile, and `sw.js` is now `2026-08-16-aaa2` with a precache list verified against the shipped files.
- Deferred: the in-app browser and local HTTP server were unavailable in this environment, so no live screenshot or throttled browser frame capture could run. Node syntax checks, a first-frame renderer harness, save migration smoke, quest reward smoke, boss phase smoke, payload limits, and precache path checks passed.
