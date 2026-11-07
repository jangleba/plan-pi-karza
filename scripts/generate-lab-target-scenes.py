#!/usr/bin/env python3
"""Synthetic perspective scenes from the actual printed SVG assets.
Input PNGs are rasterized by Chromium; only Pillow is required for projection.
This is a detector regression test, not field-accuracy validation.
"""
from pathlib import Path
from PIL import Image
import json,sys
out=Path(sys.argv[1])
def solve(matrix,rhs):
 a=[list(row)+[value] for row,value in zip(matrix,rhs)]
 for col in range(8):
  pivot=max(range(col,8),key=lambda row:abs(a[row][col]))
  if abs(a[pivot][col])<1e-10:raise ValueError('Degenerate target projection')
  a[col],a[pivot]=a[pivot],a[col]
  scale=a[col][col];a[col]=[v/scale for v in a[col]]
  for row in range(8):
   if row==col:continue
   scale=a[row][col];a[row]=[v-scale*w for v,w in zip(a[row],a[col])]
 return [row[8] for row in a]
cases=[]
for perspective in (False,True):
 def project(u,v):
  d=1+.0004*v+.0002*u if perspective else 1
  return ((.14+.00225*v+.0001*u)/d,(.83-.01*u+.00002*v)/d)
 for width in (1280,1920,3840):
  height=width*9//16
  background=Image.new('RGBA',(width,height),(242,246,250,255))
  for name,offset in [('start',0),('range',300)]:
   paper=Image.open(out/(name+'-printed-asset.png')).convert('RGBA')
   # SVG black frame is x=5..205, y=39..279 mm; scale 4 px/mm.
   coords=[(-.5,-27.9),(20.5,-27.9),(20.5,1.8),(-.5,1.8)] if name=='start' else [(-.5,284.1),(20.5,284.1),(20.5,313.8),(-.5,313.8)]
   target=[(x*width,y*height)for x,y in (project(*p)for p in coords)]
   original=[(0,0),(840,0),(840,1188),(0,1188)]
   matrix=[];rhs=[]
   for (x,y),(u,v)in zip(target,original):
    matrix.extend([[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]])
    rhs.extend([u,v])
   transform=solve(matrix,rhs)
   warped=paper.transform((width,height),Image.Transform.PERSPECTIVE,transform,Image.Resampling.BICUBIC,fillcolor=(0,0,0,0))
   background.alpha_composite(warped)
  name=f'printed-targets-{width}-'+('perspective' if perspective else 'affine')
  background.save(out/(name+'.png'))
  (out/(name+'.rgba')).write_bytes(background.tobytes())
  cases.append({'name':name,'width':width,'height':height,'perspective':perspective,
   'heel':project(-10,214),'expectedCm':214})
(out/'printed-target-cases.json').write_text(json.dumps(cases,indent=2)+'\n')
print('Rendered actual SVG targets into',len(cases),'synthetic scenes.')
