"""L1d geometry gates: lip band height, teeth seated on rim."""
import bpy, sys, os, json
sys.path.insert(0, os.path.abspath("tools"))
argv = sys.argv[sys.argv.index("--")+1:]
path = argv[0]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
objs = {o.name: o for o in bpy.data.objects if o.type == "MESH"}
def find(sub):
    for n,o in objs.items():
        if sub.lower() in n.lower(): return o
    return None
body = max((o for o in objs.values()
            if not any(k in o.name.lower() for k in ("lip","teeth","cavity"))),
           key=lambda o: len(o.data.vertices))
def world(o): return [o.matrix_world @ v.co for v in o.data.vertices]
bw = world(body)
L = max(p.z for p in bw) - min(p.z for p in bw)   # long axis after export
# determine long axis
ext = [max(p[i] for p in bw)-min(p[i] for p in bw) for i in range(3)]
la = ext.index(max(ext)); L = ext[la]
up = [i for i in range(3) if i != la]
res = {"file": os.path.basename(path), "L": L, "long_axis": la}
lip = find("LowerLip")
if lip:
    lw = world(lip)
    # band height = extent on the smallest non-long axis of the lip itself
    lext = [max(p[i] for p in lw)-min(p[i] for p in lw) for i in range(3)]
    band = min(lext[i] for i in up)
    res["lip_band_L"] = band / L
    res["lip_band_PASS"] = band <= .02 * L
cav = find("Cavity")
cw = world(cav) if cav else []
up_axis = [i for i in range(3) if i != la]
# the cavity front rim rows are its extreme vertices along the long axis
if cw:
    fy = max(p[la] for p in cw)
    rim_pts = [p for p in cw if p[la] >= fy - .02 * L]
    zc = sum(p[up_axis[1]] for p in rim_pts) / len(rim_pts)
    rim_upper = [p for p in rim_pts if p[up_axis[1]] >= zc]
    rim_lower = [p for p in rim_pts if p[up_axis[1]] < zc]
else:
    rim_upper = rim_lower = []
import collections
for role, sub, rimpts in (("upper","UpperTeeth",rim_upper), ("lower","LowerTeeth",rim_lower)):
    t = find(sub)
    if not t or not rimpts: continue
    tw = world(t)
    cols = collections.defaultdict(list)
    for p in tw:
        cols[round(p[up_axis[0]], 4)].append(p)
    ds = []
    for pts in cols.values():
        ds.append(min(min((p-q).length for q in rimpts) for p in pts))
    ds.sort()
    seat = ds[int(.75*(len(ds)-1))]
    res[role+"_teeth_seat_L"] = seat / L
    res[role+"_teeth_seat_PASS"] = seat <= .005 * L
print("L1DGATE " + json.dumps(res))
