import sys
from pathlib import Path
ROOT = Path("/Users/lucille/greenguard-usa-web/play/razorfin")
sys.path.insert(0, str(ROOT/"tools"))
import bpy
from sharklib import io as _io, accessories as acc
base, kit = sys.argv[sys.argv.index("--")+1:][:2]
high,_=_io.prepare_source(str(ROOT/("assets/models/%s.glb"%base)),length=1.0,flip=False)
high.name="low"
for o in list(bpy.context.scene.objects):
    if o.type!="MESH": bpy.data.objects.remove(o,do_unlink=True)
obj=high
m=acc.measure(obj)
def rep(tag):
    mm=acc.measure(obj)
    print("STAGE %-22s tris=%6d verts=%6d loose=%4d L=%.4f headverts=%d"%(
        tag,acc._triangles(obj),len(obj.data.vertices),acc.loose_part_count(obj),mm.L,
        sum(1 for v in obj.data.vertices if acc._station(v.co,mm)>=0.75)))
rep("start")
k=acc._import_kit(kit)
placed=acc._place_kit_object(obj,k,{"kit":kit,"placement":"dorsal"})
acc._ensure_solid(placed, acc.measure(obj).L*0.02)
acc._clean_for_boolean(obj); acc._clean_for_boolean(placed)
rep("after clean")
for solver in ("EXACT","FAST"):
    ok=acc._boolean_union(obj,placed,solver)
    print("  union",solver,"->",ok)
    if ok: break
rep("after union")
acc._region_voxel_remesh(obj, acc.measure(obj).L/220.0, acc.measure(obj), keep_from_t=0.75)
rep("after region remesh")
acc._retain_largest_component(obj)
rep("after retain largest")
