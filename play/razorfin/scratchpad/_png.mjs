/* Tiny dependency-free PNG writer: RGB raster, lines, 5x7 bitmap text, grid. */
import zlib from 'node:zlib';
const FONT = {
  '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],
  '2':['111','001','111','100','111'],'3':['111','001','111','001','111'],
  '4':['101','101','111','001','001'],'5':['111','100','111','001','111'],
  '6':['111','100','111','101','111'],'7':['111','001','010','010','010'],
  '8':['111','101','111','101','111'],'9':['111','101','111','001','111'],
  'A':['111','101','111','101','101'],'B':['110','101','110','101','110'],
  'C':['111','100','100','100','111'],'D':['110','101','101','101','110'],
  'E':['111','100','110','100','111'],'F':['111','100','110','100','100'],
  'G':['111','100','101','101','111'],'H':['101','101','111','101','101'],
  'I':['111','010','010','010','111'],'J':['001','001','001','101','111'],
  'K':['101','101','110','101','101'],'L':['100','100','100','100','111'],
  'M':['101','111','111','101','101'],'N':['101','111','111','111','101'],
  'O':['111','101','101','101','111'],'P':['111','101','111','100','100'],
  'Q':['111','101','101','111','011'],'R':['111','101','110','101','101'],
  'S':['111','100','111','001','111'],'T':['111','010','010','010','010'],
  'U':['101','101','101','101','111'],'V':['101','101','101','101','010'],
  'W':['101','101','111','111','101'],'X':['101','101','010','101','101'],
  'Y':['101','101','010','010','010'],'Z':['111','001','010','100','111'],
  '.':['000','000','000','000','010'],':':['000','010','000','010','000'],
  '-':['000','000','111','000','000'],'>':['100','010','001','010','100'],
  ' ':['000','000','000','000','000'],'x':['000','101','010','101','000'],
  '/':['001','001','010','100','100'],'(':['001','010','010','010','001'],
  ')':['100','010','010','010','100'],',':['000','000','000','010','100'],
  '_':['000','000','000','000','111'],'=':['000','111','000','111','000'],
};
export class PNG {
  constructor(w,h,bg=[0,0,0]){ this.w=w;this.h=h;this.d=Buffer.alloc(w*h*3);
    for(let i=0;i<w*h;i++){this.d[i*3]=bg[0];this.d[i*3+1]=bg[1];this.d[i*3+2]=bg[2];} }
  px(x,y,c){ x=Math.round(x);y=Math.round(y); if(x<0||y<0||x>=this.w||y>=this.h)return;
    const o=(y*this.w+x)*3; this.d[o]=c[0];this.d[o+1]=c[1];this.d[o+2]=c[2]; }
  line(x0,y0,x1,y1,c,wd=1){
    const dx=Math.abs(x1-x0), dy=Math.abs(y1-y0), sx=x0<x1?1:-1, sy=y0<y1?1:-1;
    let err=dx-dy, x=x0, y=y0;
    for(let g=0; g<20000; g++){
      if(wd>1){ for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++) this.px(x+a,y+b,c); }
      else this.px(x,y,c);
      if(Math.round(x)===Math.round(x1)&&Math.round(y)===Math.round(y1))break;
      const e2=2*err;
      if(e2>-dy){err-=dy;x+=sx;} if(e2<dx){err+=dx;y+=sy;}
    }
  }
  text(x,y,str,c,scale=1){
    let cx=x;
    for(const chRaw of String(str)){
      const ch = FONT[chRaw] ? chRaw : (FONT[chRaw.toUpperCase()] ? chRaw.toUpperCase() : ' ');
      const g=FONT[ch]||FONT[' '];
      for(let r=0;r<5;r++) for(let col=0;col<3;col++)
        if(g[r][col]==='1') for(let a=0;a<scale;a++) for(let b=0;b<scale;b++)
          this.px(cx+col*scale+a, y+r*scale+b, c);
      cx += (3*scale)+scale;
    }
  }
  static grid(rows,gap=8,bg=[0,0,0]){
    const cols=Math.max(...rows.map(r=>r.length));
    const tw=rows[0][0].w, th=rows[0][0].h;
    const W=cols*tw+(cols+1)*gap, H=rows.length*th+(rows.length+1)*gap;
    const out=new PNG(W,H,bg);
    rows.forEach((row,ri)=>row.forEach((t,ci)=>{
      const ox=gap+ci*(tw+gap), oy=gap+ri*(th+gap);
      for(let y=0;y<t.h;y++)for(let x=0;x<t.w;x++){
        const s=(y*t.w+x)*3, d=((oy+y)*W+(ox+x))*3;
        out.d[d]=t.d[s];out.d[d+1]=t.d[s+1];out.d[d+2]=t.d[s+2];
      }
    }));
    return out;
  }
  encode(){
    const raw=Buffer.alloc(this.h*(this.w*3+1));
    for(let y=0;y<this.h;y++){ raw[y*(this.w*3+1)]=0;
      this.d.copy(raw,y*(this.w*3+1)+1,y*this.w*3,(y+1)*this.w*3); }
    const idat=zlib.deflateSync(raw);
    const chunk=(type,data)=>{
      const len=Buffer.alloc(4); len.writeUInt32BE(data.length);
      const td=Buffer.concat([Buffer.from(type),data]);
      const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(td)>>>0);
      return Buffer.concat([len,td,crc]);
    };
    const ihdr=Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w,0); ihdr.writeUInt32BE(this.h,4);
    ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
      chunk('IHDR',ihdr), chunk('IDAT',idat), chunk('IEND',Buffer.alloc(0))]);
  }
}
let T=null;
function crc32(buf){
  if(!T){ T=[]; for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; T[n]=c>>>0; } }
  let c=0xFFFFFFFF;
  for(let i=0;i<buf.length;i++) c=T[(c^buf[i])&0xFF]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}
