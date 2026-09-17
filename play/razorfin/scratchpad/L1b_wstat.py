import bpy,sys
for path in sys.argv[sys.argv.index("--")+1:]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    b=max((o for o in bpy.context.scene.objects if o.type=="MESH" and not o.name.startswith("zz_")),key=lambda o:len(o.data.vertices))
    jg=b.vertex_groups["LowerJaw"].index
    ws=sorted(w.weight for v in b.data.vertices for w in v.groups if w.group==jg and w.weight>0)
    if not ws: print(path.split('/')[-1],"NO JAW WEIGHTS"); continue
    print("%s n=%d min=%.3f p25=%.3f med=%.3f p90=%.3f max=%.3f  n>=0.9:%d"%(
        path.split('/')[-1],len(ws),ws[0],ws[len(ws)//4],ws[len(ws)//2],ws[int(len(ws)*.9)],ws[-1],sum(1 for w in ws if w>=.9)))
