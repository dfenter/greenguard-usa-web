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
* Collapse decimation alone undershoots badly on non-manifold scans, so the
  reducer falls back to a voxel remesh when a plain collapse cannot reach
  the budget.
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
ap.add_argument('--flatlum', action='store_true',
                help='equalise the baked diffuse so its luminance is FLAT along the '
                     'dorsal-ventral axis (removes a painted countershade that no '
                     'runtime shader can cancel); keeps detail contrast and chroma')
ap.add_argument('--flatlum-mean', type=float, default=0.5,
                help='target mean luminance for --flatlum (sRGB, default 0.5)')
ap.add_argument('--desat', type=float, default=0.0,
                help='pull the baked diffuse toward neutral by this fraction (0..1); '
                     'use with --flatlum to drop a photographic colour cast')
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


def is_outline(o):
    """True for a toon 'border' shell: an inverted, slightly inflated copy of
    the body drawn in flat black. whitepointer ships one per part, and because
    it encloses the real body it swallows every bake ray (coverage ~0.02)."""
    for slot in o.material_slots:
        m = slot.material
        if not m:
            continue
        nm = (m.name or '').lower()
        if 'border' in nm or 'outline' in nm:
            return True
        # flat near-black with no texture is an outline hull, never skin
        if m.use_nodes:
            has_tex = any(n.type == 'TEX_IMAGE' and n.image for n in m.node_tree.nodes)
            bs = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if not has_tex and bs and sum(bs.inputs['Base Color'].default_value[:3]) < 0.05:
                return True
    return False


for o in list(parts):
    if is_outline(o):
        print('DROP %-28s outline-shell' % o.name)
        parts.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)
if not parts:
    raise SystemExit('every part looked like an outline shell')

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
        # Overlap test against the main body's box. Photogrammetry scans are
        # split into many chunks that each cover a slab of the body, so a
        # chunk that merely fails to overlap the AABB is NOT junk -- only
        # drop something that is both well separated AND small. smoothhound's
        # 90k/83k chunks were real body and were being thrown away here.
        pad = main['diag'] * 0.05
        sep = any(s['lo'][i] > main['hi'][i] + pad or s['hi'][i] < main['lo'][i] - pad for i in range(3))
        if sep and s['tris'] < main['tris'] * 0.05:
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
# 1. Undo any arbitrary source rotation. Some sources (bullshark, an STL
#    merge) carry a node matrix that rotates the body ~36 degrees off axis,
#    which inflates the AABB into a near-cube and defeats a plain
#    longest-axis pick. Search yaw/pitch/roll for the rotation that minimises
#    the bounding-box volume: for an elongated body that is unambiguously the
#    natural axis-aligned pose.
# The search only needs the convex silhouette, so subsample: a full 1.5M-vert
# scan would make this O(minutes) for no better answer.
_vs = high.data.vertices
_stride = max(1, len(_vs) // 4000)
co = [_vs[i].co.copy() for i in range(0, len(_vs), _stride)]


def box_of(R):
    lo = [1e18] * 3
    hi = [-1e18] * 3
    for v in co:
        p = R @ v
        for i in range(3):
            if p[i] < lo[i]:
                lo[i] = p[i]
            if p[i] > hi[i]:
                hi[i] = p[i]
    return [hi[i] - lo[i] for i in range(3)]


# Only bother when the source is NOT already cleanly axis-aligned. An
# elongated shark that has been imported straight has an aspect ratio well
# above 2; a body rotated off-axis inflates its AABB toward a cube. Running
# the search on an already-correct model risks trading a good pose for a
# marginally smaller box.
d0 = dims()
aspect = max(d0) / max(1e-9, sorted(d0)[1])
if aspect >= 1.9:
    print('ORIENT already axis-aligned (aspect %.2f), skipping search' % aspect)
    step = None
else:
    step = math.radians(6)
best = None
if step is not None:
    rng = [i * step for i in range(int(math.radians(180) / step) + 1)]
    for rz in rng:
        for ry in rng:
            for rx in rng:
                R = mathutils.Euler((rx, ry, rz), 'XYZ').to_matrix()
                d = box_of(R)
                vol = d[0] * d[1] * d[2]
                if best is None or vol < best[0] * 0.999:
                    best = (vol, (rx, ry, rz), d)
    # refine around the coarse optimum
    c = best[1]
    fine = math.radians(1)
    for k in range(3):
        for delta in [i * fine for i in range(-6, 7)]:
            e = list(c)
            e[k] += delta
            R = mathutils.Euler(e, 'XYZ').to_matrix()
            d = box_of(R)
            vol = d[0] * d[1] * d[2]
            if vol < best[0] * 0.999:
                best = (vol, tuple(e), d)
        c = best[1]
    if best[1] != (0.0, 0.0, 0.0):
        rotate(best[1])
        print('ORIENT min-volume rot', tuple(round(math.degrees(v), 1) for v in best[1]),
              '->', tuple(round(v, 3) for v in dims()))

# 2. longest axis -> Y
ax = max(range(3), key=lambda i: dims()[i])
if ax == 0:
    rotate((0, 0, math.radians(90)))
elif ax == 2:
    rotate((math.radians(90), 0, 0))
# 3. Roll so the dorsal fin points +Z. Comparing raw X vs Z extents is not
#    enough: on a hammerhead the cephalofoil makes the body as wide as it is
#    tall, and on a bullhead the broad pectorals do the same (both came out
#    rolled 90 degrees). The dorsal fin is instead the single most reliable
#    marker -- it is the farthest the surface ever gets from the body axis,
#    and it always sits on the animal's back. So: find the axis-and-sign whose
#    extreme is reached by the fewest vertices (a fin is a thin blade, unlike
#    the broad flanks) and rotate that to +Z.
# Subsample: scanning 1.8M vertices four times over costs many minutes and
# the answer does not change.
_dv = high.data.vertices
_dstride = max(1, len(_dv) // 60000)
_dco = [_dv[i].co.copy() for i in range(0, len(_dv), _dstride)]
_dy0 = min(p.y for p in _dco)
_dy1 = max(p.y for p in _dco)


def spike_score(axis, sign):
    """How 'fin-like' the extreme along (axis, sign) is: small tip area,
    concentrated near the middle of the body length."""
    vals = [p[axis] * sign for p in _dco]
    m = max(vals)
    rng = m - min(vals)
    if rng <= 0:
        return 0.0
    band = m - rng * 0.12
    tip = [_dco[i] for i, val in enumerate(vals) if val >= band]
    if not tip:
        return 0.0
    # a dorsal fin is a narrow blade: few verts, and not out at the nose/tail
    mid = sum(p.y for p in tip) / len(tip)
    centrality = 1.0 - abs((mid - (_dy0 + _dy1) / 2) / max(1e-9, (_dy1 - _dy0) / 2))
    sparsity = 1.0 - (len(tip) / len(_dco)) * 8.0
    return max(0.0, sparsity) * max(0.0, centrality) * (rng / max(1e-9, _dy1 - _dy0))


cands = [(spike_score(ax_, sg), ax_, sg) for ax_ in (0, 2) for sg in (1, -1)]
cands.sort(reverse=True)
sc, ax_, sg = cands[0]
print('ORIENT dorsal candidate axis=%d sign=%+d score=%.3f (all %s)'
      % (ax_, sg, sc, [(round(c[0], 3), c[1], c[2]) for c in cands]))
if ax_ == 0 and sg == 1:
    rotate((0, math.radians(-90), 0))     # +X -> +Z
elif ax_ == 0 and sg == -1:
    rotate((0, math.radians(90), 0))      # -X -> +Z
elif ax_ == 2 and sg == -1:
    rotate((0, math.radians(180), 0))     # -Z -> +Z
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


# Photogrammetry shells are non-manifold with millions of micro-triangles;
# a single collapse pass overshoots the budget by 3-6x. Weld hard first, then
# iterate collapse, and only if that stalls fall back to a voxel remesh (which
# always hits any budget but costs fin sharpness, so it is a last resort).
low.data.materials.clear()
# Weld distance must scale with source density: a hard 0.0006 weld is right
# for a 1.5M-triangle scan but obliterates a 7.5k-triangle artist model
# (tiger_mg lost 63% of its faces and could never be re-added).
src_tris = tris_of(low)
weld = a.length * 0.0006 if src_tris > 200000 else (
    a.length * 0.0002 if src_tris > 40000 else 0.0)
if weld > 0:
    clean(low, weld=weld)
else:
    clean(low, weld=1e-6)
print('LOW weld %.5f' % weld)
n = tris_of(low)
print('LOW after weld', n)

# Reducer, per NOTES-tear.md. A single collapse pass at ratio << 0.1 on a
# NON-MANIFOLD photogrammetry soup overshoots and shreds the thin features
# (hammerhead: 782297 -> 15645 in one pass, torn tail lobes and cephalofoil),
# and a coarse voxel remesh AFTER collapse dissolves anything thinner than a
# voxel. The order that keeps fins intact is manifold-first:
#   1. voxel-remesh the HIGH mesh at ~0.0035 of the normalised length,
#      adaptivity 0 -> watertight, no fragments, fins survive (~100-200k tris);
#   2. collapse-decimate that manifold result in gentle passes, ratio >= 0.1.
# Collapse only shreds non-manifold soup; on a manifold mesh it preserves thin
# silhouettes. Never remesh coarse after collapse.
if n > 20000:
    # 0.0035 of the length is the right ballpark, but the tri count it yields
    # swings wildly with how much surface a given scan has: on smoothhound it
    # gave only 9k tris (the body dissolved into fragments), on bullhead 81k.
    # Bisect the voxel size to land in the 90k-220k manifold band the notes
    # call for, so the following collapse always has enough detail to work
    # with and never has to make a >5x jump.
    # Evaluating the remesh on a 1.8M-triangle mesh costs ~2 minutes a try, so
    # do not bisect blindly. Voxel remesh tri count scales as surface_area /
    # voxel^2, so measure the area once, solve for the voxel that yields the
    # target directly, and take at most two correction steps.
    want = 150000
    low.data.calc_loop_triangles()
    area = sum(t.area for t in low.data.loop_triangles)
    rm = low.modifiers.new('rm', 'REMESH')
    rm.mode = 'VOXEL'
    rm.adaptivity = 0.0
    # each voxel face contributes ~2 triangles of side^2/2 area -> tris ~ area/v^2
    best_v = max(a.length * 0.0012, min(a.length * 0.010, math.sqrt(area / max(1, want))))
    for _ in range(2):
        rm.voxel_size = best_v
        ev = low.evaluated_get(bpy.context.evaluated_depsgraph_get())
        m_ev = ev.to_mesh()
        t = len(m_ev.loop_triangles) if m_ev else 0
        ev.to_mesh_clear()
        if 90000 <= t <= 220000 or t == 0:
            break
        # tris ~ 1/v^2  ->  v_new = v * sqrt(t / want)
        best_v = max(a.length * 0.0012,
                     min(a.length * 0.010, best_v * math.sqrt(t / float(want))))
    rm.voxel_size = best_v
    apply_mod(low, rm)
    print('  pre-collapse voxel remesh %.5f -> %d tris (manifold)'
          % (best_v, tris_of(low)))

_pass = 0
while tris_of(low) > TARGET * (1 + TOL):
    n = tris_of(low)
    m = low.modifiers.new('dec', 'DECIMATE')
    m.decimate_type = 'COLLAPSE'
    m.use_collapse_triangulate = True
    # gentle passes only: never below 1/3 in a single step. A 10x jump in one
    # pass (bullhead: 80952 -> 8094) tears the mouth and fin edges even on a
    # manifold mesh; several 3x passes reach the same budget cleanly.
    m.ratio = max(0.34, min(0.95, (TARGET * 0.97) / n))
    apply_mod(low, m)
    print('  dec pass %d %d -> %d (ratio %.4f)' % (_pass, n, tris_of(low), m.ratio))
    _pass += 1
    if _pass > 20:
        print('  WARNING: collapse loop hit pass cap')
        break

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

# ------------------------------------------------- flatten painted lighting
# Several photogrammetry hides are photographed with their own countershade
# already burned into the albedo, and on some of them it runs OPPOSITE to the
# direction the game wants. Because that gradient is painted into the texels
# rather than aligned to any mesh axis, NO runtime shader can cancel it: a
# rotation cannot fix a gradient that is negative under every candidate axis.
# The only place it can be removed is here.
#
# Method: project every vertex onto the mesh's dorsal-ventral axis, carry that
# coordinate into UV space, fit the LOW-FREQUENCY luminance as a function of
# that coordinate alone, then divide it out. Detail (pores, denticles, stripes)
# is high-frequency and rides through untouched; only the broad top-to-bottom
# ramp is removed. Chroma is preserved by scaling R,G,B together.
def flatten_dorsal_luminance(img, obj, strength=1.0, target=0.5, desat=0.0):
    import numpy as np

    W, H = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
    rgb = px[:, :, :3]

    def to_lin(c):
        return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

    def to_srgb(c):
        c = np.clip(c, 0.0, None)
        return np.where(c <= 0.0031308, c * 12.92, 1.055 * (c ** (1 / 2.4)) - 0.055)

    me = obj.data
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)

    # Dorsal axis = the non-long axis whose vertex mass is most asymmetric.
    # A near-symmetric axis scores lowest by construction, which is exactly
    # how the Y-rigged and X-rigged bakes are told apart.
    ext = co.max(axis=0) - co.min(axis=0)
    long_ax = int(np.argmax(ext))
    best, best_asym = None, -1.0
    for i in range(3):
        if i == long_ax:
            continue
        d = co[:, i] - np.median(co[:, i])
        asym = abs(int((d > 0).sum()) - int((d < 0).sum())) / max(1, len(d))
        if asym > best_asym:
            best, best_asym = i, asym
    up_ax = best
    up = co[:, up_ax]
    lo, hi = np.percentile(up, 2), np.percentile(up, 98)
    tvert = np.clip((up - lo) / max(1e-9, hi - lo), 0.0, 1.0)

    # Rasterise the per-vertex up-coordinate into UV space (loop triangles),
    # so every texel knows where on the dorsal-ventral axis it lives.
    me.calc_loop_triangles()
    uv_layer = me.uv_layers.active.data
    tmap = np.full((H, W), -1.0, dtype=np.float32)
    for tri in me.loop_triangles:
        pts = []
        for li, vi in zip(tri.loops, tri.vertices):
            u, v = uv_layer[li].uv
            pts.append((u * (W - 1), (1.0 - v) * (H - 1), tvert[vi]))
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        x0 = max(0, int(math.floor(min(xs)))); x1 = min(W - 1, int(math.ceil(max(xs))))
        y0 = max(0, int(math.floor(min(ys)))); y1 = min(H - 1, int(math.ceil(max(ys))))
        if x1 < x0 or y1 < y0:
            continue
        (ax_, ay, at), (bx, by, bt), (cx, cy, ct) = pts
        den = (by - cy) * (ax_ - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-12:
            continue
        yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1]
        xx = xx.astype(np.float32); yy = yy.astype(np.float32)
        l1 = ((by - cy) * (xx - cx) + (cx - bx) * (yy - cy)) / den
        l2 = ((cy - ay) * (xx - cx) + (ax_ - cx) * (yy - cy)) / den
        l3 = 1.0 - l1 - l2
        m = (l1 >= -0.002) & (l2 >= -0.002) & (l3 >= -0.002)
        if not m.any():
            continue
        blk = tmap[y0:y1 + 1, x0:x1 + 1]
        blk[m] = (l1 * at + l2 * bt + l3 * ct)[m]
        tmap[y0:y1 + 1, x0:x1 + 1] = blk

    body = tmap >= 0.0
    if body.sum() < 64:
        print('FLATLUM skipped: UV rasterisation covered only %d texels' % body.sum())
        return

    # Weight every texel by how much MESH it represents, not by its area in the
    # atlas. UV charts are not area-preserving -- a fin can own a quarter of the
    # map -- so an atlas-uniform fit flattens the texture while leaving the
    # SURFACE gradient (which is what the renderer and the verifier both see)
    # partly intact. Vertex density per bin supplies that weight.
    NB = 24
    vbins = np.clip((tvert * NB).astype(np.int32), 0, NB - 1)
    vcount = np.bincount(vbins, minlength=NB).astype(np.float64)
    tcount = np.bincount(np.clip((tmap[body] * NB).astype(np.int32), 0, NB - 1),
                         minlength=NB).astype(np.float64)
    # per-texel weight = (verts in this bin) / (texels in this bin)
    wbin = np.where(tcount > 0, vcount / np.maximum(tcount, 1.0), 0.0)
    if wbin.max() > 0:
        wbin = wbin / wbin.max()
    # Bins carrying very few vertices are noise; do not let them drive the fit.
    wbin = np.where(vcount < 12, 0.0, wbin)

    lin = to_lin(rgb)
    lum = 0.2126 * lin[:, :, 0] + 0.7152 * lin[:, :, 1] + 0.0722 * lin[:, :, 2]

    # Low-frequency profile: mean luminance per dorsal-ventral bin, smoothed.
    bins = np.clip((tmap * NB).astype(np.int32), 0, NB - 1)
    idx = np.arange(NB)
    k = np.array([1, 2, 3, 2, 1], dtype=np.float64); k /= k.sum()

    def fit_profile(L):
        p = np.zeros(NB, dtype=np.float64)
        c = np.zeros(NB, dtype=np.float64)
        np.add.at(p, bins[body], L[body])
        np.add.at(c, bins[body], 1.0)
        ok = (c > 8) & (wbin > 0)
        if ok.sum() < 4:
            return None
        p = np.interp(idx, idx[ok], p[ok] / c[ok])
        return np.convolve(np.pad(p, 2, mode='edge'), k, mode='valid')

    prof = fit_profile(lum)
    if prof is None:
        print('FLATLUM skipped: too few populated bins')
        return

    # The profile can span 4x between the darkest and brightest band, so a
    # single clamped divide under-corrects the dark end while fully correcting
    # the bright end -- which shows up as a residual, inverted gradient. Apply
    # the divide ITERATIVELY, re-fitting the profile from the corrected image
    # each round, so each pass only has to move a little and the clamp never
    # binds. Three rounds takes the residual into the noise.
    ROUNDS = 4
    for _ in range(ROUNDS):
        lum_i = 0.2126 * lin[:, :, 0] + 0.7152 * lin[:, :, 1] + 0.0722 * lin[:, :, 2]
        p = fit_profile(lum_i)
        if p is None:
            break
        # The level to flatten TO is the vertex-weighted mean, so the surface
        # (not the atlas) ends up uniform.
        wsum = float(wbin.sum())
        overall = float((p * wbin).sum() / wsum) if wsum > 1e-9 else float(p.mean())
        ramp = np.maximum(np.interp(np.clip(tmap, 0, 1) * (NB - 1), idx, p), 1e-4)
        gain = np.clip(overall / ramp, 0.30, 3.5)
        gain = 1.0 + (gain - 1.0) * strength
        lin *= np.where(body, gain, 1.0)[:, :, None]

    # Renormalise the body's mean luminance to the target (in sRGB terms).
    lum2 = 0.2126 * lin[:, :, 0] + 0.7152 * lin[:, :, 1] + 0.0722 * lin[:, :, 2]
    # Vertex-weighted, so the level reflects the surface rather than the atlas.
    # A uniform scale cannot change the dorsal-belly DELTA -- it only sets where
    # the flattened hide sits overall.
    pl = fit_profile(lum2)
    wsum = float(wbin.sum())
    if pl is not None and wsum > 1e-9:
        cur_lin = float((pl * wbin).sum() / wsum)
    else:
        cur_lin = float(np.mean(lum2[body]))
    if cur_lin > 1e-6:
        lin *= to_lin(np.array([float(target)], dtype=np.float32))[0] / cur_lin

    out = to_srgb(lin)

    if desat > 0.0:
        l2 = 0.2126 * lin[:, :, 0] + 0.7152 * lin[:, :, 1] + 0.0722 * lin[:, :, 2]
        neutral = to_srgb(np.repeat(l2[:, :, None], 3, axis=2))
        d = np.where(body[:, :, None], desat, 0.0)
        out = out * (1.0 - d) + neutral * d

    out = np.clip(out, 0.0, 1.0)
    px[:, :, :3] = out
    img.pixels[:] = px.reshape(-1).tolist()

    # Report on the FINAL pixels, in the same linear-luminance terms the
    # verifier uses, so the number here is the number that ships.
    fl = to_lin(out)
    flum = 0.2126 * fl[:, :, 0] + 0.7152 * fl[:, :, 1] + 0.0722 * fl[:, :, 2]
    # Vertex-weighted bands, matching how the runtime/verifier samples.
    pf = fit_profile(flum)
    if pf is not None and float(wbin.sum()) > 1e-9:
        hi_m = (idx >= NB * 0.75) & (wbin > 0)
        lo_m = (idx < NB * 0.25) & (wbin > 0)
        dor = float((pf[hi_m] * wbin[hi_m]).sum() / max(1e-9, wbin[hi_m].sum())) if hi_m.any() else float('nan')
        bel = float((pf[lo_m] * wbin[lo_m]).sum() / max(1e-9, wbin[lo_m].sum())) if lo_m.any() else float('nan')
    else:
        dor = float(np.mean(flum[body & (tmap > 0.75)]))
        bel = float(np.mean(flum[body & (tmap < 0.25)]))
    print('FLATLUM up_ax=%d texels=%d prof %.4f..%.4f | dorsalLum %.4f bellyLum %.4f delta %+.4f meanLum %.4f'
          % (up_ax, int(body.sum()), float(prof.min()), float(prof.max()),
             dor, bel, dor - bel, float(np.mean(flum[body]))))


if a.flatlum or a.desat > 0.0:
    try:
        flatten_dorsal_luminance(img_d, low, strength=1.0 if a.flatlum else 0.0,
                                 target=a.flatlum_mean, desat=a.desat)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print('FLATLUM FAILED, keeping raw bake:', e)

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

# Sources that were themselves skinned (realisticshark, whitepointer,
# megalodonrex, tiger_mg) leave stale vertex groups naming bones that no
# longer exist. The glTF exporter then tries to resolve joints for them and
# dies with "'NoneType' object has no attribute 'joints'". Clear them, and
# drop any lingering armature modifier, before auto-weighting to OUR rig.
low.vertex_groups.clear()
for m in list(low.modifiers):
    if m.type == 'ARMATURE':
        low.modifiers.remove(m)
low.parent = None

bpy.ops.object.select_all(action='DESELECT')
low.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')

# Bone-heat weighting silently fails on isolated fragments, leaving vertices
# with NO group at all. Blender 3.6's glTF exporter then dies in
# add_neutral_bones with "'NoneType' object has no attribute 'joints'".
# Guarantee full coverage: any unweighted vertex is assigned to the spine
# bone nearest along the body axis.
order = ['Tail3', 'Tail2', 'Tail1', 'Spine2', 'Spine1', 'Neck', 'Head']

weighted = set()
for v in low.data.vertices:
    for g in v.groups:
        if g.weight > 0.0:
            weighted.add(v.index)
            break
orphans = len(low.data.vertices) - len(weighted)
frac = orphans / max(1, len(low.data.vertices))
print('WEIGHTS bone-heat covered %d/%d verts' % (len(weighted), len(low.data.vertices)))

# Bone heat solves a diffusion problem over the surface and routinely fails on
# a voxel-remeshed scan shell (the bones sit inside a closed hollow volume, so
# no bone "sees" the surface). Hard-assigning the failures to one bone each
# would make 60% of the body rigid. A shark spine is a straight chain along Y,
# so when coverage is poor, discard bone heat entirely and use smooth analytic
# weights: each vertex is blended between the two nearest bone centres.
if frac > 0.05:
    centres = [(nm, ymin + L * ((stations[i][1] + stations[i + 1][1]) / 2))
               for i, nm in enumerate(order)]
    for nm in order:
        g = low.vertex_groups.get(nm)
        if g:
            low.vertex_groups.remove(g)
    groups = {nm: low.vertex_groups.new(name=nm) for nm in order}
    for v in low.data.vertices:
        y = v.co.y
        # find the bracketing pair of bone centres
        if y <= centres[0][1]:
            groups[centres[0][0]].add([v.index], 1.0, 'REPLACE')
            continue
        if y >= centres[-1][1]:
            groups[centres[-1][0]].add([v.index], 1.0, 'REPLACE')
            continue
        for i in range(len(centres) - 1):
            y0, y1 = centres[i][1], centres[i + 1][1]
            if y0 <= y <= y1:
                t = (y - y0) / max(1e-9, y1 - y0)
                # smoothstep so the bend is continuous, not faceted
                t = t * t * (3 - 2 * t)
                groups[centres[i][0]].add([v.index], 1.0 - t, 'REPLACE')
                groups[centres[i + 1][0]].add([v.index], t, 'REPLACE')
                break
    print('WEIGHTS bone heat unreliable (%.0f%% orphaned), used analytic spine weights'
          % (frac * 100))

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
