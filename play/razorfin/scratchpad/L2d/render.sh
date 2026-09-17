#!/bin/bash
cd /Users/lucille/greenguard-usa-web/play/razorfin
B=/Applications/Blender.app/Contents/MacOS/Blender
O=scratchpad/L2d/render.log; : > $O
for i in $(seq 1 120); do
  if ps -axo comm= | grep -q "MacOS/Blender$"; then sleep 20; continue; fi
  "$B" --gpu-backend opengl -b --factory-startup --python tools/kit_gen.py -- \
     --verify --base greatwhite_cy --base tigershark > scratchpad/L2d/render.raw 2>&1
  if grep -q "L2_GATE" scratchpad/L2d/render.raw; then
    grep -E "L2_GATE|L2_VERIFY " scratchpad/L2d/render.raw >> $O; break; fi
  sleep 20
done
echo DONE >> $O
