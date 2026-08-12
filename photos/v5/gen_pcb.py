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
  bottom-mid : TPS3700 U5 near the VM divider; mux U6/U7 between MCU and U4;
               /VM_OK divider/pulls and D3 advisory path
  bottom-right: U4 DRV8871 @ (44,40) + C4/C5, C1/C19 reservoirs, TVS2, J2
Routing: grid autorouter (0.25mm cells, 2 layers). F.Cu preferred; B.Cu = GND pour
(0.3mm clearance) + short crossings. VM/solenoid/battery nets 1.0mm, +3V3 0.5mm,
logic 0.25mm. GND: SMD pads get 0.6mm stub + via to B.Cu pour; THT pads via thermal
spokes. U4 PowerPAD: 4 thermal vias. Stitching vias sprinkled on open grid.
"""
import json, math, os, sys
from collections import deque
import heapq

from hardware_constants import F1_VALUE, R6_VALUE, R13_VALUE, R16_VALUE

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
 'SOT23_6': dict(name='Package_TO_SOT_SMD:SOT-23-6', pads=[
    ('1','smd','roundrect',-1.1375,-0.95,1.325,0.6,0),
    ('2','smd','roundrect',-1.1375,0,1.325,0.6,0),
    ('3','smd','roundrect',-1.1375,0.95,1.325,0.6,0),
    ('4','smd','roundrect',1.1375,0.95,1.325,0.6,0),
    ('5','smd','roundrect',1.1375,0,1.325,0.6,0),
    ('6','smd','roundrect',1.1375,-0.95,1.325,0.6,0)],
    silk=[('line',-0.91,-1.56,0.91,-1.56,0.12),
          ('line',-0.91,1.56,0.91,1.56,0.12),
          ('line',-0.91,-1.56,-0.91,-1.51,0.12),
          ('line',0.91,-1.56,0.91,-1.51,0.12),
          ('circle',-1.45,-1.7,0.14,0.12)]),
 'SC70_6': dict(name='Package_TO_SOT_SMD:SOT-363_SC-70-6', pads=[
    ('1','smd','roundrect',-0.8375,-0.65,1.025,0.35,0),
    ('2','smd','roundrect',-0.8375,0,1.025,0.35,0),
    ('3','smd','roundrect',-0.8375,0.65,1.025,0.35,0),
    ('4','smd','roundrect',0.8375,0.65,1.025,0.35,0),
    ('5','smd','roundrect',0.8375,0,1.025,0.35,0),
    ('6','smd','roundrect',0.8375,-0.65,1.025,0.35,0)],
    silk=[('line',-0.735,-1.11,0.735,-1.11,0.12),
          ('line',-0.735,1.11,0.735,1.11,0.12),
          ('line',-0.735,-1.11,-0.735,-1.085,0.12),
          ('line',0.735,-1.11,0.735,-1.085,0.12),
          ('circle',-1.18,-1.28,0.12,0.1)]),
 'HSOP8':  None,  # built below (adds PAD)
 'SOT23': dict(name='Package_TO_SOT_SMD:SOT-23', pads=[
    ('1','smd','rect',-0.95,-1.3,0.9,1.3,0), ('2','smd','rect',0.95,-1.3,0.9,1.3,0),
    ('3','smd','rect',0,1.3,0.9,1.3,0)],
    silk=[('circle',-1.8,-1.3,0.15,0.3)]),
 'SOD323': dict(name='Diode_SMD:D_SOD-323', pads=[
    ('A','smd','rect',-1.1,0,0.8,0.6,0), ('K','smd','rect',1.1,0,0.8,0.6,0)],
    silk=[('line',0.55,-0.8,0.55,0.8,0.2),
          ('line',-0.8,-0.7,0.8,-0.7,0.12),
          ('line',-0.8,0.7,0.8,0.7,0.12)]),
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
 'SKQG': dict(name='co2v5:PTS645SM43SMTR92LFS', pads=[
    # C&K PTS645SM43SMTR92LFS recommended SMT layout: 6x6 body,
    # 4.5mm pad-row spacing, 1.8x1.4mm lands; pins 1/2 and 3/4 are common.
    ('1','smd','roundrect',-3.0,-2.25,1.8,1.4,0), ('2','smd','roundrect',3.0,-2.25,1.8,1.4,0),
    ('3','smd','roundrect',-3.0,2.25,1.8,1.4,0), ('4','smd','roundrect',3.0,2.25,1.8,1.4,0)],
    silk=[('circle',0,0,1.6,0.15),
          ('line',-3.1,-3.1,3.1,-3.1,0.12), ('line',-3.1,3.1,3.1,3.1,0.12)]),
 'CP_D10': dict(name='Capacitor_THT:CP_Radial_D10.0mm_P5.00mm', pads=[
    ('+','tht','rect',-2.5,0,1.8,1.8,0.8), ('-','tht','circle',2.5,0,1.8,1.8,0.8)],
    silk=[('circle',0,0,5.0,0.15), ('text','+',-3.8,-3.2,0.9)]),
 'CP_CHP': dict(name='co2v5:CP_CHP_10x5_P7.50mm', pads=[
    ('+','tht','rect',-3.75,0,1.8,1.8,0.8), ('-','tht','circle',3.75,0,1.8,1.8,0.8)],
    silk=[('line',-5.0,-2.5,5.0,-2.5,0.15),
          ('line',-5.0,2.5,5.0,2.5,0.15),
          ('line',-5.0,-2.5,-5.0,2.5,0.15),
          ('line',5.0,-2.5,5.0,2.5,0.15),
          ('text','+',-4.4,-1.3,0.9)]),
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
 'BARREL': dict(name='co2v5:BarrelJack_CUI_PJ-002A', pads=[
    # CUI/Same Sky PJ-002A drawing: 1=tip (0,0), 2=sleeve (0,3.50),
    # 3=normally-closed switch (-3.50,1.50), nominal recommended layout.
    ('1','tht','rect',0,0,2.0,3.5,1.0), ('2','tht','circle',0,3.5,2.0,2.0,1.0),
    ('3','tht','circle',-3.5,1.5,2.0,2.0,1.0)],
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
 'D1': ('SMA',10,8,180,'SS34',0,-1.9),
 'D5': ('SMA',54,8,180,'SS34',0,-1.9),
 'D4': ('SMA',17,13,180,'SS34',0,-1.9),
 'TVS1':('SMA',14.5,10.2,180,'SMAJ15A',0,3.0),
 'TVS2':('SMA',63.5,44.5,270,'SMAJ15A',2.8,0),
 'F1': ('FUSE1812',24,8,0,F1_VALUE,0,-2.4),
 'U3': ('SOT23',26,13.5,0,'MCP1703A-3.3',-3.4,0),
 'C2': ('C0805',29.5,11.2,0,'1uF',0,-1.6),
 'C3': ('C0805',26,17,0,'1uF',-0.1,1.7),
 'C12':('C0805',29.5,17,0,'10uF',0.4,1.7),
 'U1': ('SOIC14',34,29,180,'ATtiny84A',0,-5.3),
 'C6': ('C0603',36.5,33.8,0,'100nF',0,1.5),
 'U2': ('SO16',53,24,0,'DS3231M',0,-6.2),
 'C7': ('C0603',49.4,17.8,0,'100nF',0,-1.4),
 'R2': ('R0603',60.5,11.5,0,'10K',0,-1.4),
 'R3': ('R0603',56.5,13.8,0,'10K',-2.6,0),
 'R4': ('R0603',44,19.5,0,'10K',0,-1.4),
 'R1': ('R0603',53,18.0,0,'10K',0,-1.4),
 'R5': ('R0603',48,31,0,'220R',0,-1.4),
 'D2': ('SOD323',51.5,31.5,0,'BAT54',0,-1.6),
 'SC1':('CP_CHP',56.5,34.5,0,'0.1F_5V5',0,3.4),
 'C1': ('CP_D10',57,42,0,'1000uF',0,-6.0),
 'C19':('CP_D10',64,31.5,0,'1000uF',0,-6.0),
 'U4': ('HSOP8',44,40,0,'DRV8871',0,-4.0),
 'C4': ('C1206',50,41,0,'10uF',0,1.8),
 'C5': ('C0603',51.5,38.7,0,'100nF',0,-1.5),
 'R6': ('R0603',39.2,41.9,270,R6_VALUE,-1.9,0),
 'R14':('R0603',43.5,31.5,270,'100K',1.9,0),
 'R15':('R0603',42.7,36,0,'100K',1.2,-1.4),
 'R13':('R0603',22.8,18,0,R13_VALUE,0,-1.4),
 'R16':('R0603',22.8,26,0,R16_VALUE,0,1.4),
 'R17':('R0603',27,19,0,'100K',0,-1.4),
 'R18':('R0603',27,22,0,'10K',0,1.4),
 'U5': ('SOT23_6',18,21.5,0,'TPS3700',0,3.1),
 'U6': ('SC70_6',39.5,32.5,0,'3157_IN1',0,-2.0),
 'U7': ('SC70_6',39.5,35.5,0,'3157_IN2',0,-2.0),
 'C9': ('C0603',14.5,18,0,'100nF',0,-1.4),
 'C18':('C0603',44.5,34.2,0,'100nF',0,1.4),
 'D3': ('SOD323',18,27.5,0,'BAT54',0,1.6),
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
 'TP2':('TP',13,24.5,0,'/VM_OK',0,2.0),
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

# KiCad 10 DRC requires a board-level numeric net table.  Internal routing
# continues to use canonical names; emission maps them once here.
NET_IDS = {name: i + 1 for i, name in enumerate(sorted(PBYNET))}

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
            # A Dijkstra goal can be a same-net grid cell on B.Cu beside a
            # via (or a THT pad), rather than the SMD pad itself.  Extend both
            # ends to the nearest actual same-net copper anchor so a routed
            # path cannot be logically present yet physically open.
            snap_to_copper(net, path[0], width)
            snap_to_copper(net, path[-1], width)
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

def snap_to_copper(net, cell, width):
    """Close a short endpoint gap to a real same-net pad or via.

    The grid router is allowed to terminate on a soft copper cell.  That is
    useful for congestion handling, but the emitted copper still needs to
    touch a physical pad/via.  Keep this correction short and local so it
    cannot become a second route.
    """
    l, ix, iy = cell
    px, py = ix * GRID, iy * GRID
    best = None
    for p in PADS:
        if p['net'] != net or (p['kind'] == 'smd' and l != 0):
            continue
        d = math.hypot(px - p['x'], py - p['y'])
        if d <= 0.01 or d > 0.9:
            continue
        if best is None or d < best[0]:
            best = (d, p['x'], p['y'], min(p['sx'], p['sy']))
    for n, vx, vy, size, _drill in VIAS:
        if n != net:
            continue
        d = math.hypot(px - vx, py - vy)
        if d <= 0.01 or d > 0.9:
            continue
        if best is None or d < best[0]:
            best = (d, vx, vy, size)
    if best is not None:
        _d, tx, ty, copper_size = best
        commit_seg(net, px, py, tx, ty, min(width, max(0.2, copper_size)), l)

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
 # The original safe escapes retained from the v5 floorplan.
 # /ALERT: U2 pin 3 escape west past NC pads, down to R4 pullup
 ('/ALERT',  0.25, [(48.1,22.095),(43.0,22.095),(42.2,21.3),(42.2,19.5),(43.2,19.5)],
                                                              ('U2','3'), ('R4','1')),
 # button lanes into U1 west column
 ('BTN_UP',  0.25, [(31.525,30.27),(22.8,30.27)],             ('U1','12'), ('R9','2')),
 ('BTN_SET', 0.25, [(31.525,29.0),(24.2,29.0),(23.4,28.4),(22.8,28.4)], ('U1','11'), ('R10','2')),
 ('TM_CLK',  0.25, [(31.525,27.73),(30.9,27.73),'V',(30.9,35.62),(3.5,35.62)],
                                                              ('U1','10'), ('J4','4')),
 ('TM_DIO',  0.25, [(36.475,26.46),'V',(30.0,26.46),(30.0,32.0),(3.5,32.0),(3.5,33.08)],
                                                              ('U1','6'), ('J4','3')),
 ('/ALERT',  0.25, [(36.475,27.73),(38.8,27.73),(38.8,22.095),(43.0,22.095)],
                                                              ('U1','5'), ('R4','1')),
 # BTN_SET_SW past the R7/R8 divider wall
('BTN_SET_SW',0.25,[(10.7,21.3),'V',(10.7,27.0),(20.0,27.0),(20.0,28.4),'V',(21.2,28.4)],
                                                              ('R12','1'), ('R10','1')),
 # MCU-to-mux B2 escapes use B.Cu around the MCU edge; mux A outputs use a
 # separate B.Cu corridor around the U4 thermal pad and signal pads.
 ('DRV_IN1_MCU',0.25,[(36.475,31.54),'V',(38.0,31.54),(38.0,32.35),'V',(38.6625,32.35)],
                                                              ('U1','2'), ('U6','1')),
 ('DRV_IN2_MCU',0.25,[(36.475,30.27),'V',(38.0,30.27),(38.0,34.85),'V',(38.6625,34.85)],
                                                              ('U1','3'), ('U7','1')),
 ('DRV_IN1',0.25,[(40.3375,33.65),'V',(39.0,31.0),(47.0,31.0),(47.0,40.635),(40.2,40.635),'V',(41.525,40.635)],
                                                              ('U6','4'), ('U4','3')),
 ('DRV_IN1',0.25,[(43.5,30.7),'V',(43.5,31.0),(44.0,31.0)],
                                                              ('R14','1'), ('U6','4')),
 ('DRV_IN2',0.25,[(40.3375,36.15),'V',(39.0,38.0),(48.0,38.0),(48.0,39.365),(40.2,39.365),'V',(41.525,39.365)],
                                                              ('U7','4'), ('U4','2')),
 # Supervisor divider and output branches use B.Cu so they do not cross the
 # MCU or mux pad rows.
 ('VM_DIV',0.25,[(23.6,18.0),'V',(25.0,18.0),(25.0,26.0),(22.0,26.0),'V'],
                                                              ('R13','2'), ('R16','1')),
 ('VM_DIV',0.25,[(16.8625,22.45),'V',(14.0,22.45),(14.0,26.0),(22.0,26.0),'V'],
                                                              ('U5','3'), ('R16','1')),
 ('/VM_OK',0.25,[(16.8625,20.55),'V',(13.0,20.55),(13.0,16.0),(26.2,16.0),(26.2,19.0),'V'],
                                                              ('U5','1'), ('R17','1')),
 ('/VM_OK',0.25,[(21.6,27.5),'V',(25.0,27.5),(25.0,22.0),(26.2,22.0),'V',(26.2,19.0),'V'],
                                                              ('D3','K'), ('R18','1')),
 ('/VM_OK',0.25,[(40.3375,32.35),'V',(43.0,32.35),(43.0,34.85),(40.3375,34.85),'V'],
                                                              ('U6','6'), ('U7','6')),
 ('/VM_OK',0.25,[(13.0,24.5),'V',(12.0,24.5),(12.0,20.55),(16.8625,20.55),'V'],
                                                              ('TP2','1'), ('U5','1')),
 ('GND',0.4,[(38.6625,35.5),'V',(42.0,35.5),(43.3,34.2),'V'],
                                                              ('U7','2'), ('C18','2')),
 ('GND',0.4,[(16.8625,21.5),'V',(12.0,21.5),(12.0,35.0),(43.3,35.0),(43.3,34.2),'V'],
                                                              ('U5','2'), ('C18','2')),
 ('GND',0.4,[(10.0,10.0),(11.0,10.0),(11.0,12.0),(8.0,12.0),(8.0,13.5)],
                                                              ('J5','2'), ('J5','3')),
 ('VM',1.0,[(26.0,14.8),(28.5,14.8),(28.5,11.2)],
                                                              ('U3','3'), ('C2','1')),
 ('+3V3',0.5,[(25.0,17.0),'V',(24.0,17.0),(24.0,10.5),(26.95,10.5),'V',(26.95,12.2)],
                                                              ('C3','1'), ('U3','2')),
 ('+3V3',0.5,[(40.3375,33.0),'V',(41.7,33.0),(41.7,34.2),'V'],
                                                              ('U6','5'), ('C18','1')),
 ('+3V3',0.5,[(40.3375,35.5),'V',(44.0,35.5),(44.0,34.2),(41.7,34.2),'V'],
                                                              ('U7','5'), ('C18','1')),
 ('+3V3',0.5,[(38.6625,36.15),'V',(39.0,37.0),(42.0,37.0),(42.0,34.2),(41.7,34.2),'V'],
                                                              ('U7','3'), ('C18','1')),
 ('VM',1.0,[(19.1375,21.5),'V',(18.0,21.5),(18.0,12.0),(28.5,12.0),(28.5,11.2),'V'],
                                                              ('U5','5'), ('C2','1')),
 ('SOL_OUT1',1.0,[(46.475,40.635),'V',(50.0,40.635),(50.0,48.5),(34.0,48.5),(34.0,47.0),(35.46,47.0)],
                                                              ('U4','6'), ('J2','1')),
 ('SOL_OUT2',1.0,[(46.475,38.095),'V',(48.0,38.095),(48.0,36.0),(58.0,36.0),(58.0,47.0),(42.0,47.0),(40.54,47.0)],
                                                              ('U4','8'), ('J2','2')),
 ('DRV_IN2',0.25,[(41.9,36.0),(40.3375,36.15)],
                                                              ('R15','1'), ('U7','4')),
 ('MISO',0.25,[(61.0,15.0),(61.0,13.0),(63.5,13.0),(63.5,11.5)],
                                                              ('J3','1'), ('TP1','1')),
 ('MISO',0.25,[(31.525,25.19),'V',(31.5,12.0),(63.5,12.0),(63.5,11.5),'V'],
                                                              ('U1','8'), ('TP1','1')),
 ('+3V3',0.5,[(28.5,17.0),'V',(29.0,18.0),(24.0,18.0),(25.0,17.0),'V'],
                                                              ('C12','1'), ('C3','1')),
 ('SCL',0.25,[(57.9,19.555),'V',(58.0,17.0),(55.7,17.0),(55.7,13.8),'V'],
                                                              ('U2','16'), ('R3','1')),
 ('SCL',0.25,[(61.0,17.54),'V',(59.0,17.54),(59.0,13.8),(55.7,13.8),'V'],
                                                              ('J3','3'), ('R3','1')),
 ('SCL',0.25,[(31.525,26.46),'V',(31.0,14.0),(55.7,14.0),(55.7,13.8),'V'],
                                                              ('U1','9'), ('R3','1')),
 ('/RESET',0.25,[(36.475,29.0),'V',(38.0,29.0),(38.0,17.5),(43.2,17.5),'V'],
                                                              ('U1','4'), ('R1','1')),
 ('/RESET',0.25,[(61.0,20.08),'V',(59.0,20.08),(59.0,17.5),(43.2,17.5),'V'],
                                                              ('J3','5'), ('R1','1')),
 ('SDA',0.25,[(57.9,20.825),'V',(57.9,11.5),(59.7,11.5),'V'],
                                                              ('U2','15'), ('R2','1')),
 ('SDA',0.25,[(63.54,17.54),'V',(65.0,17.54),(65.0,11.5),(59.7,11.5),'V'],
                                                              ('J3','4'), ('R2','1')),
 ('SDA',0.25,[(36.475,25.19),'V',(36.0,11.5),(59.7,11.5),'V'],
                                                              ('U1','7'), ('R2','1')),
 ('VM_SENSE',0.25,[(23.3,21.0),(21.5,20.8)],
                                                              ('C14','1'), ('R7','2')),
 ('VM_SENSE',0.25,[(21.5,22.7),(21.5,20.8)],
                                                              ('R8','1'), ('R7','2')),
 ('VM_SENSE',0.25,[(31.525,31.54),'V',(30.0,31.54),(30.0,20.8),(21.5,20.8),'V'],
                                                              ('U1','13'), ('R7','2')),
]
# The hand-seeded routes above document the former congestion corridors, but
# they are intentionally disabled for the v5.1 reroute.  They were authored
# before the final U5/U6/U7 placement and several of the fixed corridors now
# cross the newer fail-safe routes.  The grid router below owns all signal
# topology so every emitted route is checked against the current occupancy map.
SEEDS = []
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
            # The B.Cu GND zone will complete these compact escapes.  Add a
            # small via-in-pad so the pad is explicitly connected even before
            # zone refill; KiCad may report this as a cosmetic via-in-pad
            # warning, but it cannot remain an unconnected item.
            commit_via('GND', p['x'], p['y'], 0.5, 0.3)
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

def reserve_plus3():
    """Reserve the mux +3V3 escape before autorouting /RESET."""
    commit_via('+3V3', 40.337, 32.5, 0.5, 0.3)
    commit_via('+3V3', 43.7, 34.2, 0.5, 0.3)
    commit_seg('+3V3', 40.337, 32.5, 42.3, 32.5, 0.25, 1)
    # Drop below the DRV_IN1 B.Cu trunk on a short F.Cu crossover, then
    # return to C18 from below; this keeps clear of both reset branches.
    commit_seg('+3V3', 42.3, 32.5, 42.5, 32.5, 0.25, 1)
    commit_seg('+3V3', 42.5, 32.5, 42.5, 33.5, 0.25, 1)
    commit_seg('+3V3', 42.5, 33.5, 42.25, 33.9, 0.25, 1)
    commit_via('+3V3', 42.25, 33.9, 0.5, 0.3)
    commit_seg('+3V3', 42.25, 33.9, 42.5, 35.1, 0.25, 0)
    commit_via('+3V3', 42.5, 35.1, 0.5, 0.3)
    commit_seg('+3V3', 42.5, 35.1, 43.7, 35.1, 0.25, 1)
    commit_seg('+3V3', 43.7, 35.1, 43.7, 34.2, 0.25, 1)
    # U7's +3V3 branch is tied to the existing routed anchor at (42.5,33.5).
    # The former 42.3/30.25 segment began in free space and was a dangling
    # +3V3 stub; do not emit that orphan lead.
    commit_seg('+3V3', 42.5, 33.5, 42.5, 34.0, 0.25, 1)
    commit_seg('+3V3', 42.5, 34.0, 40.75, 34.0, 0.25, 1)
    commit_seg('+3V3', 40.75, 34.0, 40.75, 35.5, 0.25, 1)
    commit_via('+3V3', 40.75, 35.5, 0.5, 0.3)
    commit_seg('+3V3', 40.75, 35.5, 40.337, 35.5, 0.25, 0)
    commit_seg('+3V3', 40.75, 35.5, 40.75, 37.5, 0.25, 1)
    commit_seg('+3V3', 40.75, 37.5, 38.75, 37.5, 0.25, 1)
    commit_via('+3V3', 38.75, 37.5, 0.5, 0.3)

def reserve_plus3_mux_after_vmok():
    """Pre-connect U6/U7 +3V3 after /VM_OK has claimed its corridor."""
    commit_seg('+3V3', 40.337, 32.5, 39.25, 32.5, 0.25, 1)
    commit_seg('+3V3', 39.25, 32.5, 39.25, 35.5, 0.25, 1)
    commit_via('+3V3', 39.25, 35.5, 0.5, 0.3)
    commit_seg('+3V3', 39.25, 35.5, 40.337, 35.5, 0.25, 0)
    PRECONN.setdefault('+3V3', []).append((('U6', '5'), ('U7', '5')))

def reserve_drv2_mcu():
    """Reserve the clean F.Cu escape between U1 and the lower mux input."""
    commit_seg('DRV_IN2_MCU', 36.475, 30.27, 37.25, 30.5, 0.25, 0)
    commit_seg('DRV_IN2_MCU', 37.25, 30.5, 37.75, 30.5, 0.25, 0)
    commit_via('DRV_IN2_MCU', 37.75, 30.5, 0.5, 0.3)
    commit_seg('DRV_IN2_MCU', 37.75, 30.5, 30.5, 30.5, 0.25, 1)
    commit_seg('DRV_IN2_MCU', 30.5, 30.5, 30.5, 36.25, 0.25, 1)
    commit_seg('DRV_IN2_MCU', 30.5, 36.25, 38.25, 36.25, 0.25, 1)
    commit_seg('DRV_IN2_MCU', 38.25, 36.25, 38.25, 34.75, 0.25, 1)
    commit_via('DRV_IN2_MCU', 38.25, 34.75, 0.5, 0.3)
    commit_seg('DRV_IN2_MCU', 38.25, 34.75, 38.6625, 34.85, 0.25, 0)
    PRECONN.setdefault('DRV_IN2_MCU', []).append((('U1', '3'), ('U7', '1')))

def manual_repairs():
    """Close two deterministic component gaps left by the coarse-grid pass.

    These are short, layer-specific bridges between existing same-net copper
    anchors.  They are emitted after autorouting so they do not perturb the
    search ordering, and are kept here (rather than in the board file) for
    reproducibility.
    """
    # The two mux-side GND stubs terminate on adjacent vias on different
    # connected components.  Join those vias on the quiet B.Cu corridor.
    commit_seg('GND', 37.25, 34.5, 37.25, 35.5, 0.25, 1)

    # Bring the isolated U5 VM sense pad around the SOT-23-6 north/south
    # pad rows on B.Cu and join the existing VM via at (18,18).
    commit_via('VM', 19.137, 21.5, 0.5, 0.3)
    commit_seg('VM', 19.137, 21.5, 20.0, 21.5, 0.8, 1)
    commit_via('VM', 20.0, 21.5, 0.5, 0.3)
    commit_seg('VM', 20.0, 21.5, 20.5, 21.5, 0.25, 0)
    commit_seg('VM', 20.5, 21.5, 20.5, 19.25, 0.25, 0)
    commit_seg('VM', 20.5, 19.25, 21.5, 19.25, 0.25, 0)
    # Step to the right of the adjacent SOL_OUT1 pad before turning up to
    # the reservoir pad.  Keeping this on F.Cu avoids the crowded solenoid
    # takeovers immediately below the driver.
    commit_seg('VM', 46.475, 41.905, 48.25, 41.905, 0.25, 0)
    commit_seg('VM', 48.25, 41.905, 48.25, 41.0, 0.25, 0)
    commit_seg('VM', 48.25, 41.0, 48.55, 41.0, 1.0, 0)

    # Bridge the isolated C5-side VM island around the adjacent +3V3 trunk,
    # then join the existing right-side VM B.Cu bus.
    commit_seg('VM', 50.75, 38.75, 50.0, 38.75, 1.0, 0)
    commit_seg('VM', 50.0, 38.75, 50.0, 39.5, 1.0, 0)
    commit_seg('VM', 50.0, 39.5, 51.25, 39.5, 0.25, 0)
    commit_via('VM', 51.25, 39.5, 0.5, 0.3)
    commit_seg('VM', 51.25, 39.5, 51.5, 39.5, 0.25, 1)
    commit_seg('VM', 51.5, 39.5, 51.5, 37.5, 1.0, 1)
    commit_seg('VM', 51.5, 37.5, 55.0, 37.5, 1.0, 1)
    commit_seg('VM', 55.0, 37.5, 55.0, 37.75, 1.0, 1)

    # U6 DRV_IN1 pad 4 skirts the U7 pad row on F.Cu, transfers to the right
    # of R15, and returns to the existing DRV_IN1 B.Cu trunk.
    commit_seg('DRV_IN1', 40.3375, 33.15, 40.3375, 33.5, 0.25, 0)
    commit_seg('DRV_IN1', 40.3375, 33.5, 41.0, 33.5, 0.25, 0)
    commit_seg('DRV_IN1', 41.0, 33.5, 41.0, 34.0, 0.25, 0)
    commit_seg('DRV_IN1', 41.0, 34.0, 41.25, 34.0, 0.25, 0)
    commit_seg('DRV_IN1', 41.25, 34.0, 41.25, 34.75, 0.25, 0)
    commit_seg('DRV_IN1', 41.25, 34.75, 41.5, 34.75, 0.25, 0)
    commit_via('DRV_IN1', 41.5, 34.75, 0.5, 0.3)

    # Lower mux MCU input escape; the F.Cu center lane is clear once the
    # adjacent /VM_OK vias are emitted as compact microvias.
    commit_seg('DRV_IN2_MCU', 36.475, 30.27, 37.25, 30.5, 0.25, 0)
    commit_seg('DRV_IN2_MCU', 37.25, 30.5, 37.75, 30.5, 0.25, 0)
    commit_seg('DRV_IN2_MCU', 37.75, 30.5, 39.5, 30.5, 0.25, 0)
    commit_seg('DRV_IN2_MCU', 39.5, 30.5, 39.5, 34.75, 0.25, 0)
    commit_seg('DRV_IN2_MCU', 39.5, 34.75, 38.6625, 34.85, 0.25, 0)

    commit_via('DRV_IN1', 43.0, 31.0, 0.5, 0.3)








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
\t\t(comment 1 "ATtiny84A + DS3231M + DRV8871 + TPS3700/2x3157 mux failsafe | dual 9V + barrel jack")
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
\t\t(stackup
\t\t\t(layer "F.SilkS" (type "Top Silk Screen"))
\t\t\t(layer "F.Paste" (type "Top Solder Paste"))
\t\t\t(layer "F.Mask" (type "Top Solder Mask") (thickness 0.01))
\t\t\t(layer "F.Cu" (type "copper") (thickness 0.035))
\t\t\t(layer "dielectric 1" (type "core") (thickness 1.51) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))
\t\t\t(layer "B.Cu" (type "copper") (thickness 0.035))
\t\t\t(layer "B.Mask" (type "Bottom Solder Mask") (thickness 0.01))
\t\t\t(layer "B.Paste" (type "Bottom Solder Paste"))
\t\t\t(layer "B.SilkS" (type "Bottom Silk Screen"))
\t\t\t(copper_finish "None")
\t\t\t(dielectric_constraints no)
\t\t)
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
    unlocked = '\t\t\t(unlocked yes)\n' if name in ('Datasheet', 'Description') else ''
    return (f'\t\t(property "{name}" "{val}"\n'
            f'\t\t\t(at {fmt(dx)} {fmt(dy)} 0)\n'
            f'{unlocked}'
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
    # KiCad 10.0.3's headless DRC has a null-reference crash on visible
    # board-level property references in generated footprints.  Keep the
    # canonical Reference property hidden (the schematic and BOM remain the
    # readable identifiers); fabrication geometry is unaffected.
    hide_ref = True
    s += prop('Reference', ref, rdx, rdy, 'F.SilkS', hide_ref, 0.8)
    s += prop('Value', val, 0, 0, 'F.Fab', True)
    s += prop('Datasheet', '', 0, 0, 'F.Fab', True)
    s += prop('Description', '', 0, 0, 'F.Fab', True)
    if proto == 'MTG':
        s += '\t\t(attr exclude_from_pos_files exclude_from_bom)\n'
    elif any(p[1] == 'tht' for p in pr['pads']):
        s += '\t\t(attr through_hole)\n'
    else:
        s += '\t\t(attr smd)\n'
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
        netline = (f'\t\t\t(net {NET_IDS[net]} "{net}")\n'
                   if net and net != 'NC' else '')
        if kind == 'smd':
            rr = '\t\t\t(roundrect_rratio 0.2)\n' if shape == 'roundrect' else ''
            s += (f'\t\t(pad "{pn}" smd {shape}\n\t\t\t(at {fmt(rx)} {fmt(ry)})\n'
                  f'\t\t\t(size {fmt(psx)} {fmt(psy)})\n'
                  f'\t\t\t(layers "F.Cu" "F.Mask" "F.Paste")\n{rr}{netline}'
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
    out.append('\t(net 0 "")\n')
    for net_name in sorted(NET_IDS):
        out.append(f'\t(net {NET_IDS[net_name]} "{net_name}")\n')
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
                   f'\t\t(width {fmt(w)})\n\t\t(layer "{lay}")\n\t\t(net {NET_IDS[net]})\n\t\t(uuid "{uid()}")\n\t)\n')
    # Drop duplicate/overlapping drills (DRC holes_co_located / hole_to_hole):
    # same-net vias closer than 0.6 mm center-to-center merge into the first.
    kept_vias = []  # (net, x, y)
    def via_conflicts(net, x, y):
        for kn, kx, ky in kept_vias:
            if kn == net and (kx - x) ** 2 + (ky - y) ** 2 < 0.6 ** 2:
                return True
        return False
    for (net, x, y, size, drill) in VIAS:
        if via_conflicts(net, x, y):
            continue
        kept_vias.append((net, x, y))
        # Preserve the router's conservative occupancy model above, while
        # emitting fab-valid 0.50/0.30 mm vias for the supervisor output.
        # The two mux-side vias move 0.10 mm right; their copper still
        # overlaps the x=40.0 route stubs, but clears the DRV2 center lane.
        out_x = x + 0.1 if net == '/VM_OK' and abs(x - 40.0) < 0.01 else x
        out_size, out_drill = (0.5, 0.3) if net == '/VM_OK' and size >= 0.7 else (size, drill)
        out.append(f'\t(via\n\t\t(at {fmt(out_x)} {fmt(y)})\n\t\t(size {fmt(out_size)})\n\t\t(drill {fmt(out_drill)})\n'
                   f'\t\t(layers "F.Cu" "B.Cu")\n\t\t(net {NET_IDS[net]})\n\t\t(uuid "{uid()}")\n\t)\n')
    out.append(f'''\t(zone
\t\t(net {NET_IDS['GND']})
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
 # Route the dense MCU/failsafe fanout while the broad power and I2C buses
 # have not consumed the remaining corridors.
 ('/ALERT',0.25),('TM_DIO',0.25),('TM_CLK',0.25),
 ('BTN_UP_SW',0.25),('BTN_UP',0.25),('BTN_SET_SW',0.25),('BTN_SET',0.25),
 ('DRV_IN1_MCU',0.25),('DRV_IN1',0.25),('DRV_IN2',0.25),
 ('/VM_OK',0.25),('DRV_IN2_MCU',0.25),
 ('VM_DIV',0.25),('VM_SENSE',0.25),
 ('SOL_OUT1',1.0),('SOL_OUT2',1.0),('+3V3',0.5),('VM',1.0),
 ('VIN_OR',1.0),('VIN_DC',1.0),('VBAT1_IN',1.0),('VBAT2_IN',1.0),
 ('ILIM',0.25),('VBAT_CHG',0.25),('VBAT_RTC',0.25),
 ('SDA',0.25),('SCL',0.25),('MISO',0.25),('/RESET',0.25),
]

# These nets have exactly two pads and are completely connected by the
# dedicated B.Cu takeover escapes above; rerouting them would add a duplicate
# path through the dense MCU/mux pad rows.
SKIP_ROUTE_NETS = set()

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
    # Explicitly route the GND pad network in addition to the B.Cu pour.  This
    # keeps the board verifiable even before a GUI/CLI zone refill and avoids
    # leaving same-net THT pads dependent on stale fill data.
    fails = route_net('GND', 0.4)
    for (net, w) in ROUTE_ORDER:
        if net in SKIP_ROUTE_NETS:
            continue
        fails += route_net(net, w)
    reserve_plus3()
    manual_repairs()
    # Do not emit unconnected decorative stitching vias.  The explicit GND
    # route and the filled B.Cu plane provide the electrical ground network;
    # optional stitching is kept as a callable helper for future layouts.
    ns = 0
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
