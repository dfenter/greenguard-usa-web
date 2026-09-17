import bpy,sys,os
sys.path.insert(0,os.path.abspath("tools"))
from sharklib import io
argv=sys.argv[sys.argv.index("--")+1:]
_h,obj=io.prepare_source(argv[0])
m=io.measure(obj)
L=m["L"];ymin=m["ymin"];zc=m["zc"];H=m["H"]
print("=== %s"%argv[0])
print("JAW",m["jaw_line"])
print("L %.4f zc %.5f H %.5f nose_y %.4f"%(L,zc,H,m["landmarks"]["nose"].y))
for b in range(24):
    t0=0.80+0.18*b/24;t1=0.80+0.18*(b+1)/24
    below=sorted(v.co.z for v in obj.data.vertices if t0<=(v.co.y-ymin)/L<t1 and v.co.z<zc)
    if below:
        print("bin %2d t=%.3f n=%4d p10=%.4f min=%.4f"%(b,t0,len(below),below[int(.10*(len(below)-1))],below[0]))
    else: print("bin %2d t=%.3f EMPTY"%(b,t0))
