/* r15 FACE head crops.
 *
 * Renders through wholeshark.mjs at 4x resolution and crops the head, rather
 * than driving a second camera. Two attempts at an independent head camera
 * both framed empty water: the bind-pose box and the hand-skinned box put the
 * head in different places on these rigs (measured on reef, the bind-box head
 * end projected to screen (260,260) while the face batch projected to
 * (58,-493)), and wholeshark's framing is the one already proven to render the
 * face correctly by the containment gate. Reusing it removes a whole class of
 * camera bug from the evidence path.
 *
 * The crop box is found from the face/noface DIFFERENCE - i.e. the pixels the
 * face batch actually drew - so it is centred on the thing being judged rather
 * than on a guess. A HELD row draws no such pixels, so it falls back to the
 * forward third of the shark's own silhouette.
 */
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const RAZORFIN=path.resolve(HERE,'../../..');
const IDS=(process.env.IDS||'reef,tiger,hammerhead,greatwhite,blue,megalodon,zeusfin,typhonmaw').split(',');
const SCALE=Number(process.env.SCALE||4);
const OUT=process.env.OUT||path.join(HERE,'heads');
const RAW=path.join(HERE,'heads_raw');
fs.mkdirSync(OUT,{recursive:true});
execFileSync(process.execPath,[path.join(HERE,'wholeshark.mjs')],{
  cwd:RAZORFIN,stdio:'inherit',
  env:{...process.env,IDS:IDS.join(','),VARIANTS:'face,noface,flip,flipnoface',
       OUT:RAW,WIDTH:String(1100*SCALE),HEIGHT:String(620*SCALE)}});

/* Crop each row to a square head box around the pixels the face batch drew. */
const { execFileSync: run } = await import('node:child_process');
const py = `
import os,sys,json
from PIL import Image, ImageChops
RAW=sys.argv[1]; OUT=sys.argv[2]; SIDE=int(sys.argv[3])
WATER=(127,179,196); TOL=10
ids=sys.argv[4].split(',')
meta={}
for rid in ids:
    for face_v,no_v,tag in (('face','noface','fwd'),('flip','flipnoface','rev')):
        fp=os.path.join(RAW,rid+'_'+face_v+'.png'); np_=os.path.join(RAW,rid+'_'+no_v+'.png')
        if not (os.path.exists(fp) and os.path.exists(np_)): continue
        f=Image.open(fp).convert('RGB'); n=Image.open(np_).convert('RGB')
        bb=ImageChops.difference(f,n).getbbox()
        held=False
        if bb is None or (bb[2]-bb[0])>f.width*0.5:
            # HELD row (no overlay), or a contaminated pair: fall back to the
            # forward third of the shark's own silhouette.
            held = bb is None
            px=n.load(); xs=[];ys=[]
            for y in range(0,n.height,4):
                for x in range(0,n.width,4):
                    r,g,b=px[x,y]
                    if abs(r-WATER[0])>TOL or abs(g-WATER[1])>TOL or abs(b-WATER[2])>TOL:
                        xs.append(x);ys.append(y)
            if not xs: continue
            x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys)
            # head is the end the shark's nose points at; use the narrower end
            cx = x1-(x1-x0)*0.12 if tag=='fwd' else x0+(x1-x0)*0.12
            cy = (y0+y1)/2
        else:
            cx=(bb[0]+bb[2])/2; cy=(bb[1]+bb[3])/2
        half=SIDE//2
        L=int(max(0,min(f.width-SIDE,cx-half))); T=int(max(0,min(f.height-SIDE,cy-half)))
        crop=f.crop((L,T,L+SIDE,T+SIDE))
        crop.save(os.path.join(OUT,rid+'_'+tag+'.png'))
        meta[rid+':'+tag]={'held':held,'box':[L,T,SIDE,SIDE]}
json.dump(meta,open(os.path.join(OUT,'crops.json'),'w'),indent=1)
print('cropped',len(meta),'head views at',SIDE,'px')
`;
run('python3',['-c',py,RAW,OUT,String(process.env.SIDE||760),IDS.join(',')],{stdio:'inherit'});

/* Assemble heads_after.png: one row per shark, fwd | rev | HSE reference. */
const sheet = `
import os,sys,json
from PIL import Image, ImageDraw
OUT=sys.argv[1]; HERE=sys.argv[2]; ids=sys.argv[3].split(',')
TW=int(sys.argv[4]) if len(sys.argv)>4 else 430
refp=os.path.join(HERE,'ref','hse_roster_ref.jpg')
ref=Image.open(refp).convert('RGB') if os.path.exists(refp) else Image.new('RGB',(TW,TW),(28,30,34))
# crop the reference to a head-ish square so it sits beside like-for-like
rw,rh=ref.size
ref=ref.crop((int(rw*0.30),0,int(rw*0.30)+rh,rh)).resize((TW,TW))
meta=json.load(open(os.path.join(OUT,'crops.json'))) if os.path.exists(os.path.join(OUT,'crops.json')) else {}
rows=[i for i in ids if os.path.exists(os.path.join(OUT,i+'_fwd.png'))]
H=TW*len(rows)+34
img=Image.new('RGB',(TW*3,H),(16,18,22)); d=ImageDraw.Draw(img)
d.text((8,10),'Razorfin r15 FACE - head crops @ %d px   |   left: forward   middle: reversed   right: HSE reference'%TW,fill=(238,238,238))
for i,rid in enumerate(rows):
    y=34+i*TW
    for j,tag in enumerate(['fwd','rev']):
        p2=os.path.join(OUT,rid+'_'+tag+'.png')
        if os.path.exists(p2): img.paste(Image.open(p2).convert('RGB').resize((TW,TW)),(j*TW,y))
    img.paste(ref,(2*TW,y))
    held=meta.get(rid+':fwd',{}).get('held')
    d.text((10,y+8),rid,fill=(255,238,120))
    if held: d.text((10,y+26),'HELD - Rev 14 baked face',fill=(255,190,120))
img.save(os.path.join(OUT,'..','heads_after.png'))
print('wrote heads_after.png',img.size)
`;
run('python3',['-c',sheet,OUT,HERE,IDS.join(','),String(process.env.SIDE||380)],{stdio:'inherit'});
