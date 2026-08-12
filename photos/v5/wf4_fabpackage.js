export const meta = {
  name: 'co2-timer-v5-fabpackage',
  description: 'Assemble + verify the v5 fabrication package from the winning PCB',
  phases: [
    { title: 'Export', detail: 'gerbers/drill/pos/pdfs via kicad-cli + package assembly' },
    { title: 'Verify', detail: 'package completeness + cross-doc consistency (<=3 concurrent)' },
  ],
}
const V5 = '/Users/lucille/greenguard-usa-web/photos/v5'
const KICAD = '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli'
const WINNER = (typeof args === 'string' && args) ? args : V5 + '/co2_timer_v5.kicad_pcb'

phase('Export')
const exporter = await agent(`You are the FAB EXPORT engineer. The winning v5 board is ${WINNER} (DRC-clean). Build the fab package under ${V5}/fab_package/:
(1) '${KICAD} pcb export gerbers' (protel extensions, layers F.Cu,B.Cu,F.Mask,B.Mask,F.Paste,F.Silkscreen,B.Silkscreen,Edge.Cuts, subtract-soldermask) into fab_package/gerbers/;
(2) 'pcb export drill' (excellon, separate PTH/NPTH, units mm) same dir;
(3) 'pcb export pos' (CSV, mm, front side only, smd-only) -> fab_package/co2_timer_v5_CPL_SMT.csv, then post-process headers to JLCPCB column names (Designator,Val,Package,Mid X,Mid Y,Rotation,Layer) and remove bare-pad test points TP1/TP2/TP3 (they are intentionally absent from CPL and BOM);
(4) 'sch export pdf' of ${V5}/co2_timer_v5.kicad_sch -> fab_package/co2_timer_v5_schematic.pdf;
(5) 'pcb export pdf' assembly views top+bottom w/ silkscreen+fab layers -> assembly_top.pdf/assembly_bottom.pdf;
(6) copy in co2_timer_v5_BOM.csv, TEST_PROCEDURE.md, FABRICATION_SPEC.md (fill its gerber-index + DRC-status placeholders with the REAL file list and final DRC counts: 0 errors / 0 unconnected; describe the actual warning classes and do not call all warnings cosmetic), firmware/ folder, and a README.md handover doc modeled on the v3 fab_handover README (no consignment section; in-circuit ISP flow instead; preserve the Rev 5.1 level-held TPS3700/mux acceptance bands, T3 TEST_HANG procedure, T4/T8 T0-derived dummy, TP1-TP3 CPL note, and firmware-reference/hash wording); ALSO WRITE fab_package/CO2_Timer_Enclosure_Drilling_v5.md + front_drill_template_v5.svg: extract ACTUAL connector/button coordinates from the winning pcb file (front x=0 face: J5 barrel + SW1/SW2 + J4 display; left edge J1@x14/J6@x54; right edge J2@x38) and regenerate the Hammond 1554CGY drilling doc + 1:1 printable SVG template from those real coordinates, fixing v3's display-window/DC-jack cutout overlap (>=4mm web between all cutouts);
(7) set the .gbrjob Finish field to ENIG if present;
(8) zip everything -> ${V5}/GreenGuard_CO2_Timer_v5_FabPackage.zip. Return the file inventory.`,
  { label: 'export', phase: 'Export', effort: 'high' })
log('export: ' + String(exporter).slice(0, 150))

phase('Verify')
const check = await agent(`Single consolidated verifier for the v5 fab package at ${V5}/fab_package: (1) every file the FABRICATION_SPEC gerber index lists exists and vice versa; (2) CPL contains ONLY top-side SMT parts (no THT refdes: J1/J2/J5/J6/C1; no DNP J3); (3) BOM refdes set == CPL + THT union, no phantom refdes (v3 had a phantom R4 - check ranges member by member); (4) TEST_PROCEDURE signal names exist in NETLIST.md; (5) enclosure doc coordinates match actual connector positions extracted from ${WINNER}; (6) zip inventory complete. Return {pass, issues[]}.`,
  { label: 'verify:package', phase: 'Verify' })
return { export: String(exporter).slice(0, 400), check: String(check).slice(0, 800) }
