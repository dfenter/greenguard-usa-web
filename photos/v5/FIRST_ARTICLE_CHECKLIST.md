# CO2 Timer v5.1 — First-Article Checklist

**Status:** Five-board first-article build and bench validation

**Revision:** 2026-08-11 as-built redesign

This checklist reflects the current manufacturing split. Bittele builds and
tests five boards, then ships them to GreenGuard USA. Our bench owns the real
valve characterization, fail-safe verification, and enclosure dry-fit. The
remaining 95 units are held until written approval.

## Phase 1 — freeze the reference package

- [ ] Use `NETLIST.md` 2026-08-11 as the electrical source of truth.
- [ ] Confirm DRC is 0 errors / 0 unconnected and the pad oracle is 172/172.
- [ ] Confirm the as-built fail-safe chain is TPS3700 on VM, dual
  SN74LVC1G3157 takeover muxes, and C1+C19 at 1000 uF each.
- [ ] Confirm the release inputs match the current NETLIST and BOM reference
  inventory.
- [ ] Confirm J5 documentation requires a regulated 9-12 V adapter with <=13 V
  OCV. Do not substitute an unregulated adapter.
- [ ] Confirm the valve is represented as a class specification; production
  MPN is `TBD — qualified sample lot` until T0 qualification.

## Phase 2 — firmware and programming reference

- [ ] Use the firmware image sized **~6.2 KB**; see `firmware/README.md` §3.
- [ ] Verify the SHA-256 recorded in `firmware/README.md` §3 and `SHA256SUMS`.
- [ ] Verify unchanged fuses: low `0xE2`, high `0xC5`, extended `0xFF`.
- [ ] Use the unchanged ISP flow: 3.3 V target, SCK at or below 125 kHz, then
  read back the three fuse bytes.
- [ ] Record the firmware release-contract check for close at VM <=8.2 V and
  lockout release only at VM >=8.6 V sustained for 5 s. If the reference
  build does not implement that contract, hold release and report it; do not
  silently change the board documentation.

## Phase 3 — Bittele first-article build

- [ ] Bittele builds and tests **5** boards against the current electronics
  package and BOM.
- [ ] Confirm the hardware lane includes U1-U7, C1+C19, D1-D5, TVS1/TVS2,
  R1-R18, and no deleted references.
- [ ] Confirm J3 remains DNP on shipped boards.
- [ ] Confirm each board receives its build/lot identifier and Bittele test
  record.
- [ ] Bittele ships the five boards to GreenGuard USA for our T0-T8 bench
  work. Do not release the remaining 95 on the basis of the Bittele test
  record alone.

## Phase 4 — GreenGuard receipt and incoming inspection

For each of the five boards:

- [ ] Photograph the board and record its lot/serial identifier.
- [ ] Inspect U3 pinout, U4 PGND/exposed pad, U5 divider, U6/U7 mux routing,
  C1/C19 polarity and spacing, and J5 connector condition.
- [ ] Verify the fitted reference inventory matches the current NETLIST and
  BOM.
- [ ] Flash/read back the reference firmware and fuses if Bittele did not do
  so, using the unchanged ISP procedure.
- [ ] Run the 9 V power-on test and the 12 V repeat. Record display-on input
  current: 15-25 mA expected; reject over 30 mA.

## Phase 5 — GreenGuard T0-T8 and graft bench

- [ ] **T0 valve characterization:** record actual sample-lot identity, coil
  resistance, pulse/current behavior, latch/unlatch voltage, 100-cycle result,
  and 24-72 h CO2 bubble leak-down at 1-2 psi. Production MPN remains
  `TBD — qualified sample lot` until this gate passes.
- [ ] **T1 slow ramp:** 12 V to 5 V at 0.1 V/s; verify falling trip
  7.21–7.75 V and rising release 7.38–7.82 V, mux takeover within 1 ms,
  and real closure. The 8.2 V firmware close threshold exceeds the 7.82 V
  worst-case rising release.
- [ ] **T2 reset/stuck-high:** hold U1 in reset and force PB0 high; verify the
  bridge is 0/1, never 1/1 brake, and verify closure by position/flow.
- [ ] **T3 hung MCU:** build the FA image with `-DTEST_HANG=1`, hold both
  buttons for >5 s, and verify the watchdog/reset handling closes within 2.5 s;
  then reflash production HEX and verify its SHA-256 from the firmware README
  and `SHA256SUMS`.
- [ ] **T4 abrupt disconnect:** at 9 V record reservoir behavior for the
  qualified valve and a resistive dummy equal to 80% of the qualified coil
  resistance measured at T0; report this result as an explicit release gate.
- [ ] **T5 lockout:** verify close at <=8.2 V and release at >=8.6 V only after
  5 s sustained, with the documented tolerance.
- [ ] **T6 sequencing:** verify cold and hot restarts through VM=6.5-7.6 V
  produce no spurious OPEN pulse or uncontrolled drive.
- [ ] **T7 real valve:** verify 100/100 close latches at VM=7.6 V, using
  position/flow rather than DRV activity as the acceptance signal.
- [ ] **T8 reservoir:** with the same T0 80%-of-coil-resistance dummy at J2,
  verify >=2000 uF total, <=50 mOhm ESR, and >=200 ms above 6.5 V; record it
  under the abrupt-disconnect release gate.
- [ ] **G1 continuous-drive corner:** hold 6.5-7.4 V, measure coil temperature
  and drain time, and disposition any sustained-drive risk.
- [ ] **G2 reset matrix:** exercise POR, BOR, EXT, and WDT semantics from the
  firmware README/changelog and record close result and valve state.
- [ ] **G3 release debounce:** verify VM >=8.6 V is sustained for 5 s before
  lockout release.

Use `TEST_PROCEDURE.md` for the setup, waveform captures, and pass criteria.
Every valve result must be verified by position or flow; a driver waveform by
itself is not proof of closure.

## Phase 6 — mechanical first article

For each unit selected for enclosure fit:

- [ ] Use the retained Hammond 1554CGY shell, ordering MPN Hammond 1554C2GY
  (2-series polycarbonate IP68), with 3.0 mm nominal walls.
- [ ] Keep the existing panel coordinates and use the v5 front/rear drill
  pattern.
- [ ] Dry-fit the 70 x 50 mm PCB, two 9 V cells and snaps, the internal
  approximately 40 mm valve-with-barbs envelope, two 6 mm barb fittings, and
  tubing in the rear-corner slot.
- [ ] Confirm the lid closes without contact and the front display/buttons/J5
  align. Record photographs and any interference.
- [ ] Treat this dry-fit as mandatory; do not infer production fit from a
  drawing alone.

## Phase 7 — disposition and release

- [ ] Compile the five-board report: firmware hash/fuses, 9 V and 12 V current,
  T0-T8/G1-G3 results, and dry-fit photographs.
- [ ] Mark each first article pass, rework, or hold.
- [ ] Hold the remaining **95** units pending written approval.
- [ ] Release the 95 only after the written approval records the qualified
  valve sample lot, the firmware release contract, and mechanical fit.

## Required open items at handoff

- Valve production MPN: `TBD — qualified sample lot`.
- Qualified sample coil resistance: measured at T0; no substitute catalog
  value is permitted.
- Valve mounting hardware, exact tubing cut lengths, and final assembly
  sourcing: `TBD — first-article dry-fit / supplier quote`.
