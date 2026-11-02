#!/usr/bin/env python3
"""Authored control clips, never athlete recordings or an AI accuracy validation.
Requires Pillow and FFmpeg. Events, original FPS and geometry are known independently.
"""
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
import hashlib, json, math, subprocess, sys
from threading import local
from PIL import Image, ImageDraw, ImageFont

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/ballwise-lab-control-35')
OUT.mkdir(parents=True, exist_ok=True)
W, H, SS = 1280, 720, 2
OUTPUT_SCALE=1
PALETTE = {'bg':'#f2f6fa','floor':'#dde7ef','ink':'#14283c','blue':'#0b4978','light':'#85b4d2','skin':'#cfad91','shoe':'#263647'}
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONTS=local()
def font(size):
    if not hasattr(FONTS,'cache'):FONTS.cache={}
    key=(size,SS)
    if key not in FONTS.cache:
        try:FONTS.cache[key]=ImageFont.truetype(FONT,size*SS)
        except OSError:FONTS.cache[key]=ImageFont.load_default(size=size*SS)
    return FONTS.cache[key]
def text(d,xy,value,size=18,fill=None):
    d.text(tuple(v*SS for v in xy),value,font=font(size),fill=fill or PALETTE['ink'])
def poly(d,points,fill): d.polygon([(round(x*SS),round(y*SS)) for x,y in points],fill=fill)
def capsule(d,a,b,width,fill):
    p=[tuple(round(v*SS) for v in q) for q in (a,b)]
    d.line(p,fill=fill,width=round(width*SS))
    r=width*SS/2
    for x,y in p:d.ellipse((x-r,y-r,x+r,y+r),fill=fill)
def human(d,x,floor,raise_px=0,phase=0,running=False,crouch=0,reverse=False,near_side='left',single=False,foot_points=None):
    """Filled human silhouette with rounded limbs; no dots or skeleton overlay."""
    s=-1 if reverse else 1
    hip=(x,floor-146+38*crouch-raise_px)
    shoulder=(x+s*(10 if running else 0),hip[1]-83)
    head=(shoulder[0]+s*3,shoulder[1]-34)
    stride=math.sin(phase)*36 if running else 0
    for side in (-1,1):
        near=side==1; shade=PALETTE['blue'] if near else PALETTE['light']
        knee=(hip[0]+side*stride+s*crouch*34,hip[1]+68-crouch*6)
        foot=(hip[0]-side*stride+(14 if near else -9),floor-raise_px-max(0,side*math.sin(phase))*24 if running else floor-raise_px)
        if single and side==(-1 if near_side=='left' else 1):
            knee=(hip[0]-36,hip[1]+50);foot=(hip[0]-65,floor-raise_px-75)
        heel=foot_points[0 if side==-1 else 1] if foot_points else None
        if heel:foot=(heel[0]+8,heel[1]-raise_px)
        capsule(d,(hip[0]+side*8,hip[1]),knee,19,shade)
        capsule(d,knee,(foot[0],foot[1]-10),14,PALETTE['skin'])
        if heel:
            hx,hy=heel[0],heel[1]-raise_px
            poly(d,[(hx,hy-10),(hx+20,hy-10),(hx+26,hy-6),(hx+26,hy),(hx,hy)],PALETTE['shoe'])
        else:capsule(d,(foot[0]-9,foot[1]-5),(foot[0]+s*18,foot[1]-5),11,PALETTE['shoe'])
    poly(d,[(shoulder[0]-26,shoulder[1]+1),(shoulder[0]+26,shoulder[1]+1),(hip[0]+25,hip[1]+13),(hip[0]-24,hip[1]+13)],PALETTE['blue'])
    for side in (-1,1):
        arm=math.sin(phase+math.pi)*side if running else .2
        elbow=(shoulder[0]+side*29+s*arm*23,shoulder[1]+37)
        hand=(hip[0]+side*28+s*arm*36,hip[1]-16)
        capsule(d,(shoulder[0]+side*20,shoulder[1]+9),elbow,15,PALETTE['blue'])
        capsule(d,elbow,hand,12,PALETTE['skin'])
    capsule(d,(shoulder[0],shoulder[1]),(head[0],head[1]+14),14,PALETTE['skin'])
    r=23*SS;cx,cy=head[0]*SS,head[1]*SS
    d.ellipse((cx-r,cy-r*1.12,cx+r,cy+r*1.12),fill=PALETTE['skin'])
    d.pieslice((cx-r,cy-r*1.16,cx+r,cy+r*.85),180,355,fill=PALETTE['shoe'])
    text(d,(hip[0]-7,hip[1]-50),'7',19,PALETTE['bg'])
    if near_side:d.ellipse((int((x-42)*SS),int((floor+8)*SS),int((x+53)*SS),int((floor+17)*SS)),fill='#bfcedb')

def ground(u,v): return ((.14+v*.00225+u*.0033)*W,(.72-u*.007+v*.00002)*H)
def marker(d,centre_v,colour):
    bottom=centre_v-12
    offset=0  # Beside the athlete, with the whole rectangle unobscured.
    def rect(u,v,w,h,fill): poly(d,[ground(u+offset,v),ground(u+w+offset,v),ground(u+w+offset,v+h),ground(u+offset,v+h)],fill)
    rect(0,bottom,20,24,'#101010');rect(.8,bottom+.8,18.4,22.4,'#ffffff')
    for u in (3.6,16.4):
        for v in (bottom+4.8,bottom+19.2):rect(u-.9,v-.9,1.8,1.8,colour)
    if centre_v==300:
        rect(9,299.9,2,.2,'#f97316')
        rect(9.9,299,.2,2,'#f97316')

SPECS=[
 {'id':'cmj','title':'CMJ','fps':120,'seconds':2.8,'start':97,'end':145,'side':None},
 {'id':'single_leg_cmj','title':'Skok jednonoz - lewa','fps':240,'seconds':2.8,'start':193,'end':289,'side':'left'},
 {'id':'single_leg_cmj','title':'Skok jednonoz - prawa','fps':120,'seconds':2.8,'start':97,'end':139,'side':'right'},
 {'id':'sprint_10m','title':'Sprint 10 m','fps':120,'seconds':4.0,'start':121,'end':361,'side':None,'line':.84},
 {'id':'standing_long_jump','title':'Skok w dal - 214 cm','fps':60,'seconds':3.8,'start':42,'end':102,'side':None,'heel':ground(-10,214),'value':214,'scale':3},
 {'id':'cod_505','title':'505 - lewa','fps':120,'seconds':5.2,'start':241,'turn':385,'end':529,'side':'left','line':.34},
 {'id':'cod_505','title':'505 - prawa','fps':120,'seconds':5.4,'start':241,'turn':397,'end':553,'side':'right','line':.34},
]
def render(spec,i):
    frame=Image.new('RGB',(W*SS,H*SS),PALETTE['bg']);d=ImageDraw.Draw(frame)
    d.rectangle((0,H*(.2 if spec['id']=='standing_long_jump' else .72)*SS,W*SS,H*SS),fill=PALETTE['floor'])
    text(d,(32,25),'BALLWISE  /  LAB',20,PALETTE['blue'])
    text(d,(32,64),spec['title'],27)
    text(d,(32,105),'NAGRANIE KONTROLNE - SYMULACJA',16)
    text(d,(W-330,30),f'{spec["fps"]} FPS  |  {i:04d}  |  {i/spec["fps"]:.3f} s',16)
    t=i/spec['fps'];kind=spec['id']; floor=H*.88
    if kind in ('cmj','single_leg_cmj'):
        lift=(spec['start']-.5)/spec['fps'];land=(spec['end']-.5)/spec['fps'];flight=land-lift
        dt=max(0,min(flight,t-lift));height=.5*9.80665*dt*(flight-dt) if lift<t<land else 0
        crouch=max(0,1-abs(t-(lift-.18))/.18) if t<lift else max(0,1-abs(t-(land+.12))/.12)*.55
        human(d,W*.5,floor,height*(250/1.8),crouch=crouch,near_side=spec['side'] or 'both',single=kind=='single_leg_cmj')
        capsule(d,(W*.3,floor+2),(W*.7,floor+2),2,'#9aafc2')
    elif kind=='sprint_10m':
        first=(spec['start']-.5)/spec['fps'];duration=(spec['end']-spec['start'])/spec['fps']
        u=max(0,min(1.15,(t-first)/duration));progress=(15*u*u-5*u*u*u)/10
        x=W*(.15+(.84-.15)*progress)
        if i>=spec['start']:x=max(W*.15+1.4,x)
        for at,label in ((.15,'START'),(.84,'10 m')):
            capsule(d,(W*at,H*.58),(W*at,H*.94),3,PALETTE['light']);text(d,(W*at-25,H*.95),label,16)
        human(d,x,floor,phase=max(0,t-first)*12,running=i>=spec['start'])
    elif kind=='cod_505':
        entry=(spec['start']-.5)/spec['fps'];turn=(spec['turn']-.5)/spec['fps'];end=(spec['end']-.5)/spec['fps']
        if t<entry:x=W*(.04+.30*max(0,t)/(entry))
        elif t<turn:x=W*(.34+.43*(t-entry)/(turn-entry))
        else:x=W*(.77-.43*(t-turn)/(end-turn))
        for at,label in ((.34,'POMIAR'),(.77,'NAWROT - 5 m')):
            capsule(d,(W*at,H*.58),(W*at,H*.94),3,PALETTE['light']);text(d,(W*at-45,H*.95),label,16)
        human(d,x,floor,phase=t*12,running=True,reverse=t>turn,near_side=spec['side'])
    else:
        marker(d,-12,'#1688ff');marker(d,300,'#f28b25')
        off=.8;landing=1.4;u=max(0,min(1,(t-off)/(landing-off)));v=-9+(214+9)*u
        heel=ground(-10,v);height=.5*9.80665*max(0,t-off)*max(0,landing-t) if off<t<landing else 0
        other=ground(-6,v+(5*u))
        crouch=max(0,1-abs(t-(off-.18))/.18)*.6 if t<off else .55 if t>landing and t<landing+.2 else 0
        human(d,heel[0]-80+u*106,heel[1],height*150,phase=0,crouch=crouch,foot_points=[other,heel])
        text(d,(ground(10,0)[0]-40,H*.53),'START',16,PALETTE['blue'])
        text(d,(ground(10,300)[0]-25,H*.53),'3 m',16,'#a8550c')
    text(d,(30,H-30),'Material techniczny. Nie jest wynikiem zawodnika ani walidacja pomiaru biologicznego.',13)
    size=(W*OUTPUT_SCALE,H*OUTPUT_SCALE)
    return frame if frame.size==size else frame.resize(size,Image.Resampling.LANCZOS)

def generate(spec):
    global SS,OUTPUT_SCALE
    OUTPUT_SCALE=spec.get('scale',1);SS=max(2,OUTPUT_SCALE)
    suffix='-'+spec['side'] if spec['side'] else ''
    name=spec['id']+suffix+'.mp4';target=OUT/name;n=round(spec['seconds']*spec['fps'])
    command=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W*OUTPUT_SCALE}x{H*OUTPUT_SCALE}','-framerate',str(spec['fps']),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','13','-threads','1','-pix_fmt','yuv420p','-movflags','+faststart',str(target)]
    process=subprocess.Popen(command,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        for i in range(n):
            image=render(spec,i)
            if i==spec['end']:image.save(OUT/(target.stem+'-podglad.png'))
            process.stdin.write(image.tobytes())
        process.stdin.close();error=process.stderr.read();code=process.wait()
        if code:raise RuntimeError(error.decode())
    except BaseException:
        process.kill();process.wait();raise
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',str(target)]))
    pts=[float(f['best_effort_timestamp_time']) for f in probe['frames']]
    assert len(pts)==n and all(abs(t-i/spec['fps'])<.000001 for i,t in enumerate(pts))
    if spec['id']=='standing_long_jump':
        audit=OUT/'.audit';audit.mkdir(exist_ok=True)
        for label,index in (('start',spec['start']),('end',spec['end'])):
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(target),'-vf',f'select=eq(n\\,{index})','-frames:v','1','-f','rawvideo','-pix_fmt','rgba',str(audit/(label+'.rgba'))],check=True)
    expected=spec.get('value',9.80665*((spec['end']-spec['start'])/spec['fps'])**2/8*100 if 'cmj' in spec['id'] else (spec['end']-spec['start'])/spec['fps'])
    result={**spec,'file':name,'frameCount':n,'width':W*OUTPUT_SCALE,'height':H*OUTPUT_SCALE,'unit':'cm' if spec['id'] in ('cmj','single_leg_cmj','standing_long_jump') else 's','expected':expected,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'ptsVerifiedBy':'ffprobe','synthetic':True}
    if 'heel' in result:result['heel']=[result['heel'][0]/W,result['heel'][1]/H]
    print(json.dumps({'generated':name,'frames':n,'expected':expected}),flush=True)
    return result

if __name__=='__main__':
    with ProcessPoolExecutor(max_workers=2) as pool: records=list(pool.map(generate,SPECS))
    (OUT/'WYNIKI-KONTROLNE.json').write_text(json.dumps({'schema':'ballwise-control-video-v1','synthetic':True,'width':W,'height':H,'clips':records},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'clips':len(records),'directory':str(OUT)}),flush=True)
