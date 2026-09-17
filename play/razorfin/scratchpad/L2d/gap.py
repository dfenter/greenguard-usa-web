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
k=acc._import_kit("armor_collar.glb")
pl=acc._place_kit_object(obj,k,{"kit":"armor_collar.glb","placement":"neck"})
# true point-to-SURFACE distance via closest_point_on_mesh
gaps=[]
for v in pl.data.vertices:
    ok,loc,nor,idx = obj.closest_point_on_mesh(v.co)
    if ok: gaps.append((v.co-loc).length)
gaps.sort()
n=len(gaps)
print("GAP base=%s n=%d  max %.4f  p99 %.4f  p95 %.4f  p50 %.4f  mean %.4f"%(
  base,n,gaps[-1],gaps[int(n*0.99)],gaps[int(n*0.95)],gaps[n//2],sum(gaps)/n))
print("  frac over .02L: %.3f   over .04L: %.3f"%(
  sum(1 for g in gaps if g>0.02)/n, sum(1 for g in gaps if g>0.04)/n))
# where are the worst offenders? report band (inner vs outer ring face)
import math
cx=sum(v.co[ax[1]] for v in pl.data.vertices)/len(pl.data.vertices)
cy=sum(v.co[ax[2]] for v in pl.data.vertices)/len(pl.data.vertices)
rows=[]
for v in pl.data.vertices:
    ok,loc,nor,idx = obj.closest_point_on_mesh(v.co)
    if not ok: continue
    r=math.hypot(v.co[ax[1]]-cx, v.co[ax[2]]-cy)
    rows.append(((v.co-loc).length, r, math.degrees(math.atan2(v.co[ax[2]]-cy, v.co[ax[1]]-cx))%360))
rows.sort(reverse=True)
rmin=min(r for _,r,_ in rows); rmax=max(r for _,r,_ in rows)
print("  ring radius range %.4f..%.4f"%(rmin,rmax))
for g,r,a in rows[:8]:
    print("    worst gap %.4f  ring_r %.4f (%s face)  angle %5.1f"%(
      g,r,"outer" if r> (rmin+rmax)/2 else "inner",a))
