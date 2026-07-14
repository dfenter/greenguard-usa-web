#!/usr/bin/env python3
"""
gen_pcb.py -- generates co2_timer_v5.kicad_pcb (KiCad 10 s-expression) from data tables.

PLACEMENT PLAN (KiCad coords, y down; board x 0..70, y 0..50; origin top-left).
Enclosure mapping (Hammond 1554CGY, drilling doc):
  x=0 edge  = FRONT face  -> J5 barrel, SW1/SW2 buttons, J4 display header
  y=0 edge  = LEFT  face  -> J1 (BAT1) @x=14, J6 (BAT2) @x=54, openings outward
  y=50 edge = RIGHT face  -> J2 (SOLENOID) @x=38, opening outward
  Mounting holes 3.2mm @ (3,3)(67,3)(3,47)(67,47)
Region floorplan:
  top-left   : power entry J5/D4/TVS1, J1/D1, F1 (VIN_OR->VM)
  top-right  : J6/D5, +3V3 rail y~12.8, ISP J3 @ (61..65, 15..20)
  mid-left   : LDO U3 + C2/C3/C12, divider R7/R8/C14, buttons SW1/SW2 + R9-R12,C10,C11, J4
  center     : U1 SOIC-14 @ (34,29) rot180 (DRV/I2C/alert pins exit east)
  mid-right  : U2 SO-16 @ (53,24), C7, R2/R3/R4 pullups, R5/D2/SC1 backup
  bottom-mid : supervisor U5/C13/D3, one-shot U6/C8/C9/R13, D6/R14/R15/R16/R6
  bottom-right: U4 DRV8871 @ (44,40) + C4/C5, C1 reservoir, TVS2, J2
Routing: grid autorouter (0.25mm cells, 2 layers). F.Cu preferred; B.Cu = GND pour
(0.3mm clearance) + short crossings. VM/solenoid/battery nets 1.0mm, +3V3 0.5mm,
logic 0.25mm. GND: SMD pads get 0.6mm stub + via to B.Cu pour; THT pads via thermal
spokes. U4 PowerPAD: 4 thermal vias. Stitching vias sprinkled on open grid.
"""
import json, math, os, sys
from collections import deque
import heapq

HERE = os.path.dirname(os.path.abspath(__file__))
NETMAP = json.load(open(os.path.join(HERE, 'padnet_expected.json')))

def fmt(v):
    s = f"{v:.3f}".rstrip('0').rstrip('.')
    return s if s not in ('', '-0') else '0'

_uid = [0]
def uid():
    _uid[0] += 1
    return f"aa000000-0000-4000-8000-{_uid[0]:012d}"

def rotv(dx, dy, r):
    r %= 360
    if r == 0:   return (dx, dy)
    if r == 90:  return (dy, -dx)
    if r == 180: return (-dx, -dy)
    if r == 270: return (-dy, dx)
    raise ValueError(r)

# ---------------------------------------------------------------------------
# Footprint prototypes.  pads: (name, kind, shape, dx, dy, sx, sy, drill)
# kind: smd|tht|npth.  silk: list of ('line',x1,y1,x2,y2,w) / ('circle',cx,cy,r,w)
# / ('text',s,x,y,size).  body=(w,h) for silk box.
# ---------------------------------------------------------------------------
def soic(n, span, pitch, psx, psy, name):
    half = n // 2
    y0 = -pitch * (half - 1) / 2
    pads = []
    for i in range(half):
        pads.append((str(i + 1), 'smd', 'rect', -span/2, y0 + pitch*i, psx, psy, 0))
    for i in range(half):
        pads.append((str(n - i), 'smd', 'rect', span/2, y0 + pitch*i, psx, psy, 0))
    bw = span - psx - 0.4
    bh = pitch * (half - 1) + 1.4
    silk = [('circle', -span/2 - psx/2 - 0.5, y0, 0.15, 0.3),
            ('line', -bw/2, -bh/2, bw/2, -bh/2, 0.12),
            ('line', -bw/2, bh/2, bw/2, bh/2, 0.12)]
    return dict(name=name, pads=pads, silk=silk)

PROTOS = {
 'SOIC14': soic(14, 4.95, 1.27, 1.95, 0.6, 'Package_SO:SOIC-14_3.9x8.7mm_P1.27mm'),
 'SO16':   soic(16, 9.8, 1.27, 2.0, 0.6, 'Package_SO:SO-16_W7.5mm_P1.27mm'),
 'VSSOP8': soic(8, 2.5, 0.5, 1.0, 0.28, 'Package_SO:VSSOP-8_2.4x2mm_P0.5mm'),
 'HSOP8':  None,  # built below (adds PAD)
 'SOT23': dict(name='Package_TO_SOT_SMD:SOT-23', pads=[
    ('1','smd','rect',-0.95,-1.3,0.9,1.3,0), ('2','smd','rect',0.95,-1.3,0.9,1.3,0),
    ('3','smd','rect',0,1.3,0.9,1.3,0)],
    silk=[('circle',-1.8,-1.3,0.15,0.3)]),
 'SOT23AK': dict(name='Package_TO_SOT_SMD:SOT-23', pads=[
    ('A','smd','rect',-0.95,-1.3,0.9,1.3,0), ('K','smd','rect',0,1.3,0.9,1.3,0)],
    silk=[('line',-0.8,1.3,0.8,1.3,0.2)]),   # cathode bar near K pad
 'SMA': dict(name='Diode_SMD:D_SMA', pads=[
    ('A','smd','rect',2.0,0,2.4,1.6,0), ('K','smd','rect',-2.0,0,2.4,1.6,0)],
    silk=[('line',-0.6,-1.0,-0.6,1.0,0.25),
          ('line',-2.3,-1.15,2.3,-1.15,0.12), ('line',-2.3,1.15,2.3,1.15,0.12)]),
 'R0603': dict(name='Resistor_SMD:R_0603_1608Metric', pads=[
    ('1','smd','rect',-0.8,0,0.8,0.95,0), ('2','smd','rect',0.8,0,0.8,0.95,0)], silk=[]),
 'C0603': dict(name='Capacitor_SMD:C_0603_1608Metric', pads=[
    ('1','smd','rect',-0.8,0,0.8,0.95,0), ('2','smd','rect',0.8,0,0.8,0.95,0)], silk=[]),
 'C0805': dict(name='Capacitor_SMD:C_0805_2012Metric', pads=[
    ('1','smd','rect',-1.0,0,1.15,1.45,0), ('2','smd','rect',1.0,0,1.15,1.45,0)], silk=[]),
 'C1206': dict(name='Capacitor_SMD:C_1206_3216Metric', pads=[
    ('1','smd','rect',-1.45,0,1.15,1.8,0), ('2','smd','rect',1.45,0,1.15,1.8,0)], silk=[]),
 'FUSE1812': dict(name='Fuse:Fuse_1812_4532Metric', pads=[
    ('1','smd','rect',-2.0,0,1.8,2.6,0), ('2','smd','rect',2.0,0,1.8,2.6,0)],
    silk=[('line',-2.3,-1.6,2.3,-1.6,0.12), ('line',-2.3,1.6,2.3,1.6,0.12)]),
 'SKQG': dict(name='Button_Switch_SMD:SW_SPST_SKQG_WithStem', pads=[
    ('1','smd','rect',-3.0,-2.2,1.6,1.1,0), ('2','smd','rect',3.0,-2.2,1.6,1.1,0),
    ('3','smd','rect',-3.0,2.2,1.6,1.1,0), ('4','smd','rect',3.0,2.2,1.6,1.1,0)],
    silk=[('circle',0,0,1.6,0.15),
          ('line',-3.1,-3.1,3.1,-3.1,0.12), ('line',-3.1,3.1,3.1,3.1,0.12)]),
 'CP_D8': dict(name='Capacitor_THT:CP_Radial_D8.0mm_P3.50mm', pads=[
    ('+','tht','rect',-1.75,0,1.6,1.6,0.8), ('-','tht','circle',1.75,0,1.6,1.6,0.8)],
    silk=[('circle',0,0,4.0,0.15), ('text','+',-3.3,-2.6,0.9)]),
 'CP_D5': dict(name='Capacitor_THT:CP_Radial_D5.0mm_P2.00mm', pads=[
    ('+','tht','rect',-1.0,0,1.3,1.3,0.6), ('-','tht','circle',1.0,0,1.3,1.3,0.6)],
    silk=[('circle',0,0,2.5,0.15), ('text','+',-2.4,-2.0,0.9)]),
 'MKDS': dict(name='Connector_Phoenix_MKDS:PhoenixContact_MKDS_1,5_2-5.08mm_Angled', pads=[
    ('1','tht','rect',-2.54,0,1.8,1.8,1.0), ('2','tht','circle',2.54,0,1.8,1.8,1.0)],
    silk=[('line',-5.0,-2.0,5.0,-2.0,0.12), ('line',-5.0,2.0,5.0,2.0,0.12),
          ('line',-5.0,-2.0,-5.0,2.0,0.12), ('line',5.0,-2.0,5.0,2.0,0.12)]),
 'HDR1x4': dict(name='Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical', pads=[
    ('1','tht','rect',0,0,1.7,1.7,1.0), ('2','tht','circle',0,2.54,1.7,1.7,1.0),
    ('3','tht','circle',0,5.08,1.7,1.7,1.0), ('4','tht','circle',0,7.62,1.7,1.7,1.0)],
    silk=[('line',-1.27,-1.27,1.27,-1.27,0.12)]),
 'HDR2x3': dict(name='Connector_PinHeader_2.54mm:PinHeader_2x03_P2.54mm_Vertical', pads=[
    ('1','tht','rect',0,0,1.7,1.7,1.0), ('2','tht','circle',2.54,0,1.7,1.7,1.0),
    ('3','tht','circle',0,2.54,1.7,1.7,1.0), ('4','tht','circle',2.54,2.54,1.7,1.7,1.0),
    ('5','tht','circle',0,5.08,1.7,1.7,1.0), ('6','tht','circle',2.54,5.08,1.7,1.7,1.0)],
    silk=[('line',-1.27,-1.27,-1.27,1.27,0.12), ('line',-1.27,-1.27,1.27,-1.27,0.12)]),
 'BARREL': dict(name='Connector_BarrelJack:BarrelJack_CUI_PJ-002A', pads=[
    ('1','tht','rect',0,0,2.0,2.0,1.3), ('2','tht','circle',0,3.4,2.0,2.0,1.3),
    ('3','tht','circle',-3.3,1.7,2.0,2.0,1.3)],
    silk=[('line',-6.0,-1.6,3.0,-1.6,0.12), ('line',-6.0,5.0,3.0,5.0,0.12)]),
 'TP': dict(name='TestPoint:TestPoint_Pad_D1.5mm', pads=[
    ('1','smd','circle',0,0,1.5,1.5,0)], silk=[('circle',0,0,1.05,0.15)]),
 'MTG': dict(name='MountingHole:MountingHole_3.2mm_M3', pads=[
    ('','npth','circle',0,0,3.2,3.2,3.2)], silk=[]),
}
PROTOS['HSOP8'] = soic(8, 4.95, 1.27, 1.95, 0.6, 'Package_SO:HSOP-8_3.9x4.9mm_P1.27mm_PowerPAD')
PROTOS['HSOP8']['pads'].append(('PAD','smd','rect',0,0,2.41,3.1,0))

# ---------------------------------------------------------------------------
# Placement: ref -> (proto, x, y, rot, value, ref_label_dx, ref_label_dy)
# ---------------------------------------------------------------------------
PLACE = {
 'H1': ('MTG',3,3,0,'',0,0), 'H2': ('MTG',67,3,0,'',0,0),
 'H3': ('MTG',3,47,0,'',0,0), 'H4': ('MTG',67,47,0,'',0,0),
 'J1': ('MKDS',14,3,0,'BAT1_9V',0,3.3),
 'J6': ('MKDS',54,3,0,'BAT2_9V',0,3.3),
 'J2': ('MKDS',38,47,0,'SOLENOID',0,-3.2),
 'J5': ('BARREL',6.5,10,90,'DC_9-12V',3.0,-3.2),
 'J4': ('HDR1x4',3.5,28,0,'DISPLAY',2.2,-1.8),
 'J3': ('HDR2x3',61,15,0,'ISP',-2.6,2.5),
 'D1': ('SMA',14,8,180,'SS34',0,-1.9),
 'D5': ('SMA',54,8,180,'SS34',0,-1.9),
 'D4': ('SMA',17,13,180,'SS34',0,-1.9),
 'TVS1':('SMA',14.5,10.2,180,'SMAJ15A',0,3.0),
 'TVS2':('SMA',63.5,44.5,270,'SMAJ15A',2.8,0),
 'F1': ('FUSE1812',24,8,0,'PPTC_1.1A',0,-2.4),
 'U3': ('SOT23',26,13.5,0,'MCP1703A-3.3',-3.4,0),
 'C2': ('C0805',29.5,11.2,0,'1uF',0,-1.6),
 'C3': ('C0805',26,17,0,'1uF',-0.1,1.7),
 'C12':('C0805',29.5,17,0,'10uF',0.4,1.7),
 'U1': ('SOIC14',34,29,180,'ATtiny84A',0,-5.3),
 'C6': ('C0603',39.5,33.8,0,'100nF',0,1.5),
 'U2': ('SO16',53,24,0,'DS3231M',0,-6.2),
 'C7': ('C0603',49.4,17.8,0,'100nF',0,-1.4),
 'R2': ('R0603',60.5,11.5,0,'10K',0,-1.4),
 'R3': ('R0603',56.5,13.8,0,'10K',-2.6,0),
 'R4': ('R0603',44,19.5,0,'10K',0,-1.4),
 'R1': ('R0603',44,17.5,0,'10K',0,-1.4),
 'R5': ('R0603',48,31,0,'220R',0,-1.4),
 'D2': ('SOT23AK',51.5,31.5,90,'BAT54',0,-2.6),
 'SC1':('CP_D5',56.5,34.5,0,'1F_5V5',0,3.4),
 'C1': ('CP_D8',57,43,180,'470uF',0,-4.9),
 'U4': ('HSOP8',44,40,0,'DRV8871',0,-4.0),
 'C4': ('C1206',51.5,41,0,'10uF',0,1.8),
 'C5': ('C0603',51.5,38.7,0,'100nF',0,-1.5),
 'R6': ('R0603',39.2,41.9,270,'43K',-1.9,0),
 'R14':('R0603',41,33,270,'100K',1.9,0),
 'R16':('R0603',39,36,0,'1K',-0.4,-1.4),
 'R15':('R0603',42.7,36,0,'100K',1.2,-1.4),
 'D6': ('SOT23AK',33,38,90,'BAT54',0,-2.7),
 'U6': ('VSSOP8',24,41,0,'74LVC1G123',0,-2.9),
 'C9': ('C0603',27.5,42.8,270,'470nF',1.9,0),
 'R13':('R0603',29.9,42.8,270,'100K',1.9,0),
 'C8': ('C0603',24,37.6,180,'100nF',0,-1.4),
 'U5': ('SOT23',17,42,0,'TPS3839G30',0,3.3),
 'C13':('C0603',14.5,38.6,180,'100nF',0,-1.4),
 'D3': ('SOT23AK',20.4,45.3,270,'BAT54',0,2.8),
 'R7': ('R0603',21.5,20,270,'100K',1.9,0),
 'R8': ('R0603',21.5,23.5,270,'33K',1.9,0),
 'C14':('C0603',23.3,21.8,270,'100nF',1.7,0),
 'SW1':('SKQG',5.5,42,0,'UP',5.6,0),
 'SW2':('SKQG',5.5,23.5,0,'SET',5.6,0),
 'R11':('R0603',11.5,39.8,0,'10K',0,-1.4),
 'R12':('R0603',11.5,21.3,0,'10K',0,-1.4),
 'R9': ('R0603',22,30.27,0,'100R',0,-1.4),
 'R10':('R0603',22,28.4,0,'100R',0,1.5),
 'C10':('C0603',26,32.5,0,'100nF',0,1.5),
 'C11':('C0603',26,26.5,0,'100nF',0,-1.5),
 'TP1':('TP',63.5,11.5,0,'MISO',2.4,0),
 'TP2':('TP',13,46.5,0,'/SUPV',0,2.0),
 'TP3':('TP',61.5,38,0,'VM',2.2,0),
}

# ---------------------------------------------------------------------------
# Absolute pad geometry
# ---------------------------------------------------------------------------
def build_pads():
    pads = []   # dict: ref,pname,net,kind,shape,x,y,sx,sy,drill,layers
    for ref, (proto, cx, cy, rot, val, _, _2) in PLACE.items():
        pr = PROTOS[proto]
        nets = NETMAP.get(ref, {}).get('pads', {})
        for (pn, kind, shape, dx, dy, sx, sy, drill) in pr['pads']:
            rdx, rdy = rotv(dx, dy, rot)
            if rot % 180 == 90:
                sx, sy = sy, sx
            net = nets.get(pn)
            if net in ('NC', None):
                net = None
            pads.append(dict(ref=ref, pn=pn, net=net, kind=kind, shape=shape,
                             x=cx + rdx, y=cy + rdy, sx=sx, sy=sy, drill=drill))
    return pads

PADS = build_pads()
PBYNET = {}
for p in PADS:
    if p['net']:
        PBYNET.setdefault(p['net'], []).append(p)

# ---------------------------------------------------------------------------
# Grid router
# ---------------------------------------------------------------------------
GRID = 0.25
NX, NY = int(70/GRID) + 1, int(50/GRID) + 1
EDGE = '\x00EDGE'

occ = [dict(), dict()]          # (ix,iy) -> net  per layer (0=F,1=B)
netcells = {}                   # net -> set((l,ix,iy))

def cells_near_rect(cx, cy, sx, sy, grow):
    x0 = max(0, int((cx - sx/2 - grow)/GRID))
    x1 = min(NX-1, int(math.ceil((cx + sx/2 + grow)/GRID)))
    y0 = max(0, int((cy - sy/2 - grow)/GRID))
    y1 = min(NY-1, int(math.ceil((cy + sy/2 + grow)/GRID)))
    out = []
    for ix in range(x0, x1+1):
        for iy in range(y0, y1+1):
            px, py = ix*GRID, iy*GRID
            ddx = max(abs(px-cx) - sx/2, 0.0)
            ddy = max(abs(py-cy) - sy/2, 0.0)
            if ddx*ddx + ddy*ddy <= grow*grow:
                out.append((ix, iy))
    return out

def mark_rect(layers, net, cx, cy, sx, sy, grow=0.18):
    for l in layers:
        for c in cells_near_rect(cx, cy, sx, sy, grow):
            occ[l][c] = net
            if net and net != EDGE:
                netcells.setdefault(net, set()).add((l,) + c)

def mark_seg(layers, net, x1, y1, x2, y2, w):
    steps = max(1, int(math.hypot(x2-x1, y2-y1)/GRID) + 1)
    for i in range(steps+1):
        t = i/steps
        mark_rect(layers, net, x1+(x2-x1)*t, y1+(y2-y1)*t, w, w, 0.18)

# board edge sentinel (keeps copper >=0.5+ from Edge.Cuts)
for ix in range(NX):
    for iy in range(NY):
        x, y = ix*GRID, iy*GRID
        if x < 0.56 or x > 69.44 or y < 0.56 or y > 49.44:
            occ[0][(ix,iy)] = EDGE; occ[1][(ix,iy)] = EDGE

for p in PADS:
    lays = [0] if p['kind'] == 'smd' else [0, 1]
    net = p['net'] if p['net'] else '\x00NPAD:%s.%s' % (p['ref'], p['pn'])
    mark_rect(lays, net, p['x'], p['y'], p['sx'], p['sy'])

SEGS = []   # (net,x1,y1,x2,y2,w,layer)
VIAS = []   # (net,x,y,size,drill)

def commit_seg(net, x1, y1, x2, y2, w, layer):
    SEGS.append((net, x1, y1, x2, y2, w, layer))
    mark_seg([layer], net, x1, y1, x2, y2, w)

def commit_via(net, x, y, size=0.7, drill=0.35):
    VIAS.append((net, x, y, size, drill))
    mark_rect([0, 1], net, x, y, size, size)

def dist_map(net):
    """chebyshev distance (cells) to nearest foreign occupied cell, per layer, cap 6"""
    INF = 99
    maps = []
    for l in (0, 1):
        dm = {}
        dq = deque()
        for c, n in occ[l].items():
            if n != net:
                dm[c] = 0; dq.append(c)
        while dq:
            c = dq.popleft()
            d = dm[c]
            if d >= 5: continue
            for ddx in (-1,0,1):
                for ddy in (-1,0,1):
                    nc = (c[0]+ddx, c[1]+ddy)
                    if 0 <= nc[0] < NX and 0 <= nc[1] < NY and nc not in dm:
                        dm[nc] = d+1; dq.append(nc)
        maps.append(dm)
    return maps

def own_soft(net):
    """cells within ~0.5mm of own copper: escape exemption zone"""
    soft = set()
    for (l, ix, iy) in netcells.get(net, set()):
        for ddx in (-2,-1,0,1,2):
            for ddy in (-2,-1,0,1,2):
                soft.add((l, ix+ddx, iy+ddy))
    return soft

def pad_cells(blob, p, hw=None):
    """Cells usable as route terminals on pad p.  With hw given, restrict to
    cells where a track of half-width min(hw, pad_halfmin) stamped from the
    cell to the pad center stays within pad copper + 0.15mm."""
    out = set()
    if hw is None:
        tx = p['sx']/2 + 0.2
        ty = p['sy']/2 + 0.2
    else:
        he = min(hw, min(p['sx'], p['sy'])/2)
        tx = p['sx']/2 + 0.15 - he
        ty = p['sy']/2 + 0.15 - he
    for (l, ix, iy) in blob:
        px, py = ix*GRID, iy*GRID
        if abs(px-p['x']) <= tx and abs(py-p['y']) <= ty:
            out.add((l, ix, iy))
    return out

def route_net(net, width, viasize=0.7, viadrill=0.35):
    pads = PBYNET.get(net, [])
    hw = width/2
    need = int(math.ceil((hw + 0.21 + 0.177)/GRID))
    needv = int(math.ceil((viasize/2 + 0.21 + 0.177)/GRID))
    dms = dist_map(net)
    soft = own_soft(net)
    blob = set(netcells.get(net, set()))
    # group pads pre-joined by SEED tracks (union-find)
    parent = {}
    def find(k):
        while parent.get(k, k) != k: k = parent[k]
        return k
    keys = [(p['ref'], p['pn']) for p in pads]
    for a, b in PRECONN.get(net, []):
        parent[find(a)] = find(b)
    groups = {}
    for p in pads:
        groups.setdefault(find((p['ref'], p['pn'])), []).append(p)
    glist = sorted(groups.values(), key=lambda g: (g[0]['x'], g[0]['y']))
    first = glist.pop(0)
    cur = set()
    for p in first:
        cur |= pad_cells(blob, p, hw)
    fails = []
    while glist:
        glist.sort(key=lambda g: min(abs(g[0]['x']-ix*GRID) + abs(g[0]['y']-iy*GRID)
                                     for (l, ix, iy) in cur))
        grp = glist.pop(0)
        starts = set()
        for p in grp:
            starts |= pad_cells(blob, p, hw)
        path = dijkstra(net, starts, cur, dms, soft, need, needv,
                        2 if hw <= 0.15 else 3)
        if path is None:
            fails.append((net, grp[0]['ref'], grp[0]['pn']))
            for p in grp:
                cur |= pad_cells(blob, p, hw)
        else:
            emit_path(net, path, width, viasize, viadrill)
            snap_to_pad(net, grp, path[0], width)
            snap_to_pad(net, pads, path[-1], width)
            for p in grp:
                cur |= pad_cells(blob, p, hw)
            for st in path:
                cur.add(st)
                soft.update((st[0], st[1]+a, st[2]+b) for a in (-2,-1,0,1,2) for b in (-2,-1,0,1,2))
    return fails

def snap_to_pad(net, cand_pads, cell, width):
    """Ensure a path endpoint reaches actual pad copper: add a short segment
    from the endpoint cell to the center of the pad it terminated on."""
    l, ix, iy = cell
    px, py = ix*GRID, iy*GRID
    best, bd = None, 1e9
    for p in cand_pads:
        if p['kind'] == 'smd' and l != 0:
            continue
        dx, dy = abs(px - p['x']), abs(py - p['y'])
        if dx > p['sx']/2 + 0.25 or dy > p['sy']/2 + 0.25:
            continue
        d = dx + dy
        if d < bd:
            bd, best = d, p
    if best is not None and bd > 0.01:
        w = min(width, max(0.2, min(best['sx'], best['sy'])))
        commit_seg(net, px, py, best['x'], best['y'], w, l)

def dijkstra(net, starts, goals, dms, soft, need, needv, softneed=2):
    pq = []
    dist = {}
    parent = {}
    for s in starts:
        st = (s[0], s[1], s[2], -1)
        dist[st] = 0
        heapq.heappush(pq, (0, st))
    goalset = goals
    best = None
    while pq:
        d, st = heapq.heappop(pq)
        if d > dist.get(st, 1e18): continue
        l, ix, iy, dr = st
        if (l, ix, iy) in goalset:
            best = st; break
        for nd, (ddx, ddy) in enumerate(((1,0),(-1,0),(0,1),(0,-1))):
            nix, niy = ix+ddx, iy+ddy
            if not (0 <= nix < NX and 0 <= niy < NY): continue
            c = (nix, niy)
            dmv = dms[l].get(c, 99)
            ok = dmv >= need or \
                 (dmv >= softneed and ((l, nix, niy) in goalset or (l, nix, niy) in soft))
            if not ok: continue
            cost = d + 10 + (2 if (dr != -1 and dr != nd) else 0) + (3 if l == 1 else 0)
            nst = (l, nix, niy, nd)
            if cost < dist.get(nst, 1e18):
                dist[nst] = cost; parent[nst] = st
                heapq.heappush(pq, (cost, nst))
        # via
        ol = 1 - l
        c = (ix, iy)
        if (dms[0].get(c, 99) >= needv and dms[1].get(c, 99) >= needv):
            cost = d + 120
            nst = (ol, ix, iy, -1)
            if cost < dist.get(nst, 1e18):
                dist[nst] = cost; parent[nst] = st
                heapq.heappush(pq, (cost, nst))
    if best is None:
        return None
    out = []
    st = best
    while True:
        out.append((st[0], st[1], st[2]))
        if st not in parent: break
        st = parent[st]
    out.reverse()
    return out

def emit_path(net, path, width, viasize, viadrill):
    i = 0
    while i < len(path) - 1:
        l0, x0, y0 = path[i]
        j = i + 1
        if path[j][0] != l0:
            commit_via(net, x0*GRID, y0*GRID, viasize, viadrill)
            i = j; continue
        # extend straight run
        ddx, ddy = path[j][1]-x0, path[j][2]-y0
        k = j
        while k+1 < len(path) and path[k+1][0] == l0 and \
              (path[k+1][1]-path[k][1], path[k+1][2]-path[k][2]) == (ddx, ddy):
            k += 1
        commit_seg(net, x0*GRID, y0*GRID, path[k][1]*GRID, path[k][2]*GRID,
                   width, l0)
        i = k

# ---------------------------------------------------------------------------
# Hand-seeded tracks for congested escapes (committed before autorouting).
# Each seed fully connects the listed pad pair; PRECONN tells the router.
# ---------------------------------------------------------------------------
SEEDS = [
 # U6 one-shot fine-pitch escapes (0.5mm pitch VSSOP)
 ('OS_CEXT', 0.25, [(25.2,41.25),(26.8,41.25),(27.5,42.0)],   ('U6','6'), ('C9','1')),
 ('OS_RC',   0.25, [(25.2,40.75),(29.0,40.75),(29.9,41.65),(29.9,42.0)], ('U6','7'), ('R13','1')),
 ('OS_RC',   0.25, [(27.5,43.6),(29.9,42.0)],                 ('C9','2'), ('R13','1')),
 # /ALERT: U2 pin 3 escape west past NC pads, down to R4 pullup
 ('/ALERT',  0.25, [(48.1,22.095),(43.0,22.095),(42.2,21.3),(42.2,19.5),(43.2,19.5)],
                                                              ('U2','3'), ('R4','1')),
 # button lanes into U1 west column
 ('BTN_UP',  0.25, [(31.525,30.27),(22.8,30.27)],             ('U1','12'), ('R9','2')),
 ('BTN_SET', 0.25, [(31.525,29.0),(24.2,29.0),(23.4,28.4),(22.8,28.4)], ('U1','11'), ('R10','2')),
 # U6 remaining fine-pitch escapes; U5 SOT-23: pad2=(17.95,40.7) pad3=(17,43.3)
 ('/SUPV',   0.25, [(22.8,40.25),(19.6,40.25),(19.0,40.7),(17.95,40.7)],
                                                              ('U6','1'), ('U5','2')),
 ('+3V3',    0.25, [(22.8,40.75),(22.8,41.25)],               ('U6','2'), ('U6','3')),
 ('+3V3',    0.25, [(25.2,40.25),(25.2,38.5),(24.8,37.6)],    ('U6','8'), ('C8','1')),
 ('+3V3',    0.25, [(22.8,41.25),(21.8,41.25),(21.8,42.2),(18.3,42.2),(17.4,43.0),(17.0,43.3)],
                                                              ('U6','3'), ('U5','3')),
 ('+3V3',    0.25, [(17.0,43.3),(17.0,44.7),(13.9,44.7),(13.9,39.9),(15.3,38.9),(15.3,38.6)],
                                                              ('U5','3'), ('C13','1')),
 ('ONESHOT_Q',0.25,[(25.2,41.75),(25.2,42.5),(26.2,45.2),(31.0,45.2),(31.0,39.85),(31.7,38.95)],
                                                              ('U6','5'), ('D6','A')),
 # via-hop seeds ('V' = place via, switch layer)
 ('DRV_IN2_MCU',0.25,[(36.475,30.27),(37.6,30.27),'V',(37.6,35.0),(38.2,35.6),'V',(38.2,36.0)],
                                                              ('U1','3'), ('R16','1')),
 ('TM_CLK',  0.25, [(31.525,27.73),(30.9,27.73),'V',(30.9,35.62),(3.5,35.62)],
                                                              ('U1','10'), ('J4','4')),
 ('/ALERT',  0.25, [(36.475,27.73),(38.8,27.73),(38.8,22.095),(43.0,22.095)],
                                                              ('U1','5'), ('R4','1')),
 # BTN_SET_SW past the R7/R8 divider wall
 ('BTN_SET_SW',0.25,[(10.7,21.3),(10.7,25.4),(20.0,25.4),(20.0,27.5),(21.2,28.4)],
                                                              ('R12','1'), ('R10','1')),
]
PRECONN = {}
def commit_seeds():
    for entry in SEEDS:
        net, w, pts = entry[0], entry[1], entry[2]
        lay, prev = 0, None
        for pt in pts:
            if pt == 'V':
                commit_via(net, prev[0], prev[1])
                lay = 1 - lay
                continue
            if prev is not None:
                commit_seg(net, prev[0], prev[1], pt[0], pt[1], w, lay)
            prev = pt
        PRECONN.setdefault(net, []).append((entry[3], entry[4]))

# ---------------------------------------------------------------------------
# GND handling: SMD GND pads -> stub + via to B.Cu pour.  THT GND pads reach the
# pour directly (thermal spokes).  U4 PowerPAD gets 4 thermal vias.
# ---------------------------------------------------------------------------
def gnd_stubs():
    dms = dist_map('GND')
    unstubbed = []
    for p in PADS:
        if p['net'] != 'GND' or p['kind'] != 'smd' or p['pn'] == 'PAD':
            continue
        placed = False
        cands = [(1.3,0),(-1.3,0),(0,1.3),(0,-1.3),(1.8,0),(-1.8,0),(0,1.8),(0,-1.8),
                 (1.3,1.3),(-1.3,1.3),(1.3,-1.3),(-1.3,-1.3),(2.3,0),(-2.3,0),(0,2.3),(0,-2.3)]
        for (ox, oy) in cands:
            vx, vy = p['x']+ox, p['y']+oy
            c = (round(vx/GRID), round(vy/GRID))
            if not (0 <= c[0] < NX and 0 <= c[1] < NY):
                continue
            if dms[0].get(c, 99) >= 3 and dms[1].get(c, 99) >= 3:
                w = 0.6 if min(p['sx'], p['sy']) >= 0.55 else 0.25
                bad = False
                for t in (0.25, 0.5, 0.75):
                    mx, my = p['x'] + ox*t, p['y'] + oy*t
                    mc = (round(mx/GRID), round(my/GRID))
                    if dms[0].get(mc, 99) < (3 if w >= 0.5 else 2):
                        bad = True
                        break
                if bad:
                    continue
                vx, vy = c[0]*GRID, c[1]*GRID
                commit_seg('GND', p['x'], p['y'], vx, vy, w, 0)
                commit_via('GND', vx, vy, 0.7, 0.35)
                placed = True
                break
        if not placed:
            unstubbed.append((p['ref'], p['pn']))
    return unstubbed

def u4_thermal():
    u4 = PLACE['U4']
    for (ox, oy) in ((-0.6,-0.75),(0.6,-0.75),(-0.6,0.75),(0.6,0.75)):
        commit_via('GND', u4[1]+ox, u4[2]+oy, 0.65, 0.32)

def stitch():
    dms = dist_map('GND')
    n = 0
    for gx in range(6, 67, 6):
        for gy in range(6, 47, 6):
            c = (round(gx/GRID), round(gy/GRID))
            if dms[0].get(c, 99) >= 5 and dms[1].get(c, 99) >= 5:
                commit_via('GND', gx, gy, 0.7, 0.35)
                n += 1
    return n

# ---------------------------------------------------------------------------
# Board emission
# ---------------------------------------------------------------------------
HEADER = '''(kicad_pcb
\t(version 20260206)
\t(generator "pcbnew")
\t(generator_version "10.0")
\t(general
\t\t(thickness 1.6)
\t\t(legacy_teardrops no)
\t)
\t(paper "A4")
\t(title_block
\t\t(title "GreenGuard CO2 Trap Timer PCB")
\t\t(rev "5.0")
\t\t(company "GreenGuard USA")
\t\t(comment 1 "ATtiny84A + DS3231M + DRV8871 + TPS3839/74LVC1G123 failsafe | dual 9V + barrel jack")
\t)
\t(layers
\t\t(0 "F.Cu" signal)
\t\t(2 "B.Cu" signal)
\t\t(13 "F.Paste" user)
\t\t(15 "B.Paste" user)
\t\t(5 "F.SilkS" user "F.Silkscreen")
\t\t(7 "B.SilkS" user "B.Silkscreen")
\t\t(1 "F.Mask" user)
\t\t(3 "B.Mask" user)
\t\t(17 "Dwgs.User" user "User.Drawings")
\t\t(25 "Edge.Cuts" user)
\t\t(27 "Margin" user)
\t\t(31 "F.CrtYd" user "F.Courtyard")
\t\t(29 "B.CrtYd" user "B.Courtyard")
\t)
\t(setup
\t\t(pad_to_mask_clearance 0.1)
\t\t(allow_soldermask_bridges_in_footprints no)
\t\t(tenting
\t\t\t(front yes)
\t\t\t(back yes)
\t\t)
\t)
'''

def prop(name, val, dx, dy, layer, hide, size=0.9):
    h = '\t\t\t(hide yes)\n' if hide else ''
    return (f'\t\t(property "{name}" "{val}"\n'
            f'\t\t\t(at {fmt(dx)} {fmt(dy)} 0)\n'
            f'\t\t\t(layer "{layer}")\n{h}'
            f'\t\t\t(uuid "{uid()}")\n'
            f'\t\t\t(effects\n\t\t\t\t(font\n\t\t\t\t\t(size {size} {size})\n\t\t\t\t\t(thickness 0.15)\n\t\t\t\t)\n\t\t\t)\n'
            f'\t\t)\n')

def emit_footprint(ref):
    proto, cx, cy, rot, val, rdx, rdy = PLACE[ref]
    pr = PROTOS[proto]
    nets = NETMAP.get(ref, {}).get('pads', {})
    s = f'\t(footprint "{pr["name"]}"\n\t\t(layer "F.Cu")\n\t\t(uuid "{uid()}")\n'
    s += f'\t\t(at {fmt(cx)} {fmt(cy)})\n'
    hide_ref = (proto == 'MTG')
    s += prop('Reference', ref, rdx, rdy, 'F.SilkS', hide_ref, 0.8)
    s += prop('Value', val, 0, 0, 'F.Fab', True)
    s += prop('Datasheet', '', 0, 0, 'F.Fab', True)
    s += prop('Description', '', 0, 0, 'F.Fab', True)
    s += '\t\t(duplicate_pad_numbers_are_jumpers no)\n'
    for it in pr['silk']:
        if it[0] == 'line':
            (x1, y1) = rotv(it[1], it[2], rot); (x2, y2) = rotv(it[3], it[4], rot)
            s += (f'\t\t(fp_line\n\t\t\t(start {fmt(x1)} {fmt(y1)})\n\t\t\t(end {fmt(x2)} {fmt(y2)})\n'
                  f'\t\t\t(stroke\n\t\t\t\t(width {fmt(it[5])})\n\t\t\t\t(type solid)\n\t\t\t)\n'
                  f'\t\t\t(layer "F.SilkS")\n\t\t\t(uuid "{uid()}")\n\t\t)\n')
        elif it[0] == 'circle':
            (x1, y1) = rotv(it[1], it[2], rot)
            s += (f'\t\t(fp_circle\n\t\t\t(center {fmt(x1)} {fmt(y1)})\n\t\t\t(end {fmt(x1+it[3])} {fmt(y1)})\n'
                  f'\t\t\t(stroke\n\t\t\t\t(width {fmt(it[4])})\n\t\t\t\t(type solid)\n\t\t\t)\n'
                  f'\t\t\t(fill no)\n\t\t\t(layer "F.SilkS")\n\t\t\t(uuid "{uid()}")\n\t\t)\n')
        elif it[0] == 'text':
            (x1, y1) = rotv(it[2], it[3], rot)
            s += (f'\t\t(fp_text user "{it[1]}"\n\t\t\t(at {fmt(x1)} {fmt(y1)} 0)\n'
                  f'\t\t\t(layer "F.SilkS")\n\t\t\t(uuid "{uid()}")\n'
                  f'\t\t\t(effects\n\t\t\t\t(font\n\t\t\t\t\t(size {fmt(it[4])} {fmt(it[4])})\n\t\t\t\t\t(thickness 0.15)\n\t\t\t\t)\n\t\t\t)\n\t\t)\n')
    for (pn, kind, shape, dx, dy, sx, sy, drill) in pr['pads']:
        (rx, ry) = rotv(dx, dy, rot)
        psx, psy = (sy, sx) if rot % 180 == 90 else (sx, sy)
        net = nets.get(pn)
        netline = f'\t\t\t(net "{net}")\n' if net and net != 'NC' else ''
        if kind == 'smd':
            s += (f'\t\t(pad "{pn}" smd {shape}\n\t\t\t(at {fmt(rx)} {fmt(ry)})\n'
                  f'\t\t\t(size {fmt(psx)} {fmt(psy)})\n'
                  f'\t\t\t(layers "F.Cu" "F.Mask" "F.Paste")\n{netline}'
                  f'\t\t\t(uuid "{uid()}")\n\t\t)\n')
        elif kind == 'tht':
            s += (f'\t\t(pad "{pn}" thru_hole {shape}\n\t\t\t(at {fmt(rx)} {fmt(ry)})\n'
                  f'\t\t\t(size {fmt(psx)} {fmt(psy)})\n\t\t\t(drill {fmt(drill)})\n'
                  f'\t\t\t(layers "*.Cu" "*.Mask")\n\t\t\t(remove_unused_layers no)\n{netline}'
                  f'\t\t\t(uuid "{uid()}")\n\t\t)\n')
        else:
            s += (f'\t\t(pad "" np_thru_hole circle\n\t\t\t(at {fmt(rx)} {fmt(ry)})\n'
                  f'\t\t\t(size {fmt(psx)} {fmt(psy)})\n\t\t\t(drill {fmt(drill)})\n'
                  f'\t\t\t(layers "*.Cu" "*.Mask")\n\t\t\t(uuid "{uid()}")\n\t\t)\n')
    s += '\t\t(embedded_fonts no)\n\t)\n'
    return s

GR_TEXTS = [
 ('BAT1', 14, 5.6, 0.9, 0), ('BAT2', 54, 5.6, 0.9, 0),
 ('+', 11.46, 5.5, 0.8, 0), ('-', 16.54, 5.5, 0.8, 0),
 ('+', 51.46, 5.5, 0.8, 0), ('-', 56.54, 5.5, 0.8, 0),
 ('SOLENOID', 38, 44.9, 0.8, 0),
 ('+', 35.46, 45.9, 0.8, 0), ('-', 40.54, 45.9, 0.8, 0),
 ('9-12V DC', 8, 4.5, 0.8, 0),
 ('DISPLAY', 1.5, 30.5, 0.8, 90),
 ('ISP', 58.8, 17.5, 0.8, 0),
 ('UP', 5.5, 46.3, 0.8, 0), ('SET', 6.2, 27.9, 0.8, 0),
 ('GreenGuard CO2 Timer v5', 35, 1.5, 0.9, 0),
]

def write_board(path):
    out = [HEADER]
    for ref in PLACE:
        out.append(emit_footprint(ref))
    out.append(f'\t(gr_rect\n\t\t(start 0 0)\n\t\t(end 70 50)\n'
               f'\t\t(stroke\n\t\t\t(width 0.05)\n\t\t\t(type solid)\n\t\t)\n'
               f'\t\t(fill no)\n\t\t(layer "Edge.Cuts")\n\t\t(uuid "{uid()}")\n\t)\n')
    for (txt, x, y, sz, rot) in GR_TEXTS:
        out.append(f'\t(gr_text "{txt}"\n\t\t(at {fmt(x)} {fmt(y)} {rot})\n'
                   f'\t\t(layer "F.SilkS")\n\t\t(uuid "{uid()}")\n'
                   f'\t\t(effects\n\t\t\t(font\n\t\t\t\t(size {fmt(sz)} {fmt(sz)})\n\t\t\t\t(thickness 0.15)\n\t\t\t)\n\t\t)\n\t)\n')
    for (net, x1, y1, x2, y2, w, l) in SEGS:
        lay = 'F.Cu' if l == 0 else 'B.Cu'
        out.append(f'\t(segment\n\t\t(start {fmt(x1)} {fmt(y1)})\n\t\t(end {fmt(x2)} {fmt(y2)})\n'
                   f'\t\t(width {fmt(w)})\n\t\t(layer "{lay}")\n\t\t(net "{net}")\n\t\t(uuid "{uid()}")\n\t)\n')
    for (net, x, y, size, drill) in VIAS:
        out.append(f'\t(via\n\t\t(at {fmt(x)} {fmt(y)})\n\t\t(size {fmt(size)})\n\t\t(drill {fmt(drill)})\n'
                   f'\t\t(layers "F.Cu" "B.Cu")\n\t\t(net "{net}")\n\t\t(uuid "{uid()}")\n\t)\n')
    out.append(f'''\t(zone
\t\t(net "GND")
\t\t(layer "B.Cu")
\t\t(uuid "{uid()}")
\t\t(hatch edge 0.5)
\t\t(connect_pads
\t\t\t(clearance 0.3)
\t\t)
\t\t(min_thickness 0.25)
\t\t(fill yes
\t\t\t(thermal_gap 0.5)
\t\t\t(thermal_bridge_width 0.5)
\t\t\t(island_removal_mode 0)
\t\t)
\t\t(polygon
\t\t\t(pts
\t\t\t\t(xy 0 0) (xy 70 0) (xy 70 50) (xy 0 50)
\t\t\t)
\t\t)
\t)
''')
    out.append('\t(embedded_fonts no)\n)\n')
    with open(path, 'w') as fh:
        fh.write(''.join(out))

ROUTE_ORDER = [
 ('VM',1.0),('SOL_OUT1',1.0),('SOL_OUT2',1.0),('VIN_OR',1.0),('VIN_DC',1.0),
 ('VBAT1_IN',1.0),('VBAT2_IN',1.0),('+3V3',0.5),
 ('/SUPV',0.25),('ONESHOT_Q',0.25),('OS_CEXT',0.25),('OS_RC',0.25),
 ('DRV_IN1',0.25),('DRV_IN2',0.25),('DRV_IN2_MCU',0.25),('ILIM',0.25),
 ('VM_SENSE',0.25),('VBAT_CHG',0.25),('VBAT_RTC',0.25),
 ('SDA',0.25),('SCL',0.25),('MISO',0.25),('/RESET',0.25),('/ALERT',0.25),
 ('TM_DIO',0.25),('TM_CLK',0.25),
 ('BTN_UP_SW',0.25),('BTN_UP',0.25),('BTN_SET_SW',0.25),('BTN_SET',0.25),
]

def main():
    outpath = os.path.join(HERE, 'co2_timer_v5.kicad_pcb')
    if '-o' in sys.argv:
        outpath = sys.argv[sys.argv.index('-o') + 1]
    if '--coords' in sys.argv:
        for p in sorted(PADS, key=lambda q: (q['ref'], q['pn'])):
            print(f"{p['ref']:>4}.{p['pn']:<3} {p['net'] or '-':<12} ({p['x']:.3f},{p['y']:.3f}) {p['sx']}x{p['sy']}")
        return
    commit_seeds()
    unstub = gnd_stubs()
    u4_thermal()
    fails = []
    for (net, w) in ROUTE_ORDER:
        fails += route_net(net, w)
    ns = stitch()
    write_board(outpath)
    fseg = sum(1 for s in SEGS if s[6] == 0)
    bseg = sum(1 for s in SEGS if s[6] == 1)
    print(f"wrote {outpath}")
    print(f"segments: {len(SEGS)} (F.Cu {fseg} / B.Cu {bseg}), vias: {len(VIAS)} (incl {ns} stitch)")
    if unstub:
        print("UNSTUBBED GND PADS:", unstub)
    if fails:
        print("ROUTE FAILURES:", fails)
    else:
        print("all nets routed")

if __name__ == '__main__':
    main()
