"""Razorfin shark asset pipeline (Blender 3.6, headless).

  blender -b --python tools/shark_bake.py -- --in model.glb --out sharky_gw.glb \
      --tris 7000 --tex 1024 [--name greatwhite]

Imports a high-poly textured shark (glTF/OBJ/FBX), isolates the real shark
body from any photogrammetry backdrop / studio prop, decimates to the tri
budget, bakes the source colour + a tangent normal map from the high mesh
onto the low mesh, builds a nose->tail spine armature plus a Head and
LowerJaw bone with automatic weights, and exports a GLB with the same bone
names shark3d.js already consumes (Head, LowerJaw, Neck, Spine*, Tail*).

Notes on the hard-won bits:

* Sketchfab photogrammetry scans ship as KHR_materials_unlit. Blender's glTF
  importer wires those to an *Emission* shader with no Principled BSDF, so a
  bake of type DIFFUSE/COLOR reads zero albedo and writes a pure black atlas.
  Every high material is therefore rebuilt as a flat Emission of its base
  colour texture and baked with type EMIT, which transfers the photo colour
  faithfully and identically for unlit and PBR sources alike.
* Those same scans include a 12-triangle environment Cube and, in some
  artist models, a water plane / turntable far from the shark. Both wreck
  the bounding box (and therefore the normalisation and the armature), so
  junk parts are dropped by a size/distance heuristic before anything else.
* Collapse decimation shreds non-manifold scans, so the reducer first voxel-
  remeshes the high mesh at a small voxel (manifold-first), THEN collapses to
  the budget in gentle passes (ratio >= 0.1). See scratchpad NOTES-tear.md.
"""
import bpy, sys, os, math, argparse, bmesh
import mathutils

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--in', dest='inp', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--tris', type=int, default=7000)
ap.add_argument('--tex', type=int, default=1024)
ap.add_argument('--name', default='shark')
ap.add_argument('--length', type=float, default=1.0, help='target length (nose->tail) in scene units')
ap.add_argument('--flip', action='store_true', help='force nose to the other end of the long axis')
a = ap.parse_args(argv)

TARGET = a.tris
TOL = 0.08

bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(a.inp)[1].lower()
if ext in ('.glb', '.gltf'):
    bpy.ops.import_scene.gltf(filepath=a.inp)
elif ext == '.obj':
    bpy.ops.wm.obj_import(filepath=a.inp)
elif ext == '.fbx':
    bpy.ops.import_scene.fbx(filepath=a.inp)
else:
    raise SystemExit('unsupported input ' + ext)


# ---------------------------------------------------------------- rest pose
# Multi-object rigged sources (megalodonrex, whitepointer, tiger_mg) import
# with an action already applied to the armature. Baking frame 0 of a swim
# cycle gives a bent, mis-placed shark, so clear every animation and reset
# each bone to its rest transform BEFORE the modifiers are evaluated.
for ob in bpy.data.objects:
    if ob.animation_data:
        ob.animation_data_clear()
    if ob.type == 'ARMATURE':
        for pb in ob.pose.bones:
            pb.matrix_basis.identity()
        ob.data.pose_position = 'REST'
for sk in bpy.data.shape_keys:
    if sk.animation_data:
        sk.animation_data_clear()
bpy.context.view_layer.update()


# ------------------------------------------------------- flatten hierarchy
# Evaluate each mesh with its modifiers (armature at rest) and its full world
# matrix baked in, so parent transforms in deep Sketchfab hierarchies cannot
# leave a part scaled or displaced.
dg = bpy.context.evaluated_depsgraph_get()
parts = []
for ob in [o for o in bpy.data.objects if o.type == 'MESH']:
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    me.transform(ob.matrix_world)
    if ob.matrix_world.determinant() < 0:
        me.flip_normals()
    new = bpy.data.objects.new(ob.name + '_flat', me)
    bpy.context.collection.objects.link(new)
    parts.append(new)
for ob in list(bpy.data.objects):
    if ob not in parts:
        bpy.data.objects.remove(ob, do_unlink=True)
if not parts:
    raise SystemExit('no mesh in input')


# --------------------------------------------------- drop backdrop / props
def stats(o):
    if not o.data.polygons:
        return None
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    cs = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    lo = mathutils.Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs)))
    hi = mathutils.Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
    return dict(o=o, tris=tris, lo=lo, hi=hi, ctr=(lo + hi) / 2, diag=(hi - lo).length)


info = [s for s in (stats(o) for o in parts) if s]
# The shark is the largest connected body by triangle count. Everything that
# is a trivial box (an unlit environment Cube is exactly 12 tris) or that sits
# well away from the main body is a prop: backdrop, water plane, turntable.
info.sort(key=lambda s: -s['tris'])
main = info[0]
keep, drop = [], []
for s in info:
    if s is main:
        keep.append(s)
        continue
    reason = None
    if s['tris'] <= 24:
        reason = 'box-prop'
    else:
        # overlap test against the main body's box, generously padded
        pad = main['diag'] * 0.05
        sep = any(s['lo'][i] > main['hi'][i] + pad or s['hi'][i] < main['lo'][i] - pad for i in range(3))
        if sep:
            reason = 'disjoint'
        elif s['tris'] < main['tris'] * 0.002:
            reason = 'tiny'
    (drop if reason else keep).append(s)
    if reason:
        print('DROP %-28s tris=%-8d %s' % (s['o'].name, s['tris'], reason))
for s in drop:
    bpy.data.objects.remove(s['o'], do_unlink=True)
parts = [s['o'] for s in keep]
print('KEEP', len(parts), 'parts, tris', sum(s['tris'] for s in keep))

bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
if len(parts) > 1:
    bpy.ops.object.join()
high = bpy.context.view_layer.objects.active
high.name = 'high'


# --------------------------------------- rebuild high materials as EMIT-able
# KHR_materials_unlit imports as Emission-through-MixShader: no Principled,
# no diffuse albedo, so a DIFFUSE bake is black. Normalise EVERY high slot to
# a single Emission node fed by that slot's base colour texture (or its flat
# base colour), and bake type EMIT. That is lighting-independent and works
# the same for unlit scans and PBR artist models.
def base_color_source(mat):
    """Return ('TEX', image_node_settings) or ('RGB', colour) for a material."""
    if not mat or not mat.use_nodes:
        return ('RGB', list(mat.diffuse_color) if mat else [0.5, 0.5, 0.5, 1.0])
    nt = mat.node_tree
    # Prefer the texture actually feeding base colour / emission / a mix.
    best = None
    for n in nt.nodes:
        if n.type != 'TEX_IMAGE' or not n.image:
            continue
        nm = (n.image.name or '').lower()
        if any(k in nm for k in ('normal', 'metallicroughness', 'roughness', 'occlusion', 'orm', '_arm')):
            continue
        if n.image.colorspace_settings.name == 'Non-Color':
            continue
        score = 2 if 'basecolor' in nm or 'diffuse' in nm or 'albedo' in nm else 1
        # a texture wired onwards beats an orphan
        if n.outputs['Color'].links:
            score += 2
        if best is None or score > best[0]:
            best = (score, n)
    if best:
        return ('TEX', best[1])
    for n in nt.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            return ('RGB', list(n.inputs['Base Color'].default_value))
        if n.type == 'EMISSION':
            return ('RGB', list(n.inputs['Color'].default_value))
    return ('RGB', list(mat.diffuse_color))


if not high.data.materials:
    hm = bpy.data.materials.new('highmat')
    hm.use_nodes = True
    high.data.materials.append(hm)

for si, slot in enumerate(high.material_slots):
    src = slot.material
    kind, payload = base_color_source(src)
    flat = bpy.data.materials.new('emit_%d' % si)
    flat.use_nodes = True
    nt = flat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    if kind == 'TEX':
        old = payload
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = old.image
        tex.interpolation = old.interpolation
        tex.extension = old.extension
        tex.image.colorspace_settings.name = 'sRGB'
        # carry the original UV map / mapping if the source used one
        uvn = nt.nodes.new('ShaderNodeUVMap')
        srcuv = ''
        if old.inputs['Vector'].is_linked:
            fn = old.inputs['Vector'].links[0].from_node
            if fn.type == 'UVMAP':
                srcuv = fn.uv_map
        uvn.uv_map = srcuv or (high.data.uv_layers[0].name if high.data.uv_layers else '')
        nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])
        nt.links.new(tex.outputs['Color'], em.inputs['Color'])
        print('SLOT %d tex %s %s' % (si, old.image.name, tuple(old.image.size)))
    else:
        em.inputs['Color'].default_value = (payload + [1, 1, 1, 1])[:4]
        print('SLOT %d flat %s' % (si, tuple(round(v, 3) for v in payload[:3])))
    slot.material = flat

# Vertex colours beat a flat grey when the source has no textures at all.
if high.data.color_attributes and all(
        not any(n.type == 'TEX_IMAGE' for n in s.material.node_tree.nodes)
        for s in high.material_slots):
    ca = high.data.color_attributes[0].name
    for slot in high.material_slots:
        nt = slot.material.node_tree
        em = next(n for n in nt.nodes if n.type == 'EMISSION')
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = ca
        nt.links.new(vc.outputs['Color'], em.inputs['Color'])
    print('VCOL using', ca)


# --------------------------------------------------------------- orient
bpy.ops.object.select_all(action='DESELECT')
high.select_set(True)
bpy.context.view_layer.objects.active = high
high.rotation_mode = 'XYZ'
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
high.location = (0, 0, 0)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def dims():
    return list(high.dimensions)


def rotate(euler):
    high.rotation_euler = euler
    bpy.ops.object.transform_apply(rotation=True)


print('ORIENT raw dims', tuple(round(v, 3) for v in dims()))
# 1. longest axis -> Y
ax = max(range(3), key=lambda i: dims()[i])
if ax == 0:
    rotate((0, 0, math.radians(90)))
elif ax == 2:
    rotate((math.radians(90), 0, 0))
# 2. of the two remaining axes, the taller (dorsal-ventral) must be Z.
#    A shark is much taller than it is wide, so if X currently exceeds Z, roll.
if dims()[0] > dims()[2]:
    rotate((0, math.radians(90), 0))
print('ORIENT axis-aligned', tuple(round(v, 3) for v in dims()))

# 3. Nose to +Y. A shark's mass is concentrated at the head end and its
#    cross-section tapers to a thin caudal fin, so the half with the greater
#    mean |Z| cross-section and more volume is the head.
me = high.data
ys = [v.co.y for v in me.vertices]
ymid = (min(ys) + max(ys)) / 2
front = [v for v in me.vertices if v.co.y > ymid]
back = [v for v in me.vertices if v.co.y <= ymid]


def girth(vs):
    if not vs:
        return 0.0
    # mean radius in the XZ plane = how "thick" that half is
    return sum(math.hypot(v.co.x, v.co.z) for v in vs) / len(vs)


gf, gb = girth(front), girth(back)
print('ORIENT girth front(+Y)=%.4f back(-Y)=%.4f' % (gf, gb))
if (gb > gf) != bool(a.flip):
    rotate((0, 0, math.radians(180)))
    print('ORIENT flipped nose to +Y')

# 4. normalise length and centre on bounds
L = high.dimensions.y
high.scale = (a.length / L,) * 3
bpy.ops.object.transform_apply(scale=True)
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
high.location = (0, 0, 0)
bpy.ops.object.transform_apply(location=True)
high_tris = sum(len(p.vertices) - 2 for p in high.data.polygons)
print('HIGH tris', high_tris, 'dims', tuple(round(v, 3) for v in high.dimensions))


# ------------------------------------------------------------------ low mesh
bpy.ops.object.select_all(action='DESELECT')
high.select_set(True)
bpy.context.view_layer.objects.active = high
bpy.ops.object.duplicate()
low = bpy.context.view_layer.objects.active
low.name = a.name


def tris_of(o):
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)


def apply_mod(o, mod):
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=mod.name)


def clean(o, weld=1e-5):
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=weld)
    bpy.ops.mesh.delete_loose()
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')


# NOTES-tear.md: a single collapse pass at ratio << 0.1 on a NON-MANIFOLD
# photogrammetry soup overshoots/shreds (hammerhead: 782297 -> 15645 in one
# pass, torn fins), and a coarse voxel remesh AFTER collapse dissolves every
# feature thinner than a voxel (fin edges, tail lobes). Order of operations
# that keeps thin silhouettes intact:
#   1. voxel-remesh the HIGH mesh FIRST, small voxel (~0.0035 of the length),
#      adaptivity 0 -> watertight manifold, no fragments, fins survive;
#   2. collapse-decimate the manifold result to the budget in gentle passes,
#      ratio >= 0.1 per pass. Collapse on a manifold mesh keeps thin edges;
#      it only shreds non-manifold soup.
low.data.materials.clear()
clean(low, weld=a.length * 0.0006)
n = tris_of(low)
print('LOW after weld', n)

rm = low.modifiers.new('rm', 'REMESH')
rm.mode = 'VOXEL'
rm.adaptivity = 0.0
rm.voxel_size = a.length * 0.0035
apply_mod(low, rm)
print('  pre-collapse voxel remesh %.5f -> %d tris (manifold)' %
      (rm.voxel_size, tris_of(low)))

_pass = 0
while tris_of(low) > TARGET * (1 + TOL):
    n = tris_of(low)
    m = low.modifiers.new('dec', 'DECIMATE')
    m.decimate_type = 'COLLAPSE'
    m.use_collapse_triangulate = True
    # gentle passes only: ratio per pass >= 0.1, loop until inside budget
    m.ratio = max(0.1, min(0.95, (TARGET * 0.97) / n))
    apply_mod(low, m)
    print('  dec pass %d %d -> %d (ratio %.4f)' % (_pass, n, tris_of(low), m.ratio))
    _pass += 1
    if _pass > 20:
        print('  WARNING: collapse loop hit pass cap')
        break

# final trim to land inside the window (only reachable if the cap tripped)
n = tris_of(low)
if n > TARGET * (1 + TOL):
    m = low.modifiers.new('dec', 'DECIMATE')
    m.use_collapse_triangulate = True
    m.ratio = max(0.1, (TARGET * 0.99) / n)
    apply_mod(low, m)

clean(low)
bpy.context.view_layer.objects.active = low
bpy.ops.object.select_all(action='DESELECT')
low.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.quads_convert_to_tris(quad_method='BEAUTY', ngon_method='BEAUTY')
bpy.ops.mesh.faces_shade_smooth()
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.006)
bpy.ops.object.mode_set(mode='OBJECT')
low_tris = tris_of(low)
print('LOW tris', low_tris, 'dims', tuple(round(v, 3) for v in low.dimensions))


# --------------------------------------------------------------- bake target
img_d = bpy.data.images.new(a.name + '_diffuse', a.tex, a.tex)
img_d.generated_color = (0.5, 0.5, 0.5, 1.0)
img_n = bpy.data.images.new(a.name + '_normal', a.tex, a.tex, float_buffer=False)
img_n.colorspace_settings.name = 'Non-Color'
img_n.generated_color = (0.5, 0.5, 1.0, 1.0)

mat = bpy.data.materials.new(a.name + '_mat')
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes['Principled BSDF']
tex_d = nt.nodes.new('ShaderNodeTexImage'); tex_d.image = img_d
tex_n = nt.nodes.new('ShaderNodeTexImage'); tex_n.image = img_n
nmap = nt.nodes.new('ShaderNodeNormalMap')
nt.links.new(tex_d.outputs['Color'], bsdf.inputs['Base Color'])
nt.links.new(tex_n.outputs['Color'], nmap.inputs['Color'])
nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
bsdf.inputs['Roughness'].default_value = 0.45
bsdf.inputs['Metallic'].default_value = 0.0
low.data.materials.clear()
low.data.materials.append(mat)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 4
scene.cycles.device = 'CPU'
scene.cycles.use_denoising = False
scene.render.bake.use_selected_to_active = True
scene.render.bake.use_clear = True
scene.render.bake.margin = 8
# The low mesh sits inside the high shell after decimation, sometimes by a
# lot on the fins. Generous, symmetric cage limits catch both directions.
scene.render.bake.cage_extrusion = a.length * 0.02
scene.render.bake.max_ray_distance = a.length * 0.05
scene.render.use_bake_multires = False

bpy.ops.object.select_all(action='DESELECT')
high.select_set(True)
low.select_set(True)
bpy.context.view_layer.objects.active = low


def bake(target_node, **kw):
    for node in nt.nodes:
        node.select = False
    target_node.select = True
    nt.nodes.active = target_node
    bpy.ops.object.bake(**kw)


# EMIT, not DIFFUSE: the high materials are pure emission of the source
# colour, so this is a faithful lighting-free albedo transfer for unlit
# photogrammetry and PBR artist models alike.
bake(tex_d, type='EMIT', use_selected_to_active=True)

px = list(img_d.pixels)
lit = sum(1 for i in range(0, len(px), 4) if px[i] + px[i + 1] + px[i + 2] > 0.02)
cov = lit / (len(px) / 4)
mean = sum(px[i] + px[i + 1] + px[i + 2] for i in range(0, len(px), 4)) / (len(px) / 4 * 3)
print('BAKE diffuse coverage %.3f mean %.4f' % (cov, mean))
if cov < 0.15:
    # Rays missed: widen the cage substantially and retry once.
    scene.render.bake.cage_extrusion = a.length * 0.08
    scene.render.bake.max_ray_distance = a.length * 0.15
    bake(tex_d, type='EMIT', use_selected_to_active=True)
    px = list(img_d.pixels)
    lit = sum(1 for i in range(0, len(px), 4) if px[i] + px[i + 1] + px[i + 2] > 0.02)
    print('BAKE diffuse retry coverage %.3f' % (lit / (len(px) / 4)))

bake(tex_n, type='NORMAL', use_selected_to_active=True, normal_space='TANGENT')
for img in (img_d, img_n):
    img.pack()
bpy.data.objects.remove(high, do_unlink=True)


# ---------------------------------------------------------------- armature
bb = [mathutils.Vector(c) for c in low.bound_box]
ymin = min(c.y for c in bb); ymax = max(c.y for c in bb)
zmin = min(c.z for c in bb); zmax = max(c.z for c in bb)
L = ymax - ymin
zc = (zmin + zmax) / 2
H = zmax - zmin

arm = bpy.data.armatures.new(a.name + '_arm')
rig = bpy.data.objects.new(a.name + '_rig', arm)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
stations = [('Tail3', 0.00), ('Tail2', 0.12), ('Tail1', 0.24), ('Spine2', 0.38),
            ('Spine1', 0.52), ('Neck', 0.66), ('Head', 0.80), ('Nose', 1.00)]
prev = None
for i in range(len(stations) - 1):
    name, t0 = stations[i]
    t1 = stations[i + 1][1]
    b = arm.edit_bones.new(name)
    b.head = (0, ymin + L * t0, zc)
    b.tail = (0, ymin + L * t1, zc)
    if prev:
        b.parent = prev
        b.use_connect = True
    prev = b
jaw = arm.edit_bones.new('LowerJaw')
jaw.head = (0, ymin + L * 0.80, zc - H * 0.18)
jaw.tail = (0, ymin + L * 0.98, zc - H * 0.22)
jaw.parent = arm.edit_bones['Head']
bpy.ops.object.mode_set(mode='OBJECT')

bpy.ops.object.select_all(action='DESELECT')
low.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')

# Lower jaw: the head-span vertices below the mouth line, blended in over a
# band so the corner of the mouth does not tear when the jaw opens.
vg = low.vertex_groups.get('LowerJaw') or low.vertex_groups.new(name='LowerJaw')
hd = low.vertex_groups.get('Head')
zcut = zc - H * 0.06
for v in low.data.vertices:
    t = (v.co.y - ymin) / L
    if t <= 0.76 or v.co.z >= zcut:
        continue
    wy = min(1.0, (t - 0.76) / 0.06)
    wz = min(1.0, (zcut - v.co.z) / (H * 0.10))
    w = wy * wz
    if w <= 0.01:
        continue
    vg.add([v.index], w, 'REPLACE')
    if hd:
        try:
            hd.add([v.index], 1.0 - w, 'REPLACE')
        except RuntimeError:
            pass

for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)

bpy.ops.object.select_all(action='DESELECT')
low.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = low
bpy.ops.export_scene.gltf(filepath=a.out, export_format='GLB', use_selection=True,
                          export_apply=False, export_animations=False,
                          export_image_format='JPEG', export_jpeg_quality=85,
                          export_skins=True, export_yup=True)
print('LOW final tris', tris_of(low), 'dims', tuple(round(v, 4) for v in low.dimensions))
print('WROTE', a.out, os.path.getsize(a.out), 'bytes')
