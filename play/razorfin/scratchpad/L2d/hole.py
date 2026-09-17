import sys,math
from pathlib import Path
ROOT=Path("/Users/lucille/greenguard-usa-web/play/razorfin"); sys.path.insert(0,str(ROOT/"tools"))
import bpy
from sharklib import io as _io, accessories as acc
base=sys.argv[sys.argv.index("--")+1]
h,_=_io.prepare_source(str(ROOT/("assets/models/%s.glb"%base)),length=1.0,flip=False)
h.name="low"
for o in list(bpy.context.scene.objects):
    if o.type!="MESH": bpy.data.objects.remove(o,do_unlink=True)
obj=h; m=acc.measure(obj); ax=acc._axis_ids(m)
t=acc._pectoral_station(obj,m)
for slab in (0.035,0.06,0.10):
    st=acc._section_stats(obj,m,t)
    pts=acc._section(obj,m,t,slab=slab,exclude_fins=False)
    cx=sum(p[ax[1]] for p in pts)/len(pts); cy=sum(p[ax[2]] for p in pts)/len(pts)
    b=set()
    for p in pts:
        b.add(int(((math.atan2(p[ax[2]]-cy,p[ax[1]]-cx)%(2*math.pi))/(2*math.pi))*48)%48)
    print("SLAB %.3f npts %4d populated %2d/48  (fins INCLUDED)"%(slab,len(pts),len(b)))
# is the whole mesh closed? count boundary edges
import bmesh
bm=bmesh.new(); bm.from_mesh(obj.data)
be=[e for e in bm.edges if e.is_boundary]
print("MESH boundary edges %d / %d   verts %d faces %d"%(len(be),len(bm.edges),len(bm.verts),len(bm.faces)))
# how many boundary edges near the collar station
near=[e for e in be if abs(acc._station((e.verts[0].co+e.verts[1].co)*0.5,m)-t)<=0.06]
print("MESH boundary edges near collar station: %d"%len(near))
bm.free()
