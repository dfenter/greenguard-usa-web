import fs from 'fs';
const f = process.argv[2];
const r = JSON.parse(fs.readFileSync(f,'utf8'));
let bad = 0;
console.log('== '+r.viewport+' ==');
for (const [name,s] of Object.entries(r.screens)) {
  if (s.error) { console.log(`${name}: ERROR ${s.error}`); bad++; continue; }
  const t = s.texts;
  const shrunk = t.filter(x => x.sc < 0.999);
  const tiny   = t.filter(x => x.size * x.sc < 11.99);
  // overlap: pairwise box intersection, ignore zero-area
  const ov = [];
  for (let i=0;i<t.length;i++) for (let j=i+1;j<t.length;j++){
    const a=t[i],b=t[j];
    const ix = Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);
    const iy = Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
    if (ix>2 && iy>2) {
      const area = ix*iy, small = Math.min(a.w*a.h,b.w*b.h);
      if (area/small > 0.22) ov.push(`"${a.t}" x "${b.t}" (${Math.round(area/small*100)}%)`);
    }
  }
  const issues = [];
  if (shrunk.length) issues.push(`SHRUNK ${shrunk.length}: `+shrunk.slice(0,3).map(x=>`"${x.t}"@${x.sc}`).join(', '));
  if (tiny.length)   issues.push(`TINY ${tiny.length}: `+tiny.slice(0,3).map(x=>`"${x.t}"@${(x.size*x.sc).toFixed(1)}px`).join(', '));
  if (ov.length)     issues.push(`OVERLAP ${ov.length}: `+ov.slice(0,3).join(' | '));
  if (issues.length){ bad++; console.log(`${name}: `+issues.join('\n    ')); }
  else console.log(`${name}: clean (${t.length} texts)`);
}
console.log('\nconsole msgs: '+r.console.length);
r.console.slice(0,8).forEach(c=>console.log('  '+c.slice(0,150)));
console.log(bad ? `\n${bad} screen(s) with findings` : '\nALL CLEAN');
