# CO2 Trap Timer v3 — Fabrication Specification

**GreenGuard USA | Timer-001 Rev 3.0 | 2026-06-09**

---

## PCB Fabrication

| Parameter | Requirement |
|---|---|
| Board dimensions | 70 × 50 mm |
| Layers | 2 (F.Cu + B.Cu) |
| Material | FR-4, Tg ≥ 130°C |
| Board thickness | 1.6 mm |
| Copper weight | 1 oz (35 µm) both layers |
| Min trace width | 0.20 mm |
| Min trace spacing | 0.20 mm |
| Min drill (PTH) | 0.30 mm drill / 0.50 mm pad |
| Min drill (NPTH) | 0.80 mm |
| Surface finish | HASL lead-free (or ENIG on request) |
| Solder mask | Green, both sides |
| Silkscreen | White, both sides |
| IPC class | Class 2 |
| Edge finish | Routed, no V-score |
| Controlled impedance | None required |
| Board quantity | 10 |

---

## PCB Assembly

| Parameter | Requirement |
|---|---|
| SMT side | Top (F.Cu) only |
| SMT components | U2, U3, U4, F1, R1–R7, C2–C4 |
| THT components | D1–D5, SW1, SW2, C1, J1, J2, J4, J5, J6 (turnkey) + U1_SOCKET (turnkey) + U1 (consignment) — **J3 = DNP, do not install** |
| THT assembly | Turnkey for all THT except U1. U1 supplied pre-programmed by buyer — shop installs only |
| Solder paste | SAC305 or equivalent no-clean |
| Reflow profile | Per IPC J-STD-020, component Tg ≥ 260°C peak |
| IPC class | Class 2 |

### Special assembly notes

- **U4 (DRV8833PWP, TSSOP-16):** Exposed pad (EP) on underside must be soldered to the thermal pad on B.Cu. Confirm reflow profile achieves paste collapse under EP. Cold or missing EP solder will cause U4 to fail under solenoid load.
- **U1 (ATtiny84A-20PU, DIP-14):** Consignment — buyer supplies pre-programmed chips. Do not source. **Install U1_SOCKET only** (DIP-14, 0.3" row spacing, 3M 4814-3000-CP or equivalent), then seat the buyer-supplied pre-programmed chip into the socket at assembly. Do not solder U1 directly — socket allows field firmware updates. Buyer ships programmed chips to CM before assembly begins.
  - **J3 ISP header is non-functional in v3:** J3 is wired to PB0/PB1/PB2, not ATtiny84A ISP pins (PA4/PA5/PA6). Do not attempt in-circuit programming via J3. Buyer programs all chips in a ZIF socket before shipment. See `firmware/README.md` for ZIF wiring. This is a known issue deferred to v4.
- **C1 (100 µF electrolytic):** Observe polarity. Positive lead to square pad (marked + on silkscreen).
- **D1–D5 (1N4007):** Observe polarity. Cathode band to square pad per silkscreen marking. D1/D4/D5 form an OR-diode power input network — reversed diodes will block input power.
- **J1, J2, J6 (screw terminals):** Angled connectors; opening faces PCB edge.
- **CPL note:** Use `co2_timer_v3_CPL_SMT.csv` for the SMT placement file — the original `co2_timer_v3_CPL.csv` includes THT references and must not be sent to the SMT line. THT assembly is covered in `co2_timer_v3_THT_assembly.md`.

---

## Mechanical

| Parameter | Value |
|---|---|
| Mounting holes | 4× M3 clearance (3.2 mm dia), 4× 10 mm standoffs |
| Mounting hole positions | 3 mm from each corner |
| Target enclosure | Hammond 1554CGY (120 × 65 × 40 mm ABS) |
| PCB clearance in enclosure | 21 mm L/R, 3.5 mm T/B |

---

## Gerber File Index

| File | Layer |
|---|---|
| `co2 timer v3-F_Cu.gbr` | Front copper |
| `co2 timer v3-B_Cu.gbr` | Back copper |
| `co2 timer v3-F_Mask.gbr` | Front solder mask |
| `co2 timer v3-B_Mask.gbr` | Back solder mask |
| `co2 timer v3-F_Paste.gbr` | Front solder paste (stencil) |
| `co2 timer v3-F_Silkscreen.gbr` | Front silkscreen |
| `co2 timer v3-B_Silkscreen.gbr` | Back silkscreen |
| `co2 timer v3-Edge_Cuts.gbr` | Board outline |
| `co2 timer v3-PTH.drl` | Plated through-holes |
| `co2 timer v3-NPTH.drl` | Non-plated holes |

---

## DRC Status (as of 2026-06-09)

- Unconnected nets: **0**
- Physical violations: **0**
- Informational only: 39 (lib_footprint_mismatch, via_dangling, copper_edge_clearance — all pre-existing, non-critical)
- Tool: KiCad 10.0.3 DRC
