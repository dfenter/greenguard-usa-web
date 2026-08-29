#!/bin/bash
# Bisect which added layer bleaches the shark. Disables ONE builder at a time
# by patching a copy of world3d.js at a DIFFERENT PATH is not possible (the
# page loads it by name), so this patches in place and always restores from the
# inverse patch, never from a saved whole-file copy.
cd /Users/lucille/greenguard-usa-web/play/razorfin
LAYER="$1"
python3 - "$LAYER" <<'PY'
import sys, os
lay=sys.argv[1]
p='world3d.js'; s=open(p).read()
mark='    '+lay+'();'
assert s.count(mark)==1, (lay, s.count(mark))
s=s.replace(mark, '    /*BISECT*/', 1)
open(p+'.tmp','w').write(s); os.replace(p+'.tmp',p)
PY
node scratchpad/shark_lum.mjs bis hawaii >/dev/null 2>&1
python3 scratchpad/shark_body.py /tmp/rf_a.png /tmp/rf_box.json "[no-$LAYER]"
python3 - "$LAYER" <<'PY'
import sys, os
lay=sys.argv[1]
p='world3d.js'; s=open(p).read()
assert s.count('    /*BISECT*/')==1
s=s.replace('    /*BISECT*/', '    '+lay+'();', 1)
open(p+'.tmp','w').write(s); os.replace(p+'.tmp',p)
PY
