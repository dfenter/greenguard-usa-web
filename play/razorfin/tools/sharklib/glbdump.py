"""Dump a family GLB's skinned arrays to .npz for offline seam checks.

Stdlib only (no numpy needed to parse; numpy is used for the npz write and the
matrix inverse).  Cheaper than editing the probe: the regression test rebuilds
these from the GLB when the npz is missing, so nothing has to be committed.

Usage:
    python3 tools/sharklib/glbdump.py assets/models/fam/*.glb -o scratchpad/jawseam/
"""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path

import numpy as np

# glTF componentType -> (numpy dtype, normalisation divisor or None)
_COMPONENT = {
    5120: (np.int8, 127.0),
    5121: (np.uint8, 255.0),
    5122: (np.int16, 32767.0),
    5123: (np.uint16, 65535.0),
    5125: (np.uint32, None),
    5126: (np.float32, None),
}
_NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def parse_glb(path):
    """Return (gltf_json, bin_chunk_bytes)."""
    data = Path(path).read_bytes()
    magic, _version, _length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise ValueError("%s is not a GLB" % path)
    offset = 12
    gltf, binary = None, b""
    while offset < len(data):
        clen, ctype = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8: offset + 8 + clen]
        if ctype == 0x4E4F534A:      # JSON
            gltf = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:    # BIN
            binary = chunk
        offset += 8 + clen + ((4 - clen % 4) % 4 if clen % 4 else 0)
    if gltf is None:
        raise ValueError("%s has no JSON chunk" % path)
    return gltf, binary


def read_accessor(gltf, binary, index):
    """Dequantise an accessor by componentType and `normalized`."""
    acc = gltf["accessors"][index]
    dtype, divisor = _COMPONENT[acc["componentType"]]
    ncomp = _NCOMP[acc["type"]]
    count = int(acc["count"])
    view = gltf["bufferViews"][acc["bufferView"]]
    base = int(view.get("byteOffset", 0)) + int(acc.get("byteOffset", 0))
    itemsize = np.dtype(dtype).itemsize
    stride = int(view.get("byteStride", 0)) or ncomp * itemsize
    if stride == ncomp * itemsize:
        raw = np.frombuffer(binary, dtype=dtype, count=count * ncomp,
                            offset=base).reshape(count, ncomp)
    else:                            # interleaved
        rows = [np.frombuffer(binary, dtype=dtype, count=ncomp,
                              offset=base + i * stride) for i in range(count)]
        raw = np.asarray(rows)
    out = raw.astype(np.float64)
    if acc.get("normalized") and divisor:
        out = np.maximum(out / divisor, -1.0)
    return out, acc["componentType"], bool(acc.get("normalized"))


def _node_matrix(node):
    if "matrix" in node:
        return np.asarray(node["matrix"], dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    if "scale" in node:
        m = np.diag(list(node["scale"]) + [1.0]) @ m
    if "rotation" in node:
        x, y, z, w = node["rotation"]
        r = np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
            [0, 0, 0, 1]], dtype=np.float64)
        m = r @ m
    if "translation" in node:
        t = np.eye(4)
        t[:3, 3] = node["translation"]
        m = t @ m
    return m


def dump(path):
    """Extract the jaw-seam arrays from the first skinned mesh primitive."""
    gltf, binary = parse_glb(path)
    nodes = gltf.get("nodes", [])
    skins = gltf.get("skins", [])
    if not skins:
        raise ValueError("%s has no skin" % path)

    skinned = [(i, n) for i, n in enumerate(nodes)
               if "skin" in n and "mesh" in n]
    if not skinned:
        raise ValueError("%s has no skinned mesh node" % path)
    node_index, node = skinned[0]
    skin = skins[node["skin"]]
    mesh = gltf["meshes"][node["mesh"]]
    prim = mesh["primitives"][0]
    attrs = prim["attributes"]

    P, _ct, _nz = read_accessor(gltf, binary, attrs["POSITION"])
    F = read_accessor(gltf, binary, prim["indices"])[0].astype(np.int64).reshape(-1, 3)
    joints = read_accessor(gltf, binary, attrs["JOINTS_0"])[0].astype(np.int64)
    weights, w_ct, w_norm = read_accessor(gltf, binary, attrs["WEIGHTS_0"])

    # Mesh node TRS, if any.
    world = _node_matrix(node)
    if not np.allclose(world, np.eye(4)):
        P = (world @ np.hstack([P, np.ones((len(P), 1))]).T).T[:, :3]

    joint_nodes = skin["joints"]
    names = {nodes[j].get("name", ""): k for k, j in enumerate(joint_nodes)}
    if "LowerJaw" not in names or "Head" not in names:
        raise ValueError("%s skin has no LowerJaw/Head joint" % path)
    jaw_j, head_j = names["LowerJaw"], names["Head"]

    ibm = read_accessor(gltf, binary, skin["inverseBindMatrices"])[0]
    ibm = ibm.reshape(-1, 4, 4).transpose(0, 2, 1)   # column-major -> row-major

    B = np.linalg.inv(ibm[jaw_j])
    hinge = B[:3, 3].copy()
    axis = B[:3, 0] / max(np.linalg.norm(B[:3, 0]), 1e-30)

    # Jaw bind rotation RELATIVE TO ITS PARENT (Head).  The absolute inverse
    # bind of every joint carries the exporter's Blender-Y-up -> glTF-Z-up
    # conversion (a uniform 90 degrees on all eight), so an absolute angle says
    # nothing about the jaw.  The quantity A6 baked to near-identity, and the
    # one the analytic pose needs, is the jaw's rotation against the chain it
    # hangs from; measured this way it reproduces the node-local quaternion
    # exactly on all five families.
    rel = ibm[head_j] @ B
    _r = rel[:3, :3]
    _r = _r / np.maximum(np.linalg.norm(_r, axis=0), 1e-30)
    jaw_rel_angle = float(np.arccos(np.clip((np.trace(_r) - 1.0) / 2.0, -1.0, 1.0)))

    # Per-joint bind rotation, for the basis assertions.
    def _quat_of(rot):
        # rotation part with scale removed
        s = np.linalg.norm(rot, axis=0)
        r = rot / np.where(s > 1e-30, s, 1.0)
        tr = np.trace(r)
        w = np.sqrt(max(0.0, 1.0 + tr)) / 2.0
        if w > 1e-8:
            x = (r[2, 1] - r[1, 2]) / (4 * w)
            y = (r[0, 2] - r[2, 0]) / (4 * w)
            z = (r[1, 0] - r[0, 1]) / (4 * w)
        else:
            x, y, z = 1.0, 0.0, 0.0
        return np.array([x, y, z, w])

    bind_quat = _quat_of(B[:3, :3])
    joint_rot_dev = np.array([
        float(np.linalg.norm(
            (np.linalg.inv(ibm[k])[:3, :3]
             / np.maximum(np.linalg.norm(np.linalg.inv(ibm[k])[:3, :3], axis=0), 1e-30))
            - np.eye(3)))
        for k in range(len(joint_nodes))])

    def bone_weight(target):
        acc = np.zeros(len(P), dtype=np.float64)
        for k in range(4):
            acc += np.where(joints[:, k] == target, weights[:, k], 0.0)
        return acc

    wj, wh = bone_weight(jaw_j), bone_weight(head_j)
    wr = np.clip(weights.sum(axis=1) - wj - wh, 0.0, 1.0)

    # BIND-POSE SKINNED COORDINATES (SPEC-jawseam.md section 0).
    #
    # The gate measures rest lengths in the pose the renderer shows, which is
    # every vertex pushed through the linear blend of its bones' (worldBind @
    # ibm) matrices with the jaw at its authored bind.  That is NOT the raw
    # POSITION array: for a joint whose worldBind is exactly inv(ibm) the
    # product is identity, but a vertex carrying Neck or spine weight is moved
    # by the blend even so, because the blend of identities weighted by a
    # weight vector that does not sum to 1 is not identity.  Measured on the
    # rebaked GLBs 1757-2343 seam edges per family carry such weight and the
    # two rest lengths diverge by up to 2.8x on exactly the edges the gate
    # tears on.  Export S so every invariant can be evaluated in the gate's
    # own basis.
    world_bind = np.linalg.inv(ibm)                      # (J,4,4)
    skin_mat = np.einsum("jab,jbc->jac", world_bind, ibm)  # identity per joint
    Ph = np.hstack([P, np.ones((len(P), 1))])
    S = np.zeros((len(P), 3), dtype=np.float64)
    for k in range(4):
        m = skin_mat[joints[:, k]]                        # (N,4,4)
        contrib = np.einsum("nab,nb->na", m, Ph)[:, :3]
        S += weights[:, k, None] * contrib

    return {
        "P": P, "S": S, "F": F, "wj": wj, "wh": wh, "wr": wr,
        "joints": joints, "weights": weights,
        "ibm": ibm,
        "hinge": hinge, "axis": axis, "bind_quat": bind_quat,
        "jaw_rel_angle": np.float64(jaw_rel_angle),
        "joint_rot_dev": joint_rot_dev,
        "joint_names": np.asarray([nodes[j].get("name", "") for j in joint_nodes]),
        "weights_component_type": np.int64(w_ct),
        "weights_normalized": np.int64(1 if w_norm else 0),
        "n_skinned_meshes": np.int64(len(skinned)),
        "n_primitives": np.int64(len(mesh["primitives"])),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("glb", nargs="+")
    ap.add_argument("-o", "--out", default="scratchpad/jawseam")
    args = ap.parse_args()
    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)
    for path in args.glb:
        data = dump(path)
        name = Path(path).stem
        target = outdir / (name + ".jawseam.npz")
        np.savez(target, **data)
        print("%s verts=%d tris=%d WEIGHTS_0 componentType=%d normalized=%d "
              "skinnedMeshes=%d prims=%d jawRelRad=%.5f"
              % (name, len(data["P"]), len(data["F"]),
                 int(data["weights_component_type"]),
                 int(data["weights_normalized"]),
                 int(data["n_skinned_meshes"]), int(data["n_primitives"]),
                 float(data["jaw_rel_angle"])))


if __name__ == "__main__":
    main()
