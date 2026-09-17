import bpy, sys, math, os
argv = sys.argv[sys.argv.index("--")+1:]
glb, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 8
sc.cycles.device = 'CPU'
sc.render.film_transparent = False

body = max((o for o in sc.objects if o.type=="MESH" and not o.name.startswith("zz_")),
           key=lambda o: len(o.data.vertices))
rig = next((o for o in sc.objects if o.type=="ARMATURE"), None)
jaw = rig.pose.bones.get("LowerJaw") if rig else None

# Frame from the authored Cavity.  The cavity is by construction ventral and
# near the nose, so it identifies the model's own axes unambiguously:
#   forward = the longest body axis, signed towards the cavity;
#   up      = the axis on which the cavity sits furthest OFF centre (it is a
#             ventral feature), signed away from the cavity;
#   lateral = whatever is left.
import mathutils
cav = bpy.data.objects["zz_Cavity"]
bpts = [body.matrix_world @ v.co for v in body.data.vertices]
lo = [min(p[i] for p in bpts) for i in range(3)]
hi = [max(p[i] for p in bpts) for i in range(3)]
ext = [hi[i] - lo[i] for i in range(3)]
mid = [(lo[i] + hi[i]) * .5 for i in range(3)]
L = max(ext)
fI = ext.index(L)
cpts = [cav.matrix_world @ v.co for v in cav.data.vertices]
head = mathutils.Vector([sum(p[i] for p in cpts) / len(cpts) for i in range(3)])
nose_sign = 1.0 if head[fI] > mid[fI] else -1.0
rest = [i for i in (0, 1, 2) if i != fI]
# the ventral axis is the one where the cavity is most off-centre
off = [abs(head[i] - mid[i]) / max(ext[i], 1e-9) for i in range(3)]
uI = rest[0] if off[rest[0]] > off[rest[1]] else rest[1]
lat = rest[1] if uI == rest[0] else rest[0]
up_sign = -1.0 if head[uI] < mid[uI] else 1.0   # +up points AWAY from the mouth

world = bpy.data.worlds.new("W"); sc.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (.05,.07,.10,1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.0

def add_light(loc, energy):
    d = bpy.data.lights.new("L", type='AREA'); d.energy = energy; d.size = 0.5*L
    o = bpy.data.objects.new("L", d); o.location = loc
    sc.collection.objects.link(o)
    tr = o.constraints.new('TRACK_TO'); tr.target = key_empty
    tr.track_axis='TRACK_NEGATIVE_Z'; tr.up_axis='UP_Y'

aim = head.copy()
aim[uI] += up_sign * .045 * L   # look at the jaw line, not the throat floor
key_empty = bpy.data.objects.new("aim", None); key_empty.location = aim
sc.collection.objects.link(key_empty)

def at(forward, up, lateral):
    """Offset from the mouth centre in the model's own measured frame."""
    v = [0.0, 0.0, 0.0]
    v[fI] = forward * nose_sign
    v[uI] = up * up_sign
    v[lat] = lateral
    return (head.x + v[0], head.y + v[1], head.z + v[2])

add_light(at(.35 * L, .35 * L, .45 * L), 260 * L * L)
add_light(at(.10 * L, .25 * L, -.55 * L), 130 * L * L)
add_light(at(.45 * L, -.30 * L, .10 * L), 120 * L * L)

cam_data = bpy.data.cameras.new("C"); cam_data.lens = 50
cam = bpy.data.objects.new("C", cam_data); sc.collection.objects.link(cam); sc.camera = cam
# three-quarter from in front, slightly below the jaw so the ventral mouth
# and both tooth strips are visible.
cam.location = at(.58 * L, .30 * L, .46 * L)
c = cam.constraints.new('TRACK_TO'); c.target = key_empty
c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'

sc.render.resolution_x = 480; sc.render.resolution_y = 300
sc.render.image_settings.file_format='PNG'
panels=[]
for i, deg in enumerate((0.0, 25.0)):
    if jaw:
        jaw.rotation_mode='XYZ'
        jaw.rotation_euler = (math.radians(deg), 0, 0)
    bpy.context.view_layer.update()
    p = "/private/tmp/_L1bpanel%d.png" % i
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    panels.append(p)

# compose side by side
img=[bpy.data.images.load(p) for p in panels]
W,H=480,300
comp=bpy.data.images.new("comp", width=W*2, height=H)
px=[list(im.pixels) for im in img]
buf=[0.0]*(W*2*H*4)
for y in range(H):
    for x in range(W):
        for ch in range(4):
            buf[(y*(W*2)+x)*4+ch]=px[0][(y*W+x)*4+ch]
            buf[(y*(W*2)+W+x)*4+ch]=px[1][(y*W+x)*4+ch]
comp.pixels=buf
comp.filepath_raw=out
comp.file_format='PNG'
comp.save()
print("RENDERED", out)
