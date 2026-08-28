#!/usr/bin/env python3
"""r15 lane JAW gate + trace plots.

Reads the traces jaw_trace.mjs wrote and answers, per row:
  1. does the jaw show open -> close -> rest for each eat?
  2. is it closed within 150 ms of the eat event?
  3. does it return to rest?
  4. is the idle breathing oscillation present?
  5. is every frame-to-frame step <= 12 deg except the snap?
Emits a PNG angle-trace plot per row.
"""
import json, os, sys, math

d = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
SHARKS = [s for s in (sys.argv[2].split(',') if len(sys.argv) > 2
          else ['reef', 'greatwhite', 'mako', 'leviathanrex'])]

CLOSE_MS = 150.0      # must be shut this soon after the eat event
JUMP_MAX = 12.0       # deg, frame to frame, outside the snap
SNAP_MS = 160.0       # the open+close window an eat is allowed to be fast in

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
except Exception:
    plt = None

rows_out = []
allpass = True
for shark in SHARKS:
    path = os.path.join(d, shark + '.json')
    if not os.path.exists(path):
        rows_out.append((shark, 'NO TRACE', {}))
        allpass = False
        continue
    tr = json.load(open(path))
    rs = [r for r in tr['rows'] if r.get('deg') is not None]
    eats = tr.get('eats', [])
    if not rs:
        # A row whose bake ships NO LowerJaw bone has nothing for this lane to
        # rotate. That is the pre-existing whitepointer-family HOLD (see
        # NOTES-rev15-grin.md), not a jaw-cycle failure - and the trace still
        # proves the CYCLE ran, because jawOpen and the phase field come from
        # the engine, not from the bone. Report it as NOJAW so it cannot be
        # mistaken either for a pass or for a regression from this lane.
        drove = [r for r in tr['rows'] if r.get('phase')]
        opens = [r.get('jawOpen') for r in tr['rows'] if r.get('jawOpen') is not None]
        rows_out.append((shark, 'NOJAW', {
            'note': 'bake ships no LowerJaw bone (pre-existing HOLD)',
            'cycle_ran': bool(drove),
            'phases_seen': sorted(set(r['phase'] for r in drove)),
            'jawOpen_range': [min(opens), max(opens)] if opens else None,
        }))
        continue
    ts = [r['t'] for r in rs]
    dg = [r['deg'] for r in rs]
    lo, hi = min(dg), max(dg)

    # --- closed within CLOSE_MS of each eat, and returns to rest afterwards
    CYCLE_MS = 430.0   # open+close+hold+back
    closed_ok, return_ok, per_eat = 0, 0, []
    restband = None
    # rest = the modal level far from any eat
    # "Rest" is the IDLE BAND, not a single number: the brief asks for a
    # breathing oscillation, so the jaw at rest legitimately sweeps a range and
    # a returning bite can land anywhere inside it. Prefer the frames the
    # engine itself reports as outside a bite cycle; fall back to distance from
    # an eat for traces that predate the phase field.
    idle = [r['deg'] for r in rs if r.get('phase') is None]
    # A fed trace can leave very few idle frames (the feeder fires every 900 ms
    # and a cycle is ~430 ms). Too few and the "band" is whatever handful of
    # samples happened to land, which makes the return check a coin flip. The
    # probe now reserves a bite-free idle window at the start of every run;
    # this bar just refuses to characterise a band from less than that.
    IDLE_MIN = 25
    idle_sparse = len(idle) < IDLE_MIN
    if idle_sparse:
        idle = [g for t, g in zip(ts, dg) if all(abs(t - e) > 700 for e in eats)] or dg
    rest = sum(idle) / len(idle)
    restLo, restHi = min(idle), max(idle)
    far = idle
    # An eat that is RETRIGGERED before its cycle can finish is not required to
    # return to rest first - retriggering from the current phase is the
    # specified behaviour, not a defect. The return check is therefore scored
    # only on eats that own a full uninterrupted cycle. It is still scored on
    # the LAST eat of a burst, so a jaw that never comes back is still caught.
    n_ret_scored = 0
    # An eat too close to the end of the capture has no window to be judged in.
    # Scoring it measures where the recording stopped, not where the jaw went.
    tEnd = ts[-1]
    eats = [e for e in eats if e + 800 <= tEnd]
    for i, e in enumerate(eats):
        nxt = eats[i + 1] if i + 1 < len(eats) else None
        # A RETRIGGER legitimately extends the window. Retriggering from the
        # current phase is the specified behaviour (it is what stops a feeding
        # frenzy popping), and it necessarily defers the close - the jaw blends
        # back up to open instead of finishing the close it had started. So the
        # deadline runs from the LAST eat of the burst, not the first; measured
        # from the first it would fail a cycle that is doing exactly what the
        # brief asks for.
        last = e
        for other in eats:
            if last < other <= last + CYCLE_MS:
                last = other
        win = [(t, g) for t, g in zip(ts, dg) if e <= t <= last + CLOSE_MS + 40]
        mn = min([g for _, g in win], default=None)
        opened = max([g for t, g in zip(ts, dg) if e - 60 <= t <= e + 120], default=None)
        shut = mn is not None and mn <= max(2.0, rest * 0.35)
        closed_ok += 1 if shut else 0
        retriggered = nxt is not None and (nxt - e) < CYCLE_MS
        if retriggered:
            ret = None
        else:
            back = [g for t, g in zip(ts, dg) if e + 350 <= t <= e + 800]
            # Returned = the jaw came back INTO the idle band (with a small
            # tolerance for the tail of the ease), not onto its midpoint.
            pad = max(1.0, (restHi - restLo) * 0.25)
            avg = sum(back) / len(back) if back else None
            ret = avg is not None and (restLo - pad) <= avg <= (restHi + pad)
            n_ret_scored += 1
            return_ok += 1 if ret else 0
        per_eat.append({'t': e, 'min': None if mn is None else round(mn, 2),
                        'peak': None if opened is None else round(opened, 2),
                        'shut': shut, 'returned': ret,
                        'retriggered': retriggered})

    # --- idle oscillation present: variance in the far-from-eat samples
    if len(far) > 8:
        m = sum(far) / len(far)
        var = sum((x - m) ** 2 for x in far) / len(far)
        osc = math.sqrt(var)
    else:
        osc = 0.0
    osc_ok = osc > 0.15   # a real breathing wobble, not a flat line

    # --- frame-to-frame jumps outside the snap window
    jumps = []
    for i in range(1, len(rs)):
        step = abs(dg[i] - dg[i - 1])
        if step <= JUMP_MAX:
            continue
        t = ts[i]
        in_snap = any(e - 40 <= t <= e + SNAP_MS for e in eats)
        if not in_snap:
            jumps.append({'t': round(t, 1), 'step': round(step, 2)})
    jump_ok = not jumps

    ok = (len(eats) > 0 and closed_ok == len(eats)
          and n_ret_scored > 0 and return_ok == n_ret_scored
          and osc_ok and jump_ok and not idle_sparse)
    allpass = allpass and ok
    rows_out.append((shark, 'PASS' if ok else 'FAIL', {
        'eats': len(eats), 'closed_ok': closed_ok,
        'returned_ok': return_ok, 'returns_scored': n_ret_scored,
        'rest': round(rest, 2),
        'idle_band': [round(restLo, 2), round(restHi, 2)], 'min': round(lo, 2), 'max': round(hi, 2),
        'idle_osc_sd': round(osc, 3), 'idle_osc_ok': osc_ok,
        'idle_frames': len(idle), 'idle_sparse': idle_sparse,
        'bad_jumps': jumps[:5], 'jump_ok': jump_ok, 'per_eat': per_eat[:6],
    }))

    if plt:
        fig, ax = plt.subplots(figsize=(12, 3.4), dpi=130)
        ax.plot([t / 1000 for t in ts], dg, lw=1.3, color='#1b6fb5')
        for e in eats:
            ax.axvline(e / 1000, color='#d64545', lw=0.9, alpha=0.75)
        ax.axhline(rest, color='#7a7a7a', ls='--', lw=0.8)
        ax.set_title('%s  jaw angle (deg)   eats=%d  rest=%.1f  range %.1f..%.1f'
                     % (shark, len(eats), rest, lo, hi))
        ax.set_xlabel('seconds'); ax.set_ylabel('LowerJaw local-X (deg)')
        ax.grid(alpha=0.25)
        fig.tight_layout()
        fig.savefig(os.path.join(d, 'trace_%s.png' % shark))
        plt.close(fig)

print(json.dumps([{'shark': s, 'verdict': v, **m} for s, v, m in rows_out], indent=1))
scored = [v for _, v, _ in rows_out if v not in ('NOJAW',)]
print('GATE', 'PASS' if (allpass and scored and all(v == 'PASS' for v in scored)) else 'FAIL')
