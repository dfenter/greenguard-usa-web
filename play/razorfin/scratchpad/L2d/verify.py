import sys, math
from pathlib import Path
ROOT = Path("/Users/lucille/greenguard-usa-web/play/razorfin")
sys.path.insert(0, str(ROOT/"tools"))
import bpy
from sharklib import io as _io, accessories as acc

args = sys.argv[sys.argv.index("--")+1:]
base, kit = args[0], args[1]

def load():
    high,_ = _io.prepare_source(str(ROOT/("assets/models/%s.glb"%base)), length=1.0, flip=False)
    high.name="low"
    for o in list(bpy.context.scene.objects):
        if o.type!="MESH": bpy.data.objects.remove(o, do_unlink=True)
    return high

obj = load()
m = acc.measure(obj); ax=acc._axis_ids(m)
dh = acc._dorsal_height(obj,m)
print("VERIFY base=%s kit=%s L=%.4f dorsal_fin_height=%.5f"%(base,kit,m.L,dh))

# snapshot head verts forward of t .75, measured AFTER _clean_for_boolean,
# which is the state the fuse actually starts from (it halves the raw scan).
acc._clean_for_boolean(obj)
m = acc.measure(obj)
pre_head = sorted(tuple(round(c,6) for c in v.co) for v in obj.data.vertices
                  if acc._station(v.co,m) >= 0.75)
pre_tris = acc._triangles(obj)
print("  pre-fuse tris=%d  head verts(t>=.75)=%d"%(pre_tris,len(pre_head)))

# placement-only metrics
kobj = acc._import_kit(kit)
placed = acc._place_kit_object(obj, kobj, {"kit":kit,"placement":("neck" if "collar" in kit else "dorsal")})
if "plate" in kit:
    import collections
    sts=collections.defaultdict(list)
    for v in placed.data.vertices:
        sts[round(acc._station(v.co,m),2)].append(v.co[ax[2]])
    print("  PLATE heights above ridge (rule: largest ~= .55 x %.5f = %.5f):"%(dh,0.55*dh))
    hs=[]
    for t in sorted(sts):
        zs=sts[t]; ridge=acc._dorsal_ridge(obj,m,t)
        h=max(zs)-ridge; hs.append(h)
        print("    t=%.2f top=%.4f ridge=%.4f height_above_ridge=%.4f (%.3f x dorsal) sink=%.4f"%(
            t,max(zs),ridge,h,h/dh,ridge-min(zs)))
    print("  PLATE max height %.4f = %.3f x dorsal fin height (target 0.55)"%(max(hs),max(hs)/dh))
    print("  PLATE count(stations) %d"%len(sts))
else:
    ct = placed.get("rf_collar_ratio", None)
    print("  COLLAR ratio", ct, "station", placed.get("rf_collar_station"), "inner", placed.get("rf_collar_inner_radius"))
    # gap between ring inner surface and body
    from mathutils import kdtree
    tree=kdtree.KDTree(len(obj.data.vertices))
    for i,v in enumerate(obj.data.vertices): tree.insert(v.co,i)
    tree.balance()
    gaps=[tree.find(v.co)[2] for v in placed.data.vertices]
    print("  COLLAR max gap to body %.4f (<= %.4f = .02L)  mean %.4f"%(max(gaps),0.02*m.L,sum(gaps)/len(gaps)))
    # silhouette overhang side(up axis) and top(across axis)
    for label,a in (("side/up",ax[2]),("top/across",ax[1])):
        bmin=min(v.co[a] for v in obj.data.vertices); bmax=max(v.co[a] for v in obj.data.vertices)
        kmin=min(v.co[a] for v in placed.data.vertices); kmax=max(v.co[a] for v in placed.data.vertices)
        over=max(bmin-kmin, kmax-bmax, 0.0)
        print("  COLLAR %s overhang %.4f (<= %.4f = .04L)"%(label,over,0.04*m.L))
acc._remove_object(placed)

# full fuse
obj = load()
acc._clean_for_boolean(obj)
m2 = acc.measure(obj)
low, hi = acc.apply_accessories(obj, {"kits":[{"kit":kit,"placement":("neck" if "collar" in kit else "dorsal"),"fused":True}], "tri_budget":9000})
post = acc.measure(low)
post_head = sorted(tuple(round(c,6) for c in v.co) for v in low.data.vertices
                   if acc._station(v.co,post) >= 0.75)
print("  GATE added_tris=%d (<=1500)  components=%d  body_preserved=%s"%(
    low.get("rf_accessory_added_triangles"), acc.loose_part_count(low), post.L >= m2.L*0.75))
print("  GATE head verts t>=.75  pre=%d post=%d  identical=%s"%(len(pre_head),len(post_head), pre_head==post_head))
if pre_head!=post_head:
    ps=set(pre_head); qs=set(post_head)
    print("    missing from post: %d   new in post: %d"%(len(ps-qs),len(qs-ps)))
    print("    PRESERVED (pre subset of post): %s"%(ps<=qs))
