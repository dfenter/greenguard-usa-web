"""Author-time texture painting for Razorfin authored families.

The important distinction in this module is that markings are evaluated from
the position of a texel on the mesh, not from UV coordinates.  UVs are only a
storage/rasterisation detail; this keeps a row readable after a head graft,
fin edit, or a smart-project pass.

The module is deliberately usable from Blender's Python and from small unit
probes which provide numpy and a mesh-like object.  Blender bake calls are
attempted only when ``RAZORFIN_EMIT_BAKE=1`` is set.  Blender 3.6 cannot run an
EMIT bake in EEVEE, while the CPU UV rasteriser is exact, deterministic, and
is also the path used for the mask maps.  The temporary emission material is
still built for every map bake and is available to callers that want to force
the Cycles verification pass.
"""

from __future__ import annotations

import json
import math
import os
import struct
import subprocess
import zlib
from pathlib import Path

try:
    import numpy as np
except ImportError:  # pragma: no cover - Blender ships numpy in the supported builds.
    np = None

try:
    import bpy
    from mathutils import Vector
except ImportError:  # pragma: no cover - permits documentation/import probes.
    bpy = None
    Vector = None


LAYER_NAMES = (
    "countershade", "stripes", "spots", "saddles", "fin_tips", "glow_seams"
)


def _need_numpy():
    if np is None:
        raise RuntimeError("paint.py requires Blender's numpy module")


def _clamp(value, lo=0.0, hi=1.0):
    return np.clip(value, lo, hi)


def _smoothstep(edge0, edge1, value):
    x = _clamp((value - edge0) / max(1.0e-8, edge1 - edge0))
    return x * x * (3.0 - 2.0 * x)


def _hash01(value):
    """Stable scalar hash used by the procedural layers."""
    value = np.asarray(value, dtype=np.float32)
    return np.mod(np.sin(value * 12.9898 + 78.233) * 43758.5453, 1.0)


def _rgb(value, default=(0.5, 0.5, 0.5)):
    """Resolve a recipe colour from hex, RGB, HSV, or a named default."""
    if value is None:
        return np.asarray(default, dtype=np.float32)
    if isinstance(value, str):
        text = value.strip().lstrip("#")
        if len(text) == 6:
            return np.asarray([int(text[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)
        if len(text) == 8:
            return np.asarray([int(text[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)
    if isinstance(value, dict):
        if "hsv" in value:
            return hsv_to_rgb(value["hsv"])
        if "rgb" in value:
            value = value["rgb"]
    data = np.asarray(value, dtype=np.float32).reshape(-1)
    if data.size < 3:
        return np.asarray(default, dtype=np.float32)
    return _clamp(data[:3])


def hsv_to_rgb(hsv):
    """Vector-free HSV helper matching the JS identity layer's colour law."""
    h, s, v = [float(x) for x in hsv[:3]]
    h = h % 1.0
    i = int(math.floor(h * 6.0))
    f = h * 6.0 - i
    p = v * (1.0 - s)
    q = v * (1.0 - f * s)
    t = v * (1.0 - (1.0 - f) * s)
    table = ((v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q))
    return np.asarray(table[i % 6], dtype=np.float32)


def _as_world_vertices(obj):
    values = []
    for vertex in obj.data.vertices:
        p = obj.matrix_world @ vertex.co
        values.append((float(p.x), float(p.y), float(p.z)))
    return np.asarray(values, dtype=np.float32)


def _axis_measure(world):
    """Return body, dorsal, polarity, and normalized world-space coordinates."""
    ext = np.ptp(world, axis=0)
    body_axis = int(np.argmax(ext))
    body_t = (world[:, body_axis] - np.min(world[:, body_axis])) / max(1.0e-7, ext[body_axis])
    candidates = [i for i in range(3) if i != body_axis]
    mid = (body_t > 0.18) & (body_t < 0.82)
    scores = []
    for axis in candidates:
        values = world[mid, axis] if np.any(mid) else world[:, axis]
        centre = float(np.median(values))
        pos = float(np.percentile(values - centre, 99.0))
        neg = float(np.percentile(centre - values, 99.0))
        scores.append((max(pos, neg), axis, 1.0 if pos >= neg else -1.0))
    if body_axis == 1:
        # L1's handoff contract keeps every authored family in normalized
        # +Y length / +Z dorsal coordinates. A thresher caudal lobe can make
        # X marginally wider than Z, so the generic cross-span winner is not
        # a safe dorsal detector for this canonical orientation.
        dorsal_axis = 2
        dorsal_values = world[mid, dorsal_axis] if np.any(mid) else world[:, dorsal_axis]
        dorsal_centre = float(np.median(dorsal_values))
        dorsal_pos = float(np.percentile(dorsal_values - dorsal_centre, 99.0))
        dorsal_neg = float(np.percentile(dorsal_centre - dorsal_values, 99.0))
        dorsal_sign = 1.0 if dorsal_pos >= dorsal_neg else -1.0
    else:
        _, dorsal_axis, dorsal_sign = max(scores, key=lambda item: item[0])
    # Use the broad mid-body rather than fins/tail tips to measure the dorsal
    # centreline. Paint's belly mask is defined against this measured plane,
    # never against UV row or a generic 0.5 texture coordinate.
    centre_values = world[mid, dorsal_axis] if np.any(mid) else world[:, dorsal_axis]
    centre = float(np.median(centre_values))
    dorsal = dorsal_sign * (world[:, dorsal_axis] - centre)
    dlo, dhi = np.percentile(dorsal, (2.0, 98.0))
    dorsal_t = _clamp((dorsal - dlo) / max(1.0e-7, dhi - dlo))
    return {
        "body_axis": body_axis,
        "dorsal_axis": int(dorsal_axis),
        "dorsal_sign": float(dorsal_sign),
        "dorsal_center": centre,
        "body_t": body_t,
        "dorsal_t": dorsal_t,
        "bounds_min": world.min(axis=0),
        "bounds_max": world.max(axis=0),
    }


def _vertex_masks(world, axes):
    """Build geometric masks without relying on named vertex groups."""
    body_axis = axes["body_axis"]
    cross = [i for i in range(3) if i != body_axis]
    centre = np.median(world[:, cross], axis=0)
    radius = np.linalg.norm(world[:, cross] - centre, axis=1)
    q = float(np.quantile(radius, 0.84)) if len(radius) else 0.0
    fin = (radius >= q) & (axes["body_t"] > 0.12) & (axes["body_t"] < 0.90)
    # A second, conservative plate mask catches fused dorsal plates and the
    # tall dorsal fin.  It intentionally does not cover the whole dorsal hide.
    plate = fin & (axes["dorsal_t"] > 0.72) & (axes["body_t"] > 0.25) & (axes["body_t"] < 0.82)
    top = _smoothstep(0.48, 0.82, axes["dorsal_t"])
    belly = 1.0 - _smoothstep(0.18, 0.48, axes["dorsal_t"])
    return {
        "top": top.astype(np.float32),
        "belly": belly.astype(np.float32),
        "fin": fin.astype(np.float32),
        "plate": plate.astype(np.float32),
    }


def _rasterize_uv(obj, vertex_values, width, height):
    """Rasterise per-vertex values over loop triangles in the active UV map."""
    _need_numpy()
    mesh = obj.data
    if not mesh.uv_layers:
        raise RuntimeError("mesh has no UV layer for position/mask rasterisation")
    uv_layer = mesh.uv_layers.active.data
    values = np.asarray(vertex_values, dtype=np.float32)
    if values.ndim == 1:
        values = values[:, None]
    channels = values.shape[1]
    output = np.zeros((height, width, channels), dtype=np.float32)
    covered = np.zeros((height, width), dtype=bool)
    mesh.calc_loop_triangles()
    # Snapshot RNA collections before rasterising. Holding loop-triangle RNA
    # proxies inside the inner numpy loop is an intermittent Blender 3.6
    # macOS abort source after bmesh topology edits.
    uv_values = np.empty(len(uv_layer) * 2, dtype=np.float32)
    uv_layer.foreach_get("uv", uv_values)
    uv_values = uv_values.reshape(-1, 2)
    triangles = [(tuple(tri.loops), tuple(tri.vertices)) for tri in mesh.loop_triangles]
    for loop_indices, vertex_indices in triangles:
        points = []
        for loop_index, vertex_index in zip(loop_indices, vertex_indices):
            uv = uv_values[loop_index]
            points.append((float(uv[0]) * (width - 1), (1.0 - float(uv[1])) * (height - 1), values[vertex_index]))
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        x0 = max(0, int(math.floor(min(xs))))
        x1 = min(width - 1, int(math.ceil(max(xs))))
        y0 = max(0, int(math.floor(min(ys))))
        y1 = min(height - 1, int(math.ceil(max(ys))))
        if x1 < x0 or y1 < y0:
            continue
        (ax, ay, av), (bx, by, bv), (cx, cy, cv) = points
        denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(denominator) < 1.0e-12:
            continue
        yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1]
        xx = xx.astype(np.float32)
        yy = yy.astype(np.float32)
        l1 = ((by - cy) * (xx - cx) + (cx - bx) * (yy - cy)) / denominator
        l2 = ((cy - ay) * (xx - cx) + (ax - cx) * (yy - cy)) / denominator
        l3 = 1.0 - l1 - l2
        inside = (l1 >= -0.002) & (l2 >= -0.002) & (l3 >= -0.002)
        if not np.any(inside):
            continue
        target = output[y0:y1 + 1, x0:x1 + 1]
        value = l1[..., None] * av + l2[..., None] * bv + l3[..., None] * cv
        target[inside] = value[inside]
        covered_block = covered[y0:y1 + 1, x0:x1 + 1]
        covered_block[inside] = True
    return output, covered


def _shift_no_wrap(array, dy, dx):
    """Shift a raster without numpy's wraparound edge artefact."""
    result = np.zeros_like(array)
    height, width = array.shape[:2]
    y0 = max(0, dy); y1 = min(height, height + dy)
    x0 = max(0, dx); x1 = min(width, width + dx)
    sy0 = max(0, -dy); sy1 = sy0 + max(0, y1 - y0)
    sx0 = max(0, -dx); sx1 = sx0 + max(0, x1 - x0)
    if y1 > y0 and x1 > x0:
        result[y0:y1, x0:x1] = array[sy0:sy1, sx0:sx1]
    return result


def _dilate_raster(raster, covered, radius=6):
    """Grow UV coverage by *radius* pixels and copy nearby map values.

    UV charts can leave seams between triangles. Values are propagated without
    wraparound for six pixels; anything farther away is left un-covered so the
    paint stage can fill it with the species base colour, never a zero/white
    exported texel.
    """
    values = np.asarray(raster, dtype=np.float32).copy()
    known = np.asarray(covered, dtype=bool).copy()
    shifts = tuple((dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                   if dy or dx)
    for _ in range(max(0, int(radius))):
        previous_values = values.copy()
        previous_known = known.copy()
        for dy, dx in shifts:
            candidate_known = _shift_no_wrap(previous_known, dy, dx)
            take = (~known) & candidate_known
            if np.any(take):
                candidate_values = _shift_no_wrap(previous_values, dy, dx)
                values[take] = candidate_values[take]
                known[take] = True
    return values, known


def _set_image_pixels(image, rgba):
    data = np.asarray(rgba, dtype=np.float32)
    if data.shape[-1] != 4:
        alpha = np.ones(data.shape[:-1] + (1,), dtype=np.float32)
        data = np.concatenate((data, alpha), axis=-1)
    flat = np.ascontiguousarray(data).reshape(-1)
    try:
        image.pixels.foreach_set(flat)
    except AttributeError:
        image.pixels = flat.tolist()
    image.update()


def _image_from_array(name, array, colorspace="Non-Color", pack=False):
    height, width = array.shape[:2]
    # 8-bit image buffers are stable in Blender's headless macOS build and
    # are sufficient for UV masks/paint output; the numpy maps remain float.
    image = bpy.data.images.get(name) or bpy.data.images.new(name, width, height, alpha=True, float_buffer=False)
    image.scale(width, height)
    image.colorspace_settings.name = colorspace
    _set_image_pixels(image, array)
    if pack:
        image.pack()
    return image


def _build_emit_material(name, attribute_name="rf_world_position"):
    """Construct the requested temporary EMIT-of-Position material."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.0
    vertex = nodes.new("ShaderNodeVertexColor")
    vertex.layer_name = attribute_name
    links.new(vertex.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    mat["rf_emit_attribute"] = attribute_name
    return mat


def _try_emit_bake(obj, image, attribute_name):
    """Optional Cycles EMIT verification; never prevents the CPU map path."""
    if bpy is None or os.environ.get("RAZORFIN_EMIT_BAKE") != "1":
        return False
    old_materials = list(obj.data.materials)
    old_engine = bpy.context.scene.render.engine
    try:
        material = _build_emit_material(obj.name + "_temporary_emit", attribute_name)
        obj.data.materials.clear()
        obj.data.materials.append(material)
        node = material.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        material.node_tree.nodes.active = node
        node.select = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.scene.render.engine = "CYCLES"
        bpy.ops.object.bake(type="EMIT", use_clear=True, margin=4)
        return True
    except Exception as exc:  # pragma: no cover - Blender build/platform dependent.
        print("PAINT WARN EMIT bake unavailable: %s" % exc)
        return False
    finally:
        obj.data.materials.clear()
        for material in old_materials:
            obj.data.materials.append(material)
        bpy.context.scene.render.engine = old_engine


def _find_photo_image(obj):
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type != "TEX_IMAGE" or not node.image:
                continue
            name = (node.image.name or "").lower()
            if any(word in name for word in ("normal", "rough", "metal", "occlusion", "orm")):
                continue
            return node.image
    return None


def _source_photo(obj, width, height):
    """Read the base diffuse image, preserving photo information as luminance detail."""
    source = _find_photo_image(obj)
    flat = np.asarray((0.45, 0.48, 0.48), dtype=np.float32)
    for slot in obj.material_slots:
        mat = slot.material
        if not mat:
            continue
        flat = np.asarray(mat.diffuse_color[:3], dtype=np.float32)
        if not mat.use_nodes:
            continue
    if source is None:
        return np.broadcast_to(flat, (height, width, 3)).copy()
    sw, sh = [int(x) for x in source.size]
    if sw <= 0 or sh <= 0:
        return np.broadcast_to(flat, (height, width, 3)).copy()
    # Copy through a Python list first.  On Blender 3.6/macOS a numpy view of
    # the RNA pixel slice can outlive the image's temporary unpack buffer and
    # abort the process after geometry edits; the list copy is slower but safe.
    values = np.asarray(list(source.pixels), dtype=np.float32).reshape(sh, sw, 4)[..., :3]
    ys = np.minimum(sh - 1, (np.arange(height, dtype=np.float32) * sh / height).astype(np.int32))
    xs = np.minimum(sw - 1, (np.arange(width, dtype=np.float32) * sw / width).astype(np.int32))
    return values[np.ix_(ys, xs)].copy()


def bake_world_maps(obj, width=512, height=None):
    """Bake one world-position image and geometric mask images per mesh.

    Returned ``position_map`` is decoded WORLD position (not UV position), and
    ``position_image`` is its normalized, packed-image representation.  This
    makes all subsequent layer functions independent from UV layout while
    retaining a real EMIT bake artifact for inspection.
    """
    _need_numpy()
    if height is None:
        height = width
    print("PAINT stage=world_vertices verts=%d" % len(obj.data.vertices), flush=True)
    world = _as_world_vertices(obj)
    axes = _axis_measure(world)
    vmasks = _vertex_masks(world, axes)
    values = np.concatenate((world, np.stack(tuple(vmasks.values()), axis=1)), axis=1)
    obj.data.calc_loop_triangles()
    print("PAINT stage=uv_raster triangles=%d resolution=%dx%d" %
          (len(obj.data.loop_triangles), int(width), int(height)), flush=True)
    raster, covered = _rasterize_uv(obj, values, int(width), int(height))
    initial_coverage = int(covered.sum())
    raster, covered = _dilate_raster(raster, covered, radius=6)
    print("PAINT stage=uv_raster_done", flush=True)
    print("PAINT coverage initial=%d dilated=%d total=%d" %
          (initial_coverage, int(covered.sum()), int(covered.size)), flush=True)
    position = raster[..., :3]
    masks = raster[..., 3:]
    # The image is normalized because emission inputs are clamped to 0..1.
    lo = world.min(axis=0)
    hi = world.max(axis=0)
    packed_position = _clamp((position - lo) / np.maximum(hi - lo, 1.0e-7))
    print("PAINT stage=map_images", flush=True)
    # The numpy arrays are the authoritative maps.  Creating three additional
    # Blender image datablocks is optional because Blender 3.6's headless
    # macOS image allocator can abort while a GLB's packed source images and
    # mouth kit are live.  Set RAZORFIN_STORE_MAP_IMAGES=1 for an inspection
    # scene or a local Cycles bake.
    store_map_images = os.environ.get("RAZORFIN_STORE_MAP_IMAGES") == "1"
    position_image = _image_from_array(obj.name + "_rf_position", packed_position, "Non-Color") if store_map_images else None
    mask_image = _image_from_array(obj.name + "_rf_masks", _clamp(masks), "Non-Color") if store_map_images else None
    emit_image = _image_from_array(obj.name + "_rf_emit_position", packed_position, "Non-Color") if store_map_images else None
    emit_ok = _try_emit_bake(obj, emit_image, "rf_world_position") if emit_image is not None else False
    if not emit_ok:
        print("PAINT EMIT position/masks -> CPU UV rasteriser (%d/%d texels)" %
              (int(covered.sum()), int(covered.size)))
    print("PAINT stage=maps_ready", flush=True)
    return {
        "position_map": position,
        "position_image": position_image,
        "mask_map": masks,
        "mask_image": mask_image,
        "covered": covered,
        "axes": axes,
        "bounds_min": lo,
        "bounds_max": hi,
        "width": int(width),
        "height": int(height),
    }


def _box_blur(photo, radius=5):
    """Small wrap-free blur used only to isolate photographic micro-detail."""
    radius = max(1, int(radius))
    # A compact cross-kernel is sufficient for a detail ratio and avoids the
    # large cumulative-sum temporaries that are unstable in Blender 3.6's
    # bundled numpy on some macOS runs.
    source = np.asarray(photo, dtype=np.float32)
    result = source.copy()
    shifts = ((radius, 0), (-radius, 0), (0, radius), (0, -radius),
              (radius, radius), (-radius, -radius), (radius, -radius), (-radius, radius))
    for dy, dx in shifts:
        result += np.roll(np.roll(source, dy, axis=0), dx, axis=1)
    return result / float(len(shifts) + 1)


def countershade(position_map, top, belly, softness=0.18, axes=None):
    """Return a world-space field with belly colour strictly below centreline."""
    top = _rgb(top, (0.2, 0.25, 0.28))
    belly = _rgb(belly, (0.85, 0.9, 0.9))
    if axes is None:
        axis = 2
        sign = 1.0
        centre = float(np.median(position_map[..., axis]))
    else:
        axis = int(axes["dorsal_axis"])
        sign = float(axes["dorsal_sign"])
        centre = float(axes.get("dorsal_center", np.median(position_map[..., axis])))
    relative = sign * (position_map[..., axis] - centre)
    span = float(np.percentile(np.abs(relative), 98.0))
    # ``softness`` is the width of the TRANSITION, not the width of the whole
    # ventral ramp.  Treating it as the full ramp (band = span*softness) meant
    # that with the pilot recipes' softness ~0.17 the belly colour saturated to
    # 1.0 only 17% of the half-span below the centreline, so nearly the entire
    # ventral hide became flat near-white.  Real countershading reaches full
    # belly colour only at the ventral extreme, so ramp over the whole lower
    # half and use ``softness`` to shape how abrupt the roll-off is.
    ramp = max(1.0e-7, span)
    belly_alpha = _clamp((-relative) / ramp)
    shape = max(0.35, min(3.0, 1.0 / max(0.08, float(softness) * 3.0)))
    belly_alpha = belly_alpha ** shape
    belly_alpha = belly_alpha * belly_alpha * (3.0 - 2.0 * belly_alpha)
    return top.reshape(1, 1, 3) + (belly - top).reshape(1, 1, 3) * belly_alpha[..., None]


def _axis_field(position_map, axis, axes):
    axis = str(axis or "length").lower()
    if axis in ("length", "long", "body"):
        index = int(axes["body_axis"])
        value = position_map[..., index]
        lo = float(np.min(value)); hi = float(np.max(value))
    elif axis in ("dorsal", "vertical", "up", "height"):
        index = int(axes["dorsal_axis"])
        value = float(axes["dorsal_sign"]) * position_map[..., index]
        lo = float(np.percentile(value, 2.0)); hi = float(np.percentile(value, 98.0))
    else:
        index = ({"x": 0, "y": 1, "z": 2}.get(axis, 0))
        value = position_map[..., index]
        lo = float(np.min(value)); hi = float(np.max(value))
    return _clamp((value - lo) / max(1.0e-7, hi - lo))


def stripes(position_map, axis="length", count=5, width=0.08, colour="#27353a", region="side", noise=0.06, seed=1, axes=None):
    """Return ``(mask, colour)`` for low-contrast world-space stripes."""
    axes = axes or {"body_axis": 1, "dorsal_axis": 2, "dorsal_sign": 1.0}
    field = _axis_field(position_map, axis, axes)
    noise_field = (_hash01(position_map[..., 0] * 6.3 + position_map[..., 1] * 11.7 +
                           position_map[..., 2] * 17.1 + float(seed)) - 0.5) * float(noise)
    phase = np.mod(field * float(count) + noise_field, 1.0)
    half = max(0.005, float(width)) * 0.5
    distance = np.minimum(phase, 1.0 - phase)
    mask = 1.0 - _smoothstep(half * 0.45, half, distance)
    region = region if isinstance(region, dict) else {"name": str(region).lower()}
    name = str(region.get("name", "side")).lower()
    dorsal_t = _axis_field(position_map, "dorsal", axes)
    if name == "top":
        mask *= _smoothstep(0.48, 0.72, dorsal_t)
    elif name == "belly":
        mask *= 1.0 - _smoothstep(0.25, 0.55, dorsal_t)
    elif name not in ("all", "body"):
        mask *= _smoothstep(0.18, 0.40, dorsal_t) * (1.0 - _smoothstep(0.78, 0.94, dorsal_t))
    return mask.astype(np.float32), _rgb(colour, (0.1, 0.12, 0.12))


def spots(position_map, density=0.22, radius=0.025, colour="#32464a", seed=1, axes=None):
    """Return deterministic soft spots from a 3D world-space hash field."""
    axes = axes or {"body_axis": 1, "dorsal_axis": 2, "dorsal_sign": 1.0}
    scale = max(2.0, float(density) * 42.0)
    q = position_map * scale + float(seed) * np.asarray((1.7, 3.1, 5.9), dtype=np.float32)
    cell = np.floor(q)
    local = q - cell - 0.5
    nearest = np.full(local.shape[:2], 10.0, dtype=np.float32)
    # Nine neighbouring cells are enough for a compact Worley-like spot.
    for dz in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                offset = np.asarray((dx, dy, dz), dtype=np.float32)
                random = np.stack((
                    _hash01(cell[..., 0] + dx * 17.0 + cell[..., 1] * 3.0),
                    _hash01(cell[..., 1] + dy * 23.0 + cell[..., 2] * 5.0),
                    _hash01(cell[..., 2] + dz * 29.0 + cell[..., 0] * 7.0),
                ), axis=-1) - 0.5
                distance = np.linalg.norm(local - offset - random * 0.55, axis=-1)
                nearest = np.minimum(nearest, distance)
    mask = 1.0 - _smoothstep(float(radius) * 0.55, float(radius), nearest / max(1.0e-7, scale / 12.0))
    # Keep spots off the belly unless a caller explicitly paints all masks.
    mask *= _smoothstep(0.20, 0.42, _axis_field(position_map, "dorsal", axes))
    return mask.astype(np.float32), _rgb(colour, (0.2, 0.25, 0.25))


def saddles(position_map, count=3, width=0.14, colour="#202b2d", seed=1, axes=None):
    """Broad dark saddle patches, suitable for a restrained war-paint pass."""
    axes = axes or {"body_axis": 1, "dorsal_axis": 2, "dorsal_sign": 1.0}
    field = _axis_field(position_map, "length", axes)
    phase = np.mod(field * max(1, int(count)) + _hash01(position_map[..., 0] * 4.0 + seed) * 0.08, 1.0)
    distance = np.minimum(phase, 1.0 - phase)
    mask = 1.0 - _smoothstep(float(width) * 0.45, float(width), distance)
    mask *= _smoothstep(0.28, 0.48, _axis_field(position_map, "dorsal", axes))
    mask *= 1.0 - _smoothstep(0.90, 0.98, _axis_field(position_map, "dorsal", axes))
    return mask.astype(np.float32), _rgb(colour, (0.12, 0.12, 0.12))


def fin_tips(position_map, fraction=0.22, colour="#d3d7cf", mask_map=None, axes=None):
    """Return a tip mask for fins identified by the baked geometric mask."""
    axes = axes or {"body_axis": 1, "dorsal_axis": 2, "dorsal_sign": 1.0}
    if mask_map is None or mask_map.shape[-1] < 3:
        mask = np.zeros(position_map.shape[:2], dtype=np.float32)
    else:
        fin = _clamp(mask_map[..., 2])
        lateral = _axis_field(position_map, "x", axes)
        dorsal = _axis_field(position_map, "dorsal", axes)
        edge = np.maximum(lateral, dorsal)
        threshold = 1.0 - _clamp(float(fraction), 0.01, 0.95)
        mask = fin * _smoothstep(threshold, min(1.0, threshold + 0.20), edge)
    return mask.astype(np.float32), _rgb(colour, (0.8, 0.8, 0.76))


def _border(mask):
    neighbours = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            neighbours.append(np.roll(np.roll(mask, dy, axis=0), dx, axis=1))
    return _clamp(np.maximum.reduce(neighbours) - np.minimum.reduce(neighbours))


def glow_seams(position_map, width=0.035, colour="#8adfff", mask_map=None, axes=None):
    """Paint a restrained emissive-looking line on fin/plate borders."""
    del position_map, axes  # The border itself is derived in UV from world masks.
    if mask_map is None or mask_map.shape[-1] < 4:
        mask = np.zeros(mask_map.shape[:2] if mask_map is not None else (1, 1), dtype=np.float32)
    else:
        source = _clamp(np.maximum(mask_map[..., 2], mask_map[..., 3]))
        border = _border(source)
        # ``width`` is expressed as a normalized texture width.
        repeats = max(1, int(round(float(width) * 512.0)))
        mask = border
        for _ in range(repeats - 1):
            mask = np.maximum(mask, _border(mask))
    return _clamp(mask).astype(np.float32), _rgb(colour, (0.45, 0.85, 1.0))


def _apply_layer(image, layer_mask, layer_colour, strength=0.35, darken=False):
    alpha = _clamp(layer_mask * float(strength))[:, :, None]
    colour = np.asarray(layer_colour, dtype=np.float32).reshape(1, 1, 3)
    if darken:
        colour = np.minimum(colour, image)
    return image * (1.0 - alpha) + colour * alpha


def _luminance(image):
    return np.asarray(image, dtype=np.float32)[..., :3] @ np.asarray((0.2126, 0.7152, 0.0722), dtype=np.float32)


def body_luminance(image, covered=None):
    """Return mean Rec.709 body luminance for the covered paint texels."""
    values = _luminance(image)
    if covered is not None:
        values = values[np.asarray(covered, dtype=bool)]
    values = values[np.isfinite(values)]
    return float(values.mean()) if values.size else float("nan")


def _merge_config(base, override):
    result = dict(base or {})
    if override:
        for key, value in override.items():
            if isinstance(value, dict) and isinstance(result.get(key), dict):
                result[key] = _merge_config(result[key], value)
            else:
                result[key] = value
    return result


def _paint_array(photo, maps, config):
    position = maps["position_map"]
    masks = maps["mask_map"]
    axes = maps["axes"]
    height, width = photo.shape[:2]
    species = config.get("species_hsv") or config.get("hsv") or (0.59, 0.12, 0.38)
    # Family identity starts with species_hsv. ``top`` remains accepted for
    # old recipes, but the pilot recipes intentionally have no override.
    species_colour = hsv_to_rgb(species)
    top = _rgb(config.get("top"), species_colour)
    belly = _rgb(config.get("belly"), (0.84, 0.88, 0.88))
    authored = countershade(position, top, belly, float(config.get("softness", 0.18)), axes)
    photo = _clamp(np.asarray(photo, dtype=np.float32))
    keep_photo = bool(config.get("keep_photo", True))
    if keep_photo:
        blur = _box_blur(photo, max(2, int(min(width, height) / 64)))
        # Retain photographic micro-detail as a bounded multiplicative
        # luminance modulation. It is never added to the species colour and
        # therefore cannot turn dark family paint into a white photo patch.
        detail = _clamp(_luminance(photo) / np.maximum(_luminance(blur), 0.025), 0.75, 1.25)
        result = authored * detail[..., None]
    else:
        result = authored.copy()

    applied = {"countershade": True}
    stripes_cfg = config.get("stripes")
    if stripes_cfg:
        mask, colour = stripes(position, axes=axes, **{k: v for k, v in stripes_cfg.items() if k in {
            "axis", "count", "width", "colour", "region", "noise", "seed"}})
        result = _apply_layer(result, mask, colour, min(0.42, float(stripes_cfg.get("strength", 0.30))), darken=True)
        applied["stripes"] = True
    spots_cfg = config.get("spots")
    if spots_cfg:
        mask, colour = spots(position, axes=axes, **{k: v for k, v in spots_cfg.items() if k in {
            "density", "radius", "colour", "seed"}})
        result = _apply_layer(result, mask, colour, min(0.38, float(spots_cfg.get("strength", 0.24))), darken=True)
        applied["spots"] = True
    saddles_cfg = config.get("saddles")
    if saddles_cfg:
        mask, colour = saddles(position, axes=axes, **{k: v for k, v in saddles_cfg.items() if k in {
            "count", "width", "colour", "seed"}})
        result = _apply_layer(result, mask, colour, min(0.40, float(saddles_cfg.get("strength", 0.30))), darken=True)
        applied["saddles"] = True
    tips_cfg = config.get("fin_tips")
    if tips_cfg:
        mask, colour = fin_tips(position, mask_map=masks, axes=axes, **{k: v for k, v in tips_cfg.items() if k in {"fraction", "colour"}})
        result = _apply_layer(result, mask, colour, min(0.45, float(tips_cfg.get("strength", 0.32))))
        applied["fin_tips"] = True
    seams_cfg = config.get("glow_seams")
    if seams_cfg:
        mask, colour = glow_seams(position, mask_map=masks, axes=axes, **{k: v for k, v in seams_cfg.items() if k in {"width", "colour"}})
        result = _apply_layer(result, mask, colour, min(0.55, float(seams_cfg.get("strength", 0.45))))
        applied["glow_seams"] = True
    covered = maps["covered"]
    result = _clamp(result)
    # Normalize into the Rev-3D body-light calibration while preserving the
    # species hue/value relationship. This compensates for config V values
    # being authoring values while the review image is lit.
    mean = body_luminance(result, covered)
    if np.isfinite(mean) and mean > 1.0e-6:
        calibration = float(np.clip(0.44 / mean, 0.62, 1.38))
        result = _clamp(result * calibration)
        family_base = _clamp(species_colour * calibration)
    else:
        family_base = _clamp(species_colour)
    # UV charts outside the mesh are always the family base colour. Never
    # copy the photo or an uninitialized zero map here: both created the
    # rejected white streaks after glTF color management.
    result[~covered] = family_base
    return result, applied


def _write_png_rgb(array, path):
    """Tiny stdlib PNG writer used when Blender image RNA is already busy."""
    rgb = np.clip(np.asarray(array)[..., :3] * 255.0 + 0.5, 0, 255).astype(np.uint8)
    height, width = rgb.shape[:2]
    raw = b"".join(b"\x00" + rgb[row].tobytes() for row in range(height))
    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xffffffff)
    payload = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) +
               chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))
    Path(path).write_bytes(payload)


def _save_jpeg(array, path, quality=85, max_bytes=180 * 1024, reuse_image=None):
    """Save at q85, reducing resolution rather than violating the quality flag."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    source = np.asarray(array, dtype=np.float32)
    height, width = source.shape[:2]
    sizes = []
    current = min(width, height)
    while current >= 96:
        sizes.append(int(current))
        current = int(current * 0.82)
    if not sizes:
        sizes = [min(width, height)]
    for size in sizes:
        ys = np.minimum(height - 1, (np.arange(size) * height / size).astype(np.int32))
        xs = np.minimum(width - 1, (np.arange(size) * width / size).astype(np.int32))
        scaled = source[np.ix_(ys, xs)]
        rgba = np.concatenate((scaled, np.ones((size, size, 1), dtype=np.float32)), axis=-1)
        # A row file does not need to live in the GLB.  Convert a temporary
        # stdlib PNG with macOS sips when the family image is being reused;
        # this avoids resizing a packed Blender image datablock just to emit a
        # small q85 variant.
        if reuse_image is not None and tuple(reuse_image.size) != (size, size):
            temporary = path.with_name("." + path.stem + ".rf_tmp.png")
            _write_png_rgb(scaled, temporary)
            converted = False
            try:
                subprocess.run(("/usr/bin/sips", "-s", "format", "public.jpeg", "-s", "formatOptions", str(int(quality)), str(temporary), "--out", str(path)),
                               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                converted = True
            except (OSError, subprocess.CalledProcessError):
                # Fall through to Blender's image API if sips is absent.
                pass
            finally:
                try:
                    temporary.unlink()
                except OSError:
                    pass
            if converted and path.exists():
                if path.stat().st_size <= max_bytes or size == sizes[-1]:
                    return {"path": str(path), "bytes": path.stat().st_size, "width": size, "height": size, "quality": int(quality)}
                continue
        image = reuse_image
        if image is None:
            image = _image_from_array(path.stem + "_jpeg", rgba, "sRGB")
        else:
            if tuple(image.size) != (size, size):
                image.scale(size, size)
            image.colorspace_settings.name = "sRGB"
            _set_image_pixels(image, rgba)
        image.filepath_raw = str(path)
        image.file_format = "JPEG"
        image.save(filepath=str(path), quality=int(quality))
        if path.stat().st_size <= max_bytes or size == sizes[-1]:
            return {"path": str(path), "bytes": path.stat().st_size, "width": size, "height": size, "quality": int(quality)}
    return {"path": str(path), "bytes": path.stat().st_size, "width": size, "height": size, "quality": int(quality)}


def _install_image(obj, image, name):
    material = obj.active_material
    if material is None:
        material = bpy.data.materials.new(name + "_mat")
        material.use_nodes = True
        obj.data.materials.append(material)
    material.name = name + "_mat"
    material.use_nodes = True
    nodes = material.node_tree.nodes
    principled = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    if principled is None:
        principled = nodes.new("ShaderNodeBsdfPrincipled")
        output = next((node for node in nodes if node.type == "OUTPUT_MATERIAL"), None) or nodes.new("ShaderNodeOutputMaterial")
        material.node_tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    texture = next((node for node in nodes if node.type == "TEX_IMAGE" and node.name.startswith("RF_FamilyDiffuse")), None)
    texture = texture or nodes.new("ShaderNodeTexImage")
    texture.name = "RF_FamilyDiffuse"
    texture.label = "Razorfin authored family diffuse"
    texture.image = image
    material.node_tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    # Shark hide is matte-to-satin, not a polished surface.  0.48 left a broad
    # specular sheen that read as chrome on the turntables and washed the paint
    # out to near-white regardless of the texture, so the diffuse albedo the
    # luminance gate measures never reached the render.
    # Shark hide is matte.  0.72/0.18 still left broad facet-following specular
    # flares on the flanks and fins of the low-poly bake (no normal map is
    # baked, so every flat facet returns one uniform highlight).  Push it fully
    # matte: the authored diffuse is then what the reviewer actually sees.
    principled.inputs["Roughness"].default_value = 0.92
    if "Specular" in principled.inputs:
        principled.inputs["Specular"].default_value = 0.02
    for _name in ("Specular IOR Level", "Sheen Weight", "Coat Weight", "Metallic"):
        if _name in principled.inputs:
            principled.inputs[_name].default_value = 0.02 if "Specular" in _name else 0.0
    material["rf_texture_embedded"] = True
    return material


def paint_family(obj, recipe, root=None, width=512, height=None):
    """Paint the family default and every row texture described by a recipe."""
    _need_numpy()
    root = Path(root or os.getcwd())
    family = str(recipe["family"])
    output_dir = root / "assets" / "textures" / "rows"
    default_cfg = dict(recipe.get("paint") or {})
    maps = bake_world_maps(obj, width=width, height=height)
    print("PAINT stage=photo_read", flush=True)
    photo = _source_photo(obj, maps["width"], maps["height"])
    print("PAINT stage=photo_ready", flush=True)
    default_array, applied = _paint_array(photo, maps, default_cfg)
    print("PAINT stage=default_ready", flush=True)
    mean_luminance = body_luminance(default_array, maps["covered"])
    print("PAINT rendered_body_luminance family=%s mean=%.4f texels=%d target=0.30..0.60" %
          (family, mean_luminance, int(maps["covered"].sum())), flush=True)
    if not np.isfinite(mean_luminance) or not 0.30 <= mean_luminance <= 0.60:
        raise RuntimeError("family body luminance %.4f outside 0.30..0.60" % mean_luminance)
    default_rgba = np.concatenate((default_array, np.ones(default_array.shape[:2] + (1,), dtype=np.float32)), axis=-1)
    # Use a fresh packed datablock for the authored family image.  Mutating an
    # imported GLB image in place can leave Blender's packed-file metadata
    # stale, causing the glTF exporter to omit the diffuse image even though
    # the viewport node appears linked.  The original image was already read
    # above, so photographic detail is still preserved without reusing its
    # fragile packing state.
    default_image = _image_from_array("RF_%s_family_diffuse" % family, default_rgba, "sRGB", pack=True)
    _install_image(obj, default_image, family)
    print("PAINT family image fresh packed datablock", flush=True)
    print("PAINT stage=material_ready", flush=True)
    obj["rf_paint_layers"] = json.dumps(applied, sort_keys=True)
    obj["rf_position_bounds"] = json.dumps({"min": maps["bounds_min"].tolist(), "max": maps["bounds_max"].tolist()})
    print("PAINT stage=properties_ready", flush=True)
    rows = []
    for row in recipe.get("rows", []):
        if isinstance(row, str):
            row_id, row_cfg = row, {}
        else:
            row_id, row_cfg = str(row["id"]), row.get("paint") or {}
        cfg = _merge_config(default_cfg, row_cfg)
        row_array, _ = _paint_array(photo, maps, cfg)
        saved = _save_jpeg(row_array, output_dir / (row_id + ".jpg"), quality=85, reuse_image=default_image)
        print("PAINT stage=row_saved id=%s" % row_id, flush=True)
        rows.append({"id": row_id, **saved})
    # The shared image is a row-JPEG scratch buffer while files are written;
    # restore and repack the family default before the GLB export.
    # ``Image.save`` can restore a packed image's original dimensions.  In
    # that case scaling back does not immediately resize its RNA pixel array;
    # restore at the dimensions Blender reports instead.
    restore_width, restore_height = [int(value) for value in default_image.size]
    if (restore_width, restore_height) != (maps["width"], maps["height"]):
        ys = np.minimum(default_rgba.shape[0] - 1, (np.arange(restore_height) * default_rgba.shape[0] / restore_height).astype(np.int32))
        xs = np.minimum(default_rgba.shape[1] - 1, (np.arange(restore_width) * default_rgba.shape[1] / restore_width).astype(np.int32))
        restore = default_rgba[np.ix_(ys, xs)]
    else:
        restore = default_rgba
    _set_image_pixels(default_image, restore)
    print("PAINT stage=family_restored", flush=True)
    default_image.colorspace_settings.name = "sRGB"
    default_image.pack()
    print("PAINT stage=family_packed", flush=True)
    result = {
        "family": family,
        "resolution": [maps["width"], maps["height"]],
        "covered_texels": int(maps["covered"].sum()),
        "texture": {"name": default_image.name, "packed": True},
        "rows": rows,
        "axes": {key: value for key, value in maps["axes"].items() if key in {"body_axis", "dorsal_axis", "dorsal_sign"}},
        "layers": applied,
    }
    print("PAINT %s" % json.dumps(result, sort_keys=True))
    return result
