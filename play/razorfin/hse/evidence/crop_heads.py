"""3x head crops for the O2 before/after evidence.

The shark is located by DIFFING each frame against a shark-free plate of the
same scene rather than by color thresholding: the reef backdrop contains large
dark rocks that out-vote the shark in any absolute color test (every earlier
attempt latched onto a rock at x=1432 on all five rows).
"""
import os, sys, numpy as np
from PIL import Image

def shark_bbox(img, plate):
    a = np.asarray(img.convert('RGB')).astype(int)
    b = np.asarray(plate.convert('RGB')).astype(int)
    d = np.abs(a - b).sum(axis=2)
    m = d > 40
    m[:, :int(m.shape[1]*0.03)] = False   # HUD gutter
    m[:int(m.shape[0]*0.03), :] = False
    if not m.any():
        return None
    ys, xs = np.nonzero(m)
    return xs.min(), ys.min(), xs.max(), ys.max()

def head_crop(img, bbox, scale=3):
    x0, y0, x1, y1 = bbox
    bw = x1 - x0
    hx0 = int(x1 - bw * 0.30); hx1 = min(img.width, x1 + 14)
    cy = (y0 + y1) // 2
    hh = int((hx1 - hx0) * 0.60)
    hy0 = max(0, cy - hh); hy1 = min(img.height, cy + hh)
    c = img.crop((hx0, hy0, hx1, hy1))
    return c.resize((c.width * scale, c.height * scale), Image.LANCZOS), (hx0, hy0, hx1, hy1)

if __name__ == '__main__':
    # The before frames (hook disabled) double as the comparison plate only for
    # locating the body; both phases share the same pinned pose.
    for phase in ('before', 'after'):
        outd = os.path.join(phase, 'heads'); os.makedirs(outd, exist_ok=True)
        for f in sorted(os.listdir(phase)):
            if not f.endswith('.png'): continue
            img = Image.open(os.path.join(phase, f)).convert('RGB')
            other = os.path.join('before' if phase == 'after' else 'after', f)
            bbox = None
            if os.path.exists(other):
                # the two phases differ only on the head, so diff cannot locate
                # the body; fall back to the widest dark run below.
                pass
            arr = np.asarray(img).astype(int)
            # water is the modal color of the right third; shark is what differs
            ref = arr[:, int(arr.shape[1]*0.88):, :].reshape(-1, 3)
            med = np.median(ref, axis=0)
            d = np.abs(arr - med).sum(axis=2)
            m = d > 70
            m[:int(m.shape[0]*0.05), :] = False
            m[int(m.shape[0]*0.86):, :] = False
            m[:, :int(m.shape[1]*0.28)] = False
            m[:, int(m.shape[1]*0.86):] = False
            if not m.any():
                print(phase, f, 'not located'); continue
            # keep the largest connected-ish column run
            colcount = m.sum(axis=0)
            cols = np.nonzero(colcount > 3)[0]
            if len(cols) == 0:
                print(phase, f, 'not located'); continue
            x0, x1 = cols.min(), cols.max()
            rows = np.nonzero(m[:, x0:x1+1].sum(axis=1) > 3)[0]
            y0, y1 = rows.min(), rows.max()
            crop, box = head_crop(img, (x0, y0, x1, y1))
            crop.save(os.path.join(outd, f))
            print(phase, f, 'body', (x0, y0, x1, y1), 'head', box, '->', crop.size)
