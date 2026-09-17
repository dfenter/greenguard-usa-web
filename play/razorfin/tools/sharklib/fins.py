"""Measured fin operations for Razorfin Rev 17.

Every public operation accepts a mesh object and a parameter dictionary and
returns that same mesh object.  Groups are created geometrically by the local
measure shim in ``head.py`` when L1's io module has not landed yet.
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector


try:
    from .head import measure
except Exception:  # direct execution from tools/sharklib
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from sharklib.head import measure


def _axis_vector(axis, sign=1.0):
    out = Vector((0.0, 0.0, 0.0))
    out[int(axis)] = float(sign)
    return out


def _params(params):
    if params is None:
        return {}
    if isinstance(params, str):
        return {"group": params}
    return dict(params)


def _indices(obj, group_name, create=True):
    m = measure(obj)
    group_name = str(group_name)
    group = obj.vertex_groups.get(group_name)
    if group:
        indices = {
            v.index
            for v in obj.data.vertices
            if any(g.group == group.index and g.weight > 0.0 for g in v.groups)
        }
        if indices:
            return m, indices
    indices = set(m.fin_groups.get(group_name, set()))
    if not indices and create:
        # A useful fallback for custom recipes: the named geometric group can
        # be absent on a small source, so use the largest available fin mask.
        candidates = [(name, values) for name, values in m.fin_groups.items() if values]
        if candidates:
            _, indices = max(candidates, key=lambda item: len(item[1]))
    if indices and create and not group:
        group = obj.vertex_groups.new(name=group_name)
        group.add(sorted(indices), 1.0, "REPLACE")
    return m, indices


def select_by_vertex_group(obj, params=None):
    """Select the requested fin group and return ``obj``.

    Parameters: ``group`` (dorsal, pectoral_l/r, caudal_upper/lower, anal,
    pelvic).  Missing groups are populated by the measurement shim.
    """
    params = _params(params)
    group_name = params.get("group", "dorsal")
    _, indices = _indices(obj, group_name)
    for vertex in obj.data.vertices:
        vertex.select = vertex.index in indices
    obj["rf_selected_fin_group"] = str(group_name)
    return obj


def _basis(m):
    axis = m.long_axis
    up_axis = 2 if 2 != axis else next(i for i in range(3) if i != axis)
    across_axis = next(i for i in range(3) if i not in (axis, up_axis))
    return (
        _axis_vector(axis, m.landmarks["head_sign"]),
        _axis_vector(across_axis, 1.0),
        _axis_vector(up_axis, 1.0),
    )


def _component(point, direction):
    return point.dot(direction)


def _base_center(obj, indices, m, ring_fraction=0.16):
    if not indices:
        return Vector((0.0, 0.0, 0.0))
    long_dir, _, _ = _basis(m)
    stations = [
        (obj.data.vertices[i].co - m.landmarks["head"]).dot(long_dir)
        for i in indices
    ]
    minimum = min(stations)
    cutoff = minimum + max(stations) - minimum * 0.0
    cutoff = minimum + (max(stations) - minimum) * float(ring_fraction)
    ring = [
        obj.data.vertices[i].co.copy()
        for i in indices
        if (obj.data.vertices[i].co - m.landmarks["head"]).dot(long_dir) <= cutoff + 1.0e-6
    ]
    if not ring:
        ring = [obj.data.vertices[i].co.copy() for i in indices]
    out = Vector((0.0, 0.0, 0.0))
    for p in ring:
        out += p
    return out / max(1, len(ring))


def scale_about_base(obj, params=None):
    """Scale a selected fin about its measured base ring.

    Parameters: ``group``, ``scale`` (scalar or across/up/long tuple), and
    optional ``base_fraction``.  A scalar scales the whole fin uniformly.
    """
    params = _params(params)
    group_name = params.get("group", "dorsal")
    m, indices = _indices(obj, group_name)
    if not indices:
        return obj
    base = _base_center(obj, indices, m, params.get("base_fraction", 0.16))
    long_dir, across_dir, up_dir = _basis(m)
    value = params.get("scale", 1.0)
    if isinstance(value, (tuple, list)):
        scales = tuple(float(v) for v in value)
        if len(scales) == 2:
            scales = (1.0, scales[0], scales[1])
        elif len(scales) < 3:
            scales = (scales[0],) * 3
    else:
        scales = (float(value),) * 3
    for index in indices:
        vertex = obj.data.vertices[index]
        delta = vertex.co - base
        vertex.co = base + long_dir * _component(delta, long_dir) * scales[0]
        vertex.co += across_dir * _component(delta, across_dir) * scales[1]
        vertex.co += up_dir * _component(delta, up_dir) * scales[2]
    obj.data.update()
    obj["rf_fin_scale_group"] = str(group_name)
    obj["rf_fin_scale"] = tuple(scales)
    return obj


def _sorted_ring(vertices, indices, center, long_dir, across_dir, up_dir, station):
    candidates = []
    values = [
        (vertices[i].co - center).dot(long_dir)
        for i in indices
    ]
    if not values:
        return []
    threshold = min(values) + (max(values) - min(values)) * station
    band = max((max(values) - min(values)) * 0.13, 1.0e-5)
    for i in indices:
        p = vertices[i].co
        d = (p - center).dot(long_dir)
        if abs(d - threshold) <= band:
            angle = math.atan2((p - center).dot(up_dir), (p - center).dot(across_dir))
            candidates.append((angle, i))
    return [i for _, i in sorted(candidates)]


def _duplicate_selected_faces(obj, indices, offset, taper=1.0):
    """Duplicate selected faces with bmesh and connect their root ring."""
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        selected = {v for v in bm.verts if v.index in indices}
        faces = [f for f in bm.faces if all(v in selected for v in f.verts)]
        if not faces:
            return 0
        geom = list(selected) + faces
        result = bmesh.ops.duplicate(bm, geom=geom)
        new_verts = [e for e in result.get("geom", []) if isinstance(e, bmesh.types.BMVert)]
        if not new_verts:
            return 0
        old_by_index = {v.index: v for v in bm.verts if v in selected}
        vert_map = result.get("vert_map", {})
        for old, new in vert_map.items():
            new.co = old.co * float(taper) + offset
        # Connect the new fin to the original base ring. This is deliberately
        # a low-poly bridge; unlike a floating duplicate it remains one graph.
        roots = sorted(
            [v for v in selected],
            key=lambda v: (v.co - sum((q.co for q in selected), Vector()) / max(1, len(selected))).length,
        )[: min(24, len(selected))]
        root_pairs = []
        for old in roots:
            new = vert_map.get(old)
            if new:
                root_pairs.append((old, new))
        root_pairs.sort(key=lambda pair: math.atan2(pair[0].co.z, pair[0].co.x))
        for i in range(len(root_pairs) - 1):
            a, b = root_pairs[i][0], root_pairs[i + 1][0]
            c, d = root_pairs[i + 1][1], root_pairs[i][1]
            try:
                bm.faces.new((a, b, c, d))
            except ValueError:
                pass
        bm.to_mesh(obj.data)
        obj.data.update()
        return len(new_verts)
    finally:
        bm.free()


def duplicate_along(obj, params=None):
    """Duplicate a fin along the body axis and bridge each copied root.

    Parameters: ``group``, ``count`` (default 2), ``spacing`` as a fraction of
    measured length, and ``taper`` per copy.
    """
    params = _params(params)
    group_name = params.get("group", "dorsal")
    m, indices = _indices(obj, group_name)
    if not indices:
        return obj
    long_dir, _, _ = _basis(m)
    count = max(0, min(8, int(params.get("count", 2))))
    spacing = float(params.get("spacing", 0.10)) * m.L
    taper = float(params.get("taper", 0.82))
    created = 0
    for copy_index in range(1, count + 1):
        created += _duplicate_selected_faces(
            obj, indices, long_dir * spacing * copy_index, taper ** copy_index
        )
    obj["rf_fin_duplicates"] = count
    obj["rf_fin_duplicate_vertices"] = created
    return obj


def extrude_tip(obj, params=None):
    """Extend a caudal tip, suitable for the thresher whip silhouette.

    Parameters: ``group`` (default caudal_upper), ``length`` as a fraction of
    body length, ``taper`` and ``tip_fraction``.
    """
    params = _params(params)
    group_name = params.get("group", "caudal_upper")
    m, indices = _indices(obj, group_name)
    if not indices:
        return obj
    long_dir, across_dir, up_dir = _basis(m)
    tip_fraction = float(params.get("tip_fraction", 0.22))
    stations = [(obj.data.vertices[i].co.dot(long_dir), i) for i in indices]
    lo, hi = min(s for s, _ in stations), max(s for s, _ in stations)
    tip_cut = hi - max((hi - lo) * tip_fraction, m.L * 0.015)
    tip_indices = {i for station, i in stations if station >= tip_cut}
    if len(tip_indices) < 3:
        tip_indices = indices
    center = sum((obj.data.vertices[i].co for i in tip_indices), Vector()) / len(tip_indices)
    length = float(params.get("length", 0.18)) * m.L
    taper = max(0.08, min(1.0, float(params.get("taper", 0.38))))
    created = _duplicate_selected_faces(obj, tip_indices, long_dir * length, taper)
    obj["rf_fin_extrude_group"] = str(group_name)
    obj["rf_fin_extrude_length"] = length
    obj["rf_fin_extrude_tip_vertices"] = len(tip_indices)
    obj["rf_fin_extrude_created_vertices"] = created
    return obj


def sail(obj, params=None):
    """Apply the authored high dorsal sail preset and return ``obj``."""
    params = _params(params)
    options = dict(params)
    options.setdefault("group", "dorsal")
    options.setdefault("scale", (1.0, 1.14, float(params.get("height", 1.65))))
    scale_about_base(obj, options)
    obj["rf_fin_preset"] = "sail"
    return obj


def _triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def _cli():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Run one measured fin operation headlessly")
    parser.add_argument("--in", dest="inp", required=True)
    parser.add_argument("--out")
    parser.add_argument("--op", choices=("select", "scale", "duplicate", "extrude", "sail"), default="sail")
    parser.add_argument("--group", default="dorsal")
    args = parser.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.inp)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    obj = max(meshes, key=lambda o: len(o.data.polygons))
    before = _triangles(obj)
    params = {"group": args.group}
    if args.op == "select":
        select_by_vertex_group(obj, params)
    elif args.op == "scale":
        scale_about_base(obj, {**params, "scale": 1.45})
    elif args.op == "duplicate":
        duplicate_along(obj, {**params, "count": 2})
    elif args.op == "extrude":
        extrude_tip(obj, {**params, "length": 0.18})
    else:
        sail(obj, params)
    print("FINS", args.op, "before", before, "after", _triangles(obj))
    if args.out:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.export_scene.gltf(filepath=args.out, export_format="GLB", use_selection=True, export_apply=True)


if __name__ == "__main__":
    _cli()

