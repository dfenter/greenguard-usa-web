import sys, os, math
from pathlib import Path
ROOT = Path("/Users/lucille/greenguard-usa-web/play/razorfin")
sys.path.insert(0, str(ROOT/"tools"))
import bpy
from sharklib import io as _io, accessories as acc, head as H

base = sys.argv[sys.argv.index("--")+1]
high,_ = _io.prepare_source(str(ROOT/("assets/models/%s.glb"%base)), length=1.0, flip=False)
high.name="low"
for o in list(bpy.context.scene.objects):
    if o.type!="MESH": bpy.data.objects.remove(o, do_unlink=True)
obj = high
m = acc.measure(obj)
print("PROBE base",base,"L",round(m.L,4),"H",round(m.H,4),"long_axis",m.long_axis)
print("  head_sign?", getattr(m,'head_sign','n/a'))
print("  fin_groups", {k:len(v) for k,v in m.fin_groups.items()})
dh = acc._dorsal_height(obj,m)
print("  _dorsal_height =", round(dh,5), " L*0.01 floor=",round(m.L*0.01,5), " H*0.10=",round(m.H*0.10,5))
dorsal = set(m.fin_groups.get("dorsal",set()))
print("  dorsal group n =", len(dorsal))
if dorsal:
    ax = acc._axis_ids(m)
    ts = [acc._station(obj.data.vertices[i].co,m) for i in dorsal]
    print("  dorsal t range %.3f..%.3f mean %.3f"%(min(ts),max(ts),sum(ts)/len(ts)))
    inband=[i for i in dorsal if 0.30<=acc._station(obj.data.vertices[i].co,m)<=0.78]
    print("  in-band 0.30-0.78 count", len(inband))
    vals=[]
    for i in inband:
        v=obj.data.vertices[i]; t=acc._station(v.co,m)
        vals.append(v.co[ax[2]] - acc._dorsal_ridge(obj,m,t))
    if vals: print("  raw (fin z - ridge z) min %.5f max %.5f"%(min(vals),max(vals)))
    # true fin height: fin top minus ridge at fin's own station
    ftop = max(obj.data.vertices[i].co[ax[2]] for i in dorsal)
    tmean = sum(ts)/len(ts)
    print("  fin top z %.5f ridge at tmean %.5f => height %.5f"%(ftop, acc._dorsal_ridge(obj,m,tmean), ftop-acc._dorsal_ridge(obj,m,tmean)))
for t in (0.35,0.45,0.55,0.65,0.75):
    st=acc._section_stats(obj,m,t)
    print("  t=%.2f ridge=%.4f width=%.4f radius=%.4f girth=%.4f"%(t,acc._dorsal_ridge(obj,m,t),st["width"],st["radius"],st["girth"]))
