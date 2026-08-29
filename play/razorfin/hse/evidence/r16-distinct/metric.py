"""Rev16 look-alike metric: silhouette IoU minus colour distance, same base only.
Calibrated against r15-doc dupes.json (31 rows) / brief's 28 weak rows."""
import json,itertools,numpy as np,os,sys
from PIL import Image
SIZE=(128,80); MASK_T=0.06; WC=1.5; THR=0.95
def measure(shotdir, assess):
    rows=[r['id'] for r in assess]; mdl={r['id']:r['model'] for r in assess}
    M={};C={}
    for rid in rows:
        p=os.path.join(shotdir,f'shark_{rid}.png')
        im=Image.open(p).convert('RGB').resize(SIZE)
        arr=np.asarray(im).astype(np.float32)/255
        bg=arr[0,0]; mask=np.abs(arr-bg).sum(2)>MASK_T
        M[rid]=mask; C[rid]=arr[mask].mean(0) if mask.sum()>10 else np.zeros(3)
    pairs=[]; dup=set()
    for x,y in itertools.combinations(rows,2):
        if mdl[x]!=mdl[y] or mdl[x]=='(own GLB)': continue
        iou=(M[x]&M[y]).sum()/max((M[x]|M[y]).sum(),1)
        cd=float(np.abs(C[x]-C[y]).mean())
        s=iou-WC*cd
        pairs.append((x,y,float(iou),cd,float(s)))
        if s>THR: dup.add(x); dup.add(y)
    return dup,pairs
if __name__=='__main__':
    sd=sys.argv[1] if len(sys.argv)>1 else 'shots'
    ad=sys.argv[2] if len(sys.argv)>2 else 'assess.json'
    assess=json.load(open(ad))
    dup,pairs=measure(sd,assess)
    over=[p for p in pairs if p[4]>THR]
    print('look-alike rows:',len(dup))
    print('offending pairs:',len(over))
    for p in sorted(over,key=lambda z:-z[4])[:40]:
        print(f'  {p[0]:18} {p[1]:18} iou={p[2]:.3f} cd={p[3]:.4f} s={p[4]:.3f}')
    json.dump(sorted(dup),open(os.path.join(os.path.dirname(ad) or '.','dupes_r16.json'),'w'),indent=1)
