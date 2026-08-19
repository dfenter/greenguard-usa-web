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
