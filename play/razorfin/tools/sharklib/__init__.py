"""Reusable, headless Blender pieces for the Razorfin shark pipeline.

The modules deliberately keep Blender imports local to the pipeline package so
the command-line caller can stay small while each stage remains independently
usable from a Blender Python script.

`jawseam` is the exception by design: it is pure numpy and must import outside
Blender so SPEC-jawseam.md's invariants can be tested with plain pytest on any
machine.  Re-exporting `measure` unconditionally would drag bpy in through
io.py and break that, so the bpy-dependent surface is optional here.
"""

try:  # pragma: no cover - exercised only inside Blender
    from .io import measure
except ModuleNotFoundError:  # no bpy: numpy-only consumers (pytest, jawseam)
    measure = None

__all__ = ["measure"]
