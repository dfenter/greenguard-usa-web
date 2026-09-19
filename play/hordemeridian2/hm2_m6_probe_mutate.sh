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

# Applies a python patch script to $GAME, verifying both the python exit
# status and that the file content actually changed. On any failure this
# prints an explicit ANCHOR-FAIL marker, sets overall=1, restores the
# pristine file, and returns non-zero so the caller SKIPS the probe run.
apply_mutation() {
  local n="$1"
  local before after
  before=$(md5sum "$GAME" 2>/dev/null || md5 -q "$GAME")
  python3 - "$GAME"
  local pystatus=$?
  after=$(md5sum "$GAME" 2>/dev/null || md5 -q "$GAME")
  if [ "$pystatus" -ne 0 ]; then
    echo "ANCHOR-FAIL $n  (python patch exited $pystatus)"
    overall=1
    restore
    return 1
  fi
  if [ "$before" = "$after" ]; then
    echo "ANCHOR-FAIL $n  (patch reported success but file content unchanged)"
    overall=1
    restore
    return 1
  fi
  return 0
}

echo "=== mutation 1: chase cam forced off regardless of pref ==="
restore
if apply_mutation 1 <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "      this.chaseCam = readChaseCamPref();"
new = "      this.chaseCam = false;"
if old not in s:
    print("anchor not found for mutation 1", file=sys.stderr)
    sys.exit(1)
new_s = s.replace(old, new, 1)
if new_s == s:
    print("substitution did not change file for mutation 1", file=sys.stderr)
    sys.exit(1)
open(p, 'w').write(new_s)
PY
then
  code=$(run_probe)
  report "chaseCam forced false at boot" "$code"
  restore
fi

echo "=== mutation 2: chase cam rotation ignores player heading (zero target) ==="
if apply_mutation 2 <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "        var targetRot = -(this.playerHeading + Math.PI / 2);"
new = "        var targetRot = 0;"
if old not in s:
    print("anchor not found for mutation 2", file=sys.stderr)
    sys.exit(1)
new_s = s.replace(old, new, 1)
if new_s == s:
    print("substitution did not change file for mutation 2", file=sys.stderr)
    sys.exit(1)
open(p, 'w').write(new_s)
PY
then
  code=$(run_probe)
  report "chase cam targetRot ignores heading" "$code"
  restore
fi

echo "=== mutation 3: uiCam gets rotated along with the main camera (HUD leaks rotation) ==="
if apply_mutation 3 <<'PY'
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
if old not in s:
    print("anchor not found for mutation 3", file=sys.stderr)
    sys.exit(1)
new_s = s.replace(old, new, 1)
if new_s == s:
    print("substitution did not change file for mutation 3", file=sys.stderr)
    sys.exit(1)
open(p, 'w').write(new_s)
PY
then
  code=$(run_probe)
  report "uiCam rotated along with main camera (HUD no longer screen-locked)" "$code"
  restore
fi

echo "=== mutation 4: ARCHETYPE_FX collapsed to a single shared effect (evolution bonus lost) ==="
if apply_mutation 4 <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "        this.fx.impact.emitParticleAt(p.x + Math.cos(ang) * 16, p.y + Math.sin(ang) * 16,\n          data.tier === 'evolution' ? arch.muzzleQty + 3 : arch.muzzleQty);"
new = "        this.fx.impact.emitParticleAt(p.x + Math.cos(ang) * 16, p.y + Math.sin(ang) * 16,\n          arch.muzzleQty);"
if old not in s:
    print("anchor not found for mutation 4", file=sys.stderr)
    sys.exit(1)
new_s = s.replace(old, new, 1)
if new_s == s:
    print("substitution did not change file for mutation 4", file=sys.stderr)
    sys.exit(1)
open(p, 'w').write(new_s)
PY
then
  code=$(run_probe)
  report "evolution muzzle FX bonus removed (not directly asserted, control check)" "$code"
  restore
fi

echo "=== mutation 5: purgeBoard no longer emits a shockwave ring ==="
if apply_mutation 5 <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = """      // Purge is now a shockwave ring (contactRing, real pooled display
      // object) instead of a floater, so a probe can find it on the live
      // display list.
      this.contactRing(this.p.x, this.p.y, 40, 340, 0.5, 0x8effd8, 0.9);
      sfx('death', { volume: 0.42, rate: 0.62 });"""
new = """      sfx('death', { volume: 0.42, rate: 0.62 });"""
if old not in s:
    print("anchor not found for mutation 5", file=sys.stderr)
    sys.exit(1)
new_s = s.replace(old, new, 1)
if new_s == s:
    print("substitution did not change file for mutation 5", file=sys.stderr)
    sys.exit(1)
open(p, 'w').write(new_s)
PY
then
  code=$(run_probe)
  report "purge shockwave contactRing call removed" "$code"
  restore
fi

echo "=== mutation 6: level-up burst no longer spawns a contactRing ==="
if apply_mutation 6 <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = """        this.fx.level.emitParticleAt(this.p.x, this.p.y, 36);
        this.contactRing(this.p.x, this.p.y, 30, 260, 0.45, 0x8effd8, 0.9);
        this.contactRing(this.p.x, this.p.y, 18, 150, 0.32, 0xffffff, 0.7);"""
new = """        this.fx.level.emitParticleAt(this.p.x, this.p.y, 36);"""
if old not in s:
    print("anchor not found for mutation 6", file=sys.stderr)
    sys.exit(1)
new_s = s.replace(old, new, 1)
if new_s == s:
    print("substitution did not change file for mutation 6", file=sys.stderr)
    sys.exit(1)
open(p, 'w').write(new_s)
PY
then
  code=$(run_probe)
  report "level-up burst contactRing calls removed" "$code"
  restore
fi

echo "=== mutation 7: boss phase change skips the slow-mo dt gate ==="
if apply_mutation 7 <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "      if (this.bossPhaseFx && this.bossPhaseFx.active && this.bossPhaseFx.t < 0.3) dtFeed *= 0.3;"
new = "      if (false) dtFeed *= 0.3;"
if old not in s:
    print("anchor not found for mutation 7", file=sys.stderr)
    sys.exit(1)
new_s = s.replace(old, new, 1)
if new_s == s:
    print("substitution did not change file for mutation 7", file=sys.stderr)
    sys.exit(1)
open(p, 'w').write(new_s)
PY
then
  code=$(run_probe)
  report "boss phase slow-mo dt gate disabled" "$code"
  restore
fi

echo "=== mutation 8: boss phase change no longer sets bossPhaseFx.active ==="
if apply_mutation 8 <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "      this.bossPhaseFx.active = !quiet;"
new = "      this.bossPhaseFx.active = false;"
if old not in s:
    print("anchor not found for mutation 8", file=sys.stderr)
    sys.exit(1)
new_s = s.replace(old, new, 1)
if new_s == s:
    print("substitution did not change file for mutation 8", file=sys.stderr)
    sys.exit(1)
open(p, 'w').write(new_s)
PY
then
  code=$(run_probe)
  report "bossPhaseFx.active never set true on phase change" "$code"
  restore
fi

echo "=== mutation 9: gem pickup streak emitter (fx.trail) call removed ==="
if apply_mutation 9 <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = """          // Gem pickup streak: a short flare trail from the gem toward the
          // player, on the shared fx.trail emitter (existing atlas p_flare).
          this.fx.trail.setParticleTint([0x8fe7ff, 0xa7ffe0, 0xffd07a][g.tier]);
          this.fx.trail.emitParticleAt(g.x, g.y, 3);"""
new = ""
if old not in s:
    print("anchor not found for mutation 9", file=sys.stderr)
    sys.exit(1)
new_s = s.replace(old, new, 1)
if new_s == s:
    print("substitution did not change file for mutation 9", file=sys.stderr)
    sys.exit(1)
open(p, 'w').write(new_s)
PY
then
  code=$(run_probe)
  report "gem pickup streak (fx.trail) emit removed" "$code"
  restore
fi

restore
trap - EXIT

echo ""
if [ "$overall" -eq 0 ]; then
  echo "ALL MUTATIONS CAUGHT: probe is not vacuous"
else
  echo "HOLE(S) FOUND: see above"
fi
exit $overall
