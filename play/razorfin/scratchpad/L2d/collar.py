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
st=acc._section_stats(obj,m,t)
print("COLLAR station %.4f  npoints %d"%(t,len(st["points"])))
print("  centroid across %.4f up %.4f ; median across %.4f up %.4f"%(
  st["centroid_across"],st["centroid_up"],st["across_center"],st["up_center"]))
print("  width %.4f height %.4f radius(p82) %.4f radius_max %.4f"%(st["width"],st["height"],st["radius"],st["radius_max"]))
prof=acc._section_radius_profile(st,48)
print("  profile min %.4f max %.4f mean %.4f"%(min(prof),max(prof),sum(prof)/len(prof)))
print("  profile:", " ".join("%.3f"%v for v in prof))
# how many bins were actually populated?
cx,cy=st["centroid_across"],st["centroid_up"]
import collections
b=collections.Counter()
for p in st["points"]:
    dx=p[ax[1]]-cx; dy=p[ax[2]]-cy
    b[int(((math.atan2(dy,dx)%(2*math.pi))/(2*math.pi))*48)%48]+=1
print("  populated bins %d / 48"%len(b))
