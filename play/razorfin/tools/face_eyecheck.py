# Rendered-pixel gate: the eye highlight must exist as a small, bright,
# low-saturation blob inside the head crop. A flat disc eye has no such pixel.
import sys,os,colorsys
from PIL import Image
d=sys.argv[1]; fails=[]; rows=[]
for f in sorted(os.listdir(d)):
    if not f.endswith('_head.png'): continue
    im=Image.open(os.path.join(d,f)).convert('RGB'); W,H=im.size
    px=im.load()
    # search the head region only (right-centre of the crop)
    best=0; cnt=0
    for y in range(int(H*0.20),int(H*0.90)):
        for x in range(int(W*0.40),int(W*0.98)):
            r,g,b=[c/255 for c in px[x,y]]
            hh,ss,vv=colorsys.rgb_to_hsv(r,g,b)
            if vv>0.80 and ss<0.30:
                cnt+=1; best=max(best,vv)
    rows.append((f,cnt,round(best,3)))
    if cnt<4: fails.append(f)
w=max(len(r[0]) for r in rows)
for f,c,b in rows: print(f'{f:<{w}}  highlightPx={c:<5} maxV={b}')
print()
print('FAIL:',fails if fails else 'none')
sys.exit(1 if fails else 0)
