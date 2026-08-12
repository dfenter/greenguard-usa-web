# CO2 Timer v5 — Luna 5.6 xhigh Adversarial Pre-Fabrication Review

Date: 2026-08-11 | Reviewer: codex exec --profile luna, effort xhigh, read-only | Verdict: HOLD

Verdict is HOLD. I found multiple independent blockers. The pad oracle passes, but it compares the PCB against a project-authored expected file; that expected file contains the same U3 error.

1. **BLOCKER — U3 MCP1703A VIN/VOUT are reversed.**

   Evidence: [BOM line 4](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5_BOM.csv:4), [NETLIST line 120](/Users/lucille/greenguard-usa-web/photos/v5/NETLIST.md:120), [PCB pad 2](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5.kicad_pcb:1567), [PCB pad 3](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5.kicad_pcb:1653).

   Fact: Microchip’s SOT-23A pinout is 1=GND, 2=VOUT, 3=VIN—not 2=VIN, 3=VOUT. [MCP1703A datasheet](https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP1703-Data-Sheet-DS20005122.pdf).

   VM is connected to the actual VOUT pin and +3V3 to actual VIN. Applying 9–12 V to the output can destroy U3 and leaves the 3.3 V rail unregulated. This is a board-killing v3/v4-class error.

2. **BLOCKER — C1 cannot accept its specified Panasonic part.**

   Evidence: [BOM line 17](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5_BOM.csv:17), [schematic footprint line 7140](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5.kicad_sch:7140), [PCB footprint line 2892](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5.kicad_pcb:2892), [PCB pads at 3.5 mm pitch](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5.kicad_pcb:2966).

   Fact: EEU-FR1C471B is 470 µF, 8 mm body diameter, 5.0 mm lead pitch. [Panasonic part page](https://industrial.panasonic.com/ww/products/pt/aluminum-cap-lead/models/EEUFR1C471B).

   The PCB is D8/P3.5. The reservoir either cannot be inserted, is installed with bent/stressed leads, or is omitted. The claimed brownout reservoir is therefore absent or uncontrolled.

3. **BLOCKER — SC1 supercap footprint and rating are wrong.**

   Evidence: [BOM line 31](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5_BOM.csv:31), [NETLIST backup path](/Users/lucille/greenguard-usa-web/photos/v5/NETLIST.md:191), [PCB SC1 footprint](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5.kicad_pcb:2798).

   Fact: Eaton PB-5R0V105-R is 1 F, maximum working voltage 5.0 V, approximately 8.5 mm diameter, 11.8 mm lead pitch. [Eaton PB datasheet](https://www.eaton.com/content/dam/eaton/products/electronic-components/resources/data-sheet/eaton-pb%20supercapacitors-cylindrical-pack-data-sheet.pdf).

   The PCB is D5/P2, while the specified part is approximately 8.5 mm/P11.8. It cannot fit. RTC backup will be missing. The BOM also incorrectly calls it 5.5 V. The 60-second test does not validate the claimed multi-day backup; Eaton specifies approximately 12 µA nominal leakage for the 1 F part, which is roughly 17 hours from 3.05 V to 2.3 V before considering tolerance.

4. **BLOCKER — D2/D3/D6 package identity is contradictory.**

   Evidence: [BOM lines 9–10 and 13](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5_BOM.csv:9), [PCB D2 footprint](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5.kicad_pcb:2720), [PCB D3 footprint](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5.kicad_pcb:4119), [CPL lines 16–20](/Users/lucille/greenguard-usa-web/photos/v5/fab_package/co2_timer_v5_CPL_SMT.csv:16).

   Fact: BAT54WS-7-F is SOD323, not SOD123 or SOT-23. [Diodes BAT54WS datasheet](https://www.diodes.com/datasheet/download/BAT54WS.pdf).

   BOM says SOD-123, CPL says SOT-23, PCB uses a custom SOT-23 geometry, and the MPN is SOD323. D2 may leave SC1 uncharged; D3/D6 may leave the supervisor-to-alert or hardware-close path open.

5. **BLOCKER — The supervisor cannot guarantee a close pulse during a normal supply brownout.**

   Evidence: [U5 monitors +3V3](/Users/lucille/greenguard-usa-web/photos/v5/NETLIST.md:225), [claimed operation](/Users/lucille/greenguard-usa-web/photos/v5/NETLIST.md:268), [test expects U5 trip near VM=3.2–3.3 V](/Users/lucille/greenguard-usa-web/photos/v5/fab_package/TEST_PROCEDURE.md:203), [test admits DRV8871 needs VM above 6.5 V](/Users/lucille/greenguard-usa-web/photos/v5/fab_package/TEST_PROCEDURE.md:205).

   Fact: DRV8871 recommended VM is 6.5–45 V and UVLO disables the bridge around 6.1–6.4 V. [DRV8871 datasheet](https://www.ti.com/lit/ds/symlink/drv8871.pdf).

   With a collapsing supply, the MCP1703A output does not fall to the TPS3839 2.93 V threshold until its input is near dropout—roughly 3–4 V, already far below DRV8871 operating voltage. If VM remains above 6.5 V, the LDO output remains regulated and U5 does not trip. A dead battery can therefore leave the valve open.

6. **BLOCKER — Hardware fail-safe does not detect a dead or hung MCU with healthy rails.**

   Evidence: [U5 only monitors +3V3](/Users/lucille/greenguard-usa-web/photos/v5/NETLIST.md:225), [firmware relies on WDT reset](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:821), [hardware claim “MCU dead”](/Users/lucille/greenguard-usa.com/photos/v5/fab_package/README.md:97).

   A hung MCU with VM=9 V and +3V3 healthy never asserts U5. The watchdog may reset the MCU, but the boot path does not force a close. An open valve can remain open indefinitely.

7. **BLOCKER — Brownout during an OPEN pulse can command DRV8871 brake, not CLOSE.**

   Evidence: [OPEN drives IN1 high](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:462), [D6 only ORs the one-shot onto IN2](/Users/lucille/greenguard-usa-web/photos/v5/NETLIST.md:266), [MCU IN1 and driver IN2 mapping](/Users/lucille/greenguard-usa-web/photos/v5/NETLIST.md:199).

   Fact: DRV8871 truth table specifies IN1=1, IN2=1 as low-side brake; reverse/CLOSE is IN1=0, IN2=1. [DRV8871 datasheet](https://www.ti.com/lit/ds/symlink/drv8871.pdf).

   If the supply collapses while PB0/IN1 is still high, U6 raises IN2 but the bridge sees 1/1. The independent diode-OR does not override the MCU’s OPEN command.

8. **BLOCKER — There is no unconditional close-on-boot.**

   Evidence: [reconcile description](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:545), [conditional pulse logic](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:552), [setup reconciliation](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:850).

   If EEPROM says OPEN, RTC is valid, and the current schedule says OPEN, a WDT reset, ISP reset, or external reset produces no CLOSE pulse. Worse, the hardware one-shot can physically close the valve while EEPROM still says OPEN; after power returns during the ON window, firmware believes the valve is already open and does nothing.

9. **BLOCKER — RTC OSF is accidentally cleared, so invalid time can become trusted.**

   Evidence: [comment claims OSF preservation](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:325), [actual mask](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:327), [boot OSF read](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:847), [time reader lacks validation](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:288).

   Fact: DS3231M OSF is status-register bit 7. [DS3231M datasheet](https://www.analog.com/media/en/technical-documentation/data-sheets/DS3231M.pdf).

   `st & 0x7C` clears bit 7, despite the comment. The first boot sees OSF, then clears it; the next WDT boot sees a cleared OSF and may treat an invalid clock as valid. Normal time reads also never recheck OSF or validate BCD ranges. The schedule can open at an invalid time.

10. **BLOCKER — The released firmware package is not reproducible or self-contained.**

    Evidence: [current source adds required prototypes](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:606), [fab-package source lacks them](/Users/lucille/greenguard-usa-web/photos/v5/fab_package/firmware/co2_timer_v5.ino:596), [current build instructions](/Users/lucille/greenguard-usa-web/photos/v5/firmware/README.md:64), [fab package says uncompiled](/Users/lucille/greenguard-usa-web/photos/v5/fab_package/firmware/README.md:64), [HEX explicitly omitted](/Users/lucille/greenguard-usa-web/photos/v5/FAB_PACKAGE_VERIFICATION.md:117).

    The compiled HEX exists outside the fab package, but the package contains older source and no HEX. The first-article `avr-gcc ... co2_timer_v5.ino` command is not a valid Arduino/ATTinyCore build flow. A CM/operator can compile a different binary or fail to compile at all.

11. **MAJOR — MCP1703A thermal design is not safe at the stated 12 V input.**

    Evidence: [MCP1703A BOM rating](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5_BOM.csv:4), [test expects up to 50 mA idle](/Users/lucille/greenguard-usa-web/photos/v5/fab_package/TEST_PROCEDURE.md:79).

    The official MCP1703A SOT-23A thermal resistance is approximately 336 °C/W. At 12 V, 3.3 V, 50 mA: dissipated power is about 0.435 W, producing about a 146 °C junction rise before ambient temperature. Expect thermal shutdown or severe margin loss.

12. **MAJOR — TVS/LDO input protection does not guarantee the LDO stays below 16 V.**

    Evidence: [BOM TVS warning](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5_BOM.csv:14), [NETLIST warning](/Users/lucille/greenguard-usa-web/photos/v5/NETLIST.md:362), [fabrication warning](/Users/lucille/greenguard-usa-web/photos/v5/FABRICATION_SPEC.md:62).

    MCP1703A VIN maximum is 16 V. SMAJ15A is a 15 V standoff TVS, not a 16 V clamp. An unregulated “12 V” adapter can idle at 15–17 V and transient well above that. The documents acknowledge the risk but leave it unresolved.

13. **BLOCKER — The 470 µF hold-up calculation is wrong by orders of magnitude.**

    Evidence: [claimed 100–150 mV drop](/Users/lucille/greenguard-usa-web/photos/v5/FIRST_ARTICLE_CHECKLIST.md:122), [claimed reservoir role](/Users/lucille/greenguard-usa-web/photos/v5/NETLIST.md:113).

    For an isolated capacitor, ΔV=I·t/C. At 200 mA for 100 ms with 470 µF, the drop is about 42.6 V; at 1 A it is about 213 V. The capacitor cannot sustain a 47–50 ms solenoid close pulse after source loss. The fail-safe test is therefore testing an assumption that is mathematically false.

14. **MAJOR — Solenoid and current requirements are not defined consistently.**

    Evidence: [real-valve estimate](/Users/lucille/greenguard-usa-web/photos/v5/FIRST_ARTICLE_CHECKLIST.md:125), [dummy-load specification](/Users/lucille/greenguard-usa-web/photos/v5/fab_package/TEST_PROCEDURE.md:135), [F1/current-limit assumptions](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5_BOM.csv:16).

    The checklist describes approximately 12 Ω / 500–800 mA, while the production test uses 30–60 Ω / 150–300 mA. No valve MPN, coil inductance, minimum pulse energy, or guaranteed 9–12 V actuation specification is included. A dummy can pass while the real valve fails to latch, collapses the battery rail, or stresses F1/DRV8871.

15. **MAJOR — EEPROM journal corruption can be interpreted as valid valve state.**

    Evidence: [validity test](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:430), [state load](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:432), [state write](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:450).

    There is no CRC. A one-bit corruption can turn 0x50 CLOSED into 0x51 OPEN, and the corrupted record remains valid. Combined with the non-forcing boot logic, the firmware can skip the close pulse when the physical state is unknown.

16. **MAJOR — RTC alarm programming failure is ignored.**

    Evidence: [alarm function returns status](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:316), [return value ignored at boot](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:848), [loop has no periodic schedule evaluation](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:879).

    If alarm writes fail while ordinary RTC reads still work, the device can remain awake across an ON/OFF edge without evaluating the schedule. The valve can remain in its previous state, including OPEN.

17. **MAJOR — J5 is an unverified custom footprint, and KiCad flags it as missing.**

    Evidence: [custom PCB footprint](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5.kicad_pcb:669), [BOM says “verify”](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5_BOM.csv:54), [generic schematic footprint](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5.kicad_sch:7025), [DRC warning](/Users/lucille/greenguard-usa-web/photos/v5/drc_v5.json:502).

    The exact PJ-002A pad geometry, switch pin numbering, and custom footprint have not been tied to a manufacturer drawing. Failure means no input power, incorrect switch grounding, or a mechanical assembly failure.

18. **MAJOR — U4 BOM contradicts the real DRV8871 pinout.**

    Evidence: [BOM says pin 7 N.C.](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5_BOM.csv:5), [NETLIST correctly says PGND](/Users/lucille/greenguard-usa-web/photos/v5/NETLIST.md:204), [PCB ties pad 7 to GND](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5.kicad_pcb:3111).

    Fact: DRV8871 pin 7 is PGND and must connect to board ground. [DRV8871 datasheet](https://www.ti.com/lit/ds/symlink/drv8871.pdf). The PCB appears correct, but the released BOM can cause a CM or substitute-part review to leave the high-current return unconnected.

19. **MAJOR — U5 sourcing and variant documentation are not frozen.**

    Evidence: [BOM sourcing is “DK verify” and LCSC TBD](/Users/lucille/greenguard-usa-web/photos/v5/co2_timer_v5_BOM.csv:6), [firmware comment still says G30](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:11).

    `TPS3839K33DBZR` is a valid TI orderable part, but the released files still contain the obsolete/nonexistent G30 reference and no firm approved-source record. A wrong threshold variant changes the only supervisor safety threshold.

20. **MAJOR — This is not a Bittele-ready manufacturing package.**

    Evidence: [package explicitly specifies JLCPCB CPL format](/Users/lucille/greenguard-usa-web/photos/v5/fab_package/README.md:13), [quantity says 10/200](/Users/lucille/greenguard-usa-web/photos/v5/fab_package/README.md:29), [root checklist says do not assemble](/Users/lucille/greenguard-usa-web/photos/v5/FIRST_ARTICLE_CHECKLIST.md:48), [CPL uses negative Y coordinates](/Users/lucille/greenguard-usa-web/photos/v5/fab_package/co2_timer_v5_CPL_SMT.csv:2).

    The requested order is 100 turnkey Bittele PCBAs, while the documents alternate between JLCPCB board-only, hand assembly, JLC full turnkey, pilot 10, and production 200. Bittele must explicitly confirm coordinate origin, rotations, BOM substitutions, THT scope, and programming/test scope before accepting the package.

21. **MAJOR — ISP shares physical SCL/SDA with the RTC without isolation.**

    Evidence: [shared ISP/I2C nets](/Users/lucille/greenguard-usa-web/photos/v5/NETLIST.md:42), [firmware caveat](/Users/lucille/greenguard-usa-web/photos/v5/firmware/README.md:51), [test procedure repeats the risk](/Users/lucille/greenguard-usa-web/photos/v5/fab_package/TEST_PROCEDURE.md:40).

    SCK ≤125 kHz is conservative for the ATtiny, but it does not prevent the DS3231M from observing programmer transitions. A programming transaction can theoretically corrupt RTC state or alarm registers. The required post-flash clock reset is a mitigation, not deterministic isolation.

22. **MINOR — ADC and RTC validation margins are undocumented.**

    Evidence: [fixed 13 mV/LSB assumption](/Users/lucille/greenguard-usa-web/photos/v5/firmware/pins_v5.h:49), [fixed ADC conversion](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:484), [unchecked BCD time](/Users/lucille/greenguard-usa-web/photos/v5/firmware/co2_timer_v5.ino:291).

    The MCP1703A output can vary by several percent, shifting the 7.0 V close threshold. Invalid BCD/range values are accepted as time. This should be characterized against DRV8871 UVLO and malformed RTC data.

23. **MINOR — Release documentation contains stale electrical and export claims.**

    Evidence: [stale CPL coverage](/Users/lucille/greenguard-usa-web/photos/v5/FAB_PACKAGE_VERIFICATION.md:77), [verification says drill coordinates are inches](/Users/lucille/greenguard-usa-web/photos/v5/FAB_PACKAGE_VERIFICATION.md:65), [actual drill file says METRIC](/Users/lucille/greenguard-usa-web/photos/v5/fab_package/gerbers/co2_timer_v5-PTH.drl:8), [D4/D5 source mapping conflict](/Users/lucille/greenguard-usa-web/photos/v5/NETLIST.md:88).

    These are not the primary electrical blockers, but they demonstrate that the “verified complete/manufacturing-ready” claims are stale and should not be relied on for a turnkey release.

**Verdict: HOLD — do not pay or release this order.**
