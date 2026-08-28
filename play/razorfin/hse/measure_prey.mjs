/* Rendered-pixel contrast measurement for the prey school: how far do the
   fish actually sit from the water, in luminance and in hue? Judged on the
   screenshot, which is the only thing the owner sees. */
import fs from 'node:fs'; import zlib from 'node:zlib';
const file = process.argv[2];
const buf = fs.readFileSync(file);
// minimal PNG decode (8-bit RGBA, non-interlaced)
let pos = 8, w=0, h=0, bd=0, ct=0; const idat=[];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos+4, pos+8);
  if (type === 'IHDR') { w = buf.readUInt32BE(pos+8); h = buf.readUInt32BE(pos+12); bd = buf[pos+16]; ct = buf[pos+17]; }
  if (type === 'IDAT') idat.push(buf.subarray(pos+8, pos+8+len));
  pos += 12 + len;
}
const raw = zlib.inflateSync(Buffer.concat(idat));
const ch = ct === 6 ? 4 : 3, stride = w*ch;
const px = Buffer.alloc(w*h*ch);
let o = 0;
for (let y=0;y<h;y++){
  const f = raw[o++]; const line = raw.subarray(o, o+stride); o += stride;
  const cur = px.subarray(y*stride, (y+1)*stride);
  for (let i=0;i<stride;i++){
    const a = i>=ch ? cur[i-ch] : 0, b = y>0 ? px[(y-1)*stride+i] : 0, c = (i>=ch && y>0) ? px[(y-1)*stride+i-ch] : 0;
    let v = line[i];
    if (f===1) v += a; else if (f===2) v += b; else if (f===3) v += (a+b)>>1;
    else if (f===4){ const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c); v += (pa<=pb&&pa<=pc)?a:(pb<=pc?b:c); }
    cur[i] = v & 255;
  }
}
const lum = (r,g,b)=>0.2126*r+0.7152*g+0.0722*b;
// Water = the modal colour of the frame's outer border.
const bg = [px[0], px[1], px[2]];
const bgL = lum(bg[0],bg[1],bg[2]);
let fishN=0, fishL=0, fishMin=255, fishMax=0, hueSum=0;
const lums=[];
for (let i=0;i<w*h;i++){
  const r=px[i*ch], g=px[i*ch+1], b=px[i*ch+2];
  if (Math.abs(r-bg[0])<10 && Math.abs(g-bg[1])<10 && Math.abs(b-bg[2])<10) continue;
  const L=lum(r,g,b); fishN++; fishL+=L; lums.push(L);
  if(L<fishMin)fishMin=L; if(L>fishMax)fishMax=L;
}
lums.sort((a,b)=>a-b);
const pct=(q)=>lums[Math.floor(lums.length*q)]||0;
console.log(JSON.stringify({
  file: file.split('/').pop(),
  waterRGB: bg, waterLum: +bgL.toFixed(1),
  fishPixels: fishN, fishCoverage: +(100*fishN/(w*h)).toFixed(1),
  fishLumMean: +(fishL/fishN).toFixed(1),
  fishLumP05: +pct(0.05).toFixed(1), fishLumP50: +pct(0.5).toFixed(1), fishLumP95: +pct(0.95).toFixed(1),
  // The two numbers that matter: how much brighter the fish are than the
  // water, and how much internal contrast (countershade) they carry.
  contrastVsWater: +((fishL/fishN) - bgL).toFixed(1),
  internalRange: +(pct(0.95)-pct(0.05)).toFixed(1)
}, null, 2));
