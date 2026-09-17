import sys
from pathlib import Path
ROOT = Path("/Users/lucille/greenguard-usa-web/play/razorfin")
sys.path.insert(0, str(ROOT/"tools"))
import bpy
from sharklib import accessories as acc
bpy.ops.wm.read_factory_settings(use_empty=True)
kit = acc._import_kit("plate_row.glb")
b = acc._bounds(kit)
print("KIT plate_row bounds", {k:round(v,4) for k,v in b.items()}, "verts",len(kit.data.vertices))
ys = sorted(set(round(v.co.y,4) for v in kit.data.vertices))
print("distinct y:", ys)
step=0.10; y0=b["ymin"]
import collections
g=collections.defaultdict(list)
for v in kit.data.vertices:
    idx=int(round((v.co.y-y0)/step))
    g[idx].append(v.co)
for idx in sorted(g):
    zs=[p.z for p in g[idx]]; yy=[p.y for p in g[idx]]
    factor=max(0.35,1.0-0.105*idx)
    base_c,top_c=-0.055*factor,0.25*factor
    print("  plate idx",idx,"n",len(g[idx]),"y %.3f..%.3f"%(min(yy),max(yy)),"z %.4f..%.4f"%(min(zs),max(zs)),
          "factor %.3f base_c %.4f top_c %.4f"%(factor,base_c,top_c),
          "local_u range %.3f..%.3f"%(max(0,min(1,(min(zs)-base_c)/(top_c-base_c))), max(0,min(1,(max(zs)-base_c)/(top_c-base_c)))))
