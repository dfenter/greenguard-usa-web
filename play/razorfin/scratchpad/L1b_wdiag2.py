import bpy, sys
argv=sys.argv[sys.argv.index("--")+1:]
for path in argv:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    body=max((o for o in bpy.context.scene.objects if o.type=="MESH" and not o.name.startswith("zz_")),key=lambda o:len(o.data.vertices))
    jg=body.vertex_groups["LowerJaw"].index; hg=body.vertex_groups["Head"].index
    def w(v,g): return next((x.weight for x in v.groups if x.group==g),0.0)
    verts=body.data.vertices
    # TRUE anatomical axes in glTF yup frame: Z=fwd, Y=up
    fI,uI=2,1
    jaw=[v for v in verts if w(v,jg)>0.5]
    head=[v for v in verts if w(v,jg)<=0.5 and w(v,hg)>0.1]
    region=jaw+head
    P=lambda v:(body.matrix_world @ v.co)
    rp=[P(v) for v in region]
    minU=min(p[uI] for p in rp); maxU=max(p[uI] for p in rp); hh=maxU-minU
    minF=min(p[fI] for p in rp); maxF=max(p[fI] for p in rp); hl=maxF-minF
    lip=[v for v in verts if w(v,jg)>0.4 and (P(v)[uI]-minU)/hh<=0.15]
    allp=[P(v) for v in verts]
    bodyMinU=min(p[uI] for p in allp)
    print("%s TRUEAXIS headU %.4f..%.4f h=%.4f bodyMinU=%.4f | jaw>0.5=%d lip15%%=%d"%(
        path.split('/')[-1],minU,maxU,hh,bodyMinU,len(jaw),len(lip)))
    if jaw:
        ju=sorted((P(v)[uI]-minU)/hh for v in jaw)
        print("   jaw uFrac min=%.3f p25=%.3f med=%.3f max=%.3f"%(ju[0],ju[len(ju)//4],ju[len(ju)//2],ju[-1]))
