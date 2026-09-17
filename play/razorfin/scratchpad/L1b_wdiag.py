import bpy, sys
argv=sys.argv[sys.argv.index("--")+1:]
for path in argv:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    body=max((o for o in bpy.context.scene.objects if o.type=="MESH" and not o.name.startswith("zz_")),key=lambda o:len(o.data.vertices))
    jg=body.vertex_groups["LowerJaw"].index
    hg=body.vertex_groups["Head"].index
    def w(v,g): return next((x.weight for x in v.groups if x.group==g),0.0)
    verts=body.data.vertices
    jaw=[v for v in verts if w(v,jg)>0.5]
    head=[v for v in verts if w(v,jg)<=0.5 and w(v,hg)>0.1]
    region=jaw+head
    # probe uses forward=largest extent axis, up = 2nd largest. In glTF yup: y=up,z=fwd? check
    import mathutils
    pts=[body.matrix_world @ v.co for v in verts]
    ext=[max(p[i] for p in pts)-min(p[i] for p in pts) for i in range(3)]
    order=sorted(range(3),key=lambda i:-ext[i]); fI,uI=order[0],order[1]
    rp=[body.matrix_world @ v.co for v in region]
    minU=min(p[uI] for p in rp); maxU=max(p[uI] for p in rp)
    hh=maxU-minU
    lip=[v for v in verts if w(v,jg)>0.4 and ((body.matrix_world@v.co)[uI]-minU)/hh<=0.15]
    leak=[w(v,jg) for v in verts if 0.0<w(v,jg)<0.05]
    print("%s axes fwd=%d up=%d headU=%.4f..%.4f (h=%.4f) jaw>0.5=%d lip15%%=%d leak(0,.05)=%d"%(
        path.split('/')[-1],fI,uI,minU,maxU,hh,len(jaw),len(lip),len(leak)))
    if jaw:
        ju=[((body.matrix_world@v.co)[uI]-minU)/hh for v in jaw]
        print("   jaw vert uFrac range %.3f..%.3f  median %.3f"%(min(ju),max(ju),sorted(ju)[len(ju)//2]))
