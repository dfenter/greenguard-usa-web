// Metrics for the Rev15 FISH gates, computed off probe_fish_frames.mjs output.
import fs from 'node:fs'; import path from 'node:path';
const dir = '/Users/lucille/greenguard-usa-web/play/razorfin/hse/evidence/r15-fish';
const tag = process.argv[2] || 'before';
const d = JSON.parse(fs.readFileSync(path.join(dir, `frames-${tag}.json`), 'utf8'));
const F = d.frames.filter(f => f.inst && f.inst.length);
// key instances by def+slot
const keyOf = i => i.def + '#' + i.slot;
const tracks = new Map();
F.forEach((f, fi) => f.inst.forEach(i => {
  if (!tracks.has(keyOf(i))) tracks.set(keyOf(i), []);
  tracks.get(keyOf(i)).push({ fi, ...i });
}));
const med = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const DEG = 180 / Math.PI;

let headingDeltas = [], flipFrac = [], phaseJumps = [], jerkFrac = [], ampJumps = [], frozen = 0, total = 0;
for (const [k, tr] of tracks) {
  if (tr.length < 10) continue;
  total++;
  // --- heading per frame from the instance basis X column (nose axis)
  const hd = [];
  for (let i = 1; i < tr.length; i++) {
    const a0 = Math.atan2(tr[i-1].by, tr[i-1].bx), a1 = Math.atan2(tr[i].by, tr[i].bx);
    let da = a1 - a0; while (da > Math.PI) da -= 2*Math.PI; while (da < -Math.PI) da += 2*Math.PI;
    hd.push(Math.abs(da) * DEG);
  }
  headingDeltas.push(...hd);
  // --- lateral velocity sign flip-flops over 3 consecutive frames
  let flips = 0, win = 0;
  for (let i = 2; i < tr.length; i++) {
    const s = [tr[i-2].vy, tr[i-1].vy, tr[i].vy].map(Math.sign);
    win++;
    if (s[0] !== 0 && s[0] === s[2] && s[1] === -s[0]) flips++;   // A -A A pattern
  }
  if (win && flips / win > 0.05) flipFrac.push(k);
  // --- tail-wave phase continuity (should be monotone-ish, small steps)
  const pj = [];
  for (let i = 1; i < tr.length; i++) pj.push(Math.abs(tr[i].phase - tr[i-1].phase));
  phaseJumps.push(...pj);
  // --- amplitude step (eased vs set)
  for (let i = 1; i < tr.length; i++) ampJumps.push(Math.abs(tr[i].amp - tr[i-1].amp));
  // --- second-difference jerk of position, as fraction of body length
  const bl = (tr[0].r || 14) * 2;
  const jk = [];
  for (let i = 2; i < tr.length; i++) {
    const ax = tr[i].px - 2*tr[i-1].px + tr[i-2].px;
    const ay = tr[i].py - 2*tr[i-1].py + tr[i-2].py;
    jk.push(Math.sqrt(ax*ax + ay*ay) / bl);
  }
  jerkFrac.push(...jk);
  // --- idle floor: any instance with amp pinned at 0 for the whole window
  if (tr.every(s => s.amp <= 1e-6)) frozen++;
}
const p95 = a => { const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length*0.95)]; };
const out = {
  tag, instances: total, frames: F.length,
  headingDeltaMedianDeg: +med(headingDeltas).toFixed(2),
  headingDeltaP95Deg: +p95(headingDeltas).toFixed(2),
  headingDeltaMaxDeg: +Math.max(...headingDeltas).toFixed(2),
  lateralFlipFlopInstances: flipFrac.length,
  lateralFlipFlopPct: +(100*flipFrac.length/Math.max(total,1)).toFixed(1),
  phaseStepMedian: +med(phaseJumps).toFixed(4),
  phaseStepMax: +Math.max(...phaseJumps).toFixed(4),
  ampStepMax: +Math.max(...ampJumps).toFixed(4),
  jerkMedianBL: +med(jerkFrac).toFixed(4),
  jerkP95BL: +p95(jerkFrac).toFixed(4),
  frozenInstances: frozen,
  draws: F[0].info && F[0].info.calls, tris: F[0].info && Math.round(F[0].info.tris),
};
const gates = {
  'heading change/frame median <= 12 deg': out.headingDeltaMedianDeg <= 12,
  'lateral flip-flop instances <= 5%': out.lateralFlipFlopPct <= 5,
  'tail phase continuous (max step < 1.0 rad)': out.phaseStepMax < 1.0,
  'jerk median < 8% body length': out.jerkMedianBL < 0.08,
  'no frozen instances': out.frozenInstances === 0,
};
console.log(JSON.stringify({ metrics: out, gates }, null, 2));
fs.writeFileSync(path.join(dir, `metrics-${tag}.json`), JSON.stringify({ metrics: out, gates }, null, 2));
