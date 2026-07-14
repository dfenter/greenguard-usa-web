#!/usr/bin/env python3
"""
gen_pcb_altB.py — programmatic generator for co2_timer_v5_altB.kicad_pcb
GreenGuard CO2 Timer v5, SECOND-ATTEMPT (insurance) PCB implementation.
(Named *_altB because the concurrent first-attempt agent owns gen_pcb.py.)

Strategy: emit the .kicad_pcb s-expression from Python.
  * Footprint instances are copied verbatim from the KiCad 10 standard libraries
    (canonical geometry incl. silkscreen polarity marks and courtyards), with
    pad->net assignments injected from a netlist data table derived from
    NETLIST.md and cross-checked against the kicad-cli XML netlist export of the
    ERC-clean schematic co2_timer_v5.kicad_sch.
  * Placement follows the enclosure drilling doc faces:
      - front (user) short edge  = x=70 : J5 barrel jack, SW1/SW2 buttons, J4 display header
      - "left" long edge         = y=0  : J1 + J6 battery screw terminals (openings outward)
      - "right" long edge        = y=50 : J2 solenoid screw terminal (opening outward)
      - power entry/OR-ing near J1/J5/J6 (north strip), DRV8871 near J2 (south),
        MCU center, RTC west of MCU, supervisor/one-shot between MCU and driver.
      - mounting holes 3.2 mm at (3,3) (67,3) (3,47) (67,47)
  * Routing: explicit (segment ...) items produced by a small 2-layer grid BFS
    router with geometric clearance stamping. VM / solenoid / battery-input nets
    are routed 1.0 mm wide, logic 0.25 mm, 0.25 mm clearance. B.Cu carries a
    full-board GND pour (0.3 mm clearance); every SMD GND pad gets a stitching
    via. U4 (DRV8871) PowerPAD uses the TI HTSOP-8 *ThermalVias* footprint which
    embeds 6 thermal via drills into the GND EP (>= 4 required).

DOCUMENTED DELIBERATE MAPPINGS (schematic symbol pin -> physical pad):
  1. SW1/SW2 use Button_Switch_SMD:SW_SPST_TL3342 whose pads are numbered
     1,1,2,2 (two pads per contact). The schematic switch symbol has pins
     1,2 = BTN_x_SW and 3,4 = GND. Naive number-matching would place BTN_x_SW on
     BOTH contacts and never connect GND (electrically dead button). Mapping used:
     pads "1" (both) = BTN_x_SW, pads "2" (both) = GND — the switch's two
     contacts, exactly as NETLIST.md intends.
  2. D2/D3/D6 are BAT54 (SOT-23). The schematic uses a 2-pin diode symbol
     (pin 1 = K, pin 2 = A) on the 3-pad SOT-23 footprint. Physical BAT54 pinout
     is 1=A, 2=N.C., 3=K. Mapping used: pad 1 = anode net, pad 3 = cathode net,
     pad 2 = no net. (Naive number-matching would strand the physical diode.)
       D2: A=VBAT_CHG   K=VBAT_RTC
       D3: A=/ALERT     K=/SUPV
       D6: A=ONESHOT_Q  K=DRV_IN2
  3. J5 (DC-005 barrel) uses Connector_BarrelJack:BarrelJack_Horizontal:
     pad 1 = tip = VIN_DC, pad 2 = sleeve = GND, pad 3 = insertion switch = GND
     (matches schematic J5.1/J5.2/J5.3).
  4. U2 DS3231M pins 1 (32KHZ) and 4 (/RST) are intentionally unconnected;
     pins 5-12 (N.C.) are tied to GND per the Maxim datasheet note (NETLIST.md).

Outputs:
  co2_timer_v5_altB.kicad_pcb  (board)
  co2_timer_v5_altB.kicad_pro  (project: netclasses + DRC rules so kicad-cli
                                enforces 0.25 mm clearance / widths as designed)

Verification loop:
  python3 gen_pcb_altB.py
  kicad-cli pcb drc --refill-zones --save-board co2_timer_v5_altB.kicad_pcb   (bake pour fill)
  kicad-cli pcb drc --format json -o /tmp/altBdrc.json co2_timer_v5_altB.kicad_pcb
  -> iterate until 0 errors / 0 unconnected items.
"""

import math, os, sys, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PCB = os.path.join(HERE, "co2_timer_v5_altB.kicad_pcb")
OUT_PRO = os.path.join(HERE, "co2_timer_v5_altB.kicad_pro")
FPDIR = "/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints"

BOARD_W, BOARD_H = 70.0, 50.0
CLR = 0.25          # copper clearance (netclass)
W_LOGIC = 0.25      # logic track width
W_POWER = 1.0       # VM / solenoid / battery input track width
VIA_D, VIA_DRILL = 0.8, 0.4
GRID = 0.25         # router grid pitch (mm)
DBG_REF = os.environ.get("DBG_REF", "")

# ----------------------------------------------------------------------------
# s-expression parse / serialize
# ----------------------------------------------------------------------------

def tokenize(s):
    toks, i, n = [], 0, len(s)
    while i < n:
        c = s[i]
        if c.isspace():
            i += 1
        elif c in "()":
            toks.append(c); i += 1
        elif c == '"':
            j = i + 1; buf = []
            while j < n:
                if s[j] == "\\" and j + 1 < n:
                    buf.append(s[j:j+2]); j += 2
                elif s[j] == '"':
                    break
                else:
                    buf.append(s[j]); j += 1
            toks.append('"' + "".join(buf) + '"'); i = j + 1
        else:
            j = i
            while j < n and not s[j].isspace() and s[j] not in "()":
                j += 1
            toks.append(s[i:j]); i = j
    return toks

def parse(toks):
    it = iter(toks)
    def rec():
        out = []
        for t in it:
            if t == "(":
                out.append(rec())
            elif t == ")":
                return out
            else:
                out.append(t)
        return out
    first = next(it)
    assert first == "("
    return rec()

def fnum(v):
    if isinstance(v, str):
        return v
    if isinstance(v, int):
        return str(v)
    s = f"{v:.6f}".rstrip("0").rstrip(".")
    return s if s not in ("", "-0") else "0"

def ser(node, indent=0):
    pad = "\t" * indent
    if not isinstance(node, list):
        return pad + fnum(node)
    if all(not isinstance(x, list) for x in node):
        return pad + "(" + " ".join(fnum(x) for x in node) + ")"
    out = pad + "(" + fnum(node[0])
    i = 1
    inline = []
    while i < len(node) and not isinstance(node[i], list):
        inline.append(fnum(node[i])); i += 1
    if inline:
        out += " " + " ".join(inline)
    out += "\n"
    for x in node[i:]:
        out += ser(x, indent + 1) + "\n"
    out += pad + ")"
    return out

def kids(node, key):
    return [x for x in node if isinstance(x, list) and x and x[0] == key]

def q(s):
    return '"' + str(s) + '"'

def U():
    return q(str(uuid.uuid4()))

def rot_pt(x, y, deg):
    """KiCad RotatePoint (y-down frame, positive angle = CCW on screen)."""
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (x * c + y * s, -x * s + y * c)

# ----------------------------------------------------------------------------
# Netlist data table (derived from NETLIST.md; cross-checked against the
# kicad-cli XML netlist of co2_timer_v5.kicad_sch). ref -> pad -> net
# Pads not listed carry no net. See module docstring for SW/BAT54 mappings.
# ----------------------------------------------------------------------------

NETS = {
    "J1": {"1": "VBAT1_IN", "2": "GND"},
    "J6": {"1": "VBAT2_IN", "2": "GND"},
    "J5": {"1": "VIN_DC", "2": "GND", "3": "GND"},
    "J2": {"1": "SOL_OUT1", "2": "SOL_OUT2"},
    "J3": {"1": "MISO", "2": "+3V3", "3": "SCL", "4": "SDA", "5": "/RESET", "6": "GND"},
    "J4": {"1": "+3V3", "2": "GND", "3": "TM_DIO", "4": "TM_CLK"},
    # SS34 / SMAJ15A on D_SMA: pad1 = K, pad2 = A (matches Device:D_* symbol)
    "D1": {"1": "VIN_OR", "2": "VBAT1_IN"},
    "D5": {"1": "VIN_OR", "2": "VBAT2_IN"},
    "D4": {"1": "VIN_OR", "2": "VIN_DC"},
    "TVS1": {"1": "VIN_DC", "2": "GND"},
    "TVS2": {"1": "VM", "2": "GND"},
    # BAT54 SOT-23: pad1 = A, pad3 = K, pad2 = N.C.  (see docstring #2)
    "D2": {"1": "VBAT_CHG", "3": "VBAT_RTC"},
    "D3": {"1": "/ALERT", "3": "/SUPV"},
    "D6": {"1": "ONESHOT_Q", "3": "DRV_IN2"},
    "F1": {"1": "VIN_OR", "2": "VM"},
    "C1": {"1": "VM", "2": "GND"},
    "SC1": {"1": "VBAT_RTC", "2": "GND"},
    "U3": {"1": "GND", "2": "VM", "3": "+3V3"},
    "C2": {"1": "VM", "2": "GND"},
    "C3": {"1": "+3V3", "2": "GND"},
    "C12": {"1": "+3V3", "2": "GND"},
    "U1": {"1": "+3V3", "2": "DRV_IN1", "3": "DRV_IN2_MCU", "4": "/RESET",
            "5": "/ALERT", "6": "TM_DIO", "7": "SDA", "8": "MISO", "9": "SCL",
            "10": "TM_CLK", "11": "BTN_SET", "12": "BTN_UP", "13": "VM_SENSE",
            "14": "GND"},
    "C6": {"1": "+3V3", "2": "GND"},
    "R1": {"1": "/RESET", "2": "+3V3"},
    "U2": {"2": "+3V3", "3": "/ALERT", "5": "GND", "6": "GND", "7": "GND",
            "8": "GND", "9": "GND", "10": "GND", "11": "GND", "12": "GND",
            "13": "GND", "14": "VBAT_RTC", "15": "SDA", "16": "SCL"},
    "C7": {"1": "+3V3", "2": "GND"},
    "R2": {"1": "SDA", "2": "+3V3"},
    "R3": {"1": "SCL", "2": "+3V3"},
    "R4": {"1": "/ALERT", "2": "+3V3"},
    "R5": {"1": "+3V3", "2": "VBAT_CHG"},
    "U4": {"1": "GND", "2": "DRV_IN2", "3": "DRV_IN1", "4": "ILIM", "5": "VM",
            "6": "SOL_OUT1", "7": "GND", "8": "SOL_OUT2", "9": "GND"},
    "R6": {"1": "ILIM", "2": "GND"},
    "C4": {"1": "VM", "2": "GND"},
    "C5": {"1": "VM", "2": "GND"},
    "R14": {"1": "DRV_IN1", "2": "GND"},
    "R15": {"1": "DRV_IN2", "2": "GND"},
    "R16": {"1": "DRV_IN2_MCU", "2": "DRV_IN2"},
    "U5": {"1": "GND", "2": "/SUPV", "3": "+3V3"},
    "C13": {"1": "+3V3", "2": "GND"},
    "U6": {"1": "/SUPV", "2": "+3V3", "3": "+3V3", "4": "GND", "5": "ONESHOT_Q",
            "6": "OS_CEXT", "7": "OS_RC", "8": "+3V3"},
    "C9": {"1": "OS_CEXT", "2": "OS_RC"},
    "R13": {"1": "OS_RC", "2": "+3V3"},
    "C8": {"1": "+3V3", "2": "GND"},
    "R7": {"1": "VM", "2": "VM_SENSE"},
    "R8": {"1": "VM_SENSE", "2": "GND"},
    "C14": {"1": "VM_SENSE", "2": "GND"},
    # tact switches: pads "1" = signal contact, pads "2" = GND contact (docstring #1)
    "SW1": {"1": "BTN_UP_SW", "2": "GND"},
    "SW2": {"1": "BTN_SET_SW", "2": "GND"},
    "R11": {"1": "BTN_UP_SW", "2": "+3V3"},
    "R9": {"1": "BTN_UP_SW", "2": "BTN_UP"},
    "C10": {"1": "BTN_UP", "2": "GND"},
    "R12": {"1": "BTN_SET_SW", "2": "+3V3"},
    "R10": {"1": "BTN_SET_SW", "2": "BTN_SET"},
    "C11": {"1": "BTN_SET", "2": "GND"},
    "TP1": {"1": "MISO"},
    "TP2": {"1": "/SUPV"},
    "TP3": {"1": "VM"},
}

VALUES = {
    "C1": "470uF 16V", "C2": "1uF", "C3": "1uF", "C4": "10uF", "C5": "100nF",
    "C6": "100nF", "C7": "100nF", "C8": "100nF", "C9": "470nF", "C10": "100nF",
    "C11": "100nF", "C12": "10uF", "C13": "100nF", "C14": "100nF",
    "D1": "SS34", "D2": "BAT54", "D3": "BAT54", "D4": "SS34", "D5": "SS34",
    "D6": "BAT54", "F1": "PPTC 1.1A", "J1": "BAT1 9V", "J2": "SOLENOID",
    "J3": "ISP", "J4": "TM1637", "J5": "DC 9-12V", "J6": "BAT2 9V",
    "R1": "10K", "R2": "10K", "R3": "10K", "R4": "10K", "R5": "220R",
    "R6": "43K", "R7": "100K", "R8": "33K", "R9": "100R", "R10": "100R",
    "R11": "10K", "R12": "10K", "R13": "100K", "R14": "100K", "R15": "100K",
    "R16": "1K", "SC1": "1F 5.5V", "SW1": "UP", "SW2": "SET",
    "TP1": "MISO", "TP2": "/SUPV", "TP3": "VM",
    "TVS1": "SMAJ15A", "TVS2": "SMAJ15A",
    "U1": "ATtiny84A-SSU", "U2": "DS3231M", "U3": "MCP1703A-3.3",
    "U4": "DRV8871", "U5": "TPS3839G30", "U6": "74LVC1G123",
    "MH1": "", "MH2": "", "MH3": "", "MH4": "",
}

POWER_NETS = {"VM", "SOL_OUT1", "SOL_OUT2", "VIN_OR", "VIN_DC",
              "VBAT1_IN", "VBAT2_IN"}

# ----------------------------------------------------------------------------
# Footprint assignment (lib, name) — from the schematic's Footprint fields
# ----------------------------------------------------------------------------

FP_MKDS = ("TerminalBlock_Phoenix",
           "TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal")
FOOTPRINTS = {
    "U1": ("Package_SO", "SOIC-14_3.9x8.7mm_P1.27mm"),
    "U2": ("Package_SO", "SOIC-16W_7.5x10.3mm_P1.27mm"),
    "U3": ("Package_TO_SOT_SMD", "SOT-23"),
    "U4": ("Package_SO", "Texas_HTSOP-8-1EP_3.9x4.9mm_P1.27mm_EP2.95x4.9mm_Mask2.4x3.1mm_ThermalVias"),
    "U5": ("Package_TO_SOT_SMD", "SOT-23"),
    "U6": ("Package_SO", "VSSOP-8_2.3x2mm_P0.5mm"),
    "J1": FP_MKDS, "J2": FP_MKDS, "J6": FP_MKDS,
    "J3": ("Connector_PinHeader_2.54mm", "PinHeader_2x03_P2.54mm_Vertical"),
    "J4": ("Connector_PinHeader_2.54mm", "PinHeader_1x04_P2.54mm_Vertical"),
    "J5": ("Connector_BarrelJack", "BarrelJack_Horizontal"),
    "D1": ("Diode_SMD", "D_SMA"), "D4": ("Diode_SMD", "D_SMA"),
    "D5": ("Diode_SMD", "D_SMA"),
    "TVS1": ("Diode_SMD", "D_SMA"), "TVS2": ("Diode_SMD", "D_SMA"),
    "D2": ("Package_TO_SOT_SMD", "SOT-23"), "D3": ("Package_TO_SOT_SMD", "SOT-23"),
    "D6": ("Package_TO_SOT_SMD", "SOT-23"),
    "F1": ("Fuse", "Fuse_1812_4532Metric"),
    "C1": ("Capacitor_THT", "CP_Radial_D10.0mm_P5.00mm"),
    "SC1": ("Capacitor_THT", "CP_Radial_D10.0mm_P5.00mm"),
    "C2": ("Capacitor_SMD", "C_0805_2012Metric"),
    "C3": ("Capacitor_SMD", "C_0805_2012Metric"),
    "C12": ("Capacitor_SMD", "C_0805_2012Metric"),
    "C4": ("Capacitor_SMD", "C_1206_3216Metric"),
    "SW1": ("Button_Switch_SMD", "SW_SPST_TL3342"),
    "SW2": ("Button_Switch_SMD", "SW_SPST_TL3342"),
    "TP1": ("TestPoint", "TestPoint_Pad_D1.5mm"),
    "TP2": ("TestPoint", "TestPoint_Pad_D1.5mm"),
    "TP3": ("TestPoint", "TestPoint_Pad_D1.5mm"),
    "MH1": ("MountingHole", "MountingHole_3.2mm_M3"),
    "MH2": ("MountingHole", "MountingHole_3.2mm_M3"),
    "MH3": ("MountingHole", "MountingHole_3.2mm_M3"),
    "MH4": ("MountingHole", "MountingHole_3.2mm_M3"),
}
for _r in ["C5","C6","C7","C8","C9","C10","C11","C13","C14"]:
    FOOTPRINTS[_r] = ("Capacitor_SMD", "C_0603_1608Metric")
for _r in ["R1","R2","R3","R4","R5","R6","R7","R8","R9","R10","R11","R12",
           "R13","R14","R15","R16"]:
    FOOTPRINTS[_r] = ("Resistor_SMD", "R_0603_1608Metric")

# ----------------------------------------------------------------------------
# Placement: ref -> (x, y, rot)
# Frame: KiCad coords, y down. x=70 edge = FRONT (user) face.
# Rot is KiCad CCW-on-screen. Verified pad landing spots via pcbnew API.
# ----------------------------------------------------------------------------

PLACE = {
    # mounting holes
    "MH1": (3, 3, 0), "MH2": (67, 3, 0), "MH3": (3, 47, 0), "MH4": (67, 47, 0),

    # --- north edge: battery terminals (wire entry faces y=0 / outward) ---
    # NOTE: MKDS courtyard is 11.2 x 10.8 mm (body reaches y=11.3 when pads at 6.2)
    "J6": (12, 6.2, 0),          # BAT2, rear-left
    "J1": (51, 6.2, 0),          # BAT1, front-left
    "D5": (12, 15, 90),          # A(p2)->(12,13) toward J6.1, K(p1)->(12,17)
    "D1": (53.5, 15, 90),        # A(p2)->(53.5,13) toward J1.1, K(p1)->(53.5,17)
    "C1": (23.5, 13, 0),         # VM reservoir: +(p1)=(23.5,13) -(p2)=(28.5,13)
    "TVS2": (37.5, 13, 180),     # K(p1)->(39.5,13) VM, A(p2)->(35.5,13) GND
    "F1": (44.5, 14, 0),         # p1 VIN_OR (42.36,14), p2 VM (46.64,14)

    # --- front-east: DC jack + protection ---
    "J5": (58, 38.5, 180),       # opening faces +x (front); p1(58,38.5) p2(64,38.5) p3(61,33.8)
    "TVS1": (53.3, 31, 270),     # K(p1)->(53.3,29) VIN_DC, A(p2)->(53.3,33) GND
    "D4": (53.3, 23.6, 270),     # K(p1)->(53.3,21.6) VIN_OR, A(p2)->(53.3,25.6) VIN_DC

    # --- LDO cluster (center-north) ---
    "U3": (36, 19.3, 180),       # p1 GND (36.94,20.25) p2 VM (36.94,18.35) p3 +3V3 (35.06,19.3)
    "C2": (32.5, 15.7, 270),     # p1 VM (32.5,14.75) p2 GND (32.5,16.65)
    "C3": (39.4, 19.3, 90),      # p1 +3V3 (39.4,20.075) p2 GND (39.4,18.525)
    "C12": (42.2, 22.1, 0),      # p1 +3V3 (41.25,22.1) p2 GND (43.15,22.1)
    "C6": (27.9, 21.3, 90),      # U1 pin1 decouple: p1 +3V3 (27.9,22.075)
    "TP3": (30.2, 18.8, 0),      # VM test point

    # --- MCU center ---
    "U1": (33, 26, 0),

    # --- battery divider (north-center, near VM trunk) ---
    "R7": (43, 17.8, 270),       # VM (43,16.975) -> VM_SENSE (43,18.625)
    "R8": (44.8, 17.8, 90),      # VM_SENSE (44.8,18.625) -> GND (44.8,16.975)
    "C14": (46.6, 17.8, 90),     # VM_SENSE (46.6,18.625) -> GND (46.6,16.975)

    # --- RTC west ---
    "U2": (16, 26, 0),
    "C7": (11, 19.5, 0),
    "R2": (25.6, 21.4, 270),     # SDA pullup: p1 SDA (25.6,22.225) p2 +3V3 (25.6,20.575)
    "R3": (23.4, 20.3, 270),     # SCL pullup: p1 SCL (23.4,21.125) p2 +3V3 (23.4,19.475)
    "R4": (27.4, 30.9, 0),       # /ALERT pullup: p1 (26.575,30.9) p2 +3V3 (28.225,30.9)
    "R5": (7, 20, 0),            # trickle: p1 +3V3 (6.175,20) p2 VBAT_CHG (7.825,20)
    "D2": (7, 25, 0),            # BAT54: A(p1)=(6.06,24.05) K(p3)=(7.94,25)
    "SC1": (7, 38, 0),           # supercap: +(p1)=(7,38) -(p2)=(12,38)

    # --- ISP (south-west) ---
    "J3": (17, 41, 0),
    "TP1": (23.8, 44.3, 0),      # MISO
    "R1": (18.6, 36.5, 0),       # /RESET pullup: p1 (17.775,36.5) p2 +3V3 (19.425,36.5)

    # --- supervisor + one-shot (south of MCU) ---
    "U5": (25, 34.3, 0),         # p1 GND (24.06,33.35) p2 /SUPV (24.06,35.25) p3 +3V3 (25.94,34.3)
    "C13": (21.8, 33.0, 90),     # p1 +3V3 (21.8,33.775) p2 GND (21.8,32.225)
    "D3": (29.5, 33.5, 0),       # BAT54: A(p1)/ALERT (28.56,32.55), K(p3)/SUPV (30.44,33.5)
    "TP2": (28, 37.8, 0),        # /SUPV
    "U6": (24, 41, 0),           # VSSOP-8
    "C8": (23, 38.3, 0),         # p1 +3V3 (22.225,38.3) p2 GND (23.775,38.3)
    "C9": (28.3, 41.5, 90),      # p1 OS_CEXT (28.3,42.275) p2 OS_RC (28.3,40.725)
    "R13": (28.3, 45, 90),       # p1 OS_RC (28.3,45.825) p2 +3V3 (28.3,44.175)

    # --- driver cluster (south-center, near J2) ---
    "U4": (44, 35.8, 0),         # HTSOP-8: IN pads x=41.125, OUT/VM x=46.875
    "C4": (44, 31.3, 0),         # 1206 VM bulk: p1 VM (42.525,31.3) p2 GND (45.475,31.3)
    "C5": (49.4, 31.5, 90),      # 0603 VM hf: p1 VM (49.4,32.275) p2 GND (49.4,30.725)
    "R6": (49.4, 35.5, 90),      # ILIM: p1 (49.4,36.325) p2 GND (49.4,34.675)
    "D6": (33.5, 36.6, 0),       # BAT54: A(p1)=ONESHOT_Q (32.56,35.65) K(p3)=DRV_IN2 (34.44,36.6)
    "R14": (37.3, 31.6, 180),    # IN1 pulldown: p1 DRV_IN1 (38.125,31.6) p2 GND (36.475,31.6)
    "R16": (37.3, 33.2, 0),      # p1 DRV_IN2_MCU (36.475,33.2) p2 DRV_IN2 (38.125,33.2)
    "R15": (37.3, 34.8, 180),    # IN2 pulldown: p1 DRV_IN2 (38.125,34.8) p2 GND (36.475,34.8)
    "J2": (38, 43.8, 180),       # solenoid, wire entry faces y=50 (outward)

    # --- front (east) edge: buttons + display header ---
    "SW1": (63, 15, 90),         # contact1 pads x=61.1, contact2(GND) x=64.9
    "R11": (57.5, 13.5, 180),    # p1 BTN_UP_SW (58.325,13.5) p2 +3V3 (56.675,13.5)
    "R9": (57.5, 16.5, 180),     # p1 BTN_UP_SW (58.325,16.5) p2 BTN_UP (56.675,16.5)
    "C10": (39.5, 24.5, 270),    # at MCU: p1 BTN_UP (39.5,23.675) p2 GND (39.5,25.325)
    "SW2": (63, 27, 90),
    "R12": (57.5, 25.5, 180),    # p1 BTN_SET_SW (58.325,25.5) p2 +3V3 (56.675,25.5)
    "R10": (57.5, 28.5, 180),    # p1 BTN_SET_SW (58.325,28.5) p2 BTN_SET (56.675,28.5)
    "C11": (39.5, 28, 270),      # at MCU: p1 BTN_SET (39.5,26.675) p2 GND (39.5,28.325)
    "J4": (49.5, 26, 180),       # 1x4 header pins run -y: p1(49.5,26) .. p4(49.5,18.38)
}

# refdes silk label positions (abs x, y) — placed clear of pads; None = keep
# library default offset. Angle 0.
REF_POS = {}

# ----------------------------------------------------------------------------
# Footprint loading / instantiation
# ----------------------------------------------------------------------------

_fp_cache = {}

def load_fp(lib, name):
    key = (lib, name)
    if key not in _fp_cache:
        path = os.path.join(FPDIR, lib + ".pretty", name + ".kicad_mod")
        with open(path) as f:
            _fp_cache[key] = parse(tokenize(f.read()))
    return _fp_cache[key]

def deepcopy_sx(n):
    return [deepcopy_sx(x) for x in n] if isinstance(n, list) else n

def build_footprint(ref, lib, name, x, y, rot, netmap):
    src = load_fp(lib, name)
    fp = ["footprint", q(f"{lib}:{name}")]
    fp.append(["layer", q("F.Cu")])
    fp.append(["uuid", U()])
    fp.append(["at", x, y, rot] if rot else ["at", x, y])
    for item0 in src[2:]:
        if not isinstance(item0, list):
            continue
        k = item0[0]
        if k in ("version", "generator", "generator_version", "model",
                 "embedded_fonts", "tedit"):
            continue
        item = deepcopy_sx(item0)
        if k == "property":
            pname = item[1].strip('"')
            if pname == "Reference":
                item[2] = q(ref)
            elif pname == "Value":
                item[2] = q(VALUES.get(ref, name))
            for at in kids(item, "at"):
                a = float(at[3]) if len(at) >= 4 else 0.0
                na = (a + rot) % 360
                if len(at) >= 4:
                    at[3] = na
                elif na:
                    at.append(na)
        elif k == "fp_text":
            for at in kids(item, "at"):
                a = float(at[3]) if len(at) >= 4 else 0.0
                na = (a + rot) % 360
                if len(at) >= 4:
                    at[3] = na
                elif na:
                    at.append(na)
        elif k == "pad":
            for at in kids(item, "at"):
                a = float(at[3]) if len(at) >= 4 else 0.0
                na = (a + rot) % 360
                if len(at) >= 4:
                    at[3] = na
                elif na:
                    at.append(na)
            pnum = item[1].strip('"')
            if pnum in netmap:
                # insert net before any nested lists at end (order tolerant)
                item.append(["net", q(netmap[pnum])])
        fp.append(item)
    return fp

# geometric info extracted per instance for router / checks
class PadInfo:
    __slots__ = ("ref","num","net","x","y","w","h","rot","through","layers","drill")
    def __init__(self, **kw):
        for k_, v_ in kw.items(): setattr(self, k_, v_)

def fp_pads_abs(ref, lib, name, x, y, rot, netmap):
    """absolute pad geometry for one placed footprint"""
    src = load_fp(lib, name)
    out = []
    for p in kids(src, "pad"):
        num = p[1].strip('"')
        typ = p[2]
        at = kids(p, "at")[0]
        px, py = float(at[1]), float(at[2])
        prot = float(at[3]) if len(at) >= 4 else 0.0
        sz = kids(p, "size")[0]
        w, h = float(sz[1]), float(sz[2])
        dr = kids(p, "drill")
        drill = 0.0
        if dr:
            try:
                drill = float(dr[0][1])
            except (ValueError, IndexError):
                # oval drills: (drill oval w h)
                drill = max(float(v) for v in dr[0][2:4])
        lay = [l.strip('"') for l in kids(p, "layers")[0][1:]]
        ax, ay = rot_pt(px, py, rot)
        # pad copper bbox half-extents in board frame (account pad+fp rotation)
        tot = (prot + rot) % 180
        if abs(tot - 90) < 1:
            bw, bh = h, w
        else:
            bw, bh = w, h
        out.append(PadInfo(ref=ref, num=num, net=netmap.get(num), x=x+ax, y=y+ay,
                           w=bw, h=bh, rot=(prot+rot) % 360,
                           through=(typ == "thru_hole"), layers=lay, drill=drill))
    return out

def fp_courtyard_bbox(lib, name, x, y, rot):
    src = load_fp(lib, name)
    xs, ys = [], []
    for k in ("fp_line", "fp_rect", "fp_poly", "fp_circle", "fp_arc"):
        for e in kids(src, k):
            lay = kids(e, "layer")
            if not (lay and "CrtYd" in lay[0][1]):
                continue
            pts = []
            if k == "fp_circle":
                c = kids(e, "center")[0]
                en = kids(e, "end")[0]
                cx, cy = float(c[1]), float(c[2])
                r = math.hypot(float(en[1]) - cx, float(en[2]) - cy)
                pts = [(cx - r, cy - r), (cx + r, cy + r)]
            else:
                for tag in ("start", "end", "center", "mid"):
                    for pnode in kids(e, tag):
                        pts.append((float(pnode[1]), float(pnode[2])))
                for pnode in kids(e, "pts"):
                    for xy in kids(pnode, "xy"):
                        pts.append((float(xy[1]), float(xy[2])))
            for (px, py) in pts:
                ax, ay = rot_pt(px, py, rot)
                xs.append(x + ax); ys.append(y + ay)
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))

# ----------------------------------------------------------------------------
# Grid router: 2 layers (0=F.Cu, 1=B.Cu), BFS with per-width occupancy maps.
# occ[(layer, wclass)][cell] = netname or "X" (multi-net / hard block)
# A cell is passable for net n at width w if unmapped or mapped to n.
# ----------------------------------------------------------------------------

WCLASSES = (W_LOGIC, 0.5, VIA_D, W_POWER)   # 0.8 class doubles as via-copper check
EDGE_KEEP = 0.45     # copper-to-edge keepout for routed tracks

class Router:
    def __init__(self):
        self.occ = {(l, w): {} for l in (0, 1) for w in WCLASSES}
        self.holes = {}          # cell -> True (drill keepout for new vias)
        self.via_pts = []        # (x,y) of vias placed
        self.segments = []       # (x1,y1,x2,y2,w,layer,net)
        self.vias = []           # (x,y,net)
        self.net_cells = {}      # net -> set of (layer,cell) CONNECTED copper
        self.pad_cells = {}      # (ref,num,x,y) -> set of (layer,cell)
        self.islands = {}        # net -> [(cells, {pad xy anchors})]
        self.fail = []

    @staticmethod
    def cell(x, y):
        return (round(x / GRID), round(y / GRID))

    def _mark(self, m, c, net):
        cur = m.get(c)
        if cur is None:
            m[c] = net
        elif cur != net:
            m[c] = "X"

    def stamp_disk(self, layer, cx, cy, r, net, wclass=None):
        for w in ([wclass] if wclass else WCLASSES):
            m = self.occ[(layer, w)]
            rr = r + CLR + w / 2
            n = int(rr / GRID) + 1
            c0x, c0y = self.cell(cx, cy)
            for ix in range(c0x - n, c0x + n + 1):
                for iy in range(c0y - n, c0y + n + 1):
                    if (ix * GRID - cx) ** 2 + (iy * GRID - cy) ** 2 <= rr * rr:
                        self._mark(m, (ix, iy), net)

    def stamp_rect(self, layer, cx, cy, hw, hh, net, clr=CLR):
        for w in WCLASSES:
            m = self.occ[(layer, w)]
            gx, gy = hw + clr + w / 2, hh + clr + w / 2
            x0, x1 = self.cell(cx - gx, cy - gy), self.cell(cx + gx, cy + gy)
            for ix in range(x0[0], x1[0] + 1):
                for iy in range(x0[1], x1[1] + 1):
                    if abs(ix * GRID - cx) <= gx and abs(iy * GRID - cy) <= gy:
                        self._mark(m, (ix, iy), net)

    def stamp_seg(self, layer, x1, y1, x2, y2, halfw, net):
        L = math.hypot(x2 - x1, y2 - y1)
        steps = max(1, int(L / (GRID / 2)))
        for i in range(steps + 1):
            t = i / steps
            self.stamp_disk(layer, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t,
                            halfw, net)

    def stamp_hole(self, cx, cy, drill):
        """keepout so later vias keep hole-to-hole distance"""
        rr = drill / 2 + VIA_DRILL / 2 + 0.3
        n = int(rr / GRID) + 1
        c0x, c0y = self.cell(cx, cy)
        for ix in range(c0x - n, c0x + n + 1):
            for iy in range(c0y - n, c0y + n + 1):
                if (ix * GRID - cx) ** 2 + (iy * GRID - cy) ** 2 <= rr * rr:
                    self.holes[(ix, iy)] = True

    def stamp_edges(self):
        for w in WCLASSES:
            for l in (0, 1):
                m = self.occ[(l, w)]
                margin = EDGE_KEEP + w / 2
                nx, ny = int(BOARD_W / GRID), int(BOARD_H / GRID)
                nm = int(margin / GRID) + 1
                for ix in range(-2, nx + 3):
                    for k in range(nm + 1):
                        for iy in (k, ny - k):
                            if ix * GRID < margin or ix * GRID > BOARD_W - margin \
                               or k * GRID < margin:
                                m[(ix, iy)] = "X"
                for iy in range(-2, ny + 3):
                    for k in range(nm + 1):
                        for ix in (k, nx - k):
                            if iy * GRID < margin or iy * GRID > BOARD_H - margin \
                               or k * GRID < margin:
                                m[(ix, iy)] = "X"

    def add_pad(self, p, clr=CLR):
        layers = [0] if not p.through else [0, 1]
        if p.through:
            self.stamp_hole(p.x, p.y, p.drill)
        if not p.through and "B.Cu" in p.layers and "F.Cu" not in p.layers \
           and "*.Cu" not in p.layers:
            layers = [1]
        net = p.net if p.net else "X"
        for l in layers:
            self.stamp_rect(l, p.x, p.y, p.w / 2, p.h / 2, net, clr)
        # per-pad cells (BFS seeds; only added to net targets once connected)
        cells = set()
        for l in layers:
            cells.add((l, self.cell(p.x, p.y)))
            if p.w > p.h:
                for dx in (-p.w / 4, p.w / 4):
                    cells.add((l, self.cell(p.x + dx, p.y)))
            elif p.h > p.w:
                for dy in (-p.h / 4, p.h / 4):
                    cells.add((l, self.cell(p.x, p.y + dy)))
        self.pad_cells[(p.ref, p.num, p.x, p.y)] = cells

    def add_via(self, x, y, net, record=True):
        for l in (0, 1):
            self.stamp_disk(l, x, y, VIA_D / 2, net)
        self.stamp_hole(x, y, VIA_DRILL)
        self.via_pts.append((x, y))
        if record:
            self.vias.append((x, y, net))
        s = self.net_cells.setdefault(net, set())
        s.add((0, self.cell(x, y)))
        s.add((1, self.cell(x, y)))

    def add_track(self, x1, y1, x2, y2, w, layer, net):
        self.segments.append((x1, y1, x2, y2, w, layer, net))
        self.stamp_seg(layer, x1, y1, x2, y2, w / 2, net)
        s = self.net_cells.setdefault(net, set())
        L = math.hypot(x2 - x1, y2 - y1)
        steps = max(1, int(L / GRID))
        for i in range(steps + 1):
            t = i / steps
            s.add((layer, self.cell(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)))

    def via_ok(self, c, net, w=None):
        # via copper is a 0.8mm disk: consult the VIA_D width-class maps so the
        # via keeps full (r_via + CLR + r_other) clearance on both layers.
        if self.holes.get(c):
            return False
        for l in (0, 1):
            v = self.occ[(l, VIA_D)].get(c)
            if v is not None and v != net:
                return False
        ix, iy = c
        x, y = ix * GRID, iy * GRID
        if not (EDGE_KEEP + VIA_D/2 < x < BOARD_W - EDGE_KEEP - VIA_D/2 and
                EDGE_KEEP + VIA_D/2 < y < BOARD_H - EDGE_KEEP - VIA_D/2):
            return False
        for (vx, vy) in self.via_pts:
            # 0.8 + 0.25 clearance + margin -> 1.15mm center spacing
            if (vx - x) ** 2 + (vy - y) ** 2 < 1.3225:
                return False
        return True

    def bfs(self, net, w, starts, targets, allow_via=True):
        """starts/targets: sets of (layer, cell). Returns list of (layer,cell) path."""
        from collections import deque
        import heapq
        mF, mB = self.occ[(0, w)], self.occ[(1, w)]
        maps = (mF, mB)
        seen = {}
        pq = []
        cnt = 0
        for st in starts:
            seen[st] = None
            heapq.heappush(pq, (0, cnt, st)); cnt += 1
        tset = set(targets)
        end = None
        DIRS = ((1,0),(-1,0),(0,1),(0,-1))
        while pq:
            d, _, cur = heapq.heappop(pq)
            if cur in tset:
                end = cur; break
            l, (ix, iy) = cur
            for dx, dy in DIRS:
                nc = (ix + dx, iy + dy)
                ns = (l, nc)
                if ns in seen:
                    continue
                if ns not in tset:      # target cells always enterable (own pad)
                    v = maps[l].get(nc)
                    if v is not None and v != net:
                        continue
                seen[ns] = cur
                heapq.heappush(pq, (d + (1 if l == 0 else 4), cnt, ns)); cnt += 1
            if allow_via:
                ns = (1 - l, (ix, iy))
                if ns not in seen and self.via_ok((ix, iy), net):
                    seen[ns] = cur
                    heapq.heappush(pq, (d + 25, cnt, ns)); cnt += 1
        if end is None:
            return None
        path = []
        cur = end
        while cur is not None:
            path.append(cur)
            cur = seen[cur]
        path.reverse()
        return path

    def route_net(self, net, w, pads):
        """pads: list of PadInfo on this net. Greedy nearest-first spanning tree."""
        if len(pads) < 2:
            return
        # start at the pad nearest the net centroid
        cx = sum(p.x for p in pads) / len(pads)
        cy = sum(p.y for p in pads) / len(pads)
        def island_of(p):
            for cells, padxy in self.islands.get(net, []):
                if (p.x, p.y) in padxy:
                    return cells
            return set()

        rest = sorted(pads, key=lambda p: (p.x - cx) ** 2 + (p.y - cy) ** 2)
        first, todo = rest[0], rest[1:]
        conn = set(self.pad_cells[(first.ref, first.num, first.x, first.y)])
        conn |= island_of(first)
        self.net_cells[net] = conn
        done_xy = [(first.x, first.y)]
        while todo:
            # nearest unconnected pad to any connected pad
            todo.sort(key=lambda p: min((p.x - qx) ** 2 + (p.y - qy) ** 2
                                        for qx, qy in done_xy))
            p = todo.pop(0)
            starts = set(self.pad_cells[(p.ref, p.num, p.x, p.y)])
            starts |= island_of(p)   # fan-out stub copper is part of the pad
            targets = conn - starts
            if starts & conn:
                # overlapping pads (already merged copper)
                conn |= starts
                done_xy.append((p.x, p.y))
                continue
            path = self.bfs(net, w, starts, targets, True)
            if path is None:
                self.fail.append((net, p.ref, p.num))
                print(f"  !! ROUTE FAIL {net} to {p.ref}.{p.num} ({p.x},{p.y})")
                if os.environ.get("DBG_MAP"):
                    qx = [q_[0] for q_ in done_xy] + [p.x]
                    qy = [q_[1] for q_ in done_xy] + [p.y]
                    self.dump_region(net, w, min(qx)-3, max(qx)+3,
                                     min(qy)-3, max(qy)+3)
                continue
            self.emit_path(path, net, w)
            conn |= starts
            done_xy.append((p.x, p.y))

    def emit_path(self, path, net, w):
        # split at layer changes -> vias; merge colinear runs -> segments
        i = 0
        while i < len(path) - 1:
            l0, c0 = path[i]
            l1, c1 = path[i + 1]
            if l0 != l1:
                x, y = c0[0] * GRID, c0[1] * GRID
                self.add_via(x, y, net)
                i += 1
                continue
            j = i + 1
            dx = c1[0] - c0[0]; dy = c1[1] - c0[1]
            while j + 1 < len(path):
                lj, cj = path[j + 1]
                if lj != l0:
                    break
                pj = path[j][1]
                if (cj[0] - pj[0], cj[1] - pj[1]) != (dx, dy):
                    break
                j += 1
            cA = path[i][1]; cB = path[j][1]
            self.add_track(cA[0]*GRID, cA[1]*GRID, cB[0]*GRID, cB[1]*GRID,
                           w, l0, net)
            i = j

    def dump_region(self, net, w, x0, x1, y0, y1):
        for l in (0, 1):
            m = self.occ[(l, w)]
            print(f"  --- layer {'FB'[l]} wclass {w} owners ('.'=free, lower=own net) x{x0:.0f}..{x1:.0f} y{y0:.0f}..{y1:.0f}")
            iy0, iy1 = int(y0/GRID), int(y1/GRID)
            ix0, ix1 = int(x0/GRID), int(x1/GRID)
            for iy in range(iy0, iy1+1):
                row = []
                for ix in range(ix0, ix1+1):
                    v = m.get((ix, iy))
                    if v is None: row.append(".")
                    elif v == net: row.append("+")
                    elif v == "X": row.append("X")
                    elif v == "GND": row.append("g")
                    else: row.append(v[0].upper() if v[0] not in "+/" else v[1].upper())
                print("   " + "".join(row))

    def stitch_gnd(self, p, fp_center):
        """place a via next to an SMD GND pad + connecting stub on F.Cu"""
        stub_w = min(0.5, min(p.w, p.h))
        dx, dy = p.x - fp_center[0], p.y - fp_center[1]
        base = math.degrees(math.atan2(dy, dx)) if (dx or dy) else 0.0
        cand = []
        for dd in (0, 45, -45, 90, -90, 135, -135, 180):
            cand.append(math.radians(base + dd))
        reach = max(p.w, p.h) / 2 + VIA_D / 2 + 0.15
        wc = W_LOGIC if min(p.w, p.h) < 0.5 else 0.5
        nvia = nstub = 0
        for extra in (0.0, 0.35, 0.7, 1.1, 1.6):
            for a in cand:
                vx = p.x + (reach + extra) * math.cos(a)
                vy = p.y + (reach + extra) * math.sin(a)
                vx = round(vx / GRID) * GRID
                vy = round(vy / GRID) * GRID
                c = self.cell(vx, vy)
                if not self.via_ok(c, "GND"):
                    nvia += 1
                    if p.ref == DBG_REF:
                        print(f"    dbg {p.ref}.{p.num} cand ({vx},{vy}) via_ok=F "
                              f"occF={self.occ[(0,wc)].get(c)} occB={self.occ[(1,wc)].get(c)} "
                              f"hole={self.holes.get(c)}")
                    continue
                # stub path check on F.Cu, 0.5 class map
                ok = True
                L = math.hypot(vx - p.x, vy - p.y)
                steps = max(1, int(L / (GRID / 2)))
                m = self.occ[(0, wc)]
                for i in range(steps + 1):
                    t = i / steps
                    cc = self.cell(p.x + (vx - p.x) * t, p.y + (vy - p.y) * t)
                    if m.get(cc) not in (None, "GND"):
                        ok = False; break
                if not ok:
                    nstub += 1
                    if p.ref == DBG_REF:
                        print(f"    dbg {p.ref}.{p.num} cand ({vx},{vy}) stub blocked at {cc}: "
                              f"{m.get(cc)}")
                    continue
                self.add_via(vx, vy, "GND")
                self.add_track(p.x, p.y, vx, vy, stub_w, 0, "GND")
                return True
        print(f"  !! GND STITCH FAIL {p.ref}.{p.num} at ({p.x},{p.y}) "
              f"[via_ok rejected {nvia}, stub rejected {nstub}]")
        self.fail.append(("GND-stitch", p.ref, p.num))
        return False

# ----------------------------------------------------------------------------
# Board assembly
# ----------------------------------------------------------------------------

def silk_text(txt, x, y, size=0.8, layer="F.SilkS", thick=0.12):
    return ["gr_text", q(txt), ["at", x, y, 0], ["layer", q(layer)],
            ["uuid", U()],
            ["effects", ["font", ["size", size, size], ["thickness", thick]]]]

def build_board():
    fps = []
    all_pads = []
    boxes = {}
    for ref, (lib, name) in FOOTPRINTS.items():
        x, y, rot = PLACE[ref]
        netmap = NETS.get(ref, {})
        fps.append(build_footprint(ref, lib, name, x, y, rot, netmap))
        pads = fp_pads_abs(ref, lib, name, x, y, rot, netmap)
        all_pads.extend(pads)
        bb = fp_courtyard_bbox(lib, name, x, y, rot)
        if bb:
            boxes[ref] = bb
    # courtyard overlap pre-check (C1/SC1/MH* courtyards are circles: use exact
    # circle-vs-rect; everything else conservative bbox-vs-bbox)
    CIRC = {"C1": 5.25, "SC1": 5.25, "MH1": 3.45, "MH2": 3.45, "MH3": 3.45,
            "MH4": 3.45}
    CIRC_C = {"C1": (26.0, 13.0), "SC1": (9.5, 38.0), "MH1": (3, 3),
              "MH2": (67, 3), "MH3": (3, 47), "MH4": (67, 47)}
    def overlap(r1, r2):
        a, b = boxes[r1], boxes[r2]
        if not (a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]):
            return False
        for rc, rr in ((r1, r2), (r2, r1)):
            if rc in CIRC and rr not in CIRC:
                cx, cy = CIRC_C[rc]
                bb = boxes[rr]
                nx = min(max(cx, bb[0]), bb[2])
                ny = min(max(cy, bb[1]), bb[3])
                return math.hypot(nx - cx, ny - cy) < CIRC[rc]
        if r1 in CIRC and r2 in CIRC:
            c1, c2 = CIRC_C[r1], CIRC_C[r2]
            return math.hypot(c1[0]-c2[0], c1[1]-c2[1]) < CIRC[r1] + CIRC[r2]
        return True
    refs = sorted(boxes)
    for i in range(len(refs)):
        for j in range(i + 1, len(refs)):
            if overlap(refs[i], refs[j]):
                print(f"  ** COURTYARD OVERLAP {refs[i]} {refs[j]}  "
                      f"{boxes[refs[i]]} {boxes[refs[j]]}")
    # bounds check
    for r, bb in boxes.items():
        if r in ("J1", "J2", "J5", "J6") or r.startswith("MH"):
            continue
        if bb[0] < 0.2 or bb[1] < 0.2 or bb[2] > BOARD_W - 0.2 or bb[3] > BOARD_H - 0.2:
            print(f"  ** OFF-BOARD courtyard {r} {bb}")

    rt = Router()
    rt.stamp_edges()
    fp_centers = {ref: (PLACE[ref][0], PLACE[ref][1]) for ref in FOOTPRINTS}
    for p in all_pads:
        rt.add_pad(p, clr=0.16 if p.ref == "U6" else CLR)

    # ---- U6 (VSSOP-8, 0.5 mm pitch) fan-out stubs.
    # At 0.25 mm map clearance the neighbors' escape tracks would seal each
    # pad's start cells (legal per the 0.15 mm local .dru rule, but X on the
    # conservative grid). Pre-routed same-net stubs keep an owned corridor
    # open out of the fine-pitch zone regardless of net ordering.
    # island = ( net, [anchor pad xy...], [polyline chains...] )
    U6_STUBS = [
        ("/SUPV", [(22.6, 40.25)],
         [[(22.6, 40.25), (22.25, 40.25), (22.25, 39.4), (21.0, 39.4)]]),
        ("+3V3", [(22.6, 40.75), (22.6, 41.25)],                # tie pads 2+3
         [[(22.6, 40.75), (22.6, 41.25)], [(22.6, 41.0), (21.6, 41.0)]]),
        ("ONESHOT_Q", [(25.4, 41.75)],
         [[(25.4, 41.75), (25.4, 43.5)]]),                      # exit S
        ("OS_CEXT", [(25.4, 41.25)],
         [[(25.4, 41.25), (26.3, 41.25), (26.3, 41.9), (27.2, 41.9)]]),
        ("OS_RC", [(25.4, 40.75)],
         [[(25.4, 40.75), (27.2, 40.75)]]),
        ("+3V3", [(25.4, 40.25)],
         [[(25.4, 40.25), (25.75, 40.25), (25.75, 39.4), (27.2, 39.4)]]),
    ]
    for net, anchors, chains in U6_STUBS:
        rt.net_cells.pop(net, None)
        for pts in chains:
            for a, b in zip(pts, pts[1:]):
                rt.add_track(a[0], a[1], b[0], b[1], W_LOGIC, 0, net)
        cells = set(rt.net_cells.pop(net, set()))
        rt.islands.setdefault(net, []).append((cells, set(anchors)))

    # ---- GND stitching vias for SMD GND pads (EP has its own thermal vias)
    for p in all_pads:
        if p.net == "GND" and not p.through and not (p.ref == "U4" and p.num == "9"):
            if "F.Cu" in p.layers or "*.Cu" in p.layers:
                rt.stitch_gnd(p, fp_centers[p.ref])

    # ---- net routing
    by_net = {}
    for p in all_pads:
        if p.net and p.net != "GND" and (p.through or "F.Cu" in p.layers
                                          or "*.Cu" in p.layers or "B.Cu" in p.layers):
            by_net.setdefault(p.net, []).append(p)
    # dedupe multiple pad entries with same number (TL3342 has 2 pads per number
    # and HTSOP EP has several "9" pieces) -> keep all (they're distinct copper,
    # but same-number pads are joined inside the footprint) -> route to ONE of
    # each number, KiCad treats same-number pads as connected? It does NOT for
    # connectivity across separate copper. TL3342 pads of one number are joined
    # by the physical switch, but DRC connectivity needs copper. Keep all pads
    # so the router ties them (cheap, correct either way).
    order = ["VM", "SOL_OUT1", "SOL_OUT2", "VBAT1_IN", "VBAT2_IN", "VIN_DC",
             "VIN_OR",
             "+3V3",
             "VM_SENSE", "OS_RC", "OS_CEXT", "ONESHOT_Q",
             "VBAT_CHG", "VBAT_RTC",
             "TM_DIO", "TM_CLK", "SDA", "SCL", "/ALERT", "/RESET", "MISO",
             "BTN_UP", "BTN_SET", "BTN_UP_SW", "BTN_SET_SW",
             "DRV_IN2", "DRV_IN1", "DRV_IN2_MCU", "ILIM",
             "/SUPV"]
    missing = set(by_net) - set(order)
    if missing:
        print("  ** nets not in order list:", missing)
        order += sorted(missing)
    for net in order:
        if net not in by_net:
            continue
        w = W_POWER if net in POWER_NETS else W_LOGIC
        print(f"route {net} ({len(by_net[net])} pads, w={w})")
        rt.route_net(net, w, by_net[net])

    # ---- board skeleton
    board = ["kicad_pcb",
        ["version", 20260206],
        ["generator", q("pcbnew")],
        ["generator_version", q("10.0")],
        ["general", ["thickness", 1.6], ["legacy_teardrops", "no"]],
        ["paper", q("A4")],
        ["title_block",
            ["title", q("GreenGuard CO2 Timer v5 (alt-B second attempt)")],
            ["date", q("2026-07-10")],
            ["rev", q("5.0B")],
            ["company", q("GreenGuard USA")],
            ["comment", 1, q("ATtiny84A + DS3231M + DRV8871 + dual 9V OR + DC barrel; hardware brown-out close pulse")],
        ],
        ["layers",
            [0, q("F.Cu"), "signal"],
            [2, q("B.Cu"), "signal"],
            [13, q("F.Paste"), "user"],
            [15, q("B.Paste"), "user"],
            [5, q("F.SilkS"), "user", q("F.Silkscreen")],
            [7, q("B.SilkS"), "user", q("B.Silkscreen")],
            [1, q("F.Mask"), "user"],
            [3, q("B.Mask"), "user"],
            [17, q("Dwgs.User"), "user", q("User.Drawings")],
            [25, q("Edge.Cuts"), "user"],
            [27, q("Margin"), "user"],
            [31, q("F.CrtYd"), "user", q("F.Courtyard")],
            [29, q("B.CrtYd"), "user", q("B.Courtyard")],
            [36, q("F.Fab"), "user"],
            [34, q("B.Fab"), "user"],
        ],
        ["setup",
            ["pad_to_mask_clearance", 0.05],
            ["allow_soldermask_bridges_in_footprints", "no"],
        ],
    ]
    board.extend(fps)

    # edge cuts
    board.append(["gr_rect", ["start", 0, 0], ["end", BOARD_W, BOARD_H],
                  ["stroke", ["width", 0.1], ["type", "solid"]],
                  ["layer", q("Edge.Cuts")], ["uuid", U()]])

    # tracks + vias
    for (x1, y1, x2, y2, w, layer, net) in rt.segments:
        board.append(["segment", ["start", x1, y1], ["end", x2, y2],
                      ["width", w], ["layer", q("F.Cu" if layer == 0 else "B.Cu")],
                      ["net", q(net)], ["uuid", U()]])
    for (x, y, net) in rt.vias:
        board.append(["via", ["at", x, y], ["size", VIA_D], ["drill", VIA_DRILL],
                      ["layers", q("F.Cu"), q("B.Cu")], ["net", q(net)],
                      ["uuid", U()]])

    # B.Cu GND pour, full board, 0.3mm clearance
    board.append(["zone", ["net", q("GND")], ["layer", q("B.Cu")], ["uuid", U()],
        ["name", q("GND_POUR")], ["hatch", "edge", 0.5],
        ["connect_pads", ["clearance", 0.3]],
        ["min_thickness", 0.25],
        ["filled_areas_thickness", "no"],
        ["fill", "yes", ["thermal_gap", 0.5], ["thermal_bridge_width", 0.5],
         ["island_removal_mode", 0]],
        ["polygon", ["pts", ["xy", 0.3, 0.3], ["xy", BOARD_W - 0.3, 0.3],
                     ["xy", BOARD_W - 0.3, BOARD_H - 0.3], ["xy", 0.3, BOARD_H - 0.3]]]])

    # silkscreen: connector + polarity + board labels
    S = silk_text
    board += [
        S("GG CO2 TIMER v5B", 33.5, 10.2, 0.6),
        S("BAT1 9V", 53.5, 1.2), S("+", 48.9, 3.6, 1.0), S("-", 56.2, 3.6, 1.2),
        S("BAT2 9V", 14.5, 1.2), S("+", 9.9, 3.6, 1.0), S("-", 17.2, 3.6, 1.2),
        S("SOLENOID", 35.5, 47.6), S("OUT1", 38, 41.4, 0.6), S("OUT2", 32.9, 41.4, 0.6),
        S("DC 9-12V", 63.5, 45.2), S("TM1637", 49.5, 28.6, 0.6),
        S("3V3", 47.2, 26.0, 0.6), S("GND", 47.2, 23.46, 0.6),
        S("DIO", 47.2, 20.92, 0.6), S("CLK", 47.2, 18.38, 0.6),
        S("UP", 63, 6.9, 1.0), S("SET", 63, 21.4, 1.0),
        S("ISP", 13.9, 41.0, 0.7),
    ]
    out = ser(board) + "\n"
    with open(OUT_PCB, "w") as f:
        f.write(out)
    print(f"wrote {OUT_PCB} ({len(out)} bytes, {len(rt.segments)} segs, "
          f"{len(rt.vias)} vias, {len(rt.fail)} failures)")
    return rt

# ----------------------------------------------------------------------------
# project file: netclasses + DRC rules (picked up by kicad-cli pcb drc)
# ----------------------------------------------------------------------------

PRO_JSON = r"""{
  "board": {
    "design_settings": {
      "defaults": {},
      "rules": {
        "min_clearance": 0.15,
        "min_connection": 0.15,
        "min_copper_edge_clearance": 0.3,
        "min_hole_clearance": 0.25,
        "min_hole_to_hole": 0.25,
        "min_microvia_diameter": 0.2,
        "min_microvia_drill": 0.1,
        "min_resolved_spokes": 1,
        "min_silk_clearance": 0.0,
        "min_text_height": 0.6,
        "min_text_thickness": 0.08,
        "min_through_hole_diameter": 0.3,
        "min_track_width": 0.15,
        "min_via_annular_width": 0.1,
        "min_via_diameter": 0.5,
        "solder_mask_to_copper_clearance": 0.0,
        "use_height_for_length_calcs": true
      },
      "rule_severities": {
        "lib_footprint_issues": "ignore",
        "lib_footprint_mismatch": "ignore"
      }
    },
    "ipc2581": {},
    "layer_pairs": [],
    "3dviewports": []
  },
  "boards": [],
  "cvpcb": { "equivalence_files": [] },
  "libraries": { "pinned_footprint_libs": [], "pinned_symbol_libs": [] },
  "meta": { "filename": "co2_timer_v5_altB.kicad_pro", "version": 3 },
  "net_settings": {
    "classes": [
      {
        "bus_width": 12, "clearance": 0.25, "diff_pair_gap": 0.25,
        "diff_pair_via_gap": 0.25, "diff_pair_width": 0.2,
        "line_style": 0, "microvia_diameter": 0.3, "microvia_drill": 0.1,
        "name": "Default", "pcb_color": "rgba(0, 0, 0, 0.000)",
        "priority": 2147483647, "schematic_color": "rgba(0, 0, 0, 0.000)",
        "track_width": 0.25, "via_diameter": 0.8, "via_drill": 0.4,
        "wire_width": 6
      },
      {
        "bus_width": 12, "clearance": 0.25, "diff_pair_gap": 0.25,
        "diff_pair_via_gap": 0.25, "diff_pair_width": 0.2,
        "line_style": 0, "microvia_diameter": 0.3, "microvia_drill": 0.1,
        "name": "Power", "pcb_color": "rgba(0, 0, 0, 0.000)",
        "priority": 0, "schematic_color": "rgba(0, 0, 0, 0.000)",
        "track_width": 1.0, "via_diameter": 0.8, "via_drill": 0.4,
        "wire_width": 6
      },
      {
        "bus_width": 12, "clearance": 0.25, "diff_pair_gap": 0.25,
        "diff_pair_via_gap": 0.25, "diff_pair_width": 0.2,
        "line_style": 0, "microvia_diameter": 0.3, "microvia_drill": 0.1,
        "name": "Rail", "pcb_color": "rgba(0, 0, 0, 0.000)",
        "priority": 1, "schematic_color": "rgba(0, 0, 0, 0.000)",
        "track_width": 0.5, "via_diameter": 0.8, "via_drill": 0.4,
        "wire_width": 6
      }
    ],
    "netclass_assignments": {},
    "netclass_patterns": [
      { "netclass": "Power", "pattern": "VM" },
      { "netclass": "Power", "pattern": "SOL_OUT*" },
      { "netclass": "Power", "pattern": "VIN_*" },
      { "netclass": "Power", "pattern": "VBAT1_IN" },
      { "netclass": "Power", "pattern": "VBAT2_IN" },
      { "netclass": "Power", "pattern": "GND" },
      { "netclass": "Rail", "pattern": "+3V3" }
    ]
  },
  "pcbnew": {
    "last_paths": {}, "page_layout_descr_file": ""
  },
  "schematic": { "legacy_lib_dir": "", "legacy_lib_list": [] },
  "sheets": [],
  "text_variables": {}
}
"""

DRU_TEXT = """(version 1)
# fine-pitch exception: VSSOP-8 (U6) 0.5 mm pitch cannot satisfy 0.25 mm
# pad-to-track clearance at its own pads; relax locally, 0.25 mm elsewhere.
(rule "U6 fine pitch"
  (condition "A.intersectsCourtyard('U6') || B.intersectsCourtyard('U6')")
  (constraint clearance (min 0.15mm)))
"""

def main():
    rt = build_board()
    with open(OUT_PRO, "w") as f:
        f.write(PRO_JSON)
    with open(os.path.join(HERE, "co2_timer_v5_altB.kicad_dru"), "w") as f:
        f.write(DRU_TEXT)
    print("wrote project + dru")
    if rt.fail:
        print("FAILURES:", rt.fail)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())



