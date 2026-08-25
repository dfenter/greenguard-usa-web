import sys,os
from PIL import Image
src,dst=sys.argv[1],sys.argv[2]
os.makedirs(dst,exist_ok=True)
for f in sorted(os.listdir(src)):
    if not f.endswith('.png'): continue
    im=Image.open(os.path.join(src,f)).convert('RGB')
    W,H=im.size
    # player shark sits center screen; head is forward (right of center)
    cx,cy=int(W*0.50),int(H*0.50)
    w,h=int(W*0.20),int(H*0.30)
    box=(cx-int(w*0.15),cy-h//2,cx-int(w*0.15)+w,cy+h//2)
    c=im.crop(box).resize((w*3,h*3),Image.NEAREST)
    c.save(os.path.join(dst,f.replace('.png','_head.png')))
    print(f,im.size,box)
