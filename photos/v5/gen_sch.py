#!/usr/bin/env python3
"""CO2 Timer v5 schematic generator.

Builds co2_timer_v5.kicad_sch implementing NETLIST.md exactly.
Every symbol pin gets a real wire stub terminated by a global label,
a power symbol, a PWR_FLAG, or an explicit no-connect flag.
Runs a geometric self-check so no two different nets ever touch.
"""
import re, uuid, math, os, sys

from hardware_constants import F1_VALUE, R6_VALUE, R13_VALUE, R16_VALUE

KICAD_SYM_DIR = "/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols"
OUT_DIR = "/Users/lucille/greenguard-usa-web/photos/v5"
PROJ = "co2_timer_v5"

def U():
    return str(uuid.uuid4())

# ---------------------------------------------------------------- s-expr utils
def extract_block(txt, header):
    """Return the balanced s-expr block starting at header (e.g. '(symbol "R"')."""
    i = txt.find(header)
    if i < 0:
        return None
    d = 0
    j = i
    in_str = False
    while True:
        c = txt[j]
        if c == '"' and txt[j-1] != '\\':
            in_str = not in_str
        if not in_str:
            if c == '(':
                d += 1
            elif c == ')':
                d -= 1
                if d == 0:
                    break
        j += 1
    return txt[i:j+1]

_lib_cache = {}
def lib_text(lib):
    if lib not in _lib_cache:
        _lib_cache[lib] = open(os.path.join(KICAD_SYM_DIR, lib + ".kicad_sym")).read()
    return _lib_cache[lib]

def lib_symbol_block(lib, name):
    b = extract_block(lib_text(lib), '(symbol "%s"' % name)
    if b is None:
        raise RuntimeError("symbol %s not found in %s" % (name, lib))
    return b

PIN_RE = re.compile(
    r'\(pin\s+(\w+)\s+\w+\s*\(at\s+([-\d.]+)\s+([-\d.]+)\s+(\d+)\)\s*'
    r'\(length\s+([\d.]+)\)(\s*\(hide yes\))?[\s\S]*?\(number\s+"([^"]*)"')

def pins_of(block):
    """[(number, etype, x, y, angle, hidden)] in library coords."""
    out = []
    for m in PIN_RE.finditer(block):
        etype, x, y, a, ln, hide, num = m.groups()
        out.append((num, etype, float(x), float(y), int(a), bool(hide)))
    return out

# ------------------------------------------------------- custom symbols (co2v5)
def _pin(num, name, etype, x, y, ang, ln=2.54):
    return ('\t\t\t(pin %s line\n\t\t\t\t(at %s %s %d)\n\t\t\t\t(length %s)\n'
            '\t\t\t\t(name "%s"\n\t\t\t\t\t(effects (font (size 1.27 1.27)))\n\t\t\t\t)\n'
            '\t\t\t\t(number "%s"\n\t\t\t\t\t(effects (font (size 1.27 1.27)))\n\t\t\t\t)\n'
            '\t\t\t)\n') % (etype, x, y, ang, ln, name, num)

def _prop(name, val, x=0, y=0, hide=True):
    h = "\n\t\t\t\t(hide yes)" if hide else ""
    return ('\t\t\t(property "%s" "%s"\n\t\t\t\t(at %s %s 0)%s\n'
            '\t\t\t\t(effects (font (size 1.27 1.27)))\n\t\t\t)\n') % (name, val, x, y, h)

def box_symbol(name, refpfx, value, footprint, desc, rect, pins):
    """rect=(x1,y1,x2,y2) lib coords; pins=[(num,name,etype,x,y,ang)]"""
    x1, y1, x2, y2 = rect
    s = '\t(symbol "%s"\n' % name
    s += '\t\t(exclude_from_sim no)\n\t\t(in_bom yes)\n\t\t(on_board yes)\n'
    s += _prop("Reference", refpfx, x1, y2 + 1.27, hide=False)
    s += _prop("Value", value, x1, y1 - 1.27, hide=False)
    s += _prop("Footprint", footprint)
    s += _prop("Datasheet", "")
    s += _prop("Description", desc)
    s += '\t\t(symbol "%s_0_1"\n' % name.split(":")[-1]
    s += ('\t\t\t(rectangle\n\t\t\t\t(start %s %s)\n\t\t\t\t(end %s %s)\n'
          '\t\t\t\t(stroke (width 0.254) (type default))\n'
          '\t\t\t\t(fill (type background))\n\t\t\t)\n') % (x1, y2, x2, y1)
    s += '\t\t)\n'
    s += '\t\t(symbol "%s_1_1"\n' % name.split(":")[-1]
    for p in pins:
        s += _pin(*p)
    s += '\t\t)\n\t)\n'
    return s

DS3231M_PINS = [
    # num, name, etype, x, y, ang   (lib coords, y up)
    ("16", "SCL",        "input",          -15.24, 10.16, 0),
    ("15", "SDA",        "bidirectional",  -15.24, 7.62,  0),
    ("4",  "~{RST}",     "bidirectional",  -15.24, 2.54,  0),
    ("1",  "32KHZ",      "open_collector", -15.24, -2.54, 0),
    ("3",  "~{INT}/SQW", "open_collector", -15.24, -7.62, 0),
    ("2",  "VCC",        "power_in",       -2.54,  15.24, 270),
    ("14", "VBAT",       "power_in",        2.54,  15.24, 270),
    ("13", "GND",        "power_in",        0.00, -15.24, 90),
    ("5",  "N.C.",       "passive",         15.24, 10.16, 180),
    ("6",  "N.C.",       "passive",         15.24, 7.62,  180),
    ("7",  "N.C.",       "passive",         15.24, 5.08,  180),
    ("8",  "N.C.",       "passive",         15.24, 2.54,  180),
    ("9",  "N.C.",       "passive",         15.24, 0.00,  180),
    ("10", "N.C.",       "passive",         15.24, -2.54, 180),
    ("11", "N.C.",       "passive",         15.24, -5.08, 180),
    ("12", "N.C.",       "passive",         15.24, -7.62, 180),
]

MCP1703CB_PINS = [
    ("1", "GND",  "power_in",  0.00, -7.62, 90),
    # MCP1703A SOT-23A datasheet pinout: 1=GND, 2=VOUT, 3=VIN.
    ("2", "VOUT", "power_out", -7.62,  0.00, 0),
    ("3", "VIN",  "power_in", 7.62,  0.00, 180),
]

TPS3700_PINS = [
    ("1", "OUTA",  "open_collector", -10.16, -5.08, 0),
    ("2", "GND",   "power_in",        0.00,  10.16, 270),
    ("3", "INA+",  "input",          -10.16,  2.54, 0),
    ("4", "INB-",  "input",          -10.16, -2.54, 0),
    ("5", "VDD",   "power_in",        0.00, -10.16, 90),
    ("6", "OUTB",  "open_collector",  10.16,  5.08, 180),
]

MUX_PINS = [
    ("1", "B2", "bidirectional", -5.08, -2.54, 0),
    ("2", "GND", "power_in",        0.00,  5.08, 270),
    ("3", "B1", "bidirectional", -5.08,  2.54, 0),
    ("4", "A",  "bidirectional",  5.08,  0.00, 180),
    ("5", "VCC", "power_in",        0.00, -5.08, 90),
    ("6", "S",  "input",            5.08, -2.54, 180),
]

SW4_PINS = [
    ("1", "1", "passive", -5.08,  2.54, 0),
    ("2", "2", "passive", -5.08, -2.54, 0),
    ("3", "3", "passive",  5.08,  2.54, 180),
    ("4", "4", "passive",  5.08, -2.54, 180),
]

def attiny_flat():
    """Flattened ATtiny84A-SSU: parent ATtiny24V-10SS geometry, renamed.
    Embedding a derived (extends) symbol does not resolve in a standalone
    schematic, so we flatten it into the project library instead."""
    blk = lib_symbol_block("MCU_Microchip_ATtiny", "ATtiny24V-10SS")
    blk = blk.replace("ATtiny24V-10SS", "ATtiny84A-SSU")
    # correct the Value/Description for the actual part
    blk = blk.replace('"10MHz, 2kB Flash, 128B SRAM, 128B EEPROM, debugWIRE, SOIC-14"',
                      '"20MHz, 8kB Flash, 512B SRAM, 512B EEPROM, debugWIRE, SOIC-14"')
    return blk

def custom_symbols(prefix):
    out = ""
    a = attiny_flat()
    out += a.replace('(symbol "ATtiny84A-SSU"', '(symbol "%sATtiny84A-SSU"' % prefix, 1) + "\n"
    out += box_symbol(prefix + "DS3231M_SO16", "U", "DS3231M_SO16",
                      "Package_SO:SOIC-16W_7.5x10.3mm_P1.27mm",
                      "I2C RTC, SO-16, full 16-pin symbol incl. N.C. pins 5-12 (tied to GND per datasheet)",
                      (-12.7, -12.7, 12.7, 12.7), DS3231M_PINS)
    out += box_symbol(prefix + "MCP1703A-3302E-CB", "U", "MCP1703A-3302E/CB",
                      "Package_TO_SOT_SMD:SOT-23",
                      "250mA 16V LDO 3.3V, SOT-23A: 1=GND 2=VOUT 3=VIN",
                      (-5.08, -5.08, 5.08, 5.08), MCP1703CB_PINS)
    out += box_symbol(prefix + "TPS3700DDCR", "U", "TPS3700DDCR",
                      "Package_TO_SOT_SMD:SOT-23-6",
                      "18V VM supervisor; OUTA undervoltage output, INA+ divider input, INB- grounded",
                      (-7.62, -7.62, 7.62, 7.62), TPS3700_PINS)
    out += box_symbol(prefix + "SN74LVC1G3157", "U", "SN74LVC1G3157DCKR",
                      "Package_TO_SOT_SMD:SOT-363_SC-70-6",
                      "SPDT takeover mux; B2=MCU pass-through, B1=fail-safe level, A=DRV input, S=/VM_OK",
                      (-3.81, -3.81, 3.81, 3.81), MUX_PINS)
    out += box_symbol(prefix + "SW_Push_4P", "SW", "SW_Push_4P",
                      "Button_Switch_SMD:SW_SPST_TL3342",
                      "4-pin SMD tactile switch: pins 1-2 common, 3-4 common",
                      (-2.54, -3.81, 2.54, 3.81), SW4_PINS)
    return out

# ------------------------------------------------------------- symbol registry
# lib_id -> (lib file, source symbol name, parent name or None)
STD = {
    "Device:R": ("Device", "R", None),
    "Device:C": ("Device", "C", None),
    "Device:C_Polarized": ("Device", "C_Polarized", None),
    "Device:D_Schottky": ("Device", "D_Schottky", None),
    "Device:D_Zener": ("Device", "D_Zener", None),
    "Device:Polyfuse": ("Device", "Polyfuse", None),
    "Connector:AVR-ISP-6": ("Connector", "AVR-ISP-6", None),
    "Connector:Barrel_Jack_Switch": ("Connector", "Barrel_Jack_Switch", None),
    "Connector:TestPoint": ("Connector", "TestPoint", None),
    "Connector:Screw_Terminal_01x02": ("Connector", "Screw_Terminal_01x02", None),
    "Connector_Generic:Conn_01x04": ("Connector_Generic", "Conn_01x04", None),
    "Driver_Motor:DRV8871DDA": ("Driver_Motor", "DRV8871DDA", None),
    "power:GND": ("power", "GND", None),
    "power:+3V3": ("power", "+3V3", None),
    "power:PWR_FLAG": ("power", "PWR_FLAG", None),
}

CUSTOM_PINS = {
    "co2v5:ATtiny84A-SSU": None,  # filled below from parent lib block
    "co2v5:DS3231M_SO16": [(n, t, x, y, a, False) for (n, _, t, x, y, a) in DS3231M_PINS],
    "co2v5:MCP1703A-3302E-CB": [(n, t, x, y, a, False) for (n, _, t, x, y, a) in MCP1703CB_PINS],
    "co2v5:TPS3700DDCR": [(n, t, x, y, a, False) for (n, _, t, x, y, a) in TPS3700_PINS],
    "co2v5:SN74LVC1G3157": [(n, t, x, y, a, False) for (n, _, t, x, y, a) in MUX_PINS],
    "co2v5:SW_Push_4P": [(n, t, x, y, a, False) for (n, _, t, x, y, a) in SW4_PINS],
}

CUSTOM_PINS["co2v5:ATtiny84A-SSU"] = pins_of(lib_symbol_block("MCU_Microchip_ATtiny", "ATtiny24V-10SS"))

def get_pins(lib_id):
    if lib_id in CUSTOM_PINS:
        return CUSTOM_PINS[lib_id]
    lib, name, parent = STD[lib_id]
    src = parent if parent else name
    return pins_of(lib_symbol_block(lib, src))

def embedded_lib_symbols():
    chunks = []
    done_parent = set()
    for lib_id, (lib, name, parent) in STD.items():
        blk = lib_symbol_block(lib, name)
        blk = blk.replace('(symbol "%s"' % name, '(symbol "%s"' % lib_id, 1)
        if parent:
            if parent not in done_parent:
                chunks.append(lib_symbol_block(lib, parent))
                done_parent.add(parent)
        chunks.append(blk)
    chunks.append(custom_symbols("co2v5:"))
    return "\n".join(chunks)

# --------------------------------------------------------------- world helpers
def world(px, py, X, Y, rot):
    if rot == 0:
        return (X + px, Y - py)
    if rot == 180:
        return (X - px, Y + py)
    raise ValueError("only rot 0/180 supported")

def outward(ang, rot):
    # direction pointing AWAY from symbol body, in screen coords (y down)
    d = {0: (-1, 0), 180: (1, 0), 90: (0, 1), 270: (0, -1)}[ang]
    if rot == 180:
        d = (-d[0], -d[1])
    return d

def lab_angle(d):
    return {(1, 0): 0, (-1, 0): 180, (0, -1): 90, (0, 1): 270}[d]

def lab_justify(a):
    return "left" if a in (0, 90) else "right"

def fmt(v):
    v = round(v, 4)
    s = ("%.4f" % v).rstrip("0").rstrip(".")
    return s if s not in ("-0", "") else "0"

# ------------------------------------------------------------- schematic build
sym_out = []      # symbol instances
wire_out = []     # wires
label_out = []    # global labels
nc_out = []       # no_connects
text_out = []
# geometry ledger: segments [(x1,y1,x2,y2,net)], points [(x,y,net,desc)]
segs = []
pts = []

STUB = 5.08

def add_wire(x1, y1, x2, y2, net):
    wire_out.append(
        '\t(wire\n\t\t(pts\n\t\t\t(xy %s %s) (xy %s %s)\n\t\t)\n'
        '\t\t(stroke (width 0) (type default))\n\t\t(uuid "%s")\n\t)\n'
        % (fmt(x1), fmt(y1), fmt(x2), fmt(y2), U()))
    segs.append((x1, y1, x2, y2, net))

def add_glabel(net, x, y, ang):
    label_out.append(
        '\t(global_label "%s"\n\t\t(shape passive)\n\t\t(at %s %s %d)\n'
        '\t\t(fields_autoplaced yes)\n'
        '\t\t(effects (font (size 1.27 1.27)) (justify %s))\n\t\t(uuid "%s")\n'
        '\t\t(property "Intersheetrefs" "${INTERSHEET_REFS}"\n\t\t\t(at %s %s 0)\n'
        '\t\t\t(hide yes)\n\t\t\t(effects (font (size 1.27 1.27)))\n\t\t)\n\t)\n'
        % (net, fmt(x), fmt(y), ang, lab_justify(ang), U(), fmt(x), fmt(y)))
    pts.append((x, y, net, "glabel:" + net))

def add_nc(x, y, tag):
    nc_out.append('\t(no_connect\n\t\t(at %s %s)\n\t\t(uuid "%s")\n\t)\n'
                  % (fmt(x), fmt(y), U()))
    pts.append((x, y, "__NC__" + tag, "nc:" + tag))

def add_text(s, x, y, size=2.54):
    text_out.append(
        '\t(text "%s"\n\t\t(exclude_from_sim no)\n\t\t(at %s %s 0)\n'
        '\t\t(effects (font (size %s %s) (bold yes)) (justify left bottom))\n'
        '\t\t(uuid "%s")\n\t)\n' % (s, fmt(x), fmt(y), size, size, U()))

def place(ref, lib_id, X, Y, rot, value, footprint, pinnets, unit=1, extra_props=None):
    """pinnets: {pinnum: net or ('NC',)}; nets get stub+global label."""
    p = []
    p.append('\t(symbol\n\t\t(lib_id "%s")\n\t\t(at %s %s %d)\n\t\t(unit %d)\n'
             % (lib_id, fmt(X), fmt(Y), rot, unit))
    p.append('\t\t(exclude_from_sim no)\n\t\t(in_bom yes)\n\t\t(on_board yes)\n\t\t(dnp no)\n')
    p.append('\t\t(uuid "%s")\n' % U())
    hide_ref = ref.startswith("#")
    p.append('\t\t(property "Reference" "%s"\n\t\t\t(at %s %s 0)\n%s'
             '\t\t\t(effects (font (size 1.27 1.27)))\n\t\t)\n'
             % (ref, fmt(X + 2.54), fmt(Y - 10.16), "\t\t\t(hide yes)\n" if hide_ref else ""))
    p.append('\t\t(property "Value" "%s"\n\t\t\t(at %s %s 0)\n%s'
             '\t\t\t(effects (font (size 1.27 1.27)))\n\t\t)\n'
             % (value, fmt(X + 2.54), fmt(Y + 10.16), "\t\t\t(hide yes)\n" if hide_ref else ""))
    p.append('\t\t(property "Footprint" "%s"\n\t\t\t(at %s %s 0)\n\t\t\t(hide yes)\n'
             '\t\t\t(effects (font (size 1.27 1.27)))\n\t\t)\n' % (footprint, fmt(X), fmt(Y)))
    for pn, pv in (extra_props or {}).items():
        p.append('\t\t(property "%s" "%s"\n\t\t\t(at %s %s 0)\n\t\t\t(hide yes)\n'
                 '\t\t\t(effects (font (size 1.27 1.27)))\n\t\t)\n' % (pn, pv, fmt(X), fmt(Y)))
    p.append('\t)\n')
    sym_out.append("".join(p))

    # wires / labels / ncs for this instance's pins
    seen_at = {}
    for (num, etype, px, py, ang, hidden) in get_pins(lib_id):
        if num not in pinnets:
            continue
        net = pinnets[num]
        wx, wy = world(px, py, X, Y, rot)
        key = (round(wx, 3), round(wy, 3))
        if key in seen_at:
            # stacked pins (e.g. DRV8871 hidden 7/9 on GND): one stub is enough
            assert seen_at[key] == net, "stacked pins with different nets at %s" % (key,)
            continue
        seen_at[key] = net
        pts.append((wx, wy, net if net != ("NC",) else "__NC__%s.%s" % (ref, num),
                    "pin:%s.%s" % (ref, num)))
        if net == ("NC",):
            add_nc(wx, wy, "%s.%s" % (ref, num))
            continue
        dx, dy = outward(ang, rot)
        ex, ey = wx + dx * STUB, wy + dy * STUB
        add_wire(wx, wy, ex, ey, net)
        add_glabel(net, ex, ey, lab_angle((dx, dy)))

def place_power(ref, lib_id, X, Y, value, net=None):
    """power symbol / PWR_FLAG: pin is at origin (X,Y). net defaults to value."""
    place(ref, lib_id, X, Y, 0, value, "", {})
    pts.append((X, Y, net or value, "pwr:" + ref))

# ------------------------------------------------------------------ placements
R_FP = "Resistor_SMD:R_0603_1608Metric"
C_FP = "Capacitor_SMD:C_0603_1608Metric"
C0805_FP = "Capacitor_SMD:C_0805_2012Metric"
C1206_FP = "Capacitor_SMD:C_1206_3216Metric"
SMA_FP = "Diode_SMD:D_SMA"
SOD323_FP = "Diode_SMD:D_SOD-323"
SOT23_FP = "Package_TO_SOT_SMD:SOT-23"
TERM_FP = "TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal"
SC1_FP = "co2v5:CP_CHP_10x5_P7.50mm"
SW_FP = "co2v5:PTS645SM43SMTR92LFS"

r1, r2, r3, r4, r5 = 38.1, 111.76, 182.88, 254.0, 325.12

def R(ref, x, y, val, n1, n2, fp=R_FP):
    place(ref, "Device:R", x, y, 0, val, fp, {"1": n1, "2": n2})

def C(ref, x, y, val, n1, n2, fp=C_FP):
    place(ref, "Device:C", x, y, 0, val, fp, {"1": n1, "2": n2})

def D(ref, x, y, val, nK, nA, fp=SOT23_FP, kind="Device:D_Schottky"):
    # rot 180 -> anode on the LEFT, cathode on the RIGHT
    place(ref, kind, x, y, 180, val, fp, {"1": nK, "2": nA})

# --- Row 1: power input, OR-ing, fuse, TVS, bulk, LDO
add_text("POWER INPUT / OR-ING / FUSE / LDO", 12.7, r1 - 20.32)
place("J1", "Connector:Screw_Terminal_01x02", 25.4, r1, 0, "BAT1_9V", TERM_FP,
      {"1": "VBAT1_IN", "2": "GND"})
D("D1", 63.5, r1, "SS34", "VIN_OR", "VBAT1_IN", fp=SMA_FP)
place("J6", "Connector:Screw_Terminal_01x02", 101.6, r1, 0, "BAT2_9V", TERM_FP,
      {"1": "VBAT2_IN", "2": "GND"})
D("D5", 139.7, r1, "SS34", "VIN_OR", "VBAT2_IN", fp=SMA_FP)
place("J5", "Connector:Barrel_Jack_Switch", 177.8, r1, 0, "DC_9-12V",
      "co2v5:BarrelJack_CUI_PJ-002A",
      {"1": "VIN_DC", "2": "GND", "3": "GND"})
D("D4", 215.9, r1, "SS34", "VIN_OR", "VIN_DC", fp=SMA_FP)
place("F1", "Device:Polyfuse", 254.0, r1, 0, F1_VALUE,
      "Fuse:Fuse_1812_4532Metric", {"1": "VIN_OR", "2": "VM"})
place("TVS1", "Device:D_Zener", 292.1, r1, 0, "SMAJ15A", SMA_FP,
      {"1": "VIN_DC", "2": "GND"})
place("TVS2", "Device:D_Zener", 330.2, r1, 0, "SMAJ15A", SMA_FP,
      {"1": "VM", "2": "GND"})
place("C1", "Device:C_Polarized", 368.3, r1, 0, "1000uF 25V 105C low-ESR",
      "Capacitor_THT:CP_Radial_D10.0mm_P5.00mm", {"1": "VM", "2": "GND"})
place("C19", "Device:C_Polarized", 393.7, r1, 0, "1000uF 25V 105C low-ESR",
      "Capacitor_THT:CP_Radial_D10.0mm_P5.00mm", {"1": "VM", "2": "GND"})
place("U3", "co2v5:MCP1703A-3302E-CB", 406.4, r1, 0, "MCP1703A-3302E/CB", SOT23_FP,
      {"1": "GND", "2": "+3V3", "3": "VM"})
C("C2", 444.5, r1, "1uF X7R 25V", "VM", "GND", fp=C0805_FP)
C("C3", 482.6, r1, "1uF X7R 16V", "+3V3", "GND", fp=C0805_FP)
C("C12", 520.7, r1, "10uF X7R 16V", "+3V3", "GND", fp=C0805_FP)

# --- Row 2: MCU, ISP, display header, battery sense divider, power flags
add_text("MCU / ISP / DISPLAY / VM SENSE", 12.7, r2 - 40.64)
place("U1", "co2v5:ATtiny84A-SSU", 50.8, r2, 0, "ATtiny84A-SSU",
      "Package_SO:SOIC-14_3.9x8.7mm_P1.27mm",
      {"1": "+3V3", "2": "DRV_IN1_MCU", "3": "DRV_IN2_MCU", "4": "/RESET",
       "5": "/ALERT", "6": "TM_DIO", "7": "SDA", "8": "MISO", "9": "SCL",
       "10": "TM_CLK", "11": "BTN_SET", "12": "BTN_UP", "13": "VM_SENSE",
       "14": "GND"})
place("J3", "Connector:AVR-ISP-6", 127.0, r2, 0, "AVR-ISP-6 (DNP prod)",
      "Connector_PinHeader_2.54mm:PinHeader_2x03_P2.54mm_Vertical",
      {"1": "MISO", "2": "+3V3", "3": "SCL", "4": "SDA", "5": "/RESET", "6": "GND"})
place("TP1", "Connector:TestPoint", 165.1, r2, 0, "TP_MISO",
      "TestPoint:TestPoint_Pad_D1.5mm", {"1": "MISO"})
C("C6", 190.5, r2, "100nF X7R", "+3V3", "GND")
R("R1", 215.9, r2, "10K", "/RESET", "+3V3")
place("J4", "Connector_Generic:Conn_01x04", 254.0, r2, 0, "TM1637_DISPLAY",
      "Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical",
      {"1": "+3V3", "2": "GND", "3": "TM_DIO", "4": "TM_CLK"})
R("R7", 292.1, r2, "100K 1%", "VM", "VM_SENSE")
R("R8", 330.2, r2, "33K 1%", "VM_SENSE", "GND")
C("C14", 368.3, r2, "100nF X7R", "VM_SENSE", "GND")
place("TP3", "Connector:TestPoint", 406.4, r2, 0, "TP_VM",
      "TestPoint:TestPoint_Pad_D1.5mm", {"1": "VM"})

# power structures
add_text("POWER FLAGS", 434.34, r2 - 20.32, size=1.778)
# GND: PWR_FLAG ---- GND symbol
place_power("#FLG01", "power:PWR_FLAG", 444.5, r2, "PWR_FLAG", net="GND")
place_power("#PWR01", "power:GND", 454.66, r2, "GND")
add_wire(444.5, r2, 454.66, r2, "GND")
# +3V3: symbol ---- global label
place_power("#PWR02", "power:+3V3", 472.44, r2, "+3V3")
add_wire(472.44, r2, 472.44, r2 + 5.08, "+3V3")
add_glabel("+3V3", 472.44, r2 + 5.08, 270)
# VM: PWR_FLAG ---- global label
place_power("#FLG02", "power:PWR_FLAG", 495.3, r2, "PWR_FLAG", net="VM")
add_wire(495.3, r2, 505.46, r2, "VM")
add_glabel("VM", 505.46, r2, 0)
# VBAT_RTC: PWR_FLAG ---- global label
place_power("#FLG03", "power:PWR_FLAG", 520.7, r2, "PWR_FLAG", net="VBAT_RTC")
add_wire(520.7, r2, 530.86, r2, "VBAT_RTC")
add_glabel("VBAT_RTC", 530.86, r2, 0)

# --- Row 3: RTC + backup supercap + pull-ups, supervisor
add_text("RTC + SUPERCAP BACKUP / VM SUPERVISOR", 12.7, r3 - 33.02)
place("U2", "co2v5:DS3231M_SO16", 50.8, r3, 0, "DS3231M+TRL",
      "Package_SO:SOIC-16W_7.5x10.3mm_P1.27mm",
      {"16": "SCL", "15": "SDA", "4": ("NC",), "1": ("NC",), "3": "/ALERT",
       "2": "+3V3", "14": "VBAT_RTC", "13": "GND",
       "5": "GND", "6": "GND", "7": "GND", "8": "GND",
       "9": "GND", "10": "GND", "11": "GND", "12": "GND"})
C("C7", 114.3, r3, "100nF X7R", "+3V3", "GND")
R("R2", 139.7, r3, "10K", "SDA", "+3V3")
R("R3", 165.1, r3, "10K", "SCL", "+3V3")
R("R4", 190.5, r3, "10K", "/ALERT", "+3V3")
R("R5", 215.9, r3, "220R", "+3V3", "VBAT_CHG")
D("D2", 254.0, r3, "BAT54", "VBAT_RTC", "VBAT_CHG", fp=SOD323_FP)
place("SC1", "Device:C_Polarized", 292.1, r3, 0, "0.1F 5.5V CHP5R5L104R-TW",
      SC1_FP, {"1": "VBAT_RTC", "2": "GND"})
place("U5", "co2v5:TPS3700DDCR", 342.9, r3, 0, "TPS3700DDCR", "Package_TO_SOT_SMD:SOT-23-6",
      {"1": "/VM_OK", "2": "GND", "3": "VM_DIV", "4": "GND", "5": "VM", "6": ("NC",)})
C("C9", 381.0, r3, "100nF X7R", "VM", "GND")
D("D3", 419.1, r3, "BAT54", "/VM_OK", "/ALERT", fp=SOD323_FP)
place("TP2", "Connector:TestPoint", 457.2, r3, 0, "TP_SUPV",
      "TestPoint:TestPoint_Pad_D1.5mm", {"1": "/VM_OK"})
R("R13", 482.6, r3, R13_VALUE, "VM", "VM_DIV")
R("R16", 508.0, r3, R16_VALUE, "VM_DIV", "GND")
R("R17", 533.4, r3, "100K", "/VM_OK", "GND")
R("R18", 558.8, r3, "10K", "/VM_OK", "+3V3")

# --- Row 4: motor driver + solenoid + fail-safe mux takeover
add_text("SOLENOID DRIVER / FAIL-SAFE MUX TAKEOVER", 12.7, r4 - 33.02)
place("U4", "Driver_Motor:DRV8871DDA", 50.8, r4, 0, "DRV8871DDAR",
      "Package_SO:Texas_HTSOP-8-1EP_3.9x4.9mm_P1.27mm_EP2.95x4.9mm_Mask2.4x3.1mm_ThermalVias",
      {"1": "GND", "2": "DRV_IN2", "3": "DRV_IN1", "4": "ILIM", "5": "VM",
       "6": "SOL_OUT1", "7": "GND", "8": "SOL_OUT2", "9": "GND"})
R("R6", 114.3, r4, R6_VALUE, "ILIM", "GND")
C("C4", 139.7, r4, "10uF X7R 25V", "VM", "GND", fp=C1206_FP)
C("C5", 165.1, r4, "100nF X7R 25V", "VM", "GND")
R("R14", 190.5, r4, "100K", "DRV_IN1", "GND")
R("R15", 215.9, r4, "100K", "DRV_IN2", "GND")
place("U6", "co2v5:SN74LVC1G3157", 342.9, r4, 0, "SN74LVC1G3157DCKR", "Package_TO_SOT_SMD:SOT-363_SC-70-6",
      {"1": "DRV_IN1_MCU", "2": "GND", "3": "GND", "4": "DRV_IN1", "5": "+3V3", "6": "/VM_OK"})
place("U7", "co2v5:SN74LVC1G3157", 393.7, r4, 0, "SN74LVC1G3157DCKR", "Package_TO_SOT_SMD:SOT-363_SC-70-6",
      {"1": "DRV_IN2_MCU", "2": "GND", "3": "+3V3", "4": "DRV_IN2", "5": "+3V3", "6": "/VM_OK"})
place("J2", "Connector:Screw_Terminal_01x02", 281.94, r4, 0, "SOLENOID", TERM_FP,
      {"1": "SOL_OUT1", "2": "SOL_OUT2"})
C("C18", 444.5, r4, "100nF X7R", "+3V3", "GND")

# --- Row 5: buttons
add_text("BUTTONS (RC DEBOUNCE + ESD SERIES R)", 12.7, r5 - 20.32)
place("SW1", "co2v5:SW_Push_4P", 50.8, r5, 0, "UP",
      SW_FP,
      {"1": "BTN_UP_SW", "2": "BTN_UP_SW", "3": "GND", "4": "GND"})
R("R11", 88.9, r5, "10K", "BTN_UP_SW", "+3V3")
R("R9", 114.3, r5, "100R", "BTN_UP_SW", "BTN_UP")
C("C10", 139.7, r5, "100nF X7R", "BTN_UP", "GND")
place("SW2", "co2v5:SW_Push_4P", 190.5, r5, 0, "SET",
      SW_FP,
      {"1": "BTN_SET_SW", "2": "BTN_SET_SW", "3": "GND", "4": "GND"})
R("R12", 228.6, r5, "10K", "BTN_SET_SW", "+3V3")
R("R10", 254.0, r5, "100R", "BTN_SET_SW", "BTN_SET")
C("C11", 279.4, r5, "100nF X7R", "BTN_SET", "GND")

# --------------------------------------------------------- geometric self-check
def on_seg(px, py, s):
    x1, y1, x2, y2, _ = s
    if abs((x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)) > 1e-6:
        return False
    return (min(x1, x2) - 1e-6 <= px <= max(x1, x2) + 1e-6 and
            min(y1, y2) - 1e-6 <= py <= max(y1, y2) + 1e-6)

errors = []
# point vs point (different nets at identical location)
seen_pts = {}
for (x, y, net, desc) in pts:
    key = (round(x, 3), round(y, 3))
    if key in seen_pts and seen_pts[key][0] != net:
        errors.append("POINT CLASH at %s: %s(%s) vs %s(%s)" %
                      (key, seen_pts[key][1], seen_pts[key][0], desc, net))
    else:
        seen_pts.setdefault(key, (net, desc))
# point on foreign segment
for (x, y, net, desc) in pts:
    for s in segs:
        if s[4] != net and on_seg(x, y, s):
            errors.append("POINT %s (%s) lies on %s wire %s" % (desc, net, s[4], s[:4]))
# segment endpoint on foreign segment + collinear overlap
for i, a in enumerate(segs):
    for b in segs[i+1:]:
        if a[4] == b[4]:
            continue
        for (px, py) in ((a[0], a[1]), (a[2], a[3])):
            if on_seg(px, py, b):
                errors.append("SEG TOUCH %s(%s) endpoint on %s(%s)" % (a[:4], a[4], b[:4], b[4]))
        for (px, py) in ((b[0], b[1]), (b[2], b[3])):
            if on_seg(px, py, a):
                errors.append("SEG TOUCH %s(%s) endpoint on %s(%s)" % (b[:4], b[4], a[:4], a[4]))
if errors:
    print("GEOMETRY ERRORS:")
    for e in errors:
        print("  " + e)
    sys.exit(1)
print("geometry self-check OK: %d wires, %d labels, %d points" %
      (len(segs), len(label_out), len(pts)))

# --------------------------------------------------------------------- assemble
sch = []
sch.append('(kicad_sch\n\t(version 20250114)\n\t(generator "eeschema")\n'
           '\t(generator_version "10.0")\n\t(uuid "%s")\n\t(paper "A2")\n' % U())
sch.append('''\t(title_block
\t\t(title "GreenGuard CO2 Trap Timer")
\t\t(date "2026-08-11")
\t\t(rev "5.0")
\t\t(company "GreenGuard USA")
\t\t(comment 1 "ATtiny84A + DS3231M(+supercap) + TM1637 + DRV8871 bistable solenoid")
\t\t(comment 2 "HW fail-safe: TPS3700 VM supervisor -> /VM_OK selects two SN74LVC1G3157 muxes for deterministic takeover")
\t\t(comment 3 "All 9V/12V sources OR-ed (SS34) then fused (F1); C1+C19 are 2x1000uF VM reservoir/sag support")
\t\t(comment 4 "Netlist authority: NETLIST.md Rev 2026-08-11")
\t)
''')
sch.append('\t(lib_symbols\n')
sch.append(embedded_lib_symbols())
sch.append('\t)\n')
for chunk in (wire_out, nc_out, label_out, text_out, sym_out):
    sch.extend(chunk)
sch.append('\t(sheet_instances\n\t\t(path "/"\n\t\t\t(page "1")\n\t\t)\n\t)\n')
sch.append('\t(embedded_fonts no)\n)\n')

os.makedirs(OUT_DIR, exist_ok=True)
out_path = os.path.join(OUT_DIR, PROJ + ".kicad_sch")
open(out_path, "w").write("".join(sch))
print("wrote", out_path, len("".join(sch)), "bytes")

# project sym-lib-table for the co2v5 custom library
open(os.path.join(OUT_DIR, "sym-lib-table"), "w").write(
    '(sym_lib_table\n  (version 7)\n'
    '  (lib (name "co2v5")(type "KiCad")(uri "${KIPRJMOD}/co2v5.kicad_sym")(options "")(descr "CO2 timer v5 project symbols"))\n)\n')

# standalone custom library file
open(os.path.join(OUT_DIR, "co2v5.kicad_sym"), "w").write(
    '(kicad_symbol_lib\n\t(version 20241209)\n\t(generator "kicad_symbol_editor")\n'
    '\t(generator_version "10.0")\n' + custom_symbols("") + ')\n')
print("wrote co2v5.kicad_sym + sym-lib-table")
