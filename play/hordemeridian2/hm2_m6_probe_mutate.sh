#!/usr/bin/env bash
# hm2_m6_probe_mutate.sh - mutation harness proving hm2_m6_probe.mjs is not
# vacuous. Applies real semantic breaks to game.js one at a time, restoring
# the pristine file after each run, and requires the probe to exit non-zero
# on every mutation. Exit 0 only if every mutation is caught.
set -u
cd "$(dirname "$0")"

URL="${1:-http://127.0.0.1:8820/play/hordemeridian2/}"
GAME=game.js
PRISTINE=/tmp/hm2_m6_game_pristine.js
LOG=/tmp/hm2_m6_mut_run.log

cp "$GAME" "$PRISTINE"
restore() { cp "$PRISTINE" "$GAME"; }
trap restore EXIT

overall=0
run_probe() {
  node hm2_m6_probe.mjs "$URL" > "$LOG" 2>&1
  echo $?
}

report() {
  local name="$1" code="$2"
  if [ "$code" -ne 0 ]; then
    echo "PASS-MUTANT $name  (probe exit=$code)"
  else
    echo "HOLE $name  (probe exit=$code, expected non-zero)"
    overall=1
  fi
}

echo "=== mutation 1: chase cam forced off regardless of pref ==="
restore
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "      this.chaseCam = readChaseCamPref();"
new = "      this.chaseCam = false;"
assert old in s, "anchor not found for mutation 1"
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "chaseCam forced false at boot" "$code"
restore

echo "=== mutation 2: chase cam rotation ignores player heading (zero target) ==="
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "        var targetRot = -(this.playerHeading + Math.PI / 2);"
new = "        var targetRot = 0;"
assert old in s, "anchor not found for mutation 2"
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "chase cam targetRot ignores heading" "$code"
restore

echo "=== mutation 3: uiCam gets rotated along with the main camera (HUD leaks rotation) ==="
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = """      if (this.chaseCam) {
        var targetRot = -(this.playerHeading + Math.PI / 2);
        var rotDiff = Phaser.Math.Angle.Wrap(targetRot - cam.rotation);
        cam.rotation += rotDiff * Math.min(1, dt * 6);
      } else if (cam.rotation !== 0) {"""
new = """      if (this.chaseCam) {
        var targetRot = -(this.playerHeading + Math.PI / 2);
        var rotDiff = Phaser.Math.Angle.Wrap(targetRot - cam.rotation);
        cam.rotation += rotDiff * Math.min(1, dt * 6);
        if (this.uiCam) this.uiCam.rotation = cam.rotation;
      } else if (cam.rotation !== 0) {"""
assert old in s, "anchor not found for mutation 3"
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "uiCam rotated along with main camera (HUD no longer screen-locked)" "$code"
restore

echo "=== mutation 4: ARCHETYPE_FX collapsed to a single shared effect (evolution bonus lost) ==="
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "        this.fx.impact.emitParticleAt(p.x + Math.cos(ang) * 16, p.y + Math.sin(ang) * 16,\n          data.tier === 'evolution' ? arch.muzzleQty + 3 : arch.muzzleQty);"
new = "        this.fx.impact.emitParticleAt(p.x + Math.cos(ang) * 16, p.y + Math.sin(ang) * 16,\n          arch.muzzleQty);"
assert old in s, "anchor not found for mutation 4"
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "evolution muzzle FX bonus removed (not directly asserted, control check)" "$code"
restore

echo "=== mutation 5: purgeBoard no longer emits a shockwave ring ==="
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = """      // Purge is now a shockwave ring (contactRing, real pooled display
      // object) instead of a floater, so a probe can find it on the live
      // display list.
      this.contactRing(this.p.x, this.p.y, 40, 340, 0.5, 0x8effd8, 0.9);
      sfx('death', { volume: 0.42, rate: 0.62 });"""
new = """      sfx('death', { volume: 0.42, rate: 0.62 });"""
assert old in s, "anchor not found for mutation 5"
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "purge shockwave contactRing call removed" "$code"
restore

echo "=== mutation 6: level-up burst no longer spawns a contactRing ==="
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = """        this.fx.level.emitParticleAt(this.p.x, this.p.y, 36);
        this.contactRing(this.p.x, this.p.y, 30, 260, 0.45, 0x8effd8, 0.9);
        this.contactRing(this.p.x, this.p.y, 18, 150, 0.32, 0xffffff, 0.7);"""
new = """        this.fx.level.emitParticleAt(this.p.x, this.p.y, 36);"""
assert old in s, "anchor not found for mutation 6"
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "level-up burst contactRing calls removed" "$code"
restore

echo "=== mutation 7: boss phase change skips the slow-mo dt gate ==="
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "      if (this.bossPhaseFx && this.bossPhaseFx.active && this.bossPhaseFx.t < 0.3) dt *= 0.3;"
new = "      if (false) dt *= 0.3;"
assert old in s, "anchor not found for mutation 7"
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "boss phase slow-mo dt gate disabled" "$code"
restore

echo "=== mutation 8: boss phase change no longer sets bossPhaseFx.active ==="
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "      this.bossPhaseFx.active = !quiet;"
new = "      this.bossPhaseFx.active = false;"
assert old in s, "anchor not found for mutation 8"
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "bossPhaseFx.active never set true on phase change" "$code"
restore

echo "=== mutation 9: gem pickup streak emitter (fx.trail) call removed ==="
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = """          // Gem pickup streak: a short flare trail from the gem toward the
          // player, on the shared fx.trail emitter (existing atlas p_flare).
          this.fx.trail.setParticleTint([0x8fe7ff, 0xa7ffe0, 0xffd07a][g.tier]);
          this.fx.trail.emitParticleAt(g.x, g.y, 3);"""
new = ""
assert old in s, "anchor not found for mutation 9"
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "gem pickup streak (fx.trail) emit removed" "$code"
restore

restore
trap - EXIT

echo ""
if [ "$overall" -eq 0 ]; then
  echo "ALL MUTATIONS CAUGHT: probe is not vacuous"
else
  echo "HOLE(S) FOUND: see above"
fi
exit $overall
