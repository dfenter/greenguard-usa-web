#!/bin/bash
cd /Users/lucille/greenguard-usa-web/play/razorfin
B=/Applications/Blender.app/Contents/MacOS/Blender
O=scratchpad/L2d/gap2.log; : > $O
for i in $(seq 1 80); do
  if ps -axo comm= | grep -q "MacOS/Blender$"; then sleep 20; continue; fi
  out=$("$B" --gpu-backend opengl -b --factory-startup --python scratchpad/L2d/gap.py -- greatwhite_cy 2>&1)
  if echo "$out" | grep -q "GAP base"; then echo "$out" | grep -E "GAP|frac|ring radius|worst" >> $O; break; fi
  sleep 20
done
echo DONE >> $O
