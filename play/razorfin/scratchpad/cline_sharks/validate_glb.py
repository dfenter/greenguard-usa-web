#!/usr/bin/env python3
"""Validate a baked Razorfin shark GLB against BRIEF.md.

Checks: GLB container, JSON chunk parses, mesh tri count <= budget,
bone names present (LowerJaw, Head, Neck, Spine*, Tail*), image count
and MIME types are JPEG.
Usage: python3 validate_glb.py <file.glb> [max_tris]
"""
import json
import struct
import sys

path = sys.argv[1]
max_tris = int(sys.argv[2]) if len(sys.argv) > 2 else 7000

with open(path, 'rb') as f:
    data = f.read()

magic, version, length = struct.unpack_from('<III', data, 0)
assert magic == 0x46546C67, 'not a GLB container'
assert version == 2, 'glTF version != 2'
assert length == len(data), 'container length mismatch'

clen, ctype = struct.unpack_from('<II', data, 12)
assert ctype == 0x4E4F534A, 'first chunk is not JSON'
g = json.loads(data[20:20 + clen])

fail = []

# --- meshes / tri count -----------------------------------------------------
tris = 0
for mesh in g.get('meshes', []):
    for prim in mesh.get('primitives', []):
        idx = prim.get('indices')
        nidx = g['accessors'][idx]['count'] if idx is not None else \
            g['accessors'][prim['attributes']['POSITION']]['count']
        mode = prim.get('mode', 4)
        if mode == 4:
            tris += nidx // 3
        elif mode in (5, 6):
            tris += max(0, nidx - 2) * (mode - 3)
print('meshes=%d primitives=%d triangles=%d' %
      (len(g.get('meshes', [])),
       sum(len(m['primitives']) for m in g.get('meshes', [])), tris))
if tris > max_tris:
    fail.append(f'tri count {tris} exceeds budget {max_tris}')

# --- skins / bones ----------------------------------------------------------
bones = []
for skin in g.get('skins', []):
    bones += [g['nodes'][j].get('name', '?') for j in skin.get('joints', [])]
print('skins=%d bones=%s' % (len(g.get('skins', [])), bones))
required = ['LowerJaw', 'Head', 'Neck']
for r in required:
    if r not in bones:
        fail.append(f'missing required bone {r}')
if not any(b.startswith('Spine') for b in bones):
    fail.append('missing Spine* bones')
if not any(b.startswith('Tail') for b in bones):
    fail.append('missing Tail* bones')

# --- images -----------------------------------------------------------------
imgs = [(i.get('name'), i.get('mimeType'), i.get('uri')) for i in g.get('images', [])]
print('images=%d %s' % (len(imgs), imgs))
if not imgs:
    fail.append('no images embedded')
for name, mime, uri in imgs:
    if mime != 'image/jpeg':
        fail.append(f'image {name} MIME={mime} (want image/jpeg)')
    if uri:
        fail.append(f'image {name} is external URI, expected embedded')

# --- texture/material sanity --------------------------------------------------
print('materials=%d textures=%d samplers=%d' %
      (len(g.get('materials', [])), len(g.get('textures', [])),
       len(g.get('samplers', []))))

if fail:
    print('VALIDATE FAIL:')
    for x in fail:
        print('  -', x)
    sys.exit(1)
print('VALIDATE OK:', path)