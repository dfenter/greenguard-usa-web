"""Input normalisation, junk rejection, orientation, and geometry measures."""

import math
import os

import bpy
import mathutils


def import_source(path):
    """Reset Blender and import *path*, matching the legacy importer choices."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ext = os.path.splitext(path)[1].lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        raise SystemExit("unsupported input " + ext)


def reset_rest_pose():
    """Clear imported actions and evaluate all source rigs at rest."""
    for ob in bpy.data.objects:
        if ob.animation_data:
            ob.animation_data_clear()
        if ob.type == "ARMATURE":
            for pb in ob.pose.bones:
                pb.matrix_basis.identity()
            ob.data.pose_position = "REST"
    for sk in bpy.data.shape_keys:
        if sk.animation_data:
            sk.animation_data_clear()
    bpy.context.view_layer.update()


def _stats(obj):
    if not obj.data.polygons:
        return None
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    corners = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    lo = mathutils.Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = mathutils.Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    return {"o": obj, "tris": tris, "lo": lo, "hi": hi,
            "ctr": (lo + hi) / 2, "diag": (hi - lo).length}


def is_outline(obj):
    """Identify a toon border shell that would swallow every bake ray."""
    for slot in obj.material_slots:
        mat = slot.material
        if not mat:
            continue
        name = (mat.name or "").lower()
        if "border" in name or "outline" in name:
            return True
        if mat.use_nodes:
            has_tex = any(n.type == "TEX_IMAGE" and n.image for n in mat.node_tree.nodes)
            bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if not has_tex and bsdf and sum(bsdf.inputs["Base Color"].default_value[:3]) < 0.05:
                return True
    return False


def flatten_and_reject():
    """Evaluate meshes at rest, flatten world transforms, and remove junk."""
    dg = bpy.context.evaluated_depsgraph_get()
    parts = []
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
        mesh.transform(obj.matrix_world)
        if obj.matrix_world.determinant() < 0:
            mesh.flip_normals()
        flat = bpy.data.objects.new(obj.name + "_flat", mesh)
        bpy.context.collection.objects.link(flat)
        parts.append(flat)
    for obj in list(bpy.data.objects):
        if obj not in parts:
            bpy.data.objects.remove(obj, do_unlink=True)
    if not parts:
        raise SystemExit("no mesh in input")

    for obj in list(parts):
        if is_outline(obj):
            print("DROP %-28s outline-shell" % obj.name)
            parts.remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)
    if not parts:
        raise SystemExit("every part looked like an outline shell")

    info = [s for s in (_stats(o) for o in parts) if s]
    info.sort(key=lambda s: -s["tris"])
    main = info[0]
    keep, drop = [], []
    for state in info:
        if state is main:
            keep.append(state)
            continue
        reason = None
        if state["tris"] <= 24:
            reason = "box-prop"
        else:
            pad = main["diag"] * 0.05
            separated = any(
                state["lo"][i] > main["hi"][i] + pad or
                state["hi"][i] < main["lo"][i] - pad for i in range(3)
            )
            if separated and state["tris"] < main["tris"] * 0.05:
                reason = "disjoint"
            elif state["tris"] < main["tris"] * 0.002:
                reason = "tiny"
        (drop if reason else keep).append(state)
        if reason:
            print("DROP %-28s tris=%-8d %s" % (state["o"].name, state["tris"], reason))
    for state in drop:
        bpy.data.objects.remove(state["o"], do_unlink=True)
    parts = [state["o"] for state in keep]
    print("KEEP", len(parts), "parts, tris", sum(state["tris"] for state in keep))

    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    high = bpy.context.view_layer.objects.active
    high.name = "high"
    return high


def _dims(obj):
    return list(obj.dimensions)


def _rotate(obj, euler):
    obj.rotation_euler = euler
    bpy.ops.object.transform_apply(rotation=True)


def orient(high, length=1.0, flip=False):
    """Put the shark on +Y nose-to-tail with the dorsal fin on +Z."""
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    bpy.context.view_layer.objects.active = high
    high.rotation_mode = "XYZ"
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    high.location = (0, 0, 0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    print("ORIENT raw dims", tuple(round(v, 3) for v in _dims(high)))
    vertices = high.data.vertices
    stride = max(1, len(vertices) // 4000)
    coords = [vertices[i].co.copy() for i in range(0, len(vertices), stride)]

    def box_of(rotation):
        lo = [1e18] * 3
        hi = [-1e18] * 3
        for vert in coords:
            point = rotation @ vert
            for axis in range(3):
                lo[axis] = min(lo[axis], point[axis])
                hi[axis] = max(hi[axis], point[axis])
        return [hi[axis] - lo[axis] for axis in range(3)]

    dims = _dims(high)
    aspect = max(dims) / max(1e-9, sorted(dims)[1])
    step = None if aspect >= 1.9 else math.radians(6)
    best = None
    if step is not None:
        angles = [i * step for i in range(int(math.radians(180) / step) + 1)]
        for rz in angles:
            for ry in angles:
                for rx in angles:
                    rotation = mathutils.Euler((rx, ry, rz), "XYZ").to_matrix()
                    boxed = box_of(rotation)
                    volume = boxed[0] * boxed[1] * boxed[2]
                    if best is None or volume < best[0] * 0.999:
                        best = (volume, (rx, ry, rz), boxed)
        centre = best[1]
        fine = math.radians(1)
        for axis in range(3):
            for delta in [i * fine for i in range(-6, 7)]:
                euler = list(centre)
                euler[axis] += delta
                rotation = mathutils.Euler(euler, "XYZ").to_matrix()
                boxed = box_of(rotation)
                volume = boxed[0] * boxed[1] * boxed[2]
                if volume < best[0] * 0.999:
                    best = (volume, tuple(euler), boxed)
            centre = best[1]
        if best[1] != (0.0, 0.0, 0.0):
            _rotate(high, best[1])
            print("ORIENT min-volume rot", tuple(round(math.degrees(v), 1) for v in best[1]),
                  "->", tuple(round(v, 3) for v in _dims(high)))
    elif aspect >= 1.9:
        print("ORIENT already axis-aligned (aspect %.2f), skipping search" % aspect)

    axis = max(range(3), key=lambda i: _dims(high)[i])
    if axis == 0:
        _rotate(high, (0, 0, math.radians(90)))
    elif axis == 2:
        _rotate(high, (math.radians(90), 0, 0))

    dorsal_vertices = high.data.vertices
    dorsal_stride = max(1, len(dorsal_vertices) // 60000)
    dorsal_coords = [dorsal_vertices[i].co.copy() for i in range(0, len(dorsal_vertices), dorsal_stride)]
    y0 = min(p.y for p in dorsal_coords)
    y1 = max(p.y for p in dorsal_coords)

    def spike_score(axis_index, sign):
        values = [p[axis_index] * sign for p in dorsal_coords]
        maximum = max(values)
        span = maximum - min(values)
        if span <= 0:
            return 0.0
        band = maximum - span * 0.12
        tip = [dorsal_coords[i] for i, value in enumerate(values) if value >= band]
        if not tip:
            return 0.0
        middle = sum(p.y for p in tip) / len(tip)
        centrality = 1.0 - abs((middle - (y0 + y1) / 2) / max(1e-9, (y1 - y0) / 2))
        sparsity = 1.0 - (len(tip) / len(dorsal_coords)) * 8.0
        return max(0.0, sparsity) * max(0.0, centrality) * (span / max(1e-9, y1 - y0))

    candidates = [(spike_score(axis_index, sign), axis_index, sign)
                  for axis_index in (0, 2) for sign in (1, -1)]
    candidates.sort(reverse=True)
    score, dorsal_axis, dorsal_sign = candidates[0]
    print("ORIENT dorsal candidate axis=%d sign=%+d score=%.3f (all %s)" %
          (dorsal_axis, dorsal_sign, score,
           [(round(c[0], 3), c[1], c[2]) for c in candidates]))
    if dorsal_axis == 0 and dorsal_sign == 1:
        _rotate(high, (0, math.radians(-90), 0))
    elif dorsal_axis == 0 and dorsal_sign == -1:
        _rotate(high, (0, math.radians(90), 0))
    elif dorsal_axis == 2 and dorsal_sign == -1:
        _rotate(high, (0, math.radians(180), 0))
    print("ORIENT axis-aligned", tuple(round(v, 3) for v in _dims(high)))

    mesh = high.data
    ys = [v.co.y for v in mesh.vertices]
    midpoint = (min(ys) + max(ys)) / 2
    front = [v for v in mesh.vertices if v.co.y > midpoint]
    back = [v for v in mesh.vertices if v.co.y <= midpoint]

    def girth(vertices_):
        if not vertices_:
            return 0.0
        return sum(math.hypot(v.co.x, v.co.z) for v in vertices_) / len(vertices_)

    front_girth, back_girth = girth(front), girth(back)
    print("ORIENT girth front(+Y)=%.4f back(-Y)=%.4f" % (front_girth, back_girth))
    if (back_girth > front_girth) != bool(flip):
        _rotate(high, (0, 0, math.radians(180)))
        print("ORIENT flipped nose to +Y")

    body_length = high.dimensions.y
    high.scale = (length / body_length,) * 3
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    high.location = (0, 0, 0)
    bpy.ops.object.transform_apply(location=True)
    print("HIGH tris", sum(len(p.vertices) - 2 for p in high.data.polygons),
          "dims", tuple(round(v, 3) for v in high.dimensions))
    return high


def _smoothstep(x):
    x = max(0.0, min(1.0, float(x)))
    return x * x * (3.0 - 2.0 * x)


def _percentile(values, fraction):
    if not values:
        return 0.0
    values = sorted(values)
    at = (len(values) - 1) * max(0.0, min(1.0, fraction))
    lo = int(math.floor(at))
    hi = int(math.ceil(at))
    return values[lo] + (values[hi] - values[lo]) * (at - lo)


def _point(obj, index):
    return obj.data.vertices[index].co


def _ensure_group(obj, name, indices):
    group = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
    if indices:
        group.add(list(indices), 1.0, "REPLACE")
    return group


def _nose_sign(vertices, lo, hi):
    """Derive which end of +/-Y is the nose, without assuming the bake contract.

    ``orient()`` decides this with a girth comparison (the snout half of the
    body carries more mean radial mass than the caudal-peduncle/fin half) and
    flips the mesh so the nose lands on +Y. That flip is the source of truth,
    but ``measure`` must also be correct when it is handed a mesh that was
    never routed through ``orient`` (some callers measure a raw import).
    Reuse the identical girth signal here, sampling the same +Y/-Y halves
    ``orient`` uses, so a pre-oriented mesh (already nose at +Y) is confirmed
    and an unoriented one (nose at -Y, e.g. tigershark/thresher source GLBs)
    is detected rather than silently mirrored.
    """
    ymin, ymax = lo.y, hi.y
    span = max(ymax - ymin, 1e-9)
    mid = (ymin + ymax) / 2.0
    front = [v.co for v in vertices if v.co.y > mid]
    back = [v.co for v in vertices if v.co.y <= mid]

    def girth(points):
        if not points:
            return 0.0
        return sum(math.hypot(p.x, p.z) for p in points) / len(points)

    front_girth, back_girth = girth(front), girth(back)

    # Tie-break with tip taper/solidity: the nose end is blunter (wider
    # relative to its local height) than the tail end, which narrows into
    # forked caudal lobes. Matches the solidity/taper signal documented for
    # dorsal/roll detection, applied here to the fore/aft axis instead.
    def tip_solidity(high):
        band = [p for p in (front if high else back)
                 if ((p.y - mid) / span >= 0.32 if high else (mid - p.y) / span >= 0.32)]
        if not band:
            return 0.0
        width = max(p.x for p in band) - min(p.x for p in band)
        height = max(p.z for p in band) - min(p.z for p in band)
        return width * height / max(span * span, 1e-9)

    girth_vote = 1 if front_girth >= back_girth else -1
    solidity_vote = 1 if tip_solidity(True) >= tip_solidity(False) else -1
    sign = girth_vote if girth_vote == solidity_vote else girth_vote
    return sign, front_girth, back_girth


def measure(obj, create_groups=True):
    """Measure the oriented shark and derive mouth/fin landmark masks.

    The bake contract is +Y nose-to-tail, +Z dorsal, +X right. ``long_axis``
    is still reported explicitly for callers that measure a pre-oriented mesh.
    ``jaw_line`` is selected from a lower contour curvature flip in t=.80-.98;
    when that contour is not stable it uses zc-.06H, the documented fallback.
    Landmark values are local-space ``Vector`` instances. Fin masks are vertex
    index lists and, when ``create_groups`` is true, matching named Blender
    vertex groups are installed on the object.

    Nose polarity is MEASURED, not assumed: some bases (tigershark, thresher)
    ship nose-at--Y and are only flipped to +Y by ``orient()``. ``measure``
    reuses ``orient``'s girth signal (mean radial mass of the +Y half vs the
    -Y half) plus a nose/tail solidity term so it is correct even when called
    on a mesh that has not been routed through ``orient`` first. When the mesh
    is already nose-at-+Y (the normal, oriented case) this is a no-op: the
    detected sign is +1 and nothing below changes.
    """
    vertices = list(obj.data.vertices)
    if not vertices:
        raise ValueError("cannot measure an empty mesh")
    lo = mathutils.Vector((min(v.co.x for v in vertices), min(v.co.y for v in vertices), min(v.co.z for v in vertices)))
    hi = mathutils.Vector((max(v.co.x for v in vertices), max(v.co.y for v in vertices), max(v.co.z for v in vertices)))
    extent = hi - lo
    long_axis = max(range(3), key=lambda axis: extent[axis])
    nose_sign, nose_front_girth, nose_back_girth = _nose_sign(vertices, lo, hi)
    if nose_sign < 0:
        print("MEASURE nose-axis flip: -Y girth=%.4f > +Y girth=%.4f (unoriented mesh, "
              "measuring tail-first end as -Y)" % (nose_back_girth, nose_front_girth))
    ymin, ymax = lo.y, hi.y
    L = max(ymax - ymin, 1e-9)
    zc = (lo.z + hi.z) / 2.0
    H = max(hi.z - lo.z, 1e-9)

    # t=0 at the tail, t=1 at the nose, regardless of which raw Y end the
    # nose is actually on: nose_sign flips the station formula so every
    # downstream nose/tail-relative band (jaw range, head band, fin bands)
    # lands on the correct anatomy for bases authored nose-at--Y.
    def t_of(v):
        return (v.co.y - ymin) / L if nose_sign > 0 else (ymax - v.co.y) / L

    # Lower contour sampled along the authored jaw range. The median of the
    # lowest 12% avoids one stray scan spike while retaining the jaw silhouette.
    samples = []
    bins = 24
    for bin_index in range(bins):
        t0 = 0.80 + 0.18 * bin_index / bins
        t1 = 0.80 + 0.18 * (bin_index + 1) / bins
        below = [v.co.z for v in vertices
                 if t0 <= t_of(v) < t1 and v.co.z < zc]
        samples.append(_percentile(below, 0.10) if below else None)
    usable = [(i, z) for i, z in enumerate(samples) if z is not None]
    jaw_z = zc - 0.06 * H
    jaw_t = 0.89
    jaw_method = "zc-0.06H fallback"
    if len(usable) >= 7:
        # Smooth the contour, then find the strongest curvature sign flip below
        # the centreline. It is stable on both smooth scan contours and bakes.
        curve = [z for _, z in usable]
        smooth = []
        for i in range(len(curve)):
            window = curve[max(0, i - 2):min(len(curve), i + 3)]
            smooth.append(sum(window) / len(window))
        flips = []
        for i in range(1, len(smooth) - 2):
            left = smooth[i] - smooth[i - 1]
            right = smooth[i + 1] - smooth[i]
            if left * right < 0:
                flips.append((abs(left - right), i))
        if flips:
            _, selected = max(flips)
            jaw_z = smooth[selected]
            jaw_t = 0.80 + 0.18 * usable[selected][0] / max(1, bins - 1)
            jaw_method = "lower contour curvature flip"

    head_vertices = [v for v in vertices if t_of(v) >= 0.72]
    if not head_vertices:
        head_vertices = vertices
    head_top = max(head_vertices, key=lambda v: v.co.z).co.copy()
    nose = (max(vertices, key=lambda v: v.co.y) if nose_sign > 0
            else min(vertices, key=lambda v: v.co.y)).co.copy()
    tail_base_candidates = [v for v in vertices if 0.17 <= t_of(v) <= 0.27]
    tail_fallback = (min(vertices, key=lambda v: v.co.y) if nose_sign > 0
                      else max(vertices, key=lambda v: v.co.y)).co.copy()
    tail_base = (sum((v.co for v in tail_base_candidates), mathutils.Vector()) /
                 max(1, len(tail_base_candidates))) if tail_base_candidates else tail_fallback
    back_candidates = [v for v in vertices if 0.42 <= t_of(v) <= 0.58]
    back_mid = (sum((v.co for v in back_candidates), mathutils.Vector()) /
                max(1, len(back_candidates))) if back_candidates else mathutils.Vector((0, ymin + .5 * L, zc))

    flank_candidates = [v for v in vertices if 0.48 <= t_of(v) <= 0.72 and abs(v.co.z - zc) <= 0.20 * H]
    left = min(flank_candidates, key=lambda v: v.co.x).co.copy() if flank_candidates else mathutils.Vector((lo.x, ymin + .6 * L, zc))
    right = max(flank_candidates, key=lambda v: v.co.x).co.copy() if flank_candidates else mathutils.Vector((hi.x, ymin + .6 * L, zc))

    # Per-slice widths/heights make masks scale-independent and avoid taking a
    # pectoral tip or caudal lobe for the body flank.
    slice_stats = {}
    for v in vertices:
        key = min(19, max(0, int(t_of(v) * 20)))
        slice_stats.setdefault(key, []).append(v)
    def local_bounds(v, key):
        row = slice_stats.get(key) or vertices
        xs = [p.co.x for p in row]
        zs = [p.co.z for p in row]
        return min(xs), max(xs), min(zs), max(zs)

    fin_groups = {name: [] for name in (
        "dorsal", "pectoral_l", "pectoral_r", "caudal_upper", "caudal_lower", "anal", "pelvic")}
    for v in vertices:
        t = t_of(v)
        key = min(19, max(0, int(t * 20)))
        sx0, sx1, sz0, sz1 = local_bounds(v, key)
        width = max(sx1 - sx0, 1e-9)
        height = max(sz1 - sz0, 1e-9)
        # dorsal and caudal are outlying dorsal/ventral excursions, with a
        # centrality gate so nose and tail tips do not become dorsal fins.
        if 0.34 <= t <= 0.70 and v.co.z > zc + 0.24 * H and (v.co.z - sz0) / height > .72:
            fin_groups["dorsal"].append(v.index)
        if 0.00 <= t <= 0.18 and (v.co.z - sz0) / height > .58:
            fin_groups["caudal_upper"].append(v.index)
        if 0.00 <= t <= 0.18 and (v.co.z - sz0) / height < .42:
            fin_groups["caudal_lower"].append(v.index)
        # Pectorals project laterally and sit aft of the head. The ventral
        # threshold admits the swept-back fins without selecting the flank.
        if 0.48 <= t <= 0.78 and abs(v.co.x) > max(abs(sx0), abs(sx1)) * .82 and v.co.z < zc + .18 * H:
            fin_groups["pectoral_l" if v.co.x < 0 else "pectoral_r"].append(v.index)
        if 0.26 <= t <= 0.52 and v.co.z < zc - .22 * H and abs(v.co.x) < .48 * width:
            fin_groups["anal"].append(v.index)
        if 0.45 <= t <= 0.68 and v.co.z < zc - .16 * H and abs(v.co.x) > .30 * width:
            fin_groups["pelvic"].append(v.index)

    if create_groups:
        for name, indices in fin_groups.items():
            _ensure_group(obj, name, indices)

    return {
        "long_axis": long_axis,
        "long_axis_name": "XYZ"[long_axis],
        "ymin": float(ymin), "ymax": float(ymax), "L": float(L),
        "zc": float(zc), "H": float(H),
        "nose_sign": nose_sign,
        "jaw_line": {"t": float(jaw_t), "z": float(jaw_z), "method": jaw_method,
                      "fallback": jaw_method == "zc-0.06H fallback"},
        "neck_plane": {"t": 0.72,
                       "y": float(ymin + 0.72 * L) if nose_sign > 0 else float(ymax - 0.72 * L)},
        "landmarks": {"nose": nose, "head_top": head_top, "back_mid": back_mid,
                      "flank_l": left, "flank_r": right, "tail_base": tail_base},
        "fin_groups": fin_groups,
        "fin_vertex_groups": tuple(fin_groups),
    }


def prepare_source(path, length=1.0, flip=False):
    import_source(path)
    reset_rest_pose()
    high = flatten_and_reject()
    return high, orient(high, length=length, flip=flip)
