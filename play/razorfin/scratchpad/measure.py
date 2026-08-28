import sys, json, os
from PIL import Image
out={}
for f in sys.argv[1:]:
    im=Image.open(f).convert('RGB').resize((200,100))
    px=im.load(); lum=[];sat=[]
    for y in range(18,100):
        for x in range(200):
            if 60<x<140 and 30<y<70: continue
            r,g,b=[v/255 for v in px[x,y]]
            mx,mn=max(r,g,b),min(r,g,b)
            lum.append(mx); sat.append((mx-mn)/mx if mx>0 else 0)
    lum.sort();sat.sort()
    out[os.path.basename(f)[:-4]]={'medLum':round(lum[len(lum)//2],3),'medSat':round(sat[len(sat)//2],3)}
print(json.dumps(out,indent=2))
