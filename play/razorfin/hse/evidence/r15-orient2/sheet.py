#!/usr/bin/env python3
"""Contact sheet for the r15-orient2 EYES-ON gate.

One row per shark row, one column per drive direction, with MY OWN
PASS/FAIL verdict written from LOOKING at each frame stamped on it.
Verdicts come from verdicts.json, which is hand-authored from the
inspection - deliberately not computed, because the whole point of this
lane is that the computed gate lied."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
HERE=os.path.dirname(os.path.abspath(__file__))
SHOTS=os.path.join(HERE,'shots')
V=json.load(open(os.path.join(HERE,'verdicts.json')))
DIRS=['right','left','up','down']
CW,CH=440,254
PAD,HDR,LBL=8,54,210
rows=V['rows']
W=LBL+len(DIRS)*(CW+PAD)+PAD
H=HDR+len(rows)*(CH+PAD)+PAD
sheet=Image.new('RGB',(W,H),(248,250,252))
d=ImageDraw.Draw(sheet)
def font(sz):
    for p in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf','/System/Library/Fonts/Helvetica.ttc']:
        if os.path.exists(p):
            try: return ImageFont.truetype(p,sz)
            except Exception: pass
    return ImageFont.load_default()
F,Fs,Fb=font(15),font(12),font(20)
d.text((PAD,10),'Razorfin Rev 15 lane ORIENT2 - EYES-ON gate (verdicts written from looking, not computed)',fill=(20,30,45),font=Fb)
for i,dn in enumerate(DIRS):
    d.text((LBL+i*(CW+PAD)+6,HDR-20),'drive '+dn.upper(),fill=(60,75,95),font=F)
for r,row in enumerate(rows):
    y=HDR+r*(CH+PAD)
    d.text((PAD,y+8),row['id'],fill=(15,25,40),font=F)
    d.text((PAD,y+28),row['model'],fill=(90,105,125),font=Fs)
    d.text((PAD,y+50),row['verdict'],fill=(20,130,60) if row['verdict']=='PASS' else (190,40,40),font=F)
    if row.get('note'):
        for j,ln in enumerate(row['note'].split('|')):
            d.text((PAD,y+72+j*14),ln,fill=(110,120,140),font=Fs)
    for i,dn in enumerate(DIRS):
        x=LBL+i*(CW+PAD)
        p=os.path.join(SHOTS,'%s_%s_game.png'%(row['id'],dn))
        if os.path.exists(p):
            im=Image.open(p).convert('RGB'); im.thumbnail((CW,CH-22))
            sheet.paste(im,(x,y+20))
        else:
            d.rectangle([x,y+20,x+CW,y+CH],outline=(200,205,215))
            d.text((x+8,y+30),'(no frame)',fill=(150,155,165),font=Fs)
        fv=row['frames'].get(dn,'?')
        d.text((x+4,y+2),'%s  %s'%(dn,fv),fill=(20,130,60) if fv=='PASS' else (190,40,40),font=F)
out=os.path.join(HERE,'contact_sheet.png')
sheet.save(out)
print('wrote',out,sheet.size)
