#!/usr/bin/env bash
# hm2_m5_probe_mutate.sh - mutation harness proving hm2_m5_probe.mjs is not
# vacuous. Applies real semantic breaks to game.js one at a time, restoring
# the pristine file after each run, and requires the probe to exit non-zero
# on every mutation. Exit 0 only if every mutation is caught.
set -u
cd "$(dirname "$0")"

URL="${1:-http://127.0.0.1:8801/play/hordemeridian2/}"
GAME=game.js
PRISTINE=/tmp/hm2_m5_game_pristine.js
LOG=/tmp/hm2_m5_mut_run.log

cp "$GAME" "$PRISTINE"
restore() { cp "$PRISTINE" "$GAME"; }
trap restore EXIT

overall=0
run_probe() {
  node hm2_m5_probe.mjs "$URL" > "$LOG" 2>&1
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

echo "=== mutation 1: activeShipTierData always returns first tier ==="
restore
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "    var idx = Math.min(cls.tiers.length, owned) - 1;\n    return cls.tiers[Math.max(0, idx)];"
new = "    var idx = Math.min(cls.tiers.length, owned) - 1;\n    return cls.tiers[0];"
assert old in s, "anchor not found for mutation 1"
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "activeShipTierData always first tier" "$code"
restore

echo "=== mutation 2: ship class stat multipliers not applied when composing this.p ==="
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "      var shipHpMult = shipTierData.hpMult || 1;\n      var shipSpeedMult = shipTierData.speedMult || 1;\n      var shipDmgMult = shipTierData.dmgMult || 1;"
new = "      var shipHpMult = 1;\n      var shipSpeedMult = 1;\n      var shipDmgMult = 1;"
assert old in s, "anchor not found for mutation 2"
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "ship class multipliers stripped from this.p composition" "$code"
restore

echo "=== mutation 3: buyShipTier does not deduct gem cost ==="
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "      profile.hangar.balance -= cost;\n      profile.hangar.shipTiers[classKey] = owned + 1;"
new = "      profile.hangar.shipTiers[classKey] = owned + 1;"
assert old in s, "anchor not found for mutation 3"
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "buyShipTier skips gem deduction" "$code"
restore

echo "=== mutation 4: HM1 import skips setting hm1ImportDone (grants every migration) ==="
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "      if (hm1Bonus > 0) profile.hangar.balance = (profile.hangar.balance || 0) + hm1Bonus;\n      profile.hm1ImportDone = true;\n    }\n    didMigrate = true;"
new = "      if (hm1Bonus > 0) profile.hangar.balance = (profile.hangar.balance || 0) + hm1Bonus;\n    }\n    didMigrate = true;"
assert old in s, "anchor not found for mutation 4"
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "hm1ImportDone never set, re-grants on every migration" "$code"
restore

echo "=== mutation 5: decalUnlocked always returns true ==="
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "  function decalUnlocked(key) {\n    var d = DECAL_BY_KEY[key];\n    if (!d) return false;\n    if (!d.gate) return true;\n    return !!d.gate(profile, decalUnlockCtx());\n  }"
new = "  function decalUnlocked(key) {\n    var d = DECAL_BY_KEY[key];\n    if (!d) return false;\n    return true;\n  }"
assert old in s, "anchor not found for mutation 5"
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "decalUnlocked unconditionally true" "$code"
restore

echo "=== mutation 6: Warden shield absorb step removed from damage path ==="
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = """      if (p.shieldMax > 0 && p.shield > 0) {
        var absorbed = Math.min(p.shield, amt);
        p.shield -= absorbed;
        amt -= absorbed;
      }
      p.lastHitAt = this.run.time;
      p.hp -= amt;
      p.iframes = 0.45;
      p.hurtT = 0.35;"""
new = """      p.lastHitAt = this.run.time;
      p.hp -= amt;
      p.iframes = 0.45;
      p.hurtT = 0.35;"""
count = s.count(old)
assert count == 1, "expected exactly 1 occurrence of absorb block, found " + str(count)
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "Warden shield absorb step removed" "$code"
restore

echo "=== mutation 7: v3->v4 migration drops campaign field ==="
python3 - "$GAME" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "      if (hm1Bonus > 0) profile.hangar.balance = (profile.hangar.balance || 0) + hm1Bonus;\n      profile.hm1ImportDone = true;\n    }\n    didMigrate = true;\n  }\n  if (typeof profile.hm1ImportDone !== 'boolean') profile.hm1ImportDone = true;"
new = "      if (hm1Bonus > 0) profile.hangar.balance = (profile.hangar.balance || 0) + hm1Bonus;\n      profile.hm1ImportDone = true;\n    }\n    profile.campaign = makeDefaultCampaign();\n    didMigrate = true;\n  }\n  if (typeof profile.hm1ImportDone !== 'boolean') profile.hm1ImportDone = true;"
assert old in s, "anchor not found for mutation 7"
open(p, 'w').write(s.replace(old, new, 1))
PY
code=$(run_probe)
report "v3->v4 migration drops campaign field (resets it)" "$code"
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
