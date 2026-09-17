"""Authored head operations for Razorfin Rev 17.

The functions in this module deliberately work on a mesh object in its local
space.  That makes them useful both before and after the L1 rig/mouth pass and
keeps the authored geometry independent from a particular armature pose.

The small ``measure`` shim is the temporary L2 contract.  It has the same
six-value shape L1's ``sharklib.io.measure`` is expected to expose:
``long_axis, L, zc, H, landmarks, fin_groups``.  Once io.py exists, the
wrapper delegates to it without changing callers.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from collections import namedtuple

import bpy
import bmesh
from mathutils import Matrix, Vector


try:  # L1 may land this while the lanes are running.
    from .io import measure as _io_measure
except Exception:  # pragma: no cover - exercised until L1 lands
    try:
        from sharklib.io import measure as _io_measure
    except Exception:
        _io_measure = None


MeshMeasure = namedtuple(
    "MeshMeasure", ["long_axis", "L", "zc", "H", "landmarks", "fin_groups"]
)


def _axis_vector(axis, sign=1.0):
    out = Vector((0.0, 0.0, 0.0))
    out[int(axis)] = float(sign)
    return out


def _smoothstep(value, lo, hi):
    if hi <= lo:
        return 1.0 if value >= hi else 0.0
    t = max(0.0, min(1.0, (value - lo) / (hi - lo)))
    return t * t * (3.0 - 2.0 * t)


def _tail_to_head_station(point, measure):
    """Return the documented ``t`` station, tail=0 and nose=1."""
    axis = measure.long_axis
    long_min = float(measure.landmarks.get("long_min", 0.0))
    long_max = float(measure.landmarks.get("long_max", long_min + measure.L))
    if measure.landmarks.get("head_sign", 1) > 0:
        return (point[axis] - long_min) / max(measure.L, 1.0e-9)
    return (long_max - point[axis]) / max(measure.L, 1.0e-9)


def _head_dimensions(obj, measure, t_min=0.80):
    """Measure across/up silhouette dimensions in the authored head region."""
    axis = measure.long_axis
    up_axis = 2 if 2 != axis else next(i for i in range(3) if i != axis)
    across_axis = next(i for i in range(3) if i not in (axis, up_axis))
    points = [v.co for v in obj.data.vertices if _tail_to_head_station(v.co, measure) >= t_min]
    if not points:
        points = [v.co for v in obj.data.vertices]
    return (
        max(p[across_axis] for p in points) - min(p[across_axis] for p in points),
        max(p[up_axis] for p in points) - min(p[up_axis] for p in points),
    )


def _station(point, measure):
    """Return normalized head-to-tail station for a local-space point."""
    axis = measure.long_axis
    head = measure.landmarks["head_coord"]
    return (head - point[axis]) * measure.landmarks["head_sign"] / measure.L


def _measured_head_sign(obj, axis, up_axis, across_axis):
    """Return +1 if the nose lies at the high end of ``axis``, else -1.

    L1's ``io.measure`` does not re-orient the mesh: it *assumes* the bake
    contract (nose at +Y) and then defines ``nose`` as simply the max-Y
    vertex.  For a base whose GLB was authored nose-at--Y (``tigershark`` is
    one) that assumption is silently wrong, ``nose`` is really the caudal tip,
    and every station derived from it is mirrored -- which is what put the
    armor collar around the tail.

    Polarity is therefore measured from the geometry, using the same
    discriminator ``io.orient`` uses for its own flip test plus a shape term:
    a snout is a fuller, rounder section, while the caudal fin is a thin, tall
    blade.  Both terms agree strongly on the approved bases.
    """
    coords = [v.co for v in obj.data.vertices]
    if not coords:
        return 1
    lo = min(p[axis] for p in coords)
    hi = max(p[axis] for p in coords)
    L = max(hi - lo, 1.0e-9)
    mid = (lo + hi) * 0.5

    # Term 1: mean radial girth of each half (io.orient's polarity test).
    def girth(sample):
        if not sample:
            return 0.0
        return sum(math.hypot(p[across_axis], p[up_axis]) for p in sample) / len(sample)

    front_girth = girth([p for p in coords if p[axis] > mid])
    back_girth = girth([p for p in coords if p[axis] <= mid])

    # Term 2: the extreme tip aspect ratio. A caudal fin is much taller than
    # it is wide; a snout is comparatively round.
    def tip_aspect(high):
        band = [p for p in coords
                if ((p[axis] - lo) / L >= 0.92 if high else (p[axis] - lo) / L <= 0.08)]
        if not band:
            return 0.0
        width = max(p[across_axis] for p in band) - min(p[across_axis] for p in band)
        height = max(p[up_axis] for p in band) - min(p[up_axis] for p in band)
        return width / max(height, 1.0e-9)

    score = 0
    score += 1 if front_girth > back_girth else -1
    score += 1 if tip_aspect(True) > tip_aspect(False) else -1
    # A tie keeps the documented contract (nose at the high end).
    return 1 if score >= 0 else -1


def _coerce_measure(raw, obj):
    """Normalize L1's dict contract to the temporary named-tuple contract."""
    if not isinstance(raw, dict):
        return raw
    vertices = list(obj.data.vertices)
    axis = int(raw.get("long_axis", 1))
    up_axis = 2 if axis != 2 else next(i for i in range(3) if i != axis)
    across_axis = next(i for i in range(3) if i not in (axis, up_axis))
    coords = [v.co for v in vertices]
    long_min = min(p[axis] for p in coords)
    long_max = max(p[axis] for p in coords)
    L = float(raw.get("L", long_max - long_min)) or (long_max - long_min)
    zc = float(raw.get("zc", 0.0))

    # Polarity is MEASURED, never assumed. See _measured_head_sign.
    head_sign = _measured_head_sign(obj, axis, up_axis, across_axis)
    lm = dict(raw.get("landmarks") or {})
    head_coord = long_max if head_sign > 0 else long_min
    tail_coord = long_min if head_sign > 0 else long_max

    def station_of(point):
        return (point[axis] - long_min) / max(L, 1.0e-9) if head_sign > 0 \
            else (long_max - point[axis]) / max(L, 1.0e-9)

    def long_at(t):
        return long_min + t * L if head_sign > 0 else long_max - t * L

    if head_sign < 0:
        # io.measure derived these under the wrong polarity, so the ones that
        # are defined by an end of the body are re-derived here. Landmarks
        # that are symmetric in the long axis (flanks, back_mid) still hold.
        lm["nose"] = min(vertices, key=lambda v: v.co[axis]).co.copy()
        # The crown anchors on head_top, so take the band well forward of the
        # dorsal hump: on tigershark a t>=0.72 band puts its highest vertex on
        # the back (t~0.73), not on the head.
        head_band = [v for v in vertices if station_of(v.co) >= 0.88]
        if not head_band:
            head_band = [v for v in vertices if station_of(v.co) >= 0.72]
        if head_band:
            lm["head_top"] = max(head_band, key=lambda v: v.co[up_axis]).co.copy()
        # flank_l/flank_r were picked from a mirrored t window, so the
        # pectoral girdle landmarks are re-derived under the true polarity.
        flank_band = [v for v in vertices if 0.48 <= station_of(v.co) <= 0.72
                      and abs(v.co[up_axis] - zc) <= 0.20 * float(raw.get("H", 1.0))]
        if flank_band:
            lm["pectoral_left"] = min(flank_band, key=lambda v: v.co[across_axis]).co.copy()
            lm["pectoral_right"] = max(flank_band, key=lambda v: v.co[across_axis]).co.copy()
        tail_band = [v for v in vertices if 0.17 <= station_of(v.co) <= 0.27]
        if tail_band:
            total = Vector((0.0, 0.0, 0.0))
            for v in tail_band:
                total += v.co
            lm["tail_base"] = total / len(tail_band)

    lm.setdefault("long_min", long_min)
    lm.setdefault("long_max", long_max)
    lm["head_sign"] = head_sign
    lm["head_coord"] = head_coord
    lm.setdefault("head", lm.get("head_top", Vector((0, 0, 0))).copy())
    lm.setdefault("snout", lm.get("nose", lm["head"]).copy())
    lm.setdefault("jaw", lm["snout"].copy())
    neck = Vector((0.0, 0.0, 0.0))
    neck[axis] = long_at(0.72)
    neck[up_axis] = zc
    lm.setdefault("neck", neck)
    lm.setdefault("dorsal_base", lm.get("back_mid", lm["head"]).copy())
    lm.setdefault("pectoral_left", lm.get("flank_l", lm["head"]).copy())
    lm.setdefault("pectoral_right", lm.get("flank_r", lm["head"]).copy())
    lm.setdefault("tail_base", lm.get("tail_base", lm["head"]).copy())
    caudal = Vector((0.0, 0.0, 0.0))
    caudal[axis] = tail_coord
    caudal[up_axis] = zc
    lm.setdefault("caudal", caudal)
    groups = {name: set(values) for name, values in (raw.get("fin_groups") or {}).items()}
    return MeshMeasure(axis, L, zc, float(raw.get("H", 1.0)), lm, groups)


def _local_measure(obj):
    vertices = list(obj.data.vertices) if obj and obj.type == "MESH" else []
    if not vertices:
        raise ValueError("measure() needs a mesh object with vertices")

    coords = [v.co.copy() for v in vertices]
    mins = [min(p[i] for p in coords) for i in range(3)]
    maxs = [max(p[i] for p in coords) for i in range(3)]
    spans = [maxs[i] - mins[i] for i in range(3)]
    long_axis = max(range(3), key=lambda i: spans[i])
    residual = [i for i in range(3) if i != long_axis]
    # The shipped bakes are z-up, but keeping this geometric makes the shim
    # useful for a source whose object matrix has been applied differently.
    up_axis = 2 if 2 in residual and spans[2] >= spans[residual[0]] * 0.70 else residual[0]
    across_axis = next(i for i in residual if i != up_axis)
    L = max(spans[long_axis], 1.0e-6)

    zc = (mins[up_axis] + maxs[up_axis]) * 0.5
    across_c = (mins[across_axis] + maxs[across_axis]) * 0.5
    H = max(spans[up_axis], 1.0e-6)
    W = max(spans[across_axis], 1.0e-6)

    def end_score(sign):
        # Head end = fuller end. A mean radius beats a single caudal-fin tip.
        boundary = maxs[long_axis] if sign > 0 else mins[long_axis]
        sample = [p for p in coords if abs(p[long_axis] - boundary) <= L * 0.18]
        if not sample:
            return 0.0
        radii = [
            math.hypot(p[up_axis] - zc, p[across_axis] - across_c)
            for p in sample
        ]
        radii.sort()
        q = radii[int((len(radii) - 1) * 0.70)]
        return q * math.sqrt(len(sample))

    head_sign = 1 if end_score(1) >= end_score(-1) else -1
    long_min, long_max = mins[long_axis], maxs[long_axis]
    head_coord = long_max if head_sign > 0 else long_min
    tail_coord = long_min if head_sign > 0 else long_max

    def point_at(station, up_frac=0.0, across_frac=0.0):
        p = Vector((0.0, 0.0, 0.0))
        p[long_axis] = head_coord - head_sign * L * float(station)
        p[up_axis] = zc + H * 0.5 * float(up_frac)
        p[across_axis] = across_c + W * 0.5 * float(across_frac)
        return p

    landmarks = {
        "long_min": long_min,
        "long_max": long_max,
        "head_sign": head_sign,
        "head": point_at(0.04, 0.0, 0.0),
        "snout": point_at(-0.015, 0.0, 0.0),
        "jaw": point_at(0.10, -0.34, 0.0),
        "neck": point_at(0.72, 0.0, 0.0),
        "dorsal_base": point_at(0.43, 0.44, 0.0),
        "pectoral_left": point_at(0.38, -0.04, -0.57),
        "pectoral_right": point_at(0.38, -0.04, 0.57),
        "tail_base": point_at(0.84, 0.0, 0.0),
        "caudal": point_at(0.98, 0.0, 0.0),
    }

    def existing_or_masked_group(name, predicate):
        group = obj.vertex_groups.get(name)
        if group:
            return {v.index for v in vertices if any(g.group == group.index and g.weight > 0.0 for g in v.groups)}
        indices = {v.index for v in vertices if predicate(v.co)}
        if len(indices) < 3:
            return set()
        group = obj.vertex_groups.new(name=name)
        group.add(sorted(indices), 1.0, "REPLACE")
        return indices

    def station_of(p):
        return (head_coord - p[long_axis]) * head_sign / L

    def up_norm(p):
        return (p[up_axis] - zc) / max(H * 0.5, 1.0e-6)

    def across_norm(p):
        return (p[across_axis] - across_c) / max(W * 0.5, 1.0e-6)

    fin_groups = {}
    fin_groups["dorsal"] = existing_or_masked_group(
        "dorsal",
        lambda p: 0.22 < station_of(p) < 0.72 and up_norm(p) > 0.48 and abs(across_norm(p)) < 0.70,
    )
    fin_groups["pectoral_l"] = existing_or_masked_group(
        "pectoral_l",
        lambda p: 0.20 < station_of(p) < 0.74 and across_norm(p) < -0.58,
    )
    fin_groups["pectoral_r"] = existing_or_masked_group(
        "pectoral_r",
        lambda p: 0.20 < station_of(p) < 0.74 and across_norm(p) > 0.58,
    )
    fin_groups["caudal_upper"] = existing_or_masked_group(
        "caudal_upper",
        lambda p: station_of(p) > 0.83 and up_norm(p) > 0.20,
    )
    fin_groups["caudal_lower"] = existing_or_masked_group(
        "caudal_lower",
        lambda p: station_of(p) > 0.83 and up_norm(p) < -0.20,
    )
    fin_groups["anal"] = existing_or_masked_group(
        "anal",
        lambda p: 0.58 < station_of(p) < 0.82 and up_norm(p) < -0.52,
    )
    fin_groups["pelvic"] = existing_or_masked_group(
        "pelvic",
        lambda p: 0.52 < station_of(p) < 0.78 and abs(across_norm(p)) > 0.45 and up_norm(p) < -0.15,
    )

    return MeshMeasure(long_axis, L, zc, H, landmarks, fin_groups)


def measure(obj):
    """Measure ``obj`` using L1's io contract when available.

    The fallback returns ``(long_axis, L, zc, H, landmarks, fin_groups)``
    through a named tuple, so both tuple unpacking and named access work.
    """
    if _io_measure is not None:
        try:
            measured = _io_measure(obj)
            if measured is not None:
                return _coerce_measure(measured, obj)
        except Exception:
            # A partially landed L1 module should not strand L2 operations.
            pass
    return _local_measure(obj)


# Each preset is a real 4x4x4 control table. Values are long/up/across scale
# factors; the table is expanded across height and width so the crown of the
# head can be shaped without a hard seam at the lattice box.
_PRESET_PROFILES = {
    "blunt": ((0.78, 1.16, 1.18), (0.88, 1.12, 1.12), (0.98, 1.04, 1.05), (1.0, 1.0, 1.0)),
    "pointed": ((1.15, 0.90, 0.88), (1.08, 0.95, 0.94), (1.01, 1.0, 1.0), (1.0, 1.0, 1.0)),
    "bulbous": ((0.92, 1.28, 1.30), (0.90, 1.20, 1.22), (0.98, 1.06, 1.08), (1.0, 1.0, 1.0)),
}


def _make_control_table(profile):
    return tuple(
        tuple(
            tuple(tuple(float(c) for c in profile[i]) for _ in range(4))
            for _ in range(4)
        )
        for i in range(4)
    )


CONTROL_TABLES = {name: _make_control_table(profile) for name, profile in _PRESET_PROFILES.items()}


def _trilerp(table, station, up, across):
    def sample(i, j, k):
        return table[max(0, min(3, i))][max(0, min(3, j))][max(0, min(3, k))]

    def span(value):
        f = max(0.0, min(3.0, value * 3.0))
        i = min(2, int(math.floor(f)))
        return i, f - i

    i0, it = span(station)
    j0, jt = span(up)
    k0, kt = span(across)
    out = [0.0, 0.0, 0.0]
    for di, wi in ((0, 1.0 - it), (1, it)):
        for dj, wj in ((0, 1.0 - jt), (1, jt)):
            for dk, wk in ((0, 1.0 - kt), (1, kt)):
                value = sample(i0 + di, j0 + dj, k0 + dk)
                w = wi * wj * wk
                for c in range(3):
                    out[c] += value[c] * w
    return out


def lattice(obj, params=None):
    """Apply a 4x4x4 authored head lattice and return ``obj``.

    ``params`` accepts ``preset`` (blunt/pointed/bulbous) and ``strength``.
    """
    params = params or {}
    if isinstance(params, str):
        params = {"preset": params}
    preset = str(params.get("preset", params.get("mode", "blunt"))).lower()
    if preset not in CONTROL_TABLES:
        raise ValueError("unknown head lattice preset: %s" % preset)
    strength = float(params.get("strength", 1.0))
    strength = max(0.0, min(1.0, strength))
    m = measure(obj)
    axis, up_axis = m.long_axis, 2 if 2 != m.long_axis else next(i for i in range(3) if i != m.long_axis)
    across_axis = next(i for i in range(3) if i not in (axis, up_axis))
    head_coord = m.landmarks["long_max"] if m.landmarks["head_sign"] > 0 else m.landmarks["long_min"]
    # The recipe's scale is a multiplier on the authored profile deltas.  In
    # particular, bulbous 1.4 produces approximately 1.4x width/height in the
    # t>.8 head silhouette instead of being silently ignored.
    profile_scale = max(0.0, float(params.get("scale", 1.0)))
    box_long = m.L * float(params.get("box_length", 0.27))
    head_before = _head_dimensions(obj, m)
    head_points = [v.co for v in obj.data.vertices if _tail_to_head_station(v.co, m) >= 0.80]
    if head_points:
        head_across = max(p[across_axis] for p in head_points) - min(p[across_axis] for p in head_points)
        head_up = max(p[up_axis] for p in head_points) - min(p[up_axis] for p in head_points)
        across_c = sum(p[across_axis] for p in head_points) / len(head_points)
        up_c = sum(p[up_axis] for p in head_points) / len(head_points)
    else:
        head_across, head_up = m.H * 0.5, m.H * 0.5
        across_c = 0.0
        up_c = m.zc
    box_up = max(head_up * 1.20, m.H * 0.18) * float(params.get("box_height", 1.0))
    box_across = max(head_across * 1.20, m.H * 0.18) * float(params.get("box_width", 1.0))
    table = CONTROL_TABLES[preset]

    for vertex in obj.data.vertices:
        tail_t = _tail_to_head_station(vertex.co, m)
        if tail_t < 0.76:
            continue
        station = (1.0 - tail_t) * m.L / max(box_long, 1.0e-6)
        if station < -0.04 or station > 1.08:
            continue
        # ``station`` here is head=0, tail=1; this is the same region as the
        # documented tail=0, nose=1 t>.8 head band.  A short fade leaves the
        # neck untouched and makes the silhouette read as one authored head.
        falloff = _smoothstep(tail_t, 0.76, 0.80)
        if falloff <= 0.0:
            continue
        u = (vertex.co[up_axis] - up_c) / max(box_up * 0.5, 1.0e-6) * 0.5 + 0.5
        a = (vertex.co[across_axis] - across_c) / max(box_across * 0.5, 1.0e-6) * 0.5 + 0.5
        ls, us, cs = _trilerp(table, station, u, a)
        local_strength = strength * max(0.0, min(1.0, falloff))
        p = vertex.co.copy()
        local_strength *= profile_scale
        if preset == "bulbous" and tail_t >= 0.80:
            # Bulbous is a silhouette contract, not a hidden metadata label.
            # At recipe scale 1.4 the full head band is 1.42x across and
            # 1.392x high, matching the requested approximately 40% change.
            across_factor = 1.0 + 0.30 * profile_scale
            up_factor = 1.0 + 0.28 * profile_scale
            cs = 1.0 + (across_factor - 1.0) / max(profile_scale, 1.0e-6)
            us = 1.0 + (up_factor - 1.0) / max(profile_scale, 1.0e-6)
        p[axis] = head_coord + (p[axis] - head_coord) * (1.0 + (ls - 1.0) * local_strength)
        p[up_axis] = up_c + (p[up_axis] - up_c) * (1.0 + (us - 1.0) * local_strength)
        p[across_axis] = across_c + (p[across_axis] - across_c) * (1.0 + (cs - 1.0) * local_strength)
        vertex.co = p
    obj.data.update()
    obj["rf_head_lattice"] = preset
    obj["rf_head_lattice_resolution"] = "4x4x4"
    head_after = _head_dimensions(obj, m)
    obj["rf_head_width_before"] = float(head_before[0])
    obj["rf_head_height_before"] = float(head_before[1])
    obj["rf_head_width_after"] = float(head_after[0])
    obj["rf_head_height_after"] = float(head_after[1])
    obj["rf_head_profile_scale"] = profile_scale
    print(
        "HEAD_SHAPE preset=%s scale=%.3f width=%.6f->%.6f height=%.6f->%.6f"
        % (preset, profile_scale, head_before[0], head_after[0], head_before[1], head_after[1]),
        flush=True,
    )
    return obj


def reshape(obj, params=None):
    """Alias kept short for recipe JSON callers."""
    return lattice(obj, params)


def _resample_ring(points, measure, station, count=24):
    """Return a 24-point elliptical ring sampled from a mesh cloud."""
    axis = measure.long_axis
    up_axis = 2 if 2 != axis else next(i for i in range(3) if i != axis)
    across_axis = next(i for i in range(3) if i not in (axis, up_axis))
    head_sign = measure.landmarks["head_sign"]
    target = measure.landmarks["head_coord"] - measure.L * station * head_sign
    slab = max(measure.L * 0.045, 1.0e-5)
    candidates = [p for p in points if abs(p[axis] - target) <= slab]
    if len(candidates) < 4:
        candidates = points
    ac = sum(p[across_axis] for p in candidates) / max(1, len(candidates))
    up = sum(p[up_axis] for p in candidates) / max(1, len(candidates))
    ring = []
    for i in range(count):
        angle = 2.0 * math.pi * i / count
        direction = Vector((0.0, 0.0, 0.0))
        direction[across_axis] = math.cos(angle)
        direction[up_axis] = math.sin(angle)
        radial = []
        for p in candidates:
            d = Vector((0.0, 0.0, 0.0))
            d[across_axis] = p[across_axis] - ac
            d[up_axis] = p[up_axis] - up
            if d.length > 1.0e-8 and d.normalized().dot(direction) > 0.15:
                radial.append(d.length)
        radius = sorted(radial)[int((len(radial) - 1) * 0.75)] if radial else min(measure.H, measure.L) * 0.08
        point = Vector((0.0, 0.0, 0.0))
        point[axis] = target
        point[across_axis] = ac + math.cos(angle) * radius
        point[up_axis] = up + math.sin(angle) * radius
        ring.append(point)
    return ring


def bridge_loops(vertices, faces, loop_a, loop_b):
    """Bridge two equal-sized vertex loops with quads and return face indices."""
    if len(loop_a) != len(loop_b) or len(loop_a) < 3:
        raise ValueError("bridge_loops requires equal loops of at least 3 vertices")
    created = []
    for i in range(len(loop_a)):
        j = (i + 1) % len(loop_a)
        face = (loop_a[i], loop_a[j], loop_b[j], loop_b[i])
        faces.append(face)
        created.append(len(faces) - 1)
    return created


def _append_region(vertices, faces, source_obj, transform, measure, predicate):
    mapping = {}
    for poly in source_obj.data.polygons:
        coords = [source_obj.data.vertices[i].co for i in poly.vertices]
        if not all(predicate((measure.landmarks["head_coord"] - p[measure.long_axis]) * measure.landmarks["head_sign"] / measure.L) for p in coords):
            continue
        ids = []
        for index in poly.vertices:
            if index not in mapping:
                p = transform @ source_obj.data.vertices[index].co
                mapping[index] = len(vertices)
                vertices.append(tuple(p))
            ids.append(mapping[index])
        faces.append(tuple(ids))
    return mapping


def _copy_materials(dst, src):
    for material in src.data.materials:
        if material and material.name not in {m.name for m in dst.data.materials}:
            dst.data.materials.append(material)


def _set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def _prepare_for_boolean(obj):
    """Fill small holes and weld doubles before a boolean attempt."""
    _set_active(obj)
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        if bm.verts:
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=max(1.0e-7, _local_measure(obj).L * 1.0e-6))
            boundary = [e for e in bm.edges if e.is_boundary]
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


def _voxel_remesh(obj, voxel_size):
    if not obj or obj.type != "MESH":
        return obj
    _set_active(obj)
    modifier = obj.modifiers.new("L2 voxel fuse", "REMESH")
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
    return obj


def _retain_largest_component(obj):
    """Keep one connected solid after a scan-shell boolean/remesh."""
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
    keep = max(components, key=len)
    vertices, faces, mapping = [], [], {}
    materials = list(obj.data.materials)
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
    imported = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    if not imported:
        raise RuntimeError("kit contains no mesh: %s" % path)
    if len(imported) > 1:
        _set_active(imported[0])
        for part in imported:
            part.select_set(True)
        bpy.ops.object.join()
        kit = imported[0]
    else:
        kit = imported[0]
    kit.name = "L2 kit %s" % os.path.basename(path)
    return kit


def _place_canonical_kit(kit, obj, params):
    # Head foil/hood operations share the measured accessory placement rules.
    # The import is lazy to avoid the head <-> accessories measure dependency
    # while both modules are being imported.
    try:
        from .accessories import _place_kit_object
        return _place_kit_object(obj, kit, params)
    except ImportError:
        pass
    m = measure(obj)
    landmark_name = str(params.get("landmark", "snout"))
    target = m.landmarks.get(landmark_name, m.landmarks["snout"]).copy()
    offset = params.get("offset", (0.0, 0.0, 0.0))
    if isinstance(offset, dict):
        offset = (offset.get("x", 0.0), offset.get("y", 0.0), offset.get("z", 0.0))
    target += Vector(offset)
    scalar = params.get("scale", 1.0)
    if isinstance(scalar, (tuple, list)):
        scales = tuple(float(x) for x in scalar)
    else:
        scales = (float(scalar),) * 3
    yaw = float(params.get("yaw", 0.0))
    co = math.cos(yaw)
    si = math.sin(yaw)
    long_dir = _axis_vector(m.long_axis, m.landmarks["head_sign"])
    up_axis = 2 if 2 != m.long_axis else next(i for i in range(3) if i != m.long_axis)
    across_axis = next(i for i in range(3) if i not in (m.long_axis, up_axis))
    across_dir = _axis_vector(across_axis, 1.0)
    up_dir = _axis_vector(up_axis, 1.0)
    for vertex in kit.data.vertices:
        p = vertex.co.copy()
        # Kits use canonical x=across, y=forward, z=up. Yaw is around z.
        x = (p.x * co - p.y * si) * scales[0] * m.L
        y = (p.x * si + p.y * co) * scales[1] * m.L
        z = p.z * scales[2] * m.L
        vertex.co = target + across_dir * x + long_dir * y + up_dir * z
    kit.matrix_world = obj.matrix_world.copy()
    kit.location = (0.0, 0.0, 0.0)
    kit.rotation_euler = (0.0, 0.0, 0.0)
    kit.scale = (1.0, 1.0, 1.0)
    kit.data.update()
    return kit


def _boolean_union(obj, operand, solver):
    _set_active(obj)
    modifier = obj.modifiers.new("L2 head union %s" % solver.lower(), "BOOLEAN")
    modifier.operation = "UNION"
    modifier.solver = solver
    modifier.object = operand
    try:
        _apply_modifier(obj, modifier)
        return True
    except Exception:
        if modifier.name in obj.modifiers:
            obj.modifiers.remove(modifier)
        return False


def fuse_kit(obj, params=None):
    """Fuse a foil/hood kit to ``obj`` with EXACT -> FAST -> remesh fallback."""
    params = params or {}
    if isinstance(params, str):
        params = {"kit": params}
    kit_name = params.get("kit", "hammer_foil.glb")
    if kit_name in ("foil", "hammer", "hammer_foil"):
        kit_name = "hammer_foil.glb"
    if kit_name in ("hood", "whale", "whale_hood"):
        kit_name = "whale_hood.glb"
    _prepare_for_boolean(obj)
    operand = _place_canonical_kit(_import_kit(kit_name), obj, params)
    _prepare_for_boolean(operand)
    solver_used = None
    for solver in ("EXACT", "FAST"):
        if _boolean_union(obj, operand, solver):
            solver_used = solver
            break
    if solver_used is None:
        # A joined operand is intentionally followed by a voxel remesh: this
        # is the only reliable union for scan shells with bad winding.
        _set_active(obj)
        operand.select_set(True)
        bpy.ops.object.join()
        solver_used = "REMESH_ONLY"
    elif operand.name in bpy.data.objects:
        bpy.data.objects.remove(operand, do_unlink=True)
    m = measure(obj)
    _voxel_remesh(obj, m.L / 220.0)
    _retain_largest_component(obj)
    obj["rf_head_fuse_solver"] = solver_used
    obj["rf_head_fuse_kit"] = kit_name
    obj["rf_head_fuse_voxel"] = m.L / 220.0
    return obj


def fuse_foil(obj, params=None):
    params = dict(params or {})
    params["kit"] = "hammer_foil.glb"
    return fuse_kit(obj, params)


def fuse_hood(obj, params=None):
    params = dict(params or {})
    params["kit"] = "whale_hood.glb"
    return fuse_kit(obj, params)


def foil(obj, params=None):
    return fuse_foil(obj, params)


def hood(obj, params=None):
    return fuse_hood(obj, params)


def graft(obj, other_base, neck_t=0.72):
    """Replace the recipient head with another base and bridge a 24-ring seam."""
    if not obj or obj.type != "MESH" or not other_base or other_base.type != "MESH":
        raise ValueError("graft requires two mesh objects")
    recipient = measure(obj)
    source = measure(other_base)
    neck_t = max(0.35, min(0.92, float(neck_t)))
    target_inv = obj.matrix_world.inverted()
    source_to_target = target_inv @ other_base.matrix_world

    vertices, faces = [], []
    # Keep the source head and recipient tail. A narrow annulus is left for the
    # explicit bridge loops below, then the remesh closes any scan-shell gaps.
    source_pred = lambda t: t <= neck_t + 0.015
    target_pred = lambda t: t >= neck_t - 0.015
    _append_region(vertices, faces, other_base, source_to_target, source, source_pred)
    _append_region(vertices, faces, obj, Matrix.Identity(4), recipient, target_pred)

    source_points = [source_to_target @ v.co for v in other_base.data.vertices]
    target_points = [v.co.copy() for v in obj.data.vertices]
    ring_a = _resample_ring(source_points, recipient, neck_t, 24)
    ring_b = _resample_ring(target_points, recipient, neck_t, 24)
    start_a = len(vertices)
    vertices.extend(tuple(p) for p in ring_a)
    start_b = len(vertices)
    vertices.extend(tuple(p) for p in ring_b)
    bridge_loops(vertices, faces, list(range(start_a, start_a + 24)), list(range(start_b, start_b + 24)))

    mesh = bpy.data.meshes.new("L2 grafted head")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    old_data = obj.data
    obj.data = mesh
    for material in old_data.materials:
        if material and material.name not in {m.name for m in obj.data.materials}:
            obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update()
    _voxel_remesh(obj, recipient.L / 220.0)
    _retain_largest_component(obj)
    obj["rf_head_graft"] = True
    obj["rf_head_graft_neck_t"] = neck_t
    obj["rf_head_graft_ring_vertices"] = 24
    obj["rf_head_graft_seam_smoothing"] = True
    return obj


def _triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def _cli():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Run one authored head operation headlessly")
    parser.add_argument("--in", dest="inp", required=True)
    parser.add_argument("--out", required=False)
    parser.add_argument("--op", choices=("blunt", "pointed", "bulbous", "foil", "hood"), default="blunt")
    args = parser.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.inp)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    obj = max(meshes, key=lambda o: len(o.data.polygons))
    before = _triangles(obj)
    if args.op in CONTROL_TABLES:
        lattice(obj, {"preset": args.op})
    elif args.op == "foil":
        fuse_foil(obj)
    else:
        fuse_hood(obj)
    print("HEAD", args.op, "before", before, "after", _triangles(obj))
    if args.out:
        _set_active(obj)
        bpy.ops.export_scene.gltf(filepath=args.out, export_format="GLB", use_selection=True, export_apply=True)


if __name__ == "__main__":
    _cli()
