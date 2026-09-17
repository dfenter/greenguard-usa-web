#!/bin/bash
cd /Users/lucille/greenguard-usa-web/play/razorfin
B=/Applications/Blender.app/Contents/MacOS/Blender
O=scratchpad/L2d/gap.log; : > $O
run(){ for i in $(seq 1 80); do
  if ps -axo comm= | grep -q "MacOS/Blender$"; then sleep 20; continue; fi
  out=$("$B" --gpu-backend opengl -b --factory-startup --python scratchpad/L2d/gap.py -- $1 2>&1)
  if echo "$out" | grep -q "GAP base"; then echo "$out" | grep -E "GAP|frac" >> $O; return 0; fi
  sleep 20
done; echo "GAVEUP $1" >> $O; }
run greatwhite_cy
run tigershark
echo DONE >> $O
