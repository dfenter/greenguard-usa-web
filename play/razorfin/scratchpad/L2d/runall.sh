#!/bin/bash
cd /Users/lucille/greenguard-usa-web/play/razorfin
B=/Applications/Blender.app/Contents/MacOS/Blender
O=scratchpad/L2d/out
: > $O.log
run(){ for i in $(seq 1 60); do
  if ps -axo comm= | grep -q "MacOS/Blender$"; then sleep 20; continue; fi
  out=$("$B" --gpu-backend opengl -b --factory-startup --python scratchpad/L2d/verify.py -- $1 $2 2>&1)
  if echo "$out" | grep -q "VERIFY base"; then echo "$out" | grep -E "VERIFY|GATE|COLLAR|PLATE|missing" >> $O.log; return 0; fi
  sleep 20
done; echo "GAVEUP $1 $2" >> $O.log; }
run tigershark armor_collar.glb
echo "-----" >> $O.log
run greatwhite_cy armor_collar.glb
echo "-----" >> $O.log
run greatwhite_cy plate_row.glb
echo DONE >> $O.log
