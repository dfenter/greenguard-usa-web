# Razorfin Rev 7 Lane L2: world3d patch handoff

This file is the exact world3d handoff for Rev 7.5 instanced-bend v2.
`world3d.js` was not edited in this lane. Apply the four old/new blocks below
as one change, preserving the surrounding context.

## Patch 1: replace `INST_BEND_CHUNK`

Old block:

```js
  var INST_BEND_CHUNK =
    'float bendT=smoothstep(uBendSpan.x,uBendSpan.y,-transformed.x); ' +
    'transformed.z += aBendAmp*bendT*sin(aBendPhase+transformed.x*uBendK);';

  // Install the instanced bend contract on a CLONED material only. The base
  // fish-lane material remains untouched, and the cache key is distinct from
  // the shark/solid bend variants so Three never aliases the programs.
  function installInstancedBend(material) {
```

New block:

```js
  var INST_BEND_CHUNK =
    'float bendT=smoothstep(uBendSpan.x,uBendSpan.y,-transformed.x); ' +
    'float bendTail=bendT*bendT; ' +
    'float bendWave=sin(aBendPhase+transformed.x*uBendK); ' +
    'float bendZ=aBendAmp*bendTail*bendWave; ' +
    'transformed.z += bendZ; ' +
    'transformed.y += 0.35*bendZ + 0.06*aBendAmp*bendTail*sin(aBendPhase*1.17+transformed.x*uBendK*1.35);';

  // Install the instanced bend contract on a CLONED material only. The base
  // fish-lane material remains untouched, and the cache key is distinct from
  // the shark/solid bend variants so Three never aliases the programs.
  function installInstancedBend(material) {
```

The new shader chunk references only the already-declared `uBendK`,
`uBendSpan`, `aBendPhase`, and `aBendAmp`. `bendTail`, `bendWave`, and
`bendZ` are local GLSL variables; no uniform declaration is needed.

## Patch 2: idle bend amplitude floor and frozen override

Old block:

```js
    var spd = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
    var maxSpd = (e.def && (e.def.speed || (e.def.stats && e.def.stats.speed))) || 160;
    var speedFrac = maxSpd > 0 ? clamp(spd / maxSpd, 0, 1.4) : 0;
    if (st.frozenT > 0) speedFrac = 0;
    batch.phase.setX(rec.slot, entPhase(e) + t);
    // Rev 6.5: doubled instanced bend amplitude while panicking, so a fish
    // whose panicT is armed visibly thrashes rather than just swimming away
    // faster (the flee-speed and jitter live in preyAI/steer; this is the
    // purely visual half of the same cue).
    var bendAmp = INST_BEND_AMP * clamp(speedFrac, 0, 1);
    if (st.panicT > 0) bendAmp *= PANIC_BEND_MULT;
    batch.amp.setX(rec.slot, bendAmp);
```

New block:

```js
    var spd = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
    var maxSpd = (e.def && (e.def.speed || (e.def.stats && e.def.stats.speed))) || 160;
    var speedFrac = maxSpd > 0 ? clamp(spd / maxSpd, 0, 1.4) : 0;
    if (st.frozenT > 0) speedFrac = 0;
    batch.phase.setX(rec.slot, entPhase(e) + t);
    // Rev 7.5: preserve a small idle swim while retaining a hard frozen
    // override. Panic still multiplies the resulting visual amplitude.
    var bendAmp = INST_BEND_AMP * (0.28 + 0.72 * clamp(speedFrac, 0, 1));
    if (st.frozenT > 0) bendAmp = 0;
    if (st.panicT > 0) bendAmp *= PANIC_BEND_MULT;
    batch.amp.setX(rec.slot, bendAmp);
```

## Patch 3: bump the instanced shader program key

Old block:

```js
    };
    material.customProgramCacheKey = function () { return String(baseKey) + ':rf-bend-inst'; };
    material.userData.rfBendInstanced = true;
    material.userData.rfBendSpan = new THREE.Vector2(INST_BEND_SPAN[0], INST_BEND_SPAN[1]);
```

New block:

```js
    };
    material.customProgramCacheKey = function () { return String(baseKey) + ':rf-bend-inst2'; };
    material.userData.rfBendInstanced = true;
    material.userData.rfBendSpan = new THREE.Vector2(INST_BEND_SPAN[0], INST_BEND_SPAN[1]);
```

## Patch 4: update the world shader probe

Old block:

```js
          var probeShader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>' };
          probeBatch.material.onBeforeCompile(probeShader);
          var bendKey = probeBatch.material.customProgramCacheKey();
          chk(probeBatch.material.vertexColors === true &&
            probeBatch.material.color && probeBatch.material.color.getHex() === 0xffffff &&
            probeBatch.material.side === THREE.DoubleSide &&
            bendKey.slice(-13) === ':rf-bend-inst' &&
            probeShader.uniforms.uBendK && probeShader.uniforms.uBendSpan &&
            probeShader.vertexShader.indexOf('uniform float uBendK') >= 0 &&
            probeShader.vertexShader.indexOf('uniform vec2 uBendSpan') >= 0 &&
            probeShader.vertexShader.indexOf('aBendPhase') >= 0 &&
            probeShader.vertexShader.indexOf(INST_BEND_CHUNK) >= 0,
          'instanced toon material preserves the Rev 3 bend uniforms, attributes, and cache key');
```

New block:

```js
          var probeShader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>' };
          probeBatch.material.onBeforeCompile(probeShader);
          var bendKey = probeBatch.material.customProgramCacheKey();
          chk(probeBatch.material.vertexColors === true &&
            probeBatch.material.color && probeBatch.material.color.getHex() === 0xffffff &&
            probeBatch.material.side === THREE.DoubleSide &&
            bendKey.slice(-14) === ':rf-bend-inst2' &&
            probeShader.uniforms.uBendK && probeShader.uniforms.uBendSpan &&
            probeShader.vertexShader.indexOf('uniform float uBendK') >= 0 &&
            probeShader.vertexShader.indexOf('uniform vec2 uBendSpan') >= 0 &&
            probeShader.vertexShader.indexOf('aBendPhase') >= 0 &&
            probeShader.vertexShader.indexOf('float bendTail=bendT*bendT;') >= 0 &&
            probeShader.vertexShader.indexOf('transformed.y += 0.35*bendZ') >= 0 &&
            probeShader.vertexShader.indexOf(INST_BEND_CHUNK) >= 0,
          'instanced toon material preserves the Rev 7.5 bend uniforms, attributes, idle floor, Y ripple, tail envelope, and cache key');
```

After applying these blocks, the existing frozen probe should continue to
observe `batch.amp === 0`; the new shader source should contain the squared
tail envelope and Y ripple, and the material key should end in
`:rf-bend-inst2`.
