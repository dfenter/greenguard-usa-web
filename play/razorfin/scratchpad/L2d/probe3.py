import sys
from pathlib import Path
ROOT = Path("/Users/lucille/greenguard-usa-web/play/razorfin")
sys.path.insert(0, str(ROOT/"tools"))
import bpy
from sharklib import io as _io, accessories as acc
base = sys.argv[sys.argv.index("--")+1]
high,_ = _io.prepare_source(str(ROOT/("assets/models/%s.glb"%base)), length=1.0, flip=False)
high.name="low"
for o in list(bpy.context.scene.objects):
    if o.type!="MESH": bpy.data.objects.remove(o, do_unlink=True)
obj=high
m=acc.measure(obj); ax=acc._axis_ids(m)
body_top = max(v.co[ax[2]] for v in obj.data.vertices)
print("BODY top z %.4f  dorsal_height %.5f"%(body_top, acc._dorsal_height(obj,m)))
kit = acc._import_kit("plate_row.glb")
placed = acc._place_kit_object(obj, kit, {"kit":"plate_row.glb","placement":"dorsal"})
import collections
g=collections.defaultdict(list)
for v in placed.data.vertices:
    g[round(v.co[ax[0]],3)].append(v.co[ax[2]])
# group by station bucket
sts=collections.defaultdict(list)
for v in placed.data.vertices:
    sts[round(acc._station(v.co,m),2)].append(v.co[ax[2]])
print("PLACED plate z by station:")
for t in sorted(sts):
    zs=sts[t]
    ridge=acc._dorsal_ridge(obj,m,t)
    print("  t=%.2f  z %.4f..%.4f  height %.4f  ridge %.4f  proud_of_ridge %.4f  body_top %.4f  proud_of_bodytop %.4f"%(
        t,min(zs),max(zs),max(zs)-min(zs),ridge,max(zs)-ridge,body_top,max(zs)-body_top))
