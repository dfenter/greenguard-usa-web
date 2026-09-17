import sys
from pathlib import Path
ROOT=Path("/Users/lucille/greenguard-usa-web/play/razorfin"); sys.path.insert(0,str(ROOT/"tools"))
import bpy
from sharklib import io as _io, accessories as acc
base,kit=sys.argv[sys.argv.index("--")+1:][:2]
h,_=_io.prepare_source(str(ROOT/("assets/models/%s.glb"%base)),length=1.0,flip=False)
h.name="low"
for o in list(bpy.context.scene.objects):
    if o.type!="MESH": bpy.data.objects.remove(o,do_unlink=True)
obj=h
acc._clean_for_boolean(obj)
m=acc.measure(obj)
snap=lambda o,mm: set(tuple(round(c,6) for c in v.co) for v in o.data.vertices if acc._station(v.co,mm)>=0.75)
pre=snap(obj,m)
def chk(tag):
    mm=acc.measure(obj); cur=snap(obj,mm)
    print("WHERE %-24s head=%5d lost=%4d"%(tag,len(cur),len(pre-cur)))
chk("post-clean")
k=acc._import_kit(kit)
pl=acc._place_kit_object(obj,k,{"kit":kit,"placement":"dorsal"})
acc._ensure_solid(pl,acc.measure(obj).L*0.02); acc._clean_for_boolean(pl)
for sv in ("EXACT","FAST"):
    if acc._boolean_union(obj,pl,sv): print("  union",sv); break
chk("after union")
acc._region_voxel_remesh(obj,acc.measure(obj).L/220.0,acc.measure(obj),keep_from_t=0.75)
chk("after region remesh")
acc._retain_largest_component(obj)
chk("after retain largest")
acc._gentle_decimate(obj, 6784+1500, protect_from_t=0.75, measurement=acc.measure(obj))
chk("after decimate")
