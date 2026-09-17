"""Real fused accessory operations for Razorfin Rev 17."""

from __future__ import annotations

import argparse
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector, kdtree


try:
    from .head import measure
except Exception:  # direct execution from tools/sharklib
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from sharklib.head import measure


def _params(params):
    if params is None:
        return {}
    if isinstance(params, str):
        return {"kit": params}
    return dict(params)


def _set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def _triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def loose_part_count(obj):
    """Count connected face components, including isolated vertices."""
    if not obj or obj.type != "MESH":
        return 0
    vertices = obj.data.vertices
    polygons = obj.data.polygons
    if not vertices:
        return 0
    adjacency = {v.index: set() for v in vertices}
    for polygon in polygons:
        ids = list(polygon.vertices)
        for index in ids:
            adjacency[index].update(other for other in ids if other != index)
    unseen = set(adjacency)
    components = 0
    while unseen:
        components += 1
        stack = [unseen.pop()]
        while stack:
            index = stack.pop()
            for other in adjacency[index]:
                if other in unseen:
                    unseen.remove(other)
                    stack.append(other)
    return components


def _mesh_extent_box(obj):
    """Return (xmin, ymin, zmin, xmax, ymax, zmax) of the mesh in local space."""
    points = [v.co for v in obj.data.vertices]
    if not points:
        return (0.0,) * 6
    return (
        min(p.x for p in points), min(p.y for p in points), min(p.z for p in points),
        max(p.x for p in points), max(p.y for p in points), max(p.z for p in points),
    )


def _retain_largest_component(obj, protect_from_t=None, measurement=None):
    """Remove tiny detached islands left by a scan boolean/remesh.

    When ``protect_from_t`` is given, islands lying entirely forward of that
    station are kept as well.  The preserved head graft can leave a handful of
    small islands there (18 vertices measured), and discarding them would edit
    head geometry that the mouth cut still has to run on.

    Photogrammetry shells often contain hundreds of face islands before the
    voxel pass.  The fuse contract is one authored solid, so after the single
    post-fuse remesh we retain the largest connected surface component.  This
    is intentionally based on polygon count rather than object count; an
    imported GLB with several loose objects is already joined by the caller.
    """
    polygons = list(obj.data.polygons)
    if not polygons:
        return obj
    by_vertex = {}
    for pi, polygon in enumerate(polygons):
        for vertex in polygon.vertices:
            by_vertex.setdefault(vertex, []).append(pi)
    unseen = set(range(len(polygons)))
    components = []
    while unseen:
        seed = unseen.pop()
        stack = [seed]
        found = {seed}
        while stack:
            pi = stack.pop()
            for vertex in polygons[pi].vertices:
                for other in by_vertex.get(vertex, ()):
                    if other in unseen:
                        unseen.remove(other)
                        found.add(other)
                        stack.append(other)
        components.append(found)
    if len(components) <= 1:
        return obj
    keep = set(max(components, key=len))
    if protect_from_t is not None and measurement is not None:
        for component in components:
            if component is keep:
                continue
            if all(_station(obj.data.vertices[i].co, measurement) >= protect_from_t
                   for pi in component for i in polygons[pi].vertices):
                keep |= component
    vertices = []
    faces = []
    materials = list(obj.data.materials)
    mapping = {}
    for pi in keep:
        polygon = polygons[pi]
        face = []
        for index in polygon.vertices:
            if index not in mapping:
                mapping[index] = len(vertices)
                vertices.append(tuple(obj.data.vertices[index].co))
            face.append(mapping[index])
        faces.append(tuple(face))
    mesh = bpy.data.meshes.new(obj.data.name + " fused solid")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.clear()
    for material in materials:
        mesh.materials.append(material)
    mesh.update()
    obj.data = mesh
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def _kit_path(name):
    if os.path.isabs(name):
        return name
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.path.join(root, "assets", "kit", name)


def _import_kit(name):
    path = _kit_path(name)
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    if not meshes:
        raise RuntimeError("kit contains no mesh: %s" % path)
    if len(meshes) == 1:
        return meshes[0]
    _set_active(meshes[0])
    for part in meshes:
        part.select_set(True)
    bpy.ops.object.join()
    return meshes[0]


def _duplicate_object(obj, name):
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = name
    if obj.users_collection:
        obj.users_collection[0].objects.link(copy)
    else:
        bpy.context.scene.collection.objects.link(copy)
    return copy


def _target_axes(m):
    long_dir = Vector((0.0, 0.0, 0.0))
    long_dir[m.long_axis] = m.landmarks["head_sign"]
    up_axis = 2 if 2 != m.long_axis else next(i for i in range(3) if i != m.long_axis)
    across_axis = next(i for i in range(3) if i not in (m.long_axis, up_axis))
    across_dir = Vector((0.0, 0.0, 0.0))
    across_dir[across_axis] = 1.0
    up_dir = Vector((0.0, 0.0, 0.0))
    up_dir[up_axis] = 1.0
    return long_dir, across_dir, up_dir


def _median(values):
    values = sorted(values)
    if not values:
        return 0.0
    return values[(len(values) - 1) // 2]


def _percentile(values, fraction):
    values = sorted(values)
    if not values:
        return 0.0
    at = (len(values) - 1) * max(0.0, min(1.0, fraction))
    lo, hi = int(math.floor(at)), int(math.ceil(at))
    return values[lo] + (values[hi] - values[lo]) * (at - lo)


def _axis_ids(m):
    axis = m.long_axis
    up_axis = 2 if axis != 2 else next(i for i in range(3) if i != axis)
    across_axis = next(i for i in range(3) if i not in (axis, up_axis))
    return axis, across_axis, up_axis


def _station(point, m):
    """The io contract's station: tail=0, nose=1."""
    axis, _, _ = _axis_ids(m)
    lo = float(m.landmarks.get("long_min", 0.0))
    hi = float(m.landmarks.get("long_max", lo + m.L))
    if m.landmarks.get("head_sign", 1) > 0:
        return (point[axis] - lo) / max(m.L, 1.0e-9)
    return (hi - point[axis]) / max(m.L, 1.0e-9)


def _long_at(t, m):
    axis, _, _ = _axis_ids(m)
    lo = float(m.landmarks.get("long_min", 0.0))
    hi = float(m.landmarks.get("long_max", lo + m.L))
    return lo + float(t) * m.L if m.landmarks.get("head_sign", 1) > 0 else hi - float(t) * m.L


def _fin_indices(m):
    indices = set()
    for values in m.fin_groups.values():
        indices.update(values)
    return indices


def _section(obj, m, t, slab=0.035, exclude_fins=True):
    excluded = _fin_indices(m) if exclude_fins else set()
    points = [v.co.copy() for v in obj.data.vertices
              if abs(_station(v.co, m) - float(t)) <= slab and v.index not in excluded]
    if len(points) < 8 and exclude_fins:
        points = [v.co.copy() for v in obj.data.vertices
                  if abs(_station(v.co, m) - float(t)) <= slab]
    return points


def _section_stats(obj, m, t):
    axis, across_axis, up_axis = _axis_ids(m)
    points = _section(obj, m, t)
    if not points:
        points = [v.co.copy() for v in obj.data.vertices]
    across = [p[across_axis] for p in points]
    up = [p[up_axis] for p in points]
    across_center = _median(across)
    up_center = _median(up)
    # The ring must be centred on the section CENTROID, not on the spine or
    # the bbox centre: a median centre on an asymmetric (belly-heavy) section
    # sits above the true middle, so a ring sized to clear the far side hangs
    # far below the belly.  The centroid is the mean of the section points.
    centroid_across = sum(across) / len(across)
    centroid_up = sum(up) / len(up)
    radii = [math.hypot(p[across_axis] - across_center, p[up_axis] - up_center) for p in points]
    # Radii about the centroid, used by the collar rule.  ``radius_max`` is the
    # true circumscribing radius of the section: a percentile leaves part of
    # the body outside the ring.  The 0.995 quantile rejects a single stray
    # scan spike without shrinking inside the silhouette.
    centroid_radii = [math.hypot(p[across_axis] - centroid_across, p[up_axis] - centroid_up)
                      for p in points]
    width = max(across) - min(across)
    height = max(up) - min(up)
    radius = max(_percentile(radii, 0.82), 1.0e-5)
    radius_max = max(_percentile(sorted(centroid_radii), 0.995), 1.0e-5)
    # Some approved bases (tigershark) are nearly flat in the across axis at
    # the head stations, so the raw width collapses to ~0.007 and any kit
    # sized from it renders invisible.  ``girth`` is the degenerate-proof
    # cross-section scale head-anchored kits size from: never smaller than the
    # section radius or a small fraction of body length.
    girth = max(width, radius * 1.6, m.L * 0.06)
    return {
        "points": points,
        "across_center": across_center,
        "up_center": up_center,
        "centroid_across": centroid_across,
        "centroid_up": centroid_up,
        "radius_max": radius_max,
        "width": width,
        "height": height,
        "girth": girth,
        "radius": radius,
        "axis": axis,
        "across_axis": across_axis,
        "up_axis": up_axis,
    }


def _dorsal_ridge(obj, m, t):
    """Return the skin ridge, excluding measured dorsal/side fins."""
    stats = _section_stats(obj, m, t)
    axis, across_axis, up_axis = _axis_ids(m)
    points = [p for p in stats["points"]
              if abs(p[across_axis] - stats["across_center"]) <= max(stats["width"] * 0.46, m.L * 0.025)]
    if not points:
        points = stats["points"]
    return max(p[up_axis] for p in points)


def _dorsal_height(obj, m):
    dorsal = set(m.fin_groups.get("dorsal", set()))
    if not dorsal:
        return max(m.H * 0.10, m.L * 0.01)
    values = []
    for index in dorsal:
        vertex = obj.data.vertices[index]
        t = _station(vertex.co, m)
        if 0.30 <= t <= 0.78:
            values.append(vertex.co[_axis_ids(m)[2]] - _dorsal_ridge(obj, m, t))
    return max(max(values) if values else m.H * 0.10, m.L * 0.01)


def _bounds(kit):
    points = [v.co for v in kit.data.vertices]
    if not points:
        return {"xmin": 0.0, "xmax": 1.0, "ymin": 0.0, "ymax": 1.0, "zmin": 0.0, "zmax": 1.0}
    return {
        "xmin": min(p.x for p in points), "xmax": max(p.x for p in points),
        "ymin": min(p.y for p in points), "ymax": max(p.y for p in points),
        "zmin": min(p.z for p in points), "zmax": max(p.z for p in points),
    }


def _scale_multipliers(params):
    value = params.get("scale", 1.0)
    if isinstance(value, (tuple, list)):
        values = tuple(float(v) for v in value)
        if len(values) == 1:
            return values * 3
        if len(values) == 2:
            return (values[0], values[1], values[1])
        return values[:3]
    return (float(value),) * 3


def _placement_name(kit, params):
    name = os.path.splitext(os.path.basename(str(params.get("kit", kit.name))))[0].lower()
    placement = str(params.get("landmark", params.get("placement", ""))).lower()
    if name == "armor_collar" or placement in ("collar", "neck"):
        return "armor_collar"
    if name in ("plate_row", "spine_row") or placement in ("dorsal", "back", "dorsal_base"):
        return name if name in ("plate_row", "spine_row") else "plate_row"
    if name in ("crown_a", "horns_pair") or placement in ("head_top", "crown", "horns"):
        return name if name in ("crown_a", "horns_pair") else "crown_a"
    if name == "hammer_foil" or placement in ("hammer", "snout"):
        return "hammer_foil"
    if name == "whale_hood" or placement in ("hood", "head"):
        return "whale_hood"
    if name == "saw_rostrum" or placement in ("saw", "rostrum"):
        return "saw_rostrum"
    return name


def _offset_vector(params, long_dir, across_dir, up_dir):
    offset = params.get("offset", (0.0, 0.0, 0.0))
    if isinstance(offset, dict):
        offset = (offset.get("x", 0.0), offset.get("y", 0.0), offset.get("z", 0.0))
    values = Vector(offset)
    return across_dir * values.x + long_dir * values.y + up_dir * values.z


def _finish_placement(obj, kit, m, kind, metrics):
    kit.matrix_world = obj.matrix_world.copy()
    kit.location = (0.0, 0.0, 0.0)
    kit.rotation_euler = (0.0, 0.0, 0.0)
    kit.scale = (1.0, 1.0, 1.0)
    kit.data.update()
    for key, value in metrics.items():
        if isinstance(value, (int, float)):
            kit["rf_" + key] = float(value)
    kit["rf_placement_kind"] = kind
    obj["_rf_last_kit"] = kit.name
    obj["rf_last_accessory_kind"] = kind
    obj["rf_last_accessory_max_surface_distance"] = float(metrics.get("max_surface_distance", 0.0))
    for key in ("collar_ratio", "collar_station", "plate_top_z", "plate_top_allowed_z",
                "plate_top_margin", "dorsal_height", "ornament_width", "width_ratio",
                "collar_max_gap", "collar_overhang_side", "collar_overhang_top",
                "plate_max_height"):
        if key in metrics:
            obj["rf_last_accessory_" + key] = float(metrics[key])
    obj["rf_last_accessory_metrics"] = repr(metrics)
    # Forward-most station the placed kit occupies, so the caller can keep its
    # preserved-head cut in front of the ornament instead of over it.
    stations = [_station(v.co, m) for v in kit.data.vertices]
    kit.data.update()
    kit["rf_kit_min_station"] = float(min(stations)) if stations else 1.0
    kit["rf_kit_max_station"] = float(max(stations)) if stations else 1.0
    return kit


def _max_surface_distance(obj, kit):
    """Farthest distance from any kit vertex to the nearest body vertex.

    Uses a KD-tree; the naive form is O(kit x body) in Python and dominated
    the placement cost once kits are solidified.
    """
    body_points = [v.co.copy() for v in obj.data.vertices]
    if not body_points:
        return 0.0
    tree = kdtree.KDTree(len(body_points))
    for index, point in enumerate(body_points):
        tree.insert(point, index)
    tree.balance()
    maximum = 0.0
    for vertex in kit.data.vertices:
        _, _, distance = tree.find(vertex.co)
        maximum = max(maximum, distance)
    return maximum


def _pectoral_station(obj, m):
    """Station of the pectoral girdle, measured from the body every time.

    The collar must sit at the neck/shoulder on any base.  A fixed t=.72 is
    not anatomically equivalent across bases, and the ``pectoral_left``
    landmark alone is not trustworthy either: it is derived from a fixed
    station window, so it degrades on a base whose proportions differ.  The
    girdle is found here as the station where the measured lateral width
    peaks over the forward half of the body -- that is the widest part of the
    trunk, just behind the head -- and the landmark is only used to break a
    tie.  The result is clamped to a plausible neck band.
    """
    best_t, best_width = None, -1.0
    t = 0.55
    while t <= 0.86 + 1.0e-9:
        width = _section_stats(obj, m, t)["width"]
        if width > best_width:
            best_width, best_t = width, t
        t += 0.01
    candidates = []
    if best_t is not None:
        candidates.append(best_t)
    pectoral = m.landmarks.get("pectoral_left")
    if pectoral is not None:
        station = _station(pectoral, m)
        if 0.55 <= station <= 0.86:
            candidates.append(station)
    if not candidates:
        return 0.72
    # Sit just forward of the girdle so the ring lands on the neck rather
    # than on the fin roots themselves.
    return max(0.58, min(0.84, sum(candidates) / len(candidates) + 0.04))


def _section_radius_profile(stats, bins=48):
    """Body radius about the section centroid, sampled per angle bin.

    Returns a list of ``bins`` radii covering 0..2pi.  Empty bins are filled by
    interpolating their nearest populated neighbours, so a sparse scan section
    still yields a closed contour.
    """
    across_axis, up_axis = stats["across_axis"], stats["up_axis"]
    cx, cy = stats["centroid_across"], stats["centroid_up"]
    buckets = [[] for _ in range(bins)]
    for point in stats["points"]:
        dx = point[across_axis] - cx
        dy = point[up_axis] - cy
        radius = math.hypot(dx, dy)
        index = int(((math.atan2(dy, dx) % (2.0 * math.pi)) / (2.0 * math.pi)) * bins) % bins
        buckets[index].append(radius)
    # The OUTERMOST point in each bin is the silhouette; a mean would sit
    # inside the body and let the ring cut through the skin.
    profile = [max(values) if values else None for values in buckets]
    if all(value is None for value in profile):
        return [max(stats["radius_max"], 1.0e-5)] * bins
    for index in range(bins):
        if profile[index] is not None:
            continue
        back = next(profile[(index - k) % bins] for k in range(1, bins + 1)
                    if profile[(index - k) % bins] is not None)
        forward = next(profile[(index + k) % bins] for k in range(1, bins + 1)
                       if profile[(index + k) % bins] is not None)
        profile[index] = (back + forward) * 0.5
    return profile


def _sample_profile(profile, angle):
    """Linearly interpolate a per-angle radius profile."""
    bins = len(profile)
    position = ((angle % (2.0 * math.pi)) / (2.0 * math.pi)) * bins
    lo = int(math.floor(position)) % bins
    hi = (lo + 1) % bins
    fraction = position - math.floor(position)
    return profile[lo] + (profile[hi] - profile[lo]) * fraction


def _place_kit_object(obj, kit, params):
    """Place a kit from measured body dimensions at its authored landmark.

    ``scale`` is a multiplier on the measured rule for the selected kit; it is
    never an absolute ``scale * L`` transform.  The returned object remains the
    imported kit so callers can preserve its authored materials in ``hi``.
    """
    params = _params(params)
    m = measure(obj)
    kind = _placement_name(kit, params)
    sx, sy, sz = _scale_multipliers(params)
    long_dir, across_dir, up_dir = _target_axes(m)
    axis, across_axis, up_axis = _axis_ids(m)
    bounds = _bounds(kit)
    metrics = {"kind": kind, "scale": sx, "body_L": m.L}
    offset = _offset_vector(params, long_dir, across_dir, up_dir)
    points = list(kit.data.vertices)

    if kind == "armor_collar":
        # The contract station t=.72 is NOT anatomically equivalent across the
        # approved bases: it lands on greatwhite's pectorals (long .2216 vs
        # pectoral .2085) but well forward of tigershark's shoulder (pectoral
        # .0819), which put the ring out past the flank.  Anchor the collar
        # just behind the measured pectoral girdle instead, falling back to
        # t=.72 only when that landmark is missing.
        collar_t = _pectoral_station(obj, m)
        stats = _section_stats(obj, m, collar_t)
        target = Vector((0.0, 0.0, 0.0))
        target[axis] = _long_at(collar_t, m)
        # Centre the ring on the section CENTROID.  The median centre sits on
        # the spine of an asymmetric section, so a ring sized to clear the far
        # side stood off the back and hung a long way below the belly -- the
        # "huge hoop" in the turntable review.
        metrics["collar_station"] = collar_t
        # The authored armor_collar ring lies in its local XY plane (radius
        # 0.19..0.27) and is only 0.08 thick in Z.  Measuring the radius about
        # XZ collapses the inner radius to zero and unwraps the ring into a
        # flat blade, so the ring plane is XY and Z is the axial thickness.
        canonical_x = (bounds["xmin"] + bounds["xmax"]) * 0.5
        canonical_y = (bounds["ymin"] + bounds["ymax"]) * 0.5
        radii = [math.hypot(p.co.x - canonical_x, p.co.y - canonical_y) for p in points]
        inner = min(radii) if radii else 0.1
        radial_span = max(max(radii) - inner, 1.0e-6) if radii else 0.1
        # Inner radius = the section's MAX radius about the centroid x 1.05.
        # The old 0.82 percentile about the median left ~18% of the section
        # outside the ring on one side while the ring stood far off on the
        # other, which is what made it read as a detached hoop.
        body_radius = stats["radius_max"]
        target_inner = body_radius * 1.05 * sx
        # A CIRCULAR ring of radius max*1.05 still stands far off a section
        # that is not round: measured on tigershark it left a 0.186L gap at the
        # narrow sides and hung 0.104L outside the side silhouette.  The ring
        # therefore follows the section's own outline: the body radius is
        # sampled per angle about the centroid and the ring is offset outward
        # from that contour, so it hugs the body all the way round.
        # The approved bases are OPEN photogrammetry shells (tigershark: 5,924
        # of 13,147 edges are boundaries, 1,246 of them at this station), so a
        # thin slab leaves most of the ring's circumference with no measured
        # body at all -- 29 of 48 angle bins on tigershark, the rest filled by
        # interpolation.  A wider slab is sampled for the contour: it takes
        # greatwhite from 41 to 48 populated bins.  Fins are kept OUT so the
        # ring is not sized to a pectoral blade.
        contour_stats = dict(stats)
        contour_stats["points"] = _section(obj, m, collar_t, slab=0.10)
        if len(contour_stats["points"]) < 8:
            contour_stats = stats
        else:
            contour_across = [p[across_axis] for p in contour_stats["points"]]
            contour_up = [p[up_axis] for p in contour_stats["points"]]
            contour_stats["centroid_across"] = sum(contour_across) / len(contour_across)
            contour_stats["centroid_up"] = sum(contour_up) / len(contour_up)
        # 48 bins left the ring cutting chords between samples on a lumpy scan
        # (max surface gap 0.050L against a 0.020L target); 144 follows the
        # outline closely enough that the residual is the shell's own noise.
        contour = _section_radius_profile(contour_stats, 144)
        target[across_axis] = contour_stats["centroid_across"]
        target[up_axis] = contour_stats["centroid_up"]
        # The ring's INNER surface should graze the skin: a 5% radial standoff
        # measured 0.026L median / 0.061L max clear of the surface.  A small
        # negative clearance sinks the inner face slightly into the skin, which
        # both closes the visual gap and gives the voxel remesh real
        # interpenetration to weld against.
        clearance = -0.01 * body_radius * sx
        axial_span = 0.04 * m.L * sy
        yaw = float(params.get("yaw", 0.0))
        zspan = max(bounds["zmax"] - bounds["zmin"], 1.0e-6)
        for vertex, radius in zip(points, radii):
            p = vertex.co.copy()
            angle = math.atan2(p.y - canonical_y, p.x - canonical_x) + yaw
            local_radius = _sample_profile(contour, angle)
            # Radial position within the authored ring cross-section maps to
            # the band between the skin clearance and the ring thickness.
            band = (radius - inner) / radial_span
            # The authored ring cross-section spans the .04L thickness OUTWARD
            # from the skin, so the inner face tracks the contour exactly
            # instead of the whole ring being pushed out by its own radius.
            new_radius = local_radius + clearance + band * (0.04 * m.L * sx)
            axial = (p.z - (bounds["zmin"] + bounds["zmax"]) * 0.5) / zspan
            vertex.co = target + across_dir * math.cos(angle) * new_radius
            vertex.co += up_dir * math.sin(angle) * new_radius
            vertex.co += long_dir * axial * axial_span
            vertex.co += offset
        metrics.update({"body_radius": body_radius, "collar_inner_radius": target_inner,
                        "collar_ratio": (target_inner / max(body_radius, 1.0e-9))})
        # Measured, not assumed: how far the finished ring stands off the skin,
        # and how far it pokes outside the body silhouette in the side and top
        # views.  The review rejected a ring that satisfied a radius RATIO but
        # still hung a long way clear of the body, so both are gated.
        body_points = [v.co for v in obj.data.vertices]
        if body_points:
            tree = kdtree.KDTree(len(body_points))
            for index, point in enumerate(body_points):
                tree.insert(point, index)
            tree.balance()
            metrics["collar_max_gap"] = max(tree.find(v.co)[2] for v in points)
            for label, sample_axis in (("side", up_axis), ("top", across_axis)):
                lo = min(p[sample_axis] for p in body_points)
                hi = max(p[sample_axis] for p in body_points)
                klo = min(v.co[sample_axis] for v in points)
                khi = max(v.co[sample_axis] for v in points)
                metrics["collar_overhang_" + label] = max(lo - klo, khi - hi, 0.0)

    elif kind in ("plate_row", "spine_row"):
        plate = kind == "plate_row"
        dorsal_height = _dorsal_height(obj, m)
        max_height = (0.55 if plate else 0.25) * dorsal_height * sz
        t0, t1 = 0.35, 0.75
        y0, y1 = bounds["ymin"], bounds["ymax"]
        yspan = max(y1 - y0, 1.0e-6)
        step = 0.10
        max_x = max(abs(v.co.x) for v in points) if points else 0.1
        top_limit = -1.0e18
        top_allowed = -1.0e18
        for vertex in points:
            p = vertex.co.copy()
            u = max(0.0, min(1.0, (p.y - y0) / yspan))
            t = t0 + (t1 - t0) * u
            stats = _section_stats(obj, m, t)
            ridge = _dorsal_ridge(obj, m, t)
            if plate:
                index = int(round((p.y - y0) / step))
                factor = max(0.35, 1.0 - 0.105 * index)
                base_c, top_c = -0.055 * factor, 0.25 * factor
            else:
                index = int(round((p.y - y0) / step))
                factor = max(0.45, 1.0 - 0.09 * index)
                base_c, top_c = 0.0, 0.20 * factor
            # ``local_u`` normalises the WHOLE authored plate, skirt included.
            # Mapping that 0..1 span onto ``height`` made ``height`` the plate's
            # total size rather than its size ABOVE the skin, so the buried
            # skirt (18% of the authored z-span) plus the 0.01L sink ate most of
            # it and the row rendered as ~.02L tabs instead of back plates.
            # ``height`` is now the VISIBLE height above the measured ridge and
            # the sink depth is added below it, so the rule
            # "largest plate ~= .55 x dorsal fin height" is what the eye sees.
            local_u = max(0.0, min(1.0, (p.z - base_c) / max(top_c - base_c, 1.0e-6)))
            skirt = max(0.0, min(0.9, -base_c / max(top_c - base_c, 1.0e-6)))
            taper = 0.55 + 0.45 * max(0.0, 1.0 - abs(t - 0.55) / 0.20)
            height = max_height * taper
            sink = 0.01 * m.L
            # Remap so local_u == skirt lands exactly on the ridge, the plate
            # top (local_u == 1) lands at ridge + height, and the authored
            # skirt occupies the sink depth below the skin.
            if local_u >= skirt:
                up_value = ridge + (local_u - skirt) / max(1.0 - skirt, 1.0e-6) * height
            else:
                up_value = ridge - (1.0 - local_u / max(skirt, 1.0e-6)) * sink
            half_width = max(stats["width"] * 0.33, m.L * 0.012) * sx
            vertex.co = Vector((0.0, 0.0, 0.0))
            vertex.co[axis] = _long_at(t, m)
            vertex.co[across_axis] = stats["across_center"] + (p.x / max(max_x, 1.0e-6)) * half_width
            vertex.co[up_axis] = up_value
            vertex.co += offset
            top_limit = max(top_limit, vertex.co[up_axis])
            top_allowed = max(top_allowed, ridge + 0.55 * dorsal_height)
        # The tallest plate's height ABOVE THE RIDGE, which is what the eye
        # judges.  The old code reported only absolute top z, so a row that had
        # sunk into the body still looked fine in the numbers.
        plate_max_height = 0.0
        for vertex in points:
            t_here = _station(vertex.co, m)
            plate_max_height = max(plate_max_height,
                                   vertex.co[up_axis] - _dorsal_ridge(obj, m, t_here))
        metrics.update({"dorsal_height": dorsal_height, "plate_top_z": top_limit,
                        "plate_max_height": plate_max_height,
                        "plate_top_allowed_z": top_allowed, "plate_top_margin": top_limit - top_allowed})

    elif kind in ("crown_a", "horns_pair"):
        head_top = m.landmarks.get("head_top", m.landmarks.get("head", Vector((0.0, 0.0, 0.0))))
        t = max(0.80, min(0.99, _station(head_top, m)))
        stats = _section_stats(obj, m, t)
        # head_top is a single landmark vertex and can sit well below the
        # actual skin ridge at the crown station (on tigershark it is 0.031
        # against a 0.147 body top), which built the crown down inside the
        # head where the voxel remesh melted the prongs away.  Seat the crown
        # on the MEASURED ridge at its own station instead.
        ridge = _dorsal_ridge(obj, m, t)
        head_top = head_top.copy()
        head_top[up_axis] = max(head_top[up_axis], ridge)
        # The crown must OVERLAP the skin, not rest on it.  head_top is the
        # topmost skin vertex, so lifting the base clear of it (the old
        # +0.008L) left the ornament touching the body along a single ridge
        # line at best.  The voxel remesh could not bridge that gap, the union
        # stayed a separate shell, and _retain_largest_component then deleted
        # the crown while keeping the body -- which is why the fuse reported
        # every gate green with no crown in the render.  Seating the base
        # 0.02L below the skin gives the remesh real interpenetration to weld.
        center = head_top - up_dir * (0.02 * m.L) + offset
        # The crown must clear the skin enough to read as an ornament at
        # review resolution: girth*0.70 put a greatwhite crown only ~0.09
        # above a 0.99-long body, which renders as a bare head.  The head
        # girth is the width rule; the height is taken against body length so
        # a slim head still gets a visible crown.
        width = stats["girth"] * 1.20 * sx
        # The crown has to clear the WHOLE silhouette, not just the local head
        # station.  On a base whose head sits well below the dorsal line
        # (tigershark: head_top 0.031 against a 0.147 body top) a height taken
        # only from the local girth leaves the prongs under the back line, so
        # the ornament reads as a lump.  The deficit to the body top is added
        # in, then the authored clearance on top of that.
        body_top = max((v.co[up_axis] for v in obj.data.vertices), default=head_top[up_axis])
        deficit = max(0.0, body_top - head_top[up_axis])
        height = (max(stats["girth"] * 0.70, 0.11 * m.L) + deficit) * sz
        depth = min(stats["girth"] * 0.65, 0.12 * m.L) * sy
        cx = max(max(abs(v.co.x) for v in points), 1.0e-6)
        cy = max(bounds["ymax"] - bounds["ymin"], 1.0e-6) * 0.5
        zspan = max(bounds["zmax"] - bounds["zmin"], 1.0e-6)
        for vertex in points:
            p = vertex.co.copy()
            vertex.co = center + across_dir * (p.x / cx) * width * 0.5
            vertex.co += long_dir * ((p.y - (bounds["ymin"] + bounds["ymax"]) * 0.5) / cy) * depth * 0.5
            # Height is measured from the seated base, so the sink depth is
            # added back to keep the visible crown at the intended height.
            vertex.co += up_dir * ((p.z - bounds["zmin"]) / zspan) * (height + 0.02 * m.L)
        metrics.update({"head_width": stats["girth"], "ornament_width": width,
                        "width_ratio": width / max(stats["girth"], 1.0e-9)})

    elif kind in ("hammer_foil", "whale_hood"):
        t = 0.90
        stats = _section_stats(obj, m, t)
        center = Vector((0.0, 0.0, 0.0))
        center[axis] = _long_at(t, m)
        center[across_axis] = stats["across_center"]
        center[up_axis] = stats["up_center"] + 0.015 * m.L
        center += offset
        width_factor = 1.60 if kind == "hammer_foil" else 1.50
        width = stats["girth"] * width_factor * sx
        depth = min(stats["girth"] * (0.70 if kind == "hammer_foil" else 0.85), 0.16 * m.L) * sy
        height = min(stats["girth"] * (0.55 if kind == "hammer_foil" else 0.65), 0.14 * m.L) * sz
        cx = max(max(abs(v.co.x) for v in points), 1.0e-6)
        cy = max(bounds["ymax"] - bounds["ymin"], 1.0e-6) * 0.5
        zspan = max(bounds["zmax"] - bounds["zmin"], 1.0e-6)
        for vertex in points:
            p = vertex.co.copy()
            vertex.co = center + across_dir * (p.x / cx) * width * 0.5
            vertex.co += long_dir * ((p.y - (bounds["ymin"] + bounds["ymax"]) * 0.5) / cy) * depth * 0.5
            vertex.co += up_dir * ((p.z - (bounds["zmin"] + bounds["zmax"]) * 0.5) / zspan) * height
        metrics.update({"head_width": stats["girth"], "ornament_width": width,
                        "width_ratio": width / max(stats["girth"], 1.0e-9)})

    elif kind == "saw_rostrum":
        head_top = m.landmarks.get("head_top", m.landmarks.get("nose"))
        stats = _section_stats(obj, m, 0.90)
        nose = m.landmarks.get("nose", head_top).copy()
        nose[across_axis] = stats["across_center"]
        length = 0.22 * m.L * sy
        width = stats["girth"] * 0.35 * sx
        zspan = min(stats["girth"] * 0.30, 0.08 * m.L) * sz
        yspan = max(bounds["ymax"] - bounds["ymin"], 1.0e-6)
        xspan = max(max(abs(v.co.x) for v in points), 1.0e-6)
        pz = (bounds["zmin"] + bounds["zmax"]) * 0.5
        for vertex in points:
            p = vertex.co.copy()
            vertex.co = nose + long_dir * ((p.y - bounds["ymin"]) / yspan) * length
            vertex.co += across_dir * (p.x / xspan) * width * 0.5
            vertex.co += up_dir * ((p.z - pz) / max(bounds["zmax"] - bounds["zmin"], 1.0e-6)) * zspan
            vertex.co += offset
        metrics.update({"rostrum_length": length, "rostrum_width": width})

    else:
        landmark = str(params.get("landmark", "dorsal_base"))
        target = m.landmarks.get(landmark, m.landmarks["dorsal_base"]).copy() + offset
        stats = _section_stats(obj, m, max(0.0, min(1.0, _station(target, m))))
        width = max(stats["width"] * sx, m.L * 0.02)
        depth = max(stats["width"] * sy, m.L * 0.02)
        height = max(stats["height"] * sz, m.L * 0.02)
        xspan = max(bounds["xmax"] - bounds["xmin"], 1.0e-6)
        yspan = max(bounds["ymax"] - bounds["ymin"], 1.0e-6)
        zspan = max(bounds["zmax"] - bounds["zmin"], 1.0e-6)
        for vertex in points:
            p = vertex.co.copy()
            vertex.co = target + across_dir * ((p.x - (bounds["xmin"] + bounds["xmax"]) * 0.5) / xspan) * width
            vertex.co += long_dir * ((p.y - (bounds["ymin"] + bounds["ymax"]) * 0.5) / yspan) * depth
            vertex.co += up_dir * ((p.z - (bounds["zmin"] + bounds["zmax"]) * 0.5) / zspan) * height

    metrics["max_surface_distance"] = _max_surface_distance(obj, kit)
    return _finish_placement(obj, kit, m, kind, metrics)


def place_kit(obj, params=None):
    """Place one canonical kit in the object's local space and return obj.

    ``params``: ``kit``, ``landmark``, ``offset`` (local x/y/z), ``scale``
    (scalar or xyz), and ``yaw`` in radians.  Normal recipe callers should use
    ``apply_accessories`` when they also need boolean fusion and the hi copy.
    """
    params = _params(params)
    kit = _import_kit(params.get("kit", "crown_a.glb"))
    _place_kit_object(obj, kit, params)
    return obj


def _clean_for_boolean(obj):
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        if bm.verts:
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1.0e-6)
            boundary = [edge for edge in bm.edges if edge.is_boundary]
            if boundary and len(boundary) < 4096:
                try:
                    bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
                except Exception:
                    pass
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        obj.data.update()
    finally:
        bm.free()


def _apply_modifier(obj, modifier):
    _set_active(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def _ensure_solid(kit, thickness):
    """Give a flat/open kit real thickness before it is used as a boolean operand.

    ``hammer_foil`` is authored as a two-lobe sheet with no enclosed volume.
    A UNION against a zero-volume shell is degenerate: the EXACT solver can
    return "success" while emitting only the operand, which silently deletes
    the shark.  Solidifying first gives the union a real interior, so the
    normal EXACT path succeeds and no fallback is needed.
    """
    points = [v.co for v in kit.data.vertices]
    if not points:
        return kit
    spans = sorted(max(p[i] for p in points) - min(p[i] for p in points) for i in range(3))
    if spans[0] > thickness * 0.9:
        return kit
    modifier = kit.modifiers.new("L2 kit solidify", "SOLIDIFY")
    modifier.thickness = max(float(thickness), 1.0e-5)
    modifier.offset = 0.0
    modifier.use_even_offset = False
    try:
        _apply_modifier(kit, modifier)
    except Exception:
        if modifier.name in kit.modifiers:
            kit.modifiers.remove(modifier)
    kit.data.update()
    return kit


def _voxel_remesh(obj, voxel_size):
    modifier = obj.modifiers.new("L2 accessory voxel fuse", "REMESH")
    modifier.mode = "VOXEL"
    modifier.voxel_size = max(float(voxel_size), 1.0e-5)
    modifier.adaptivity = 0.0
    try:
        _apply_modifier(obj, modifier)
    except Exception:
        if modifier.name in obj.modifiers:
            obj.modifiers.remove(modifier)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update()


def _region_voxel_remesh(obj, voxel_size, m, keep_from_t=0.75):
    """Voxel-remesh the fused region while preserving head topology exactly.

    The plain whole-body ``_voxel_remesh`` rebuilds EVERY face, head included.
    The family pipeline cuts the mouth AFTER accessories, so a remesh that
    rewrites the snout replaces the fine scan topology there with long uniform
    voxel edges running across the future jaw-weight gradient.  ``probe_jaw``
    then measures those edges stretching: leviathanrex reported 5.68x with the
    accessory and 1.55x without it.

    Splitting the mesh and remeshing only the aft half does NOT work: the voxel
    remesher needs a closed manifold, and an aft shell with the head cut away is
    open, so it shatters (measured: 163 islands, and the largest-component pass
    then kept a fragment with L collapsed 1.00 -> 0.25).

    Instead the WHOLE body is remeshed exactly as before -- so the fused kit
    region is welded the way it always was -- and the head is then spliced back
    from a pre-remesh snapshot: the remeshed faces forward of ``keep_from_t``
    are discarded and the original head faces are grafted in their place.  The
    graft is a vertex-for-vertex copy, so every preserved position is unchanged.
    The two parts overlap across the seam band, so the result is one component.
    """
    head = _duplicate_object(obj, "L2 head keep")
    head_set = set()
    for polygon in obj.data.polygons:
        if all(_station(obj.data.vertices[i].co, m) >= keep_from_t
               for i in polygon.vertices):
            head_set.add(polygon.index)
    if not head_set or len(head_set) >= len(obj.data.polygons):
        # Nothing to protect (or everything is head): plain whole-body remesh.
        _remove_object(head)
        _voxel_remesh(obj, voxel_size)
        return obj

    # Snapshot: keep ONLY the original head faces on the spare copy.
    bm = bmesh.new()
    bm.from_mesh(head.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in head_set],
                     context="FACES")
    bm.to_mesh(head.data)
    bm.free()
    head.data.update()

    # Remesh the whole closed body, unchanged from the original behaviour.
    _voxel_remesh(obj, voxel_size)

    # Drop the remeshed head.  A face goes only if ALL of its vertices are
    # forward of the cut, so the seam band survives and the graft overlaps it.
    m_post = measure(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    doomed = [f for f in bm.faces
              if all(_station(v.co, m_post) >= keep_from_t for v in f.verts)]
    if doomed and len(doomed) < len(bm.faces):
        bmesh.ops.delete(bm, geom=doomed, context="FACES")
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
        _join(obj, head)
        # The graft and the remeshed body do not share vertices at the cut, so
        # they arrive as two islands and _retain_largest_component would delete
        # the head (measured: L collapsed to exactly 0.7506, the aft portion).
        # Bridge the seam by snapping remeshed boundary vertices onto the
        # nearest ORIGINAL head boundary vertex, then merging.  The head
        # vertices are the snap targets, so none of them moves.
        _weld_graft_seam(obj, keep_from_t, voxel_size)
    else:
        bm.free()
        _remove_object(head)
    return obj


def _weld_graft_seam(obj, keep_from_t, voxel_size):
    """Weld the preserved head graft to the remeshed body at the cut.

    Boundary vertices of the remeshed part are snapped onto the nearest
    preserved-head boundary vertex and merged, so the seam closes without
    moving any protected vertex.
    """
    m = measure(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    boundary = [v for v in bm.verts if v.is_boundary]
    if not boundary:
        bm.free()
        return
    head_side = [v for v in boundary if _station(v.co, m) >= keep_from_t]
    aft_side = [v for v in boundary if _station(v.co, m) < keep_from_t]
    if head_side and aft_side:
        tree = kdtree.KDTree(len(head_side))
        for index, vertex in enumerate(head_side):
            tree.insert(vertex.co, index)
        tree.balance()
        # Wide enough that the small head islands the graft leaves behind also
        # find a partner and join the main surface.  At 2.5x, 22 preserved
        # vertices sat on islands that _retain_largest_component then deleted
        # (head_preserved 98.6%, just under the 99% gate).
        limit = voxel_size * 6.0
        # Weld each aft boundary vertex ONTO its nearest head boundary vertex
        # with an explicit pair map, so the head vertex is always the survivor.
        # A remove_doubles over the whole boundary instead welded protected
        # head vertices to each other (21 preserved positions were lost).
        pairs = {}
        for vertex in aft_side:
            _, index, distance = tree.find(vertex.co)
            if distance <= limit:
                pairs[vertex] = head_side[index]
        if pairs:
            bmesh.ops.weld_verts(bm, targetmap=pairs)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def _long_extent(obj, m):
    """Extent of the mesh along the measured long axis."""
    axis, _, _ = _axis_ids(m)
    values = [v.co[axis] for v in obj.data.vertices]
    return (max(values) - min(values)) if values else 0.0


def _kit_extent_present(obj, kit, up_axis, tolerance):
    """True if the union actually brought the kit's silhouette into ``obj``.

    A UNION against a shredded photogrammetry shell (tigershark's base carries
    842 loose components) can report success while quietly emitting only the
    body: the kit is dropped, no error is raised, and every downstream gate --
    component count, body preservation, triangle budget -- still reports
    green.  The kit's own extreme is therefore checked against the result.
    """
    kit_points = [v.co[up_axis] for v in kit.data.vertices]
    body_points = [v.co[up_axis] for v in obj.data.vertices]
    if not kit_points or not body_points:
        return True
    kit_top = max(kit_points)
    body_top = max(body_points)
    # Only meaningful when the kit stands proud of the body in the first place.
    if kit_top <= body_top:
        return True
    return body_top >= kit_top - tolerance


def _boolean_union(obj, kit, solver):
    """Union ``kit`` into ``obj``, rolling back a destructive result.

    An open, non-manifold kit (hammer_foil is a flat two-lobe sheet) has no
    valid interior, so the EXACT solver can "succeed" while collapsing the
    result to the kit alone -- the body is silently deleted and the later
    largest-component pass then keeps the ornament instead of the shark.  The
    mesh is snapshotted first and restored whenever the union loses most of
    the body's long-axis extent, so the caller falls through to FAST and then
    to the non-destructive join.
    """
    m = measure(obj)
    before_extent = _long_extent(obj, m)
    backup = obj.data.copy()
    _set_active(obj)
    modifier = obj.modifiers.new("L2 accessory union %s" % solver.lower(), "BOOLEAN")
    modifier.operation = "UNION"
    modifier.solver = solver
    modifier.object = kit
    try:
        _apply_modifier(obj, modifier)
    except Exception:
        if modifier.name in obj.modifiers:
            obj.modifiers.remove(modifier)
        bpy.data.meshes.remove(backup)
        return False
    after_extent = _long_extent(obj, measure(obj))
    _, _, up_axis = _axis_ids(m)
    kit_landed = _kit_extent_present(obj, kit, up_axis, m.L * 0.03)
    if not obj.data.polygons or after_extent < before_extent * 0.75 or not kit_landed:
        destroyed = obj.data
        obj.data = backup
        bpy.data.meshes.remove(destroyed)
        return False
    bpy.data.meshes.remove(backup)
    return True


def _join(obj, other):
    _set_active(obj)
    other.select_set(True)
    bpy.ops.object.join()
    return obj


def _decimate_protect_group(obj, measurement, protect_from_t):
    """Vertex group weighting the head at 0 so the decimate leaves it alone.

    Returns the group name, or ``None`` when there is nothing to protect.
    """
    if measurement is None or protect_from_t is None:
        return None
    name = "L2 decimate protect"
    group = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
    aft, head = [], []
    for vertex in obj.data.vertices:
        (head if _station(vertex.co, measurement) >= protect_from_t else aft).append(vertex.index)
    if not head or not aft:
        obj.vertex_groups.remove(group)
        return None
    group.add(aft, 1.0, "REPLACE")
    group.add(head, 0.0, "REPLACE")
    return name


def _gentle_decimate(obj, tri_budget, protect_from_t=None, measurement=None):
    tri_budget = max(12, int(tri_budget))
    protect = _decimate_protect_group(obj, measurement, protect_from_t)
    pass_index = 0
    while _triangles(obj) > tri_budget and pass_index < 24:
        before = _triangles(obj)
        modifier = obj.modifiers.new("L2 gentle decimate %02d" % pass_index, "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.use_collapse_triangulate = True
        modifier.ratio = max(0.08, min(0.96, (tri_budget * 0.985) / max(1, before)))
        if protect:
            modifier.vertex_group = protect
        try:
            _apply_modifier(obj, modifier)
        except Exception:
            if modifier.name in obj.modifiers:
                obj.modifiers.remove(modifier)
            break
        pass_index += 1
    if _triangles(obj) > tri_budget:
        modifier = obj.modifiers.new("L2 final gentle decimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.use_collapse_triangulate = True
        modifier.ratio = max(0.05, min(0.96, (tri_budget * 0.995) / max(1, _triangles(obj))))
        if protect:
            modifier.vertex_group = protect
        try:
            _apply_modifier(obj, modifier)
        except Exception:
            if modifier.name in obj.modifiers:
                obj.modifiers.remove(modifier)
    return obj


def _remove_object(obj):
    if obj and obj.name in bpy.data.objects:
        bpy.data.objects.remove(obj, do_unlink=True)


def apply_accessories(obj, params=None):
    """Place and fuse kit GLBs, then return ``(low, hi)``.

    ``hi`` is a separate pre-op reference containing the original photo
    material plus the placed kit materials/vertex colours.  ``low`` receives
    EXACT -> FAST -> remesh-only boolean handling, one voxel remesh if a fuse
    was attempted, and the shark_bake gentle-pass triangle reducer.
    """
    params = _params(params)
    kits = params.get("kits")
    if kits is None:
        kits = [params] if params.get("kit") else []
    if isinstance(kits, dict):
        kits = [kits]
    kits = [dict(item) for item in kits]
    budget = max(1, int(params.get("tri_budget", params.get("tris", 9000))))
    before = _triangles(obj)
    named_mouth_names = {"cavity", "upperteeth", "lowerteeth"}
    other_objects = [candidate for candidate in bpy.context.scene.objects
                     if candidate is not obj and candidate.type == "MESH"
                     and (candidate.name.lower() in named_mouth_names
                          or any(candidate.name.lower().startswith(name) for name in named_mouth_names))]
    other_triangles = sum(_triangles(candidate) for candidate in other_objects)
    added_budget = min(1500, max(0, budget - before - other_triangles))
    hi = _duplicate_object(obj, "hi")
    hi["rf_role"] = "hi"
    any_fuse = False
    solver_names = []

    placement_records = []
    for item in kits:
        # Place one copy for the high reference, and a separate copy for the
        # low boolean so joining cannot erase the photo source materials.
        placed_hi = _place_kit_object(hi, _import_kit(item.get("kit", "crown_a.glb")), item)
        _join(hi, placed_hi)
        placed_low = _place_kit_object(obj, _import_kit(item.get("kit", "crown_a.glb")), item)
        placement_records.append({
            "kit": str(item.get("kit", "crown_a.glb")),
            "kind": placed_low.get("rf_placement_kind", ""),
            "kit_min_station": float(placed_low.get("rf_kit_min_station", 0.0)),
            "kit_max_station": float(placed_low.get("rf_kit_max_station", 1.0)),
            "max_surface_distance": float(placed_low.get("rf_max_surface_distance", 0.0)),
            "collar_ratio": float(placed_low.get("rf_collar_ratio", 0.0)),
            "plate_top_z": float(placed_low.get("rf_plate_top_z", 0.0)),
            "plate_top_allowed_z": float(placed_low.get("rf_plate_top_allowed_z", 0.0)),
            "plate_top_margin": float(placed_low.get("rf_plate_top_margin", 0.0)),
        })
        _ensure_solid(placed_low, measure(obj).L * 0.02)
        _clean_for_boolean(obj)
        _clean_for_boolean(placed_low)
        used = None
        for solver in ("EXACT", "FAST"):
            if _boolean_union(obj, placed_low, solver):
                used = solver
                any_fuse = True
                _remove_object(placed_low)
                break
        if used is None:
            _join(obj, placed_low)
            used = "REMESH_ONLY"
            any_fuse = True
        solver_names.append(used)

    if any_fuse:
        # Region-restricted: the head forward of t .75 is set aside and rejoined
        # untouched, so the mouth cut that the family pipeline runs AFTER this
        # step still has the original fine scan topology to work with.  A
        # whole-body remesh here was what pushed leviathanrex's jaw stretch to
        # 5.68x (1.55x without the accessory).
        # Head-anchored kits (crown, horns, hammer foil, hood, saw) are fused
        # INTO the t>.75 region, so protecting that region would restore the
        # pre-fuse head over the top of them and delete the ornament -- the
        # crown_visible gate caught exactly that.  The head is protected only
        # when every kit in this call is fused aft of the cut, which is the
        # case that the mouth actually depends on.
        head_anchored = {"crown_a", "horns_pair", "hammer_foil", "whale_hood",
                         "saw_rostrum"}
        protect_head = all(
            record.get("kind") not in head_anchored for record in placement_records)
        # A head-anchored kit is fused INTO the protected band, so the graft
        # would restore the pre-fuse head over the ornament.  The cut is pushed
        # forward of the kit instead of abandoning protection: skipping the
        # region remesh entirely made the plain whole-body remesh destroy the
        # body on both head kits (L 0.993 -> 0.60, 25-29k added tris), because
        # the graft had been silently repairing that damage.
        keep_from_t = 0.75
        if not protect_head:
            kit_front = 1.0
            for record in placement_records:
                if record.get("kind") in head_anchored:
                    kit_front = min(kit_front, record.get("kit_min_station", 0.0))
            keep_from_t = max(0.75, min(0.98, kit_front + 0.02))
        _region_voxel_remesh(obj, measure(obj).L / 220.0, measure(obj),
                             keep_from_t=keep_from_t)
        obj["rf_accessory_head_keep_from_t"] = float(keep_from_t)
        obj["rf_accessory_head_protected"] = bool(protect_head)
        # _retain_largest_component keeps the body and throws away every other
        # island.  If a kit failed to weld it is one of those islands, so the
        # ornament is silently deleted while every gate still reports green
        # (component count 1, body preserved, tris in budget).  The bbox is
        # snapshotted so that loss is detected and reported rather than hidden.
        before_extent_box = _mesh_extent_box(obj)
        # NOTE: protect_from_t is deliberately NOT used here.  Keeping the head
        # islands preserved 18 more vertices but left 7 components, and
        # "components == 1" is a hard family gate.  The islands are welded into
        # the main surface by the seam pass instead; the residual loss is
        # reported by the head_preserved gate rather than hidden.
        _retain_largest_component(obj)
        after_extent_box = _mesh_extent_box(obj)
        obj["rf_accessory_extent_lost"] = float(
            max(before_extent_box[i + 3] - after_extent_box[i + 3] for i in range(3)))
    # The accessory allowance is measured after reserving the current mesh and
    # any named mouth/teeth objects.  This keeps a 6.8k base + <=700 mouth +
    # <=1.5k accessory result inside the 9k family budget.
    # The decimate collapses edges anywhere, head included, which would undo
    # the topology the region remesh just protected.  Restrict it to the aft
    # region for the same reason.
    _gentle_decimate(obj, before + added_budget, protect_from_t=(0.75 if any_fuse else None),
                     measurement=measure(obj) if any_fuse else None)
    after = _triangles(obj)
    obj["rf_accessory_solvers"] = ",".join(solver_names) or "NONE"
    obj["rf_accessory_fused"] = bool(any_fuse)
    obj["rf_accessory_tri_before"] = before
    obj["rf_accessory_tri_after"] = after
    obj["rf_accessory_added_triangles"] = max(0, after - before)
    obj["rf_accessory_tri_budget"] = budget
    obj["rf_accessory_other_triangles"] = other_triangles
    obj["rf_accessory_added_budget"] = added_budget
    obj["rf_accessory_placement_records"] = repr(placement_records)
    obj["rf_accessory_loose_parts"] = loose_part_count(obj)
    hi["rf_hi_triangles"] = _triangles(hi)
    return obj, hi


def fuse(obj, params=None):
    """Recipe-friendly name for ``apply_accessories``."""
    return apply_accessories(obj, params)


def _cli():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Fuse one accessory kit headlessly")
    parser.add_argument("--in", dest="inp", required=True)
    parser.add_argument("--out")
    parser.add_argument("--kit", default="crown_a.glb")
    parser.add_argument("--tri-budget", type=int, default=9000)
    args = parser.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.inp)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    obj = max(meshes, key=lambda o: len(o.data.polygons))
    low, hi = apply_accessories(obj, {"kits": [{"kit": args.kit, "landmark": "dorsal_base"}], "tri_budget": args.tri_budget})
    print("ACCESSORIES", args.kit, "before", low.get("rf_accessory_tri_before"), "after", _triangles(low), "loose", loose_part_count(low), "hi", _triangles(hi))
    if args.out:
        _set_active(low)
        bpy.ops.export_scene.gltf(filepath=args.out, export_format="GLB", use_selection=True, export_apply=True)


if __name__ == "__main__":
    _cli()
