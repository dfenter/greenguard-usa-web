"""Thin command-line caller for the reusable Razorfin bake stages.

Default flags preserve the original shark_bake.py behavior. Mouth authoring
is opt-in because the legacy bake is also the parity reference for Rev 17.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sharklib import bake, export, io, rig


argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument("--in", dest="inp", required=True)
parser.add_argument("--out", required=True)
parser.add_argument("--tris", type=int, default=7000)
parser.add_argument("--tex", type=int, default=1024)
parser.add_argument("--name", default="shark")
parser.add_argument("--length", type=float, default=1.0)
parser.add_argument("--flip", action="store_true")
parser.add_argument("--flatlum", action="store_true")
parser.add_argument("--flatlum-mean", type=float, default=.5)
parser.add_argument("--desat", type=float, default=0.0)
parser.add_argument("--mouth", action="store_true")
parser.add_argument("--gape-deg", type=float, default=25.0)
parser.add_argument("--cavity-depth", type=float, default=.12)
parser.add_argument("--lip-band", type=float, default=.06)
parser.add_argument("--teeth", choices=("strip", "none", "filter"), default="strip")
args = parser.parse_args(argv)

high, _ = io.prepare_source(args.inp, length=args.length, flip=args.flip)
bake.rebuild_emission_materials(high)
low = bake.reduce_mesh(high, args.tris, args.length)
# Preserve the old output object name, which is also the mesh name in the GLB.
low.name = args.name
bake.bake_mesh(high, low, args.name, args.tex, args.length,
               flatlum=args.flatlum, flatlum_mean=args.flatlum_mean, desat=args.desat)
mouth_payload = None
if args.mouth:
    from sharklib.mouth import cut_mouth
    mouth_payload = cut_mouth(low, args.gape_deg, args.cavity_depth, args.lip_band, args.teeth)
rig_obj, _ = rig.build_rig(low, args.name, lower_jaw_weights=mouth_payload)
for action in list(__import__("bpy").data.actions):
    __import__("bpy").data.actions.remove(action)
export.export_glb(low, rig_obj, args.out, extras=mouth_payload)
