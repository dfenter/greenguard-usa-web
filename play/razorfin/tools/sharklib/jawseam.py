"""Rev 17 jaw-seam solver: one module owning the exported seam invariants.

SPEC-jawseam.md is authoritative; this is its implementation.  Three earlier
point-fix rounds (lanes A4/A5/A6) left probe_jaw at 0/5 because three passes
with interacting predicates (sliver collapse, the unsatisfiable-edge feed, and
the final gradient cap) were run alternately without a proven fixed point.
This module replaces all three with one deterministic solver stated over the
exported arrays, so every invariant can be checked offline in numpy with no
Blender and no node.

Pure numpy.  No bpy import: importable from Blender 3.6's bundled Python and
from pytest alike.  The Blender adapter lives in finish.py.
"""

from __future__ import annotations

from typing import NamedTuple

import numpy as np

__all__ = [
    "JawSeamError",
    "Result",
    "solve",
    "check",
    "BUDGET",
    "MIN_JAW_EDGE",
    "EPS_ZERO",
    "EPS_W",
    "QUANTUM",
    "STRETCH_SPEC",
    "LIP_CLASS",
]

# --- spec constants (section 1) ------------------------------------------
BUDGET = 1.6            # A4 derivation: stretch <= 1 + BUDGET*2*sin(theta/2)
MIN_JAW_EDGE = 1.0e-3   # I2 length floor, fraction of L
EPS_ZERO = 1.0e-6       # I1; also the probe's own restLen skip
EPS_W = 1.0e-4          # I6, A4's JAW_AUTHORED_EPS
QUANTUM = 1.0 / 255.0   # 8-bit normalised WEIGHTS_0 quantum
STRETCH_SPEC = 2.5      # I5, 0.5x inside the 3.0 gate
LIP_CLASS = 0.4         # I9, the probe's lower-lip classifier
LIP_RETENTION = 0.8     # I9 retention floor
CAP_MAX_SWEEPS = 256    # I4 relaxation runaway guard (hard error)
THETA = 0.72            # game gape, radians


class JawSeamError(RuntimeError):
    """The solver failed to reach a state satisfying I1-I8."""


class Result(NamedTuple):
    wj: np.ndarray          # (N_in,) corrected jaw weight, ORIGINAL indices
    wh: np.ndarray          # (N_in,) = 1 - wr - wj, original indices
    merges: list            # [(keep, drop, co)] original indices, keep < drop
    P2: np.ndarray          # (N2,3) reduced positions
    F2: np.ndarray          # (T2,3) reduced triangles
    wj2: np.ndarray         # (N2,)
    wh2: np.ndarray         # (N2,)
    remap: np.ndarray       # (N_in,) old -> new index, or -1 if dropped
    rounds: int
    collapsed: int
    changed: bool
    report: dict


# --- geometry helpers ----------------------------------------------------

def _edges_of(F):
    """Unique undirected edges of a triangle array, lexicographic (min, max).

    Diagonals are included implicitly because the probe walks TRIANGLES, not
    Blender polygons: a quad reaches the gate as two triangles and its
    diagonal is a real edge of the exported index buffer.
    """
    F = np.asarray(F, dtype=np.int64)
    if F.size == 0:
        return np.zeros((0, 2), dtype=np.int64)
    pairs = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]], axis=0)
    pairs = np.sort(pairs, axis=1)
    pairs = pairs[pairs[:, 0] != pairs[:, 1]]
    if pairs.size == 0:
        return np.zeros((0, 2), dtype=np.int64)
    uniq = np.unique(pairs, axis=0)          # np.unique sorts lexicographically
    return uniq


def _extent(P):
    P = np.asarray(P, dtype=np.float64)
    if P.shape[0] == 0:
        return 0.0
    return float(np.max(P.max(axis=0) - P.min(axis=0)))


def _arms(P, hinge, axis, L):
    """Perpendicular distance of each vertex to the hinge axis, over L."""
    axis = np.asarray(axis, dtype=np.float64)
    norm = float(np.linalg.norm(axis))
    if norm <= 0.0:
        raise JawSeamError("hinge axis is degenerate")
    u = axis / norm
    d = np.asarray(P, dtype=np.float64) - np.asarray(hinge, dtype=np.float64)
    perp = d - np.outer(d @ u, u)
    return np.linalg.norm(perp, axis=1) / max(L, 1.0e-30)


def _rest_lengths(P, E):
    if E.shape[0] == 0:
        return np.zeros(0, dtype=np.float64)
    return np.linalg.norm(P[E[:, 0]] - P[E[:, 1]], axis=1)


def _allow(rest, arm_e, L):
    """allow(e) = BUDGET * (rest/L) / arm(e), clipped to the weight range."""
    arm_safe = np.maximum(arm_e, 1.0e-12)
    return np.minimum(1.0, BUDGET * (rest / max(L, 1.0e-30)) / arm_safe)


def _rotate(P, hinge, axis, angle):
    """Rodrigues rotation of points about the axis through hinge."""
    u = np.asarray(axis, dtype=np.float64)
    u = u / max(float(np.linalg.norm(u)), 1.0e-30)
    d = np.asarray(P, dtype=np.float64) - np.asarray(hinge, dtype=np.float64)
    c, s = float(np.cos(angle)), float(np.sin(angle))
    rot = d * c + np.cross(u, d) * s + np.outer(d @ u, u) * (1.0 - c)
    return rot + np.asarray(hinge, dtype=np.float64)


def analytic_stretch(P, E, wj, hinge, axis, theta=THETA, sign=1):
    """stretch_s(e) under linear blend skinning, exactly the probe's math.

    P'[v] = (1 - wj[v]) P[v] + wj[v] R_s(P[v]).  Valid when every non-jaw bone
    sits at its bind, which the regression test asserts on the exported
    inverseBindMatrices (spec section 3).
    """
    P = np.asarray(P, dtype=np.float64)
    if E.shape[0] == 0:
        return np.zeros(0, dtype=np.float64)
    rotated = _rotate(P, hinge, axis, sign * theta)
    w = np.asarray(wj, dtype=np.float64).reshape(-1, 1)
    posed = (1.0 - w) * P + w * rotated
    rest = _rest_lengths(P, E)
    open_len = np.linalg.norm(posed[E[:, 0]] - posed[E[:, 1]], axis=1)
    out = np.ones_like(rest)
    live = rest > 0.0
    out[live] = open_len[live] / rest[live]
    return out


# --- invariant checker (spec section 2, `check`) --------------------------

def check(P, F, wj, wh, hinge, axis, theta=THETA, budget_tris=9000,
          wr=None, lip_before=None):
    """Evaluate I1-I9 and the analytic stretch on a mesh.

    Returns a dict of per-invariant worst values plus the offending edge
    indices (into the returned ``edges`` array), so a caller can name exactly
    which invariant a failing edge violates instead of guessing.
    """
    P = np.asarray(P, dtype=np.float64)
    F = np.asarray(F, dtype=np.int64)
    wj = np.asarray(wj, dtype=np.float64)
    wh = np.asarray(wh, dtype=np.float64)
    if wr is None:
        wr = np.clip(1.0 - wj - wh, 0.0, 1.0)
    wr = np.asarray(wr, dtype=np.float64)

    E = _edges_of(F)
    L = _extent(P)
    rest = _rest_lengths(P, E)
    arm_v = _arms(P, hinge, axis, L) if L > 0 else np.zeros(len(P))
    arm_e = (np.maximum(arm_v[E[:, 0]], arm_v[E[:, 1]])
             if E.shape[0] else np.zeros(0))
    allow = _allow(rest, arm_e, L) if E.shape[0] else np.zeros(0)
    dW = (np.abs(wj[E[:, 0]] - wj[E[:, 1]]) if E.shape[0]
          else np.zeros(0))
    jawish = (np.maximum(wj[E[:, 0]], wj[E[:, 1]]) > 0.0 if E.shape[0]
              else np.zeros(0, dtype=bool))

    out = {"L": L, "edges": E, "n_edges": int(E.shape[0]),
           "n_verts": int(P.shape[0]), "n_tris": int(F.shape[0]),
           "violations": {}}

    # I1 no degenerate edge
    i1 = np.flatnonzero(rest < EPS_ZERO * L) if E.shape[0] else np.zeros(0, dtype=np.int64)
    out["I1"] = {"bad": i1, "worst": float(rest.min() / L) if E.shape[0] and L > 0 else 0.0}

    # I2 jaw-influenced edge length floor
    i2 = (np.flatnonzero(jawish & (rest < MIN_JAW_EDGE * L)) if E.shape[0]
          else np.zeros(0, dtype=np.int64))
    out["I2"] = {"bad": i2,
                 "worst": float(rest[jawish].min() / L) if jawish.any() and L > 0 else 1.0}

    # I3 cap representable
    i3 = (np.flatnonzero(jawish & (allow < 2.0 * QUANTUM)) if E.shape[0]
          else np.zeros(0, dtype=np.int64))
    out["I3"] = {"bad": i3,
                 "worst": float(allow[jawish].min()) if jawish.any() else 1.0}

    # I4 cap holds
    excess = dW - allow - QUANTUM if E.shape[0] else np.zeros(0)
    i4 = np.flatnonzero(excess > 0.0) if E.shape[0] else np.zeros(0, dtype=np.int64)
    out["I4"] = {"bad": i4, "worst": float(excess.max()) if E.shape[0] else 0.0}

    # I5 analytic stretch, both hinge signs
    s_pos = analytic_stretch(P, E, wj, hinge, axis, theta, +1)
    s_neg = analytic_stretch(P, E, wj, hinge, axis, theta, -1)
    stretch = np.maximum(s_pos, s_neg) if E.shape[0] else np.zeros(0)
    i5 = np.flatnonzero(stretch > STRETCH_SPEC) if E.shape[0] else np.zeros(0, dtype=np.int64)
    out["I5"] = {"bad": i5, "worst": float(stretch.max()) if E.shape[0] else 1.0,
                 "stretch": stretch}

    # I6 no isolated jaw weight
    live = wj > EPS_W
    has_nbr = np.zeros(len(P), dtype=bool)
    if E.shape[0]:
        a, b = E[:, 0], E[:, 1]
        np.logical_or.at(has_nbr, a, live[b])
        np.logical_or.at(has_nbr, b, live[a])
    i6 = np.flatnonzero(live & ~has_nbr)
    out["I6"] = {"bad": i6, "count": int(i6.size)}

    # I7 normalisation + coincident-duplicate weight agreement
    total = wj + wh + wr
    bad_sum = np.flatnonzero(np.abs(total - 1.0) > QUANTUM + 1.0e-9)
    bad_rng = np.flatnonzero((wj < -1.0e-9) | (wj > 1.0 - wr + 1.0e-9))
    dup_bad = []
    if E.shape[0] and L > 0:
        coincident = np.flatnonzero(rest < EPS_ZERO * L)
        for k in coincident:
            if abs(wj[E[k, 0]] - wj[E[k, 1]]) > QUANTUM:
                dup_bad.append(int(k))
    out["I7"] = {"bad_sum": bad_sum, "bad_range": bad_rng,
                 "bad_dup": np.asarray(dup_bad, dtype=np.int64),
                 "worst_sum": float(np.abs(total - 1.0).max()) if len(P) else 0.0}

    # I8 triangle budget
    out["I8"] = {"tris": int(F.shape[0]), "budget": int(budget_tris),
                 "ok": bool(F.shape[0] <= budget_tris)}

    # I9 lip retention (warning, reported not raised)
    lip_now = int(np.count_nonzero(wj > LIP_CLASS))
    out["I9"] = {"lip_now": lip_now, "lip_before": lip_before,
                 "ok": (lip_before is None or lip_before == 0
                        or lip_now >= LIP_RETENTION * lip_before)}

    viol = {}
    if i1.size:
        viol["I1"] = int(i1.size)
    if i2.size:
        viol["I2"] = int(i2.size)
    if i3.size:
        viol["I3"] = int(i3.size)
    if i4.size:
        viol["I4"] = int(i4.size)
    if i5.size:
        viol["I5"] = int(i5.size)
    if i6.size:
        viol["I6"] = int(i6.size)
    if bad_sum.size or bad_rng.size or len(dup_bad):
        viol["I7"] = int(bad_sum.size + bad_rng.size + len(dup_bad))
    if not out["I8"]["ok"]:
        viol["I8"] = int(F.shape[0])
    out["violations"] = viol
    out["ok"] = not viol
    return out


# --- solver (spec section 2, `solve`) ------------------------------------

def _compact(P, F, wj, wr, alive):
    """Drop vertices with no faces; return reduced arrays and old->new remap."""
    used = np.zeros(len(P), dtype=bool)
    if F.shape[0]:
        used[F.reshape(-1)] = True
    keep_mask = used & alive
    remap = np.full(len(P), -1, dtype=np.int64)
    order = np.flatnonzero(keep_mask)
    remap[order] = np.arange(order.size, dtype=np.int64)
    F2 = remap[F] if F.shape[0] else F.reshape(0, 3)
    return P[order], F2, wj[order], wr[order], remap


def _cap_sweep(wj, E, allow):
    """Relax the HIGHER endpoint down to low + allow, in edge order.

    Monotone non-increasing in the worst excess and bounded below by 0, so it
    converges; CAP_MAX_SWEEPS is a runaway guard and hitting it is a hard
    error, not a warning (spec section 2 step 2).
    """
    if E.shape[0] == 0:
        return wj, 0, 0.0
    a_all, b_all = E[:, 0], E[:, 1]
    for sweep in range(1, CAP_MAX_SWEEPS + 1):
        worst = 0.0
        for k in range(E.shape[0]):
            a, b = int(a_all[k]), int(b_all[k])
            delta = wj[a] - wj[b]
            ex = abs(delta) - allow[k]
            if ex <= 0.0:
                continue
            if ex > worst:
                worst = ex
            if delta > 0.0:
                wj[a] = wj[b] + allow[k]
            else:
                wj[b] = wj[a] + allow[k]
        if worst <= 1.0e-6:
            return wj, sweep, worst
    raise JawSeamError(
        "gradient cap did not converge in %d sweeps (worst excess %.6g)"
        % (CAP_MAX_SWEEPS, worst))


def _independent_targets(E, targets):
    """Maximal independent subset of target edges, lexicographic order.

    No two chosen edges share a vertex within a round, so each merge result is
    unambiguous and the round's merges are order-free.
    """
    taken = set()
    chosen = []
    for k in targets:                       # targets already lexicographic
        a, b = int(E[k, 0]), int(E[k, 1])
        if a in taken or b in taken:
            continue
        taken.add(a)
        taken.add(b)
        chosen.append((min(a, b), max(a, b)))
    return chosen


def solve(P, F, wj, wh, hinge, axis, theta=THETA, budget=BUDGET,
          min_jaw_edge=MIN_JAW_EDGE, eps_zero=EPS_ZERO, quantum=QUANTUM,
          max_rounds=64, budget_tris=9000):
    """Drive the jaw seam to a state satisfying I1-I8.  See SPEC-jawseam.md."""
    P0 = np.array(P, dtype=np.float64, copy=True)
    F0 = np.array(F, dtype=np.int64, copy=True).reshape(-1, 3)
    wj0 = np.array(wj, dtype=np.float64, copy=True)
    wh0 = np.array(wh, dtype=np.float64, copy=True)
    n_in = P0.shape[0]
    if wj0.shape[0] != n_in or wh0.shape[0] != n_in:
        raise JawSeamError("weight arrays must match the vertex count")
    # wr is the residual carried by every OTHER bone and is preserved exactly:
    # only the jaw/head split may move (fixes the REPLACE defect behind I7).
    wr0 = np.clip(1.0 - wj0 - wh0, 0.0, 1.0)

    hinge = np.asarray(hinge, dtype=np.float64).reshape(3)
    axis = np.asarray(axis, dtype=np.float64).reshape(3)

    lip_before = int(np.count_nonzero(wj0 > LIP_CLASS))
    report = {"before": check(P0, F0, wj0, np.clip(1.0 - wr0 - wj0, 0.0, 1.0),
                              hinge, axis, theta, budget_tris, wr=wr0,
                              lip_before=lip_before)}

    # Working state, on original indices, with a survivor map for merged verts.
    Pw, Fw, wjw, wrw = P0.copy(), F0.copy(), wj0.copy(), wr0.copy()
    survivor = np.arange(n_in, dtype=np.int64)   # original -> current owner
    alive = np.ones(n_in, dtype=bool)
    merges = []
    collapsed = 0
    rounds = 0

    for rounds in range(1, max_rounds + 1):
        E = _edges_of(Fw)
        L = _extent(Pw[alive]) if alive.any() else 0.0
        if L <= 0.0:
            raise JawSeamError("degenerate mesh extent")

        # --- step 1 COLLAPSE ------------------------------------------------
        merged_this_round = 0
        if E.shape[0]:
            rest = _rest_lengths(Pw, E)
            arm_v = _arms(Pw, hinge, axis, L)
            arm_e = np.maximum(arm_v[E[:, 0]], arm_v[E[:, 1]])
            allow = _allow(rest, arm_e, L)
            jawish = np.maximum(wjw[E[:, 0]], wjw[E[:, 1]]) > 0.0
            # Zero-weight degenerate edges are collapsed too: they are
            # degenerate triangles, not seam (spec step 1).
            fail = (rest < eps_zero * L)
            fail |= jawish & (rest < min_jaw_edge * L)
            fail |= jawish & (allow < 2.0 * quantum)
            targets = np.flatnonzero(fail)
            for keep, drop in _independent_targets(E, targets):
                co = 0.5 * (Pw[keep] + Pw[drop])
                Pw[keep] = co
                wjw[keep] = 0.5 * (wjw[keep] + wjw[drop])
                wrw[keep] = 0.5 * (wrw[keep] + wrw[drop])
                alive[drop] = False
                # Record in ORIGINAL indices: keep/drop are original ids
                # because the working arrays never renumber.
                merges.append((int(keep), int(drop), co.copy()))
                # every original vertex that had landed on `drop` follows it
                survivor[survivor == drop] = keep
                Fw[Fw == drop] = keep
                merged_this_round += 1
            if merged_this_round:
                collapsed += merged_this_round
                degenerate = ((Fw[:, 0] == Fw[:, 1]) | (Fw[:, 1] == Fw[:, 2])
                              | (Fw[:, 2] == Fw[:, 0]))
                Fw = Fw[~degenerate]

        # --- step 2 CAP -----------------------------------------------------
        E = _edges_of(Fw)
        before_w = wjw.copy()
        if E.shape[0]:
            rest = _rest_lengths(Pw, E)
            arm_v = _arms(Pw, hinge, axis, L)
            arm_e = np.maximum(arm_v[E[:, 0]], arm_v[E[:, 1]])
            allow = _allow(rest, arm_e, L)
            wjw, _sweeps, _worst = _cap_sweep(wjw, E, allow)
            wjw = np.clip(wjw, 0.0, np.maximum(0.0, 1.0 - wrw))

        # --- step 3 STOP ----------------------------------------------------
        weight_moved = float(np.abs(wjw - before_w).max()) if len(wjw) else 0.0
        if merged_this_round == 0 and weight_moved <= 1.0e-6:
            break
    else:
        raise JawSeamError("solve exceeded max_rounds=%d" % max_rounds)

    # --- outputs -------------------------------------------------------------
    P2, F2, wj2, wr2, remap_live = _compact(Pw, Fw, wjw, wrw, alive)
    wh2 = np.clip(1.0 - wr2 - wj2, 0.0, 1.0)

    # Original-index outputs: a merged vertex carries its survivor's weight, so
    # the caller can write weights by original index BEFORE editing topology.
    wj_out = wjw[survivor]
    wr_out = wrw[survivor]
    wh_out = np.clip(1.0 - wr_out - wj_out, 0.0, 1.0)
    remap = remap_live[survivor]

    post = check(P2, F2, wj2, wh2, hinge, axis, theta, budget_tris,
                 wr=wr2, lip_before=lip_before)
    hard = {k: v for k, v in post["violations"].items()
            if k in ("I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8")}
    if hard:
        raise JawSeamError(
            "solve converged to a state violating %s (worst stretch %.3fx); "
            "offending edge counts %r"
            % (",".join(sorted(hard)), post["I5"]["worst"], hard))

    report["after"] = post
    report["rounds"] = rounds
    report["collapsed"] = collapsed
    report["lip_before"] = lip_before
    report["lip_after"] = int(np.count_nonzero(wj2 > LIP_CLASS))
    report["I9_ok"] = post["I9"]["ok"]

    changed = bool(collapsed or float(np.abs(wj_out - wj0).max() if n_in else 0.0) > 1.0e-9)
    return Result(wj=wj_out, wh=wh_out, merges=merges, P2=P2, F2=F2,
                  wj2=wj2, wh2=wh2, remap=remap, rounds=rounds,
                  collapsed=collapsed, changed=changed, report=report)
