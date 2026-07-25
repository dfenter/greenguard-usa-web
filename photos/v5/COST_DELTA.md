# CO2 Timer v3 -> v5 Cost Delta

GreenGuard USA | Timer-001 | BOM Engineer output | 2026-07-09

All costs are estimated unit cost @ qty 200. v3 costs derived from v3 BOM + typical Digi-Key/LCSC pricing.

---

## Summary

| Metric | v3 | v5 | Delta |
|--------|----|----|-------|
| Estimated BOM cost @ qty200 | ~$8.10 | ~$10.28 | +$2.18 (+27%) |
| Component count (installed) | 31 (incl. DIP socket) | 48 (excl. J3 DNP) | +17 |
| SMT parts | 12 | 36 | +24 |
| THT parts | 19 | 12 | -7 |
| New ICs | — | U5 supervisor, U6 one-shot | +2 |
| New passives | — | SC1 supercap, R9-R16, C8-C14 | +15 |

---

## Line-by-Line Changes

### Removed (v3 only)

| v3 RefDes | Part | Reason Removed | v3 Cost |
|-----------|------|---------------|---------|
| U1 (DIP-14) | ATtiny84A-PU + DIP-14 socket | Replaced by SOIC-14 (U1 + U1_SOCKET removed) | ~$1.55 + $0.30 = $1.85 |
| U4 (v3) | DRV8833PWP TSSOP-16 | Replaced by DRV8871DDAR HSOP-8 (single H-bridge, simpler, solenoid-optimized) | ~$1.50 |
| D1-D5 (1N4007 THT x5) | 1N4007 DO-41 | Replaced by SS34 SMA Schottky (lower V_F, SMT, faster switching); D3 was flyback (removed — DRV8871 has internal clamp, verify if additional flyback needed) | ~$0.08 x5 = $0.40 |
| C1 (v3) | 100uF/16V electrolytic | Upsized to 470uF for larger solenoid pulse reservoir | ~$0.30 |
| SW1/SW2 (v3 THT) | PTS645SM43SMTR92LFS THT 6x6 | Same MPN but THT; v5 uses SMD version | same MPN, minor cost parity |
| R5, R7 (v3 4K7) | Pull-down/misc resistors | Some rationalized; see v5 R-map | ~$0.02 each |

### Added (v5 only)

| v5 RefDes | Part | Reason Added | v5 Cost |
|-----------|------|-------------|---------|
| U5 TPS3839K33DBZR | Voltage supervisor 2.93V | Safety: closes solenoid on supply collapse even with MCU dead | +$0.62 |
| U6 SN74LVC1G123DCUR | One-shot monostable | Drives CLOSE pulse to DRV8871 on U5 trip; ~47ms hardware guarantee | +$0.38 |
| SC1 1F/5.5V supercap | Eaton PB-5R0V105-R | RTC VBAT backup; replaces implied coin cell (which was absent in v3/v4) | +$0.85 |
| D2, D3, D6 BAT54 x3 | BAT54 SOD-123 Schottky | Trickle-charge isolation (D2), supervisor /ALERT isolation (D3), one-shot OR (D6) | +$0.30 total |
| TVS1, TVS2 SMAJ15A x2 | SMAJ15A SMA TVS | Transient protection at J5 input and VM rail; missing from v3 | +$0.36 total |
| C9 470nF | One-shot Cext timing | U6 timing network | +$0.04 |
| C12 10uF 0805 | 3.3V bulk cap | 3.3V rail hold-up; v3 lacked dedicated bulk on 3.3V | +$0.08 |
| C13, C14 100nF x2 | U5/ADC decoupling | Standard decoupling for new ICs | +$0.04 |
| R6 43K | DRV8871 ILIM set | Current limiting for DRV8871; DRV8833 did not require this | +$0.02 |
| R7/R8 100K/33K | VM ADC divider | Battery monitoring (new feature in v5) | +$0.04 |
| R9-R12 (100R ESD + 10K pull-up x2) | Button ESD/pull-up | Added proper ESD series R + explicit pull-ups (v3 used internal MCU pull-ups only) | +$0.08 |
| R13 100K | U6 Rext | One-shot timing | +$0.02 |
| R14, R15, R16 | DRV8871 pull-downs + isolation | Prevent rogue valve open during MCU reset/ISP; safe diode-OR from one-shot | +$0.06 |
| R5 220R (v5) | Supercap trickle | Trickle-charge current limit for SC1 | +$0.02 (v3 had no supercap circuit) |

### Changed (same function, different part)

| v3 | v5 | Change | Cost Delta |
|----|----|----|------------|
| ATtiny84A-PU DIP-14 + socket | ATtiny84A-SSU SOIC-14 | Eliminates DIP socket ($0.30), reduces board area, enables full SMT assembly | -$0.30 socket, chip ~same: net ~-$0.20 |
| DRV8833PWP TSSOP-16 dual H-bridge | DRV8871DDAR HSOP-8 single H-bridge | Simpler footprint, solenoid-optimized current limiting, lower cost | -$0.40 |
| 1N4007 THT Schottky x5 | SS34 SMA Schottky x3 (D1, D4, D5) | SMT; lower V_F (0.5V vs 1.1V) saves ~0.3V VM headroom per OR diode; reduced from 5 to 3 (D2/D3 are new BAT54 for new circuits; D3 v3 flyback removed as DRV8871 has internal recirculation diodes) | -$0.20 net (SMT Schottky cheaper at qty) |
| 0805 resistors + caps | 0603 resistors + caps (most) | Lower cost at LCSC; 0603 is JLCPCB basic library preference; 0805 retained only where voltage/current requires (C2/C3 LDO caps, C4 VM bulk) | -$0.05 approx |
| 100uF/16V C1 | 470uF/16V C1 | Larger reservoir for faster/heavier solenoid; Panasonic EEU-FR1C series 105C | +$0.25 |

---

## Where the $2.18 Goes

| Category | Delta |
|----------|-------|
| U5 supervisor + U6 one-shot (safety hardware) | +$1.00 |
| SC1 supercap (RTC backup, was absent in v3) | +$0.85 |
| TVS1 + TVS2 (transient protection, absent in v3) | +$0.36 |
| Additional diodes (D2/D3/D6 BAT54) | +$0.30 |
| Additional passives (R/C for new circuits) | +$0.27 |
| Savings: DIP->SOIC U1 (no socket), DRV8833->DRV8871, 1N4007->SS34, 0805->0603 | -$0.60 |
| **Net** | **+$2.18** |

---

## Cost vs. Target

Target range: $9.50-$11.50/unit @ qty 100-500.  
Estimated v5 BOM @ qty 200: **$10.28** — within target.  
At qty 100 (LCSC price tier ~15-20% higher for some parts): ~$11.20 — still within upper bound.  
At qty 500 (price breaks on U1/U2/passives): ~$9.40 — slightly below lower bound (favorable).

The $2.18 delta vs. v3 is justified entirely by safety features absent in v3:
1. Hardware solenoid-close guarantee on supply collapse (U5 + U6) — prevents CO2 leak if batteries die suddenly
2. RTC backup that actually works (supercap SC1 — v3/v4 had DS3231M VBAT wired wrong AND no backup supply)
3. Transient protection on VM and barrel input (absent in v3)
4. Corrected DS3231M wiring (v3/v4 silicon defect, zero cost fix)

---

## LCSC TBD-verify Items (must resolve before submitting to JLCPCB)

1. U5 TPS3839K33DBZR — search TI SOT-23-3 supervisor at LCSC; if unavailable, MCP809 SOT-23 is close substitute (verify pin order differs from TPS3839 before PCB layout)
2. SC1 1F/5.5V supercap — Eaton PB-5R0V105-R; confirm LCSC availability or substitute KEMET FT0H105ZF; both are D14/P5mm radial but verify body height fits Hammond 1554CGY 40mm internal height with PCB standoffs
3. C1 470uF EEU-FR1C471B — confirm LCSC stock; C TBD-verify means LCSC part number was not confirmed at BOM compile time
4. C9 470nF 0603 — common value; confirm C1525 or equivalent
5. R6 43K 1%, R8 33K 1% — 1% 0603 at these values is LCSC basic catalog; verify against RC0603FR series
6. J5 DC-005 barrel: confirm DC-005 footprint LCSC part matches CUI PJ-002A footprint pin-for-pin (center tip, sleeve, switch); dozens of DC-005 clones exist on LCSC with identical PCB footprints
