# Razorfin Lane F build log

## Built

- `RF.Fx`: five bounded manual pools for bubbles, score/blood motes, element sparks, shockwave rings, and atomic beam cores. Sprites are prebuilt in `RF.Fx.init(scene)`, use additive blending, and are advanced by one scene update hook without per-frame pool or options allocations. `chomp` and `deathBurst` alias the motes pool.
- `RF.Juice`: capped additive hit-stop accumulator, max-stacked camera shake, pooled-safe slow-motion requests, and Leviathan Rex glow/audio/quake presence. Both `leviathanrex` and the contract spelling `leviathan_rex` are accepted.
- `RF.Sound`: file-backed SFX register and playback through `kit.audio.sfx`; null-file entries use lazy deterministic WebAudio oscillators/noise. The synth path honors `kit.audio.prefs.mute` and `sfx`, calls `kit.audio.resume()`, and uses an exposed kit context when available before falling back to a local context.
- `RF.Music`: calm uses `kit.audio.music('calm', 700)` with the kit's music ownership token. Danger and goldrush keep calm underneath and crossfade one shared filtered-noise/bass overlay, so repeated layer changes cannot double-start the calm track or overlay.

## Slow-mo consumption contract

`RF.Juice.slowmo(scale, ms)` combines overlapping requests by taking the lowest scale and longest duration. `RF.Juice.consumeSlowmo()` returns `null` when empty, otherwise the reusable object `{scale, ms}` and clears the pending request. `game.js` should consume it once per frame, set `ctx.run.timeScale = result.scale`, and track `ctx.run.slowmoT` in seconds with `result.ms / 1000`; restore `timeScale` to `1` when that timer expires. `consumeFreeze()` is the scalar per-frame hit-stop read and clears its accumulator.

## Self-test

Command:

```sh
node --check play/razorfin/juice.js && node -e "global.window={}; require('./play/razorfin/data.js'); require('./play/razorfin/juice.js'); var r=window.RF; var out={fx:r.Fx.__selftest(),juice:r.Juice.__selftest(),sound:r.Sound.__selftest(),music:r.Music.__selftest()}; console.log(JSON.stringify(out)); if(!out.fx.pass||!out.juice.pass||!out.sound.pass||!out.music.pass) process.exit(1);"
```

Output:

```text
{"fx":{"pass":true,"notes":["five pooled families constructed and emitted","manual update completed without allocation paths"]},"juice":{"pass":true,"notes":["hit-stop accumulator consumed and reset","slowmo reads through RF.Juice.consumeSlowmo()"]},"sound":{"pass":true,"notes":["synth fallback table covers every RFD.SFX key","file-backed entries use kit.audio.sfx; null entries use lazy WebAudio synthesis"]},"music":{"pass":true,"notes":["calm uses kit.audio.music with its ownership token","danger and goldrush share one crossfaded synthesized overlay"]}}

```

## Rev 4 (Lane F)

- Extended `RF.Fx` with bounded pooled `swimtrail`, `speedlines`, `breach`, and `goldpulse` families. `swimtrail` accepts `{tint, scale, count, angle, speed, life}`; `speedlines` adds `{length, width}` and accepts radians or degrees for `angle`; `breach` emits white droplets plus an expanding ring; `goldpulse` emits four screen-safe edge gradient bars only, with `{tint, scale, alpha, count, life}`.
- Upgraded motes/chomp/deathBurst to use pooled two-tone variants, two larger chunk particles, and a small white score sparkle. No per-frame emitter or option objects were added.
- Added synth-only `RF.Sound.play('boost', {vol, rate})`, quiet hard-rate-limited `RF.Sound.play('swimtrail', {vol, rate})`, and `RF.Sound.play('breach', {vol, rate})`, which aliases the existing splash path and honors kit audio preferences.
- Added `RF.Juice.kaijuGlow(bodySprite, palette, timeMs)` plus optional `bodySprite` and `palette` arguments on `RF.Juice.kaiju`; the body tint breathes from `palette.glow` to white at 0.4 Hz while the existing roar, quake cadence, entry shake, and glow remain.

Self-test proof:

```sh
node --check play/razorfin/juice.js && node -e "global.window={}; require('./play/razorfin/data.js'); require('./play/razorfin/juice.js'); var r=window.RF; var out={fx:r.Fx.__selftest(),juice:r.Juice.__selftest(),sound:r.Sound.__selftest(),music:r.Music.__selftest()}; console.log(JSON.stringify(out)); if(!out.fx.pass||!out.juice.pass||!out.sound.pass||!out.music.pass) process.exit(1);"
```

```text
{"fx":{"pass":true,"notes":["nine pooled families constructed and each emitted once, including Rev 4 juice pools","manual update completed without allocation paths"]},"juice":{"pass":true,"notes":["hit-stop accumulator consumed and reset","slowmo reads through RF.Juice.consumeSlowmo()","kaiju body glow breathes from palette glow to white at 0.4 Hz"]},"sound":{"pass":true,"notes":["synth fallback table covers every RFD.SFX key plus boost, swimtrail, and breach","file-backed entries use kit.audio.sfx; null entries use lazy WebAudio synthesis","swimtrail synth is quiet and hard rate-limited; breach reuses splash"]},"music":{"pass":true,"notes":["calm uses kit.audio.music with its ownership token","danger and goldrush share one crossfaded synthesized overlay"]}}
```

## Rev-3D (Lane F3)

- Added `fx3d.js` as an ES module importing the browser import-map key `three`. It attaches `RF.Fx`, `RF.Juice`, `RF.Sound`, and `RF.Music`, and also exports the four namespaces plus a module-level `__selftest`.
- `RF.Fx.init(scene3)` prebuilds one typed-buffer `THREE.Points` field for every world effect family. `RF.Fx.update(dt)` accepts seconds or milliseconds and advances the same bounded, cursor-reused pools without creating per-frame particle objects or arrays; `RF.Fx.render(ctx, dt)` is the Lane A adapter and also applies the camera shake impulse. World coordinates remain x-right/y-down; every particle, ring, and beam writes Three.js as `(x, -y, z)`.
- Rings and beam cores reuse their single pooled `THREE.Points` field, using the point shader for the ring/streak shape. There is no per-emit geometry, line mesh, or per-slot beam mesh. Additive blending is used for luminous families and every point material applies explicit camera-distance size attenuation.
- `goldpulse` is the UI-only exception: `Fx.init` creates exactly four fixed, pointer-transparent DOM edge bars and `emit('goldpulse', ..., {tint, scale, count, life})` only changes their edge glow. No center-screen overlay or gameplay object is created.
- `RF.Juice.hitStop`, `consumeFreeze`, `slowmo`, and `consumeSlowmo` retain the original accumulator semantics. `shake` stores the same capped impulse and `applyShake(camera, dt)` applies/removes a deterministic Three.js camera-position impulse. `kaiju` accepts an entity or Three.js group, pulses emissive materials, and keeps the original roar/quake cadence and entry FX.
- `RF.Sound` carries the original `SYNTH_SFX`, `SYNTH_DURATION`, oscillator/noise synthesis, file registration (`assets/<RFD path>`), `kit.audio.sfx`, preference, resume, and rate-limit behavior. `RF.Music` keeps calm owned by `kit.audio.music` and uses one shared synthesized danger/goldrush overlay.

Pool inventory and capacities:

| Family | Capacity | Render path |
|---|---:|---|
| bubbles | 96 | additive `THREE.Points` |
| motes (`chomp`, `deathBurst`) | 96 | additive `THREE.Points` |
| elementSpark | 64 | additive `THREE.Points` |
| ring | 24 | one additive `THREE.Points` draw |
| beamCore | 12 | one additive `THREE.Points` draw |
| swimtrail | 128 | additive `THREE.Points` |
| speedlines | 72 | additive streak points |
| breach | 96 | one additive `THREE.Points` draw |
| ambient | 160 | normal-blended soft `THREE.Points` |
| goldpulse | 16 | four DOM edge bars, four slots per pulse |

Self-test and module-import proof:

```sh
node --check play/razorfin/fx3d.js
node --experimental-loader='data:text/javascript,export async function resolve(s,c,n){if(s==="three"){return {url:"file:///Users/lucille/greenguard-usa-web/play/_shared/three/three.module.min.js",shortCircuit:true}};return n(s,c)}' --input-type=module -e "globalThis.window=globalThis; await import('./play/razorfin/data.js'); const m=await import('./play/razorfin/fx3d.js'); const out=m.__selftest(); console.log(JSON.stringify({pass:out.pass,fx:out.fx.pass,juice:out.juice.pass,sound:out.sound.pass,music:out.music.pass})); if(!out.pass)process.exit(1);"
```

Verified output: `{"pass":true,"fx":true,"juice":true,"sound":true,"music":true}`.

## F3 rework: FX-01, LIFE-01, PERF-03

- `FX-01` PASS: exported `RF.Fx.teardown()` is synchronous and idempotent. It deactivates every pooled slot, resets cursors, hides all goldpulse edge bars, clears tracked kaiju pulse state, and resets `RF.Juice` hitstop, slowmo, shake, camera offsets, and kaiju material state.
- `LIFE-01` F3 share PASS: every FX-owned `THREE.Points` object, geometry, and material is removed from the owned scene and disposed during teardown. Shared shark caches are untouched. A live same-scene `Fx.init(scene)` is intentionally a no-op to avoid duplicate ownership; after explicit teardown, `Fx.init(scene)` rebuilds the same state as first init. The four DOM edge bars are created once and reused, then hidden on teardown.
- `PERF-03` F3 share PASS: nine GPU pools contribute nine maximum draw calls, one reusable `THREE.Points` draw each: bubbles, motes, elementSpark, ring, beamCore, swimtrail, speedlines, breach, and ambient. `goldpulse` is DOM-only and contributes zero WebGL draws. FX pool `emit`, `update`, and `render` paths contain no per-frame JS object/array construction; there are no window listeners in this module.

Self-test and module-import proof after the rework:

```sh
node --check play/razorfin/fx3d.js
node --experimental-loader='data:text/javascript,export async function resolve(s,c,n){if(s==="three"){return {url:"file:///Users/lucille/greenguard-usa-web/play/_shared/three/three.module.min.js",shortCircuit:true}};return n(s,c)}' --input-type=module -e "globalThis.window=globalThis; await import('./play/razorfin/data.js'); const m=await import('./play/razorfin/fx3d.js'); const out=m.__selftest(); console.log(JSON.stringify({pass:out.pass,fx:out.fx.pass,juice:out.juice.pass,sound:out.sound.pass,music:out.music.pass,drawCalls:out.fx.drawCalls,notes:out.fx.notes})); if(!out.pass)process.exit(1);"
```

```text
{"pass":true,"fx":true,"juice":true,"sound":true,"music":true,"drawCalls":9,"notes":["five init/emit/update/teardown cycles passed: pool cursors reset and zero active effects after teardown","teardown is synchronous and idempotent (double-teardown leaves the scene empty)","teardown reset Juice accumulators, camera shake, and tracked kaiju pulse state","nine GPU pools are one reusable THREE.Points draw each; goldpulse is four DOM edge bars with zero WebGL draws"]}
```
