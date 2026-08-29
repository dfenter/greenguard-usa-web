"""Rev16 girth spread. Anchors pinned; free rows spread inside their OWN
reachable height band, bulky and non-bulky solved separately so the bulky
rows cannot all collapse onto the girth floor."""
import sys, json, collections, re
sys.path.insert(0,'/tmp')
from rd import load
GMIN, GMAX = 0.16, 0.70
def bulky(h): return h in ('whale','kaiju')
def H(head, g):
    return min(max(0.91 + g*(0.76 if bulky(head) else 0.55) + (0.10 if bulky(head) else 0), 0.90), 1.30)
def girth_for_H(head, t):
    a = 0.76 if bulky(head) else 0.55
    b = 0.10 if bulky(head) else 0.0
    return max(GMIN, min(GMAX, (t - 0.91 - b)/a))

src = open('hse/skin_identity.js').read()
blk = src[src.find('const SPECIES_HIDE'):src.find('const MODEL_HIDE')]
ANCHORS = set(re.findall(r'(\w+):\s*\[[^\]]+\],\s*/\*[^*]*ANCHOR', blk))
arr = load()
groups = collections.defaultdict(list)
for r in arr:
    m = r['sil'].get('model')
    if m: groups[m].append(r)

plan = {}
for m, rows in groups.items():
    for cls in (True, False):                       # bulky first, then slim
        sub = [r for r in rows if bulky(r['sil']['head']) == cls]
        if not sub: continue
        anch = [r for r in sub if r['id'] in ANCHORS]
        free = [r for r in sub if r['id'] not in ANCHORS]
        for r in anch: plan[r['id']] = r['sil']['girth']
        lo = H(sub[0]['sil']['head'], GMIN); hi = H(sub[0]['sil']['head'], GMAX)
        taken = sorted(H(r['sil']['head'], r['sil']['girth']) for r in anch)
        free.sort(key=lambda r: (r['sil']['girth'], r['id']))
        placed = list(taken)
        for r in free:
            placed.sort()
            bounds = [lo] + placed + [hi]
            gi = max(range(len(bounds)-1), key=lambda i: bounds[i+1]-bounds[i])
            t = (bounds[gi] + bounds[gi+1]) * 0.5
            plan[r['id']] = round(girth_for_H(r['sil']['head'], t), 3)
            placed.append(H(r['sil']['head'], plan[r['id']]))
    hs = sorted(H(r['sil']['head'], plan[r['id']]) for r in rows)
    gaps = [hs[i+1]-hs[i] for i in range(len(hs)-1)] or [0]
    print(f'{m:15} n={len(rows):2} min gap {min(gaps):.4f} tight {sum(1 for x in gaps if x<0.004)}')
json.dump(plan, open('/tmp/girth_plan.json','w'), indent=1)
c = collections.Counter(round(v,3) for v in plan.values())
print('girth values used more than twice:', {k:v for k,v in c.items() if v>2})
