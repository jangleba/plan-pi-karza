(function(scope){
'use strict';
const models=Object.create(null),mod=(x,n=1)=>((x%n)+n)%n,clamp=(x,min=0,max=1)=>Math.max(min,Math.min(max,x));
const mix=(a,b,t)=>Array.isArray(a)?a.map((v,i)=>v+(b[i]-v)*t):a+(b-a)*t;
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const bezier=(a,b,c,d,t)=>a.map((v,i)=>(1-t)**3*v+3*(1-t)**2*t*b[i]+3*(1-t)*t*t*c[i]+t**3*d[i]);
function ik(hip,ankle,bend=1){const dx=ankle[0]-hip[0],dy=ankle[1]-hip[1],d=Math.max(.00001,Math.hypot(dx,dy)),a=(57*57-56*56+d*d)/(2*d),h=Math.sqrt(Math.max(0,57*57-a*a));return[hip[0]+a*dx/d+bend*h*dy/d,hip[1]+a*dy/d-bend*h*dx/d];}
function sole(angle=0){const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),toe=[16*c-11*s,16*s+11*c],heel=[-7*c-11*s,-7*s+11*c];return{toe,heel,lowest:Math.max(toe[1],heel[1])};}
function groundedAnkle(x,angle=0){return[x,264-sole(angle).lowest];}
function leg(hip,ankle,contact=false,footAngle=0){return{knee:ik(hip,ankle),ankle,contact,footAngle,local:0};}
function register(id,model){if(Array.isArray(id)){for(const item of id)register(item,model);return;}if(!id||typeof model.sample!=='function')throw new Error('Invalid animation '+id);models[id]={id,...model};}
function compose(ids,p){const list=ids.map(id=>models[id]);if(list.some(x=>!x))throw new Error('Missing composition '+ids.join(','));const duration=list.reduce((n,x)=>n+x.durationMs,0),time=mod(p)*duration;let offset=0,index=0;for(;index<list.length-1;index++){if(time<offset+list[index].durationMs)break;offset+=list[index].durationMs;}const model=list[index],q=(time-offset)/model.durationMs,scene=model.sample(q),fade=Math.min(1,q/.025,(1-q)/.025);return{...scene,opacity:(scene.opacity??1)*clamp(fade),phase:model.title+' · '+scene.phase,sequenceIndex:index,sequenceLength:list.length,sequenceId:model.id};}
scope.BWAnim={models,register,compose,math:{mod,clamp,mix,smooth,bezier,ik,leg,sole,groundedAnkle}};
})(typeof window==='object'?window:globalThis);

/* Anatomical outline renderer. Geometry and timing come from the supplied scene.
 * This renderer does not infer joint targets or modify ground contacts.
 * Shoe sole endpoints are exactly [-7, 11] and [16, 11] in ankle coordinates. */
(function (scope) {
  'use strict';
  const fmt = n => Number(n).toFixed(3);
  const xy = p => p.map(fmt).join(',');
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const scale = (a, n) => [a[0] * n, a[1] * n];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const point = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  const unit = (a, b) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  };
  const normal = v => [-v[1], v[0]];
  const rotate = (p, degrees) => {
    const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  };
  const path = (d, extra = '') => `<path d="${d}" ${extra}/>`;
  const detail = (d, extra = '') => path(d, `fill="none" ${extra.includes('stroke-width=') ? '' : 'stroke-width=".72"'} ${extra}`);

  /** A single anatomical envelope. Both sides have a shared tangent at every
   * cubic join, including a straight knee/elbow; no doubled joint endpoints or
   * offset-line miters. The supplied a/b/c remain the underlying joint centres. */
  function limb(a, b, c, width) {
    const u = unit(a, b), v = unit(b, c), n = normal(u), m = normal(v);
    const lenA = Math.hypot(b[0] - a[0], b[1] - a[1]), lenB = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const sum = add(u, v), sumLength = Math.hypot(...sum);
    const turn = u[0] * v[1] - u[1] * v[0];
    const tangent = sumLength > .0001 ? scale(sum, 1 / sumLength) : scale(n, turn < 0 ? -1 : 1);
    const jointNormal = normal(tangent), jointHandle = Math.min(lenA, lenB) * .115;
    const cap = width.end * .85;
    const outlineSide = sign => {
      const start = add(a, scale(n, width.root * sign));
      const upper = add(mix(a, b, .40), scale(n, width.upper * sign));
      const joint = add(b, scale(jointNormal, width.joint * sign));
      const lower = add(mix(b, c, .39), scale(m, width.lower * sign));
      const end = add(c, scale(m, width.end * sign));
      return { start, upper, joint, lower, end };
    };
    const l = outlineSide(1), r = outlineSide(-1);
    const cubic = (c1, c2, end) => `C${xy(c1)} ${xy(c2)} ${xy(end)}`;
    const forward = s => cubic(add(s.start, scale(u, lenA * .14)), add(s.upper, scale(u, -lenA * .14)), s.upper)
      + cubic(add(s.upper, scale(u, lenA * .21)), add(s.joint, scale(tangent, -jointHandle)), s.joint)
      + cubic(add(s.joint, scale(tangent, jointHandle)), add(s.lower, scale(v, -lenB * .14)), s.lower)
      + cubic(add(s.lower, scale(v, lenB * .22)), add(s.end, scale(v, -lenB * .18)), s.end);
    const reverse = s => cubic(add(s.end, scale(v, -lenB * .18)), add(s.lower, scale(v, lenB * .22)), s.lower)
      + cubic(add(s.lower, scale(v, -lenB * .14)), add(s.joint, scale(tangent, jointHandle)), s.joint)
      + cubic(add(s.joint, scale(tangent, -jointHandle)), add(s.upper, scale(u, lenA * .21)), s.upper)
      + cubic(add(s.upper, scale(u, -lenA * .14)), add(s.start, scale(u, lenA * .14)), s.start);
    return path(`M${xy(l.start)}${forward(l)}${cubic(add(l.end, scale(v, cap)), add(r.end, scale(v, cap)), r.end)}${reverse(r)}${cubic(add(r.start, scale(u, -width.root * .7)), add(l.start, scale(u, -width.root * .7)), l.start)}Z`);
  }

  function shorts(hip, knee) {
    const d = unit(hip, knee), n = normal(d), hem = mix(hip, knee, .40);
    const a = add(hip, scale(n, 10.2)), b = add(hem, scale(n, 8.8));
    const c = add(hem, scale(n, -8.8)), e = add(hip, scale(n, -10.2));
    return path(`M${xy(a)} C${xy(add(mix(hip, hem, .26), scale(n, 11.7)))} ${xy(add(mix(hip, hem, .76), scale(n, 10.4)))} ${xy(b)} Q${xy(add(hem, scale(d, 1.7)))} ${xy(c)} C${xy(add(mix(hip, hem, .70), scale(n, -10.5)))} ${xy(add(mix(hip, hem, .24), scale(n, -10.9)))} ${xy(e)} Q${xy(add(hip, scale(d, -2.2)))} ${xy(a)}Z`)
      + detail(`M${xy(add(add(hem, scale(d, -1.5)), scale(n, 8.2)))} Q${xy(add(hem, scale(d, -.1)))} ${xy(add(add(hem, scale(d, -1.5)), scale(n, -8.2)))}`)
      + detail(`M${xy(add(mix(hip, hem, .20), scale(n, -4)))} Q${xy(add(mix(hip, hem, .55), scale(n, -2)))} ${xy(add(mix(hip, hem, .79), scale(n, 2)))}`);
  }

  function shoe(limb, front) {
    const local = Number.isFinite(limb.local) ? limb.local : 0;
    const phase = Math.max(0, Math.min(1, (local - .34) / .66));
    const angle = Number.isFinite(limb.footAngle) ? limb.footAngle : limb.contact ? 0 : -16 * Math.sin(Math.PI * phase);
    const upper = front
      ? 'M-4,-3 C-2,-4.9 2.8,-4.9 5,-3 C6.2,-1.1 6.9,.5 8.7,1.9 C12.2,3.2 15.2,4.5 16,7.8 L16,10 L-7,10 L-7,5 C-6.9,1.4 -6,-1.1 -4,-3Z'
      : 'M-4,-3 C-1.5,-2.6 1,-.7 4,-2 C5.6,-.3 6.4,2.4 10,3.8 C13.5,4.2 15.8,5 16,7 L16,10 L-7,10 L-7,4 C-6.9,.5 -5.9,-1.3 -4,-3Z';
    // Flat bottom edge is deliberately unchanged from the motion contact model.
    const sole = 'M-7,8 C-1,8.8 10,8.8 16,8 L16,11 L-7,11Z';
    const laces = front ? 'M-1,.6h6 M-1,2.5h7 M-2,4.3h9' : 'M4,.8l4,1.3 M5,2.6l4,1.1 M6,4.3l4,.9';
    return `<g class="bw-outline-shoe" transform="translate(${xy(limb.ankle)}) rotate(${fmt(angle)})">`
      + path(upper) + path(sole)
      + detail(front ? 'M-3,-1 Q1,2 6,0 L8,6' : 'M-4,0 Q1,4 5,3 L10,6.8')
      + detail(laces, 'stroke-width=".65"') + '</g>';
  }

  function leg(scene, side, front) {
    const l = scene[side], { knee, ankle } = l, hip = scene.hip;
    const u = unit(hip, knee), n = normal(u), v = unit(knee, ankle), m = normal(v);
    return `<g class="bw-outline-leg bw-outline-leg-${side}">`
      + limb(hip, knee, ankle, { root: 8.2, joint: 5.6, end: 3.2, upper: 10.5, lower: 8.2 })
      + detail(`M${xy(add(mix(hip, knee, .47), scale(n, -3)))} Q${xy(add(mix(hip, knee, .68), scale(n, -1.5)))} ${xy(add(mix(hip, knee, .86), scale(n, -.8)))}`)
      + detail(`M${xy(add(mix(knee, ankle, .18), scale(m, -2.4)))} Q${xy(add(mix(knee, ankle, .43), scale(m, -1.1)))} ${xy(add(mix(knee, ankle, .68), scale(m, -.9)))}`)
      + shorts(hip, knee) + shoe(l, front) + '</g>';
  }

  function armPoints(scene, side, angle, front) {
    const far = side === 'left', own = scene.arms && scene.arms[side];
    const shoulder = own && point(own.shoulder) ? own.shoulder : add(scene.hip, rotate(front ? [far ? -16 : 16, -58] : [-1, -59], angle));
    if (own && point(own.elbow) && point(own.wrist)) return { shoulder, elbow: own.elbow, wrist: own.wrist };
    const drive = Number.isFinite(scene.armDrive) ? scene.armDrive : Math.sin((Number.isFinite(scene.p) ? scene.p : 0) * 2 * Math.PI);
    const swing = far ? -drive : drive, a = swing * .60;
    const elbowLocal = front ? [(far ? -1 : 1) * (11 + 3 * Math.abs(swing)), 27 - 4 * swing] : [Math.sin(a) * 30, Math.cos(a) * 30];
    const wristLocal = front ? [(far ? -1 : 1) * (5 + 2 * Math.abs(swing)), 46 - 14 * swing] : [elbowLocal[0] + Math.cos(a) * 23, elbowLocal[1] - Math.sin(a) * 23];
    return { shoulder, elbow: add(shoulder, rotate(elbowLocal, angle)), wrist: add(shoulder, rotate(wristLocal, angle)) };
  }

  function arm(scene, side, angle, front) {
    const { shoulder, elbow, wrist } = armPoints(scene, side, angle, front);
    const u = unit(shoulder, elbow), n = normal(u), v = unit(elbow, wrist);
    const hand = add(wrist, scale(v, 4)), degrees = Math.atan2(v[1], v[0]) * 180 / Math.PI;
    return `<g class="bw-outline-arm bw-outline-arm-${side}">`
      + limb(shoulder, elbow, wrist, { root: 6.2, joint: 3.7, end: 2.5, upper: 7.8, lower: 5.2 })
      + detail(`M${xy(add(mix(shoulder, elbow, .26), scale(n, -2.3)))} Q${xy(add(mix(shoulder, elbow, .52), scale(n, -1.3)))} ${xy(add(mix(shoulder, elbow, .74), scale(n, -1.6)))}`)
      + `<g class="bw-outline-hand" transform="translate(${xy(hand)}) rotate(${fmt(degrees)})">`
      + path('M-3,-2.7 Q-1,-4 1,-3.8 Q3,-4.4 4.4,-2.6 Q6.2,-2 5.5,.2 Q6,2 4,3 Q1,4.1 -2.9,2.4Z')
      + detail('M.7,-2.7L3.4,-1.8 M1.2,-.8L3.9,0 M1.1,1.1L3.7,1.6', 'stroke-width=".55"')
      + detail('M-2.8,-1 Q-.8,-5 1.2,-3.4 L1.4,-1.1', 'stroke-width=".65"')
      + '</g></g>';
  }

  function sideTorso() {
    return path('M-5,-76 C-1,-75 2,-74 4,-75 L5,-62 C1,-58 -4,-59 -7,-63 C-5,-67 -5,-72 -5,-76Z')
      + path('M-10,-90 C-12,-96 -8,-102 -3,-103 C3,-106 9,-103 11,-99 C13,-96 12,-92 12,-89 C12,-86 14.7,-84.9 15.2,-83.3 C15.5,-82.3 13.6,-81.5 13,-81 C12.6,-78.6 13.5,-76 11.4,-74 C9,-71.3 5,-71 2,-72.6 C-2,-74 -5,-77 -6.6,-80 C-8.5,-83 -8.6,-87 -10,-90Z')
      + path('M-10,-87 C-15,-92 -14,-99 -9,-102 C-5,-106 2,-107 8,-104 C10,-103 11.6,-101.3 12,-99 C8,-100.4 5,-99.8 2,-97 C-.4,-97.8 -1.9,-98.3 -3,-97 C-5.1,-95.5 -6,-91.7 -7,-88.3 C-7.8,-87.2 -8.7,-87 -10,-87Z')
      + detail('M-10,-96 C-8,-99 -5,-101 -2,-101', 'stroke-width=".6"')
      + path('M-8,-65 C-2,-69 4,-67 8,-62 C13,-57 15,-49 14,-42 C13.8,-35 10,-28 10,-22 C10,-17 10.6,-12 12,-8 C4,-4 -8,-4 -16,-9 C-16.6,-17 -17,-25 -15,-34 C-14,-42 -17,-55 -8,-65Z')
      + detail('M-6,-65 C-3,-60 2,-60 6,-63 M-11,-60 C-2,-59 4,-53 5,-46 C5,-41 2,-38 -2,-36 M-14,-34 C-12,-28 -11,-20 -12,-15')
      + detail('M-13,-14 Q-3,-18 8,-13 M-11,-10 Q-3,-12 7,-10')
      + path('M-16,-9 C-8,-5 4,-4 12,-8 C13,-5 14,-2 14,1 C10,6 4,8 -2,7 C-8,7 -13,5 -17,4 C-17,0 -17,-5 -16,-9Z')
      + detail('M-14,-7 Q-2,-4 10,-7');
  }

  function frontTorso() {
    return path('M-5,-77 C-2,-76 2,-76 5,-77 L6,-62 C2,-58 -2,-58 -6,-62Z')
      + path('M-12,-94 C-12,-101 -7,-104 0,-104 C7,-104 12,-101 12,-94 C12,-90 11.8,-85 11,-81 C9,-75.5 5,-72.3 0,-72 C-5,-72.3 -9,-75.5 -11,-81 C-11.8,-85 -12,-90 -12,-94Z')
      + path('M-12,-90 C-15,-95 -14,-101 -8,-104 C-2,-107 6,-107 11,-102 C13,-100 14,-97 12,-94 C9,-98 6,-99 3,-96 C.5,-97.9 -1.8,-98.4 -4,-96.6 C-7,-95 -8,-91 -10,-89Z')
      + detail('M-9,-98 C-6,-101 -3,-102 0,-101', 'stroke-width=".6"')
      + path('M-6,-64 C-11,-66 -17,-62 -19,-59 C-19,-54 -18,-47 -16,-42 C-12,-32 -13,-20 -12,-9 C-5,-5 5,-5 12,-9 C13,-20 12,-32 16,-42 C18,-47 19,-54 19,-59 C17,-62 11,-66 6,-64 C3,-60 -3,-60 -6,-64Z')
      + detail('M-6,-64 C-3,-57 3,-57 6,-64 M-16,-60 C-12,-54 -11,-47 -13,-41 M16,-60 C12,-54 11,-47 13,-41')
      + detail('M-9,-19 Q0,-22 9,-18 M-7,-13 Q0,-16 7,-12')
      + path('M-12,-9 C-5,-5 5,-5 12,-9 C14,-5 16,0 17,4 C13,7 8,8 4,9 C2,7 1,5 0,4 C-1,5 -2,7 -4,9 C-8,8 -13,7 -17,4 C-16,0 -14,-5 -12,-9Z')
      + detail('M-10,-7 Q0,-4 10,-7');
  }

  function torso(scene, angle, front) {
    return `<g class="bw-outline-torso" transform="translate(${xy(scene.hip)}) rotate(${fmt(angle)})">${front ? frontTorso() : sideTorso()}</g>`;
  }

  function drawBallwiseAthlete(scene) {
    if (!scene || !point(scene.hip) || !scene.right || !scene.left) return '';
    if (![scene.right.knee, scene.right.ankle, scene.left.knee, scene.left.ankle].every(point)) return '';
    const front = scene.view === 'front', angle = Number.isFinite(scene.torsoAngle) ? scene.torsoAngle : 0;
    const mirrorX = Number.isFinite(scene.mirrorX) ? scene.mirrorX : scene.hip[0];
    const mirror = scene.facing < 0 ? ` transform="translate(${fmt(mirrorX * 2)} 0) scale(-1 1)"` : '';
    const farArm = arm(scene, 'left', angle, front), nearArm = arm(scene, 'right', angle, front);
    const farLeg = leg(scene, 'left', front), nearLeg = leg(scene, 'right', front);
    const layers = front ? farLeg + nearLeg + torso(scene, angle, true) + farArm + nearArm : farArm + farLeg + torso(scene, angle, false) + nearLeg + nearArm;
    return `<g class="bw-human-athlete bw-human-outline bw-human-${front ? 'front' : 'side'}" fill="var(--bw-figure-paper, #f8fafc)" stroke="var(--bw-figure-ink, #123b60)" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"${mirror}>${layers}</g>`;
  }
  scope.drawBallwiseAthlete = drawBallwiseAthlete;
  scope.BWDrawHuman = { draw: drawBallwiseAthlete, armPoints, style: 'anatomical-outline-faceless' };
})(typeof window === 'object' ? window : globalThis);

/* Candidate teaching cycles. Only the separate observed-A adapter is source-timed.
 * These models retain distinct gather / same-foot-return / alternating schedules.
 * Segment lengths are fixed; numerical joint targets are not measured from film. */
(function (scope) {
  'use strict';
  const BW = scope.BWAnim;
  if (!BW) throw new Error('BWAnim core must load before skips');
  const GROUND = 264, THIGH = 57, SHIN = 56, REACH = 112.99, FREE_REACH = 112.9999;
  const mod = (x, n = 1) => ((x % n) + n) % n;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;
  const vec = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
  const bezier = (a, b, c, d, t) => [0, 1].map(i => (1 - t) ** 3 * a[i] + 3 * (1 - t) ** 2 * t * b[i] + 3 * (1 - t) * t * t * c[i] + t ** 3 * d[i]);
  function sole(angle) {
    const r = angle * Math.PI / 180;
    const toe = [16 * Math.cos(r) - 11 * Math.sin(r), 16 * Math.sin(r) + 11 * Math.cos(r)];
    const heel = [-7 * Math.cos(r) - 11 * Math.sin(r), -7 * Math.sin(r) + 11 * Math.cos(r)];
    return { toe, heel, lowest: Math.max(toe[1], heel[1]) };
  }
  function groundAnkle(anchorX, angle) {
    const s = sole(angle);
    // Forefoot stays at one world coordinate while the shoe rolls around it.
    return [anchorX + 16 - s.toe[0], GROUND - s.lowest];
  }
  function ik(hip, ankle) {
    const dx = ankle[0] - hip[0], dy = ankle[1] - hip[1], d = Math.hypot(dx, dy);
    const a = (THIGH * THIGH - SHIN * SHIN + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, THIGH * THIGH - a * a));
    return [hip[0] + a * dx / d + h * dy / d, hip[1] + a * dy / d - h * dx / d];
  }
  function makeLeg(hip, ankle, contact, footAngle, local, contactId) {
    let a = ankle;
    if (!contact) {
      let dx = a[0] - hip[0], dy = a[1] - hip[1], d = Math.hypot(dx, dy);
      if (d > FREE_REACH) { dx *= FREE_REACH / d; dy *= FREE_REACH / d; a = [hip[0] + dx, hip[1] + dy]; }
      const maxY = GROUND - sole(footAngle).lowest - .0000001;
      if (a[1] > maxY) a = [a[0], maxY];
    }
    return { knee: ik(hip, a), ankle: a, contact, footAngle, local, contactId: contact ? contactId || 'first' : null };
  }
  function contactAngle(u) {
    return u < .3 ? 6 * (1 - smooth(u / .3)) : u < .65 ? 0 : 10 * smooth((u - .65) / .35);
  }
  function extendedHip(ankle, x, u) {
    const compression = 2.4 * (1 - smooth(u / .36)) + .01;
    const length = 113 - compression;
    return ankle[1] - Math.sqrt(Math.max(1, length * length - (ankle[0] - x) ** 2));
  }
  const ENTRY_HIP = extendedHip(groundAnkle(154, 6), 154, 0);
  const EXIT_HIP = extendedHip(groundAnkle(154, 10), 154, 1);

  function support(q, rhythm) {
    if (rhythm === 'extra_bounce') {
      if (q < .13) return { contact: true, u: q / .13, id: 'first' };
      if (q >= .30 && q < .43) return { contact: true, u: (q - .30) / .13, id: 'return' };
      return { contact: false };
    }
    if (rhythm === 'gather') return { contact: q < .5 || q >= .91, u: 0, id: q >= .91 ? 'gather' : 'first' };
    if (rhythm === 'march') return { contact: q < .58, u: 0, id: 'first' };
    return { contact: q < .34, u: q / .34, id: 'first' };
  }
  function hipFor(p, rhythm, contacts) {
    if (rhythm === 'gather' || rhythm === 'march') {
      const half = mod(p, .5) / .5;
      const both = contacts[0].contact && contacts[1].contact;
      const y = rhythm === 'gather'
        ? 140.1 + 4.9 * (1 - smooth(half / .22)) + 4.9 * smooth((half - .68) / .14)
        : half < .16 ? 142.8 : 142.8 - 2.7 * smooth((half - .16) / .16) + 2.7 * smooth((half - .84) / .16);
      let x;
      if (rhythm === 'gather') x = p < .41 ? 146 : p < .5 ? mix(146, 162, smooth((p - .41) / .09)) : p < .91 ? 162 : mix(162, 146, smooth((p - .91) / .09));
      else x = p < .5 ? mix(146, 162, smooth(p < .08 ? 0 : p > .42 ? (p - .42) / .08 : 0)) : mix(162, 146, smooth((p - .92) / .08));
      // During a march the body transfers while both feet support; no flight.
      if (rhythm === 'march') x = p < .08 ? mix(162, 146, smooth(p / .08)) : p < .5 ? 146 : p < .58 ? mix(146, 162, smooth((p - .5) / .08)) : 162;
      return [x, y];
    }
    const half = mod(p, .5);
    const active = half < (rhythm === 'extra_bounce' ? .13 : .34) ? contacts[p < .5 ? 0 : 1] : rhythm === 'extra_bounce' && half >= .3 && half < .43 ? contacts[p < .5 ? 0 : 1] : null;
    if (active?.contact) return [154, extendedHip(groundAnkle(154, contactAngle(active.u)), 154, active.u)];
    const start = rhythm === 'extra_bounce' ? half < .3 ? .13 : .43 : .34;
    const end = rhythm === 'extra_bounce' && half < .3 ? .3 : .5;
    const u = clamp((half - start) / (end - start));
    return [154, mix(EXIT_HIP, ENTRY_HIP, smooth(u)) - (end - start > .1 ? 7 : 3) * Math.sin(Math.PI * u)];
  }
  function peak(kind) {
    if (kind === 'c') return [-14, 4]; // Heel folds under hip; knee remains slightly forward and below hip.
    if (kind === 'd') { const a = 25 * Math.PI / 180; return [112.8 * Math.sin(a), 112.8 * Math.cos(a)]; }
    if (kind === 'ankling') return [12, 110];
    if (kind === 'low') return [28, 83];
    if (kind === 'high') return [47, 64];
    return [57, 56];
  }
  function swing(kind, u, from, to) {
    u = clamp(u);const high = peak(kind);
    if (kind === 'd') {
      // The almost-straight leg sweeps from the hip; a small clearance is retained.
      const start = u < .46 ? from : high, end = u < .46 ? high : to;
      const t = smooth(u < .46 ? u / .46 : (u - .46) / .54);
      const angle = mix(Math.atan2(start[0], start[1]), Math.atan2(end[0], end[1]), t);
      const radius = mix(Math.hypot(...start), Math.hypot(...end), t);
      return [radius * Math.sin(angle), radius * Math.cos(angle)];
    }
    const liftEnd = kind === 'b' ? .40 : kind === 'c' ? .38 : .48;
    if (u < liftEnd) return bezier(from, [Math.min(from[0], -10), Math.min(from[1], 85)], kind === 'c' ? [-16, 25] : [28, Math.min(47, high[1])], high, smooth(u / liftEnd));
    if (kind === 'b') {
      const open = [88, 47];
      if (u < .63) return vec(high, open, smooth((u - .40) / .23));
      return bezier(open, [82, 66], [19, 101], to, smooth((u - .63) / .37));
    }
    if (u < .7) return high;
    return bezier(high, kind === 'c' ? [-11, 35] : [high[0], Math.max(high[1], 78)], [16, Math.max(100, to[1] - 2)], to, smooth((u - .7) / .3));
  }
  // Ankling is an ankle-height step-over, not a shortened high-knee skip.
  // The source describes small steps; all timings/coordinates here are authored.
  const ANKLING_CONTACT = .40;
  function anklingContactAngle(u) {
    return u < .18 ? 4 * (1 - smooth(u / .18)) : u < .25 ? 0 : 18 * smooth((u - .25) / .75);
  }
  function anklingSupportLength(u) { return mix(111.5, 112.8, smooth(u / .36)); }
  function anklingSupportHip(u) {
    const ankle = groundAnkle(154, anklingContactAngle(u)), length = anklingSupportLength(u);
    return ankle[1] - Math.sqrt(length * length - (ankle[0] - 154) ** 2);
  }
  const ANKLING_ENTRY_HIP = anklingSupportHip(0), ANKLING_EXIT_HIP = anklingSupportHip(1);
  function sampleAnkling(p) {
    p = mod(p);const half = mod(p, .5), flightU = clamp((half - ANKLING_CONTACT) / (.5 - ANKLING_CONTACT));
    const hip = [154, half < ANKLING_CONTACT ? anklingSupportHip(half / ANKLING_CONTACT)
      : mix(ANKLING_EXIT_HIP, ANKLING_ENTRY_HIP, smooth(flightU)) - .35 * Math.sin(Math.PI * flightU) ** 2];
    const legs = [p, mod(p + .5)].map(q => {
      if (q < ANKLING_CONTACT) {
        const u = q / ANKLING_CONTACT, angle = anklingContactAngle(u);
        return makeLeg(hip, groundAnkle(154, angle), true, angle, q, 'first');
      }
      const u = (q - ANKLING_CONTACT) / (1 - ANKLING_CONTACT);
      const angle = u < .35 ? mix(18, -14, smooth(u / .35)) : u < .65 ? -14 : mix(-14, 4, smooth((u - .65) / .35));
      const startDx = groundAnkle(154, 18)[0] - hip[0], endDx = groundAnkle(154, 4)[0] - hip[0];
      const dx = mix(startDx, endDx, smooth(u)) + 8 * Math.sin(Math.PI * u) ** 2;
      // A short, smooth recovery keeps the thigh almost vertical. Unlike the
      // shared skip curve there are no high Bézier controls or high-knee hold.
      const radius = u < .16 ? mix(112.8, 109.5, smooth(u / .16)) : u < .72 ? 109.5 : mix(109.5, 111.5, smooth((u - .72) / .28));
      const ankle = [hip[0] + dx, hip[1] + Math.sqrt(radius * radius - dx * dx)];
      return makeLeg(hip, ankle, false, angle, q);
    });
    const [right, left] = legs, active = right.contact ? right : left.contact ? left : null;
    return { p, hip, right, left, view: 'side', groundSpeed: 0, groundOffset: 0,
      armDrive: .12 * clamp((right.knee[1] - left.knee[1]) / 8, -1, 1),
      phase: !active ? 'Krótka zmiana podporu · stopa pozostaje nisko'
        : active.footAngle > 7 ? 'Przetoczenie przez przodostopie · niski krok'
          : 'Krótki kontakt pod biodrem · kolano miękkie' };
  }
  function sampleSkip(kind, rhythm, p) {
    if (kind === 'ankling') return sampleAnkling(p);
    p = mod(p);const qs = [p, mod(p + .5)], contacts = qs.map(q => support(q, rhythm));
    const hip = hipFor(p, rhythm, contacts);
    const anchors = rhythm === 'gather' || rhythm === 'march' ? [146, 162] : [154, 154];
    // Protect reach while two support feet straddle the pelvis.
    contacts.forEach((c, i) => { if (c.contact) {
      const a = groundAnkle(anchors[i], rhythm === 'gather' || rhythm === 'march' ? 0 : contactAngle(c.u));
      hip[1] = Math.max(hip[1], a[1] - Math.sqrt(Math.max(1, REACH * REACH - (a[0] - hip[0]) ** 2)));
    } });
    const legs = qs.map((q, i) => {
      const c = contacts[i];let relative, angle;
      if (c.contact) { angle = rhythm === 'gather' || rhythm === 'march' ? 0 : contactAngle(c.u); return makeLeg(hip, groundAnkle(anchors[i], angle), true, angle, q, c.id); }
      if (rhythm === 'extra_bounce' && q < .30) {
        // After lift-off this SAME support leg returns, while the other knee stays up.
        const u = (q - .13) / .17;angle = mix(10, 6, smooth(u));const a = groundAnkle(154, angle);
        const baseline = mix(EXIT_HIP, ENTRY_HIP, smooth(u));
        return makeLeg(hip, [a[0], a[1] + hip[1] - baseline - .6 * Math.sin(Math.PI * u)], false, angle, q);
      }
      let start, end;
      if (rhythm === 'gather') { start = .5; end = .91; }
      else if (rhythm === 'march') { start = .58; end = 1; }
      else if (rhythm === 'extra_bounce') { start = .43; end = 1; }
      else { start = .34; end = 1; }
      const u = (q - start) / (end - start);
      const startAngle = rhythm === 'gather' || rhythm === 'march' ? 0 : 10, endAngle = rhythm === 'gather' || rhythm === 'march' ? 0 : 6;
      const a0 = groundAnkle(anchors[i], startAngle), a1 = groundAnkle(anchors[i], endAngle);
      const from = [a0[0] - hip[0], a0[1] - hip[1]], to = [a1[0] - hip[0], a1[1] - hip[1]];
      relative = swing(kind, u, from, to);angle = mix(startAngle, -14, smooth(u / .25));
      if (u > .75) angle = mix(-14, endAngle, smooth((u - .75) / .25));
      return makeLeg(hip, [hip[0] + relative[0], hip[1] + relative[1]], false, angle, q);
    });
    const [right, left] = legs;
    const returned = right.contactId === 'return' || left.contactId === 'return';
    const gathered = right.contact && left.contact;
    const bOpen = kind === 'b' && legs.some((l, i) => !l.contact && qs[i] > .65 && qs[i] < .80);
    return { p, hip, right, left, view: 'side', groundSpeed: 0,
      armDrive: clamp((right.knee[1] - left.knee[1]) / 57, -1, 1),
      phase: gathered ? 'Dostawienie · obie stopy pod sobą' : returned ? 'Ponowny kontakt tej samej nogi' : !right.contact && !left.contact ? 'Faza lotu' : bOpen ? 'Ograniczone otwarcie podudzia' : kind === 'c' ? 'Pięta wraca krótko pod biodro' : kind === 'd' ? 'Nożyce · ruch z biodra' : rhythm === 'march' ? 'Marsz · bez fazy lotu' : 'Uniesienie → kontakt pod biodrem' };
  }
  function register(id, title, kind, rhythm, extraNotes = [], durationMs = 1800) {
    BW.register(id, { title, durationMs, view: 'side', sourceVerified: false,
      notes: ['Propozycja ruchu i rytmu do wspólnej oceny; nie pomiar z nagrania.', ...extraNotes],
      sample: p => sampleSkip(kind, rhythm, p) });
  }
  for (const [kind, title] of [['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D']]) {
    register(`${kind}_skip`, `Skip ${title}`, kind, 'extra_bounce', kind === 'b' ? ['Punkt odniesienia korekty35–40° pozostaje do uzgodnienia; liczby nie naniesiono na model.'] : []);
    for (const [rhythm, name] of [['gather', 'z dostawieniem'], ['extra_bounce', 'z dodatkowym odbiciem'], ['continuous', 'ciągły']])
      register(`review:${kind}_skip:${rhythm}`, `Skip ${title} — ${name}`, kind, rhythm, ['Oddzielny rytm; akceptacja wersji bazowej nie zatwierdza tego wariantu.'], rhythm === 'gather' ? 2400 : 1800);
  }
  register('a_march', 'Marsz A', 'a', 'march', ['Stały kontakt co najmniej jednej stopy z podłożem.'], 3000);
  register('a_skip_add_step', 'Skip A z add-step', 'a', 'extra_bounce', ['Roboczo: dodatkowe odbicie na tej samej nodze według quickGuide. Opis biblioteki mówi też o dostawieniu — znaczenie ID wymaga ujednolicenia.'], 2200);
  register('a_skip_no_add_step', 'Skip A bez add-step', 'a', 'continuous', ['Naprzemienne kontakty, bez powrotu na tę samą nogę.']);

  // True rapid exchanges: alternating A positions without an added same-foot hop.
  function exchange(u, startRight = true) {
    u = clamp(u);const airborne = u >= .16 && u < .68;
    // Near extension belongs to the settled high-support position only.
    // This is authored teaching geometry, not an angle measured from the source.
    const target = 179.5 * Math.PI / 180;
    const extendedHipY = 253 - Math.sqrt(THIGH * THIGH + SHIN * SHIN - 2 * THIGH * SHIN * Math.cos(target));
    const absorption = u >= .68 && u < .91 ? 1.4 * Math.sin(Math.PI * (u - .68) / .23) ** 2 : 0;
    const y = airborne ? extendedHipY - 3 * Math.sin(Math.PI * (u - .16) / .52) : extendedHipY + absorption;
    const hip = [154, y];
    const grounded = groundAnkle(154, 0), low = [0, grounded[1] - y], high = [57, 56];
    const lift = u < .16 ? low : u >= .68 ? high : bezier(low, [-8, 84], [35, 47], high, smooth((u - .16) / .52));
    const lower = u < .16 ? high : u >= .68 ? low : bezier(high, [54, 76], [10, 106], low, smooth((u - .16) / .52));
    const outgoingAngle = u < .16 ? 0 : -12 * smooth((u - .16) / .20);
    const incomingAngle = u >= .68 ? 0 : mix(-12, 0, smooth((u - .16) / .52));
    const outgoing = makeLeg(hip, [154 + lift[0], y + lift[1]], u < .16, outgoingAngle, u, 'first');
    const incoming = makeLeg(hip, [154 + lower[0], y + lower[1]], u >= .68, incomingAngle, u, 'first');
    const right = startRight ? outgoing : incoming, left = startRight ? incoming : outgoing;
    return { p: u, hip, right, left, view: 'side', groundSpeed: 0, phase: airborne ? 'Szybka wymiana · krótki lot' : 'Pozycja A · kontakt pod biodrem', armDrive: clamp((right.knee[1] - left.knee[1]) / 57, -1, 1) };
  }
  function exchangeSeries(progress, count, completed = 0) {
    const raw = clamp(progress) * count, index = Math.min(count - 1, Math.floor(raw)), u = raw >= count ? 1 : raw - index;
    return exchange(u, (completed + index) % 2 === 0);
  }
  function inclineWholeBody(scene, degrees) {
    const pivot = [170, GROUND], radians = degrees * Math.PI / 180;
    const rotate = point => {
      const x = point[0] - pivot[0], y = point[1] - pivot[1];
      return [pivot[0] + x * Math.cos(radians) - y * Math.sin(radians), pivot[1] + x * Math.sin(radians) + y * Math.cos(radians)];
    };
    const hip = rotate(scene.hip);
    const tiltLeg = original => {
      const ankle = rotate(original.ankle), footAngle = original.footAngle + degrees;
      const changed = { ...original, ankle, knee: rotate(original.knee), footAngle };
      if (!original.contact && ankle[1] + sole(footAngle).lowest > GROUND - .0000001)
        return makeLeg(hip, [ankle[0], GROUND - sole(footAngle).lowest - .0000001], false, footAngle, original.local);
      return changed;
    };
    return { ...scene, hip, right: tiltLeg(scene.right), left: tiltLeg(scene.left), torsoAngle: degrees };
  }
  for (const [id, count, label] of [['switch_skip_a', 1, 'Jedna wymiana → skip A'], ['double_switch_skip_a', 2, 'Dwie wymiany → skip A']]) {
    BW.register(id, { title: label, durationMs: count === 1 ? 2800 : 3400, view: 'side', sourceVerified: false,
      notes: ['Szybka wymiana w miejscu, potem ciągły rytm. Dystans i prędkość biegu wynikają z sesji.'],
      sample(p) { p = mod(p);const prelude = .24, mainCount = count === 1 ? 3 : 4;
        const scene = p < prelude ? exchangeSeries(p / prelude, count) : exchangeSeries((p - prelude) / (1 - prelude), mainCount, count);
        scene.p = p;scene.phase = p < prelude ? `${count === 1 ? 'Pojedyncza' : 'Podwójna'} wymiana w miejscu` : 'Wejście w ciągły rytm skipu A';return scene; } });
  }
  BW.register('a_switch_progression', { title: 'Zmiany A: pojedyncza → podwójna → potrójna', durationMs: 6500, view: 'side', sourceVerified: false,
    notes: ['Sekwencja1→2→3 z zatrzymaniem nowej pozycji po serii. Małe pochylenie obejmuje nogę podporową i tułów, bez załamania w pasie. Model autorski wymaga porównania z zaakceptowanym wzorem.'],
    sample(p) { p = mod(p);let scene;
      if (p < .12) scene = exchangeSeries(p / .12, 1);
      else if (p < .28) scene = exchangeSeries(1, 1);
      else if (p < .48) scene = exchangeSeries((p - .28) / .20, 2, 1);
      else if (p < .64) scene = exchangeSeries(1, 2, 1);
      else if (p < .88) scene = exchangeSeries((p - .64) / .24, 3, 3);
      else scene = exchangeSeries(1, 3, 3);
      scene.p = p;scene.phase = p < .28 ? '1 wymiana → zatrzymaj pozycję' : p < .64 ? '2 wymiany → zatrzymaj pozycję' : '3 wymiany → zatrzymaj pozycję';return inclineWholeBody(scene, 8); } });

  for (const [id, kind, title] of [['a_accent', 'a', 'A-accent'], ['c_accent', 'c', 'C-accent']]) {
    BW.register(id, { title, durationMs: 5200, view: 'side', sourceVerified: false,
      notes: ['Dwie oddzielne serie3+1. Drugą zacznij od przeciwnej nogi, aby akcent wykonała druga strona. Zmianę nogi pokazano po wygaszeniu widoku.', 'Akcent oznacza intencję kontaktu, nie wymuszony wysoki skok. W C czwarty cykl jest krótszy w obu seriach.'],
      sample(p) {
        p = mod(p);
        const weights = kind === 'c' ? [1, 1, 1, .7] : [1, 1, 1, 1];
        const total = weights.reduce((a, b) => a + b, 0);
        const first = p < .44, second = p >= .50 && p < .94;
        const series = first ? 0 : 1;
        if (!first && !second) {
          const nextLead = p < .50 ? 1 : 0;
          const scene = sampleSkip(kind, 'continuous', nextLead * .5);
          return { ...scene, p, opacity: 0, reset: true, accentLeg: null, seriesIndex: nextLead,
            phase: 'Zmiana nogi akcentującej · ustawienie do kolejnej serii3+1', extras: '' };
        }
        const q = first ? p / .44 : (p - .50) / .44;
        let cursor = q * total, index = 0;
        while (index < weights.length - 1 && cursor >= weights[index]) { cursor -= weights[index];index++; }
        const local = cursor / weights[index], leadingOffset = series;
        const scene = sampleSkip(kind, 'continuous', mod((index + leadingOffset) * .5 + local * .5));
        const accentLeg = (index + leadingOffset) % 2 === 0 ? 'right' : 'left';
        scene.p = p;scene.seriesIndex = series;scene.contactOrdinal = index + 1;scene.accentLeg = index === 3 ? accentLeg : null;
        scene.opacity = Math.min(1, clamp(q / .05), clamp((1 - q) / .05));
        scene.phase = `Seria${series + 1} · ` + (index === 3 ? `4 · akcent ${accentLeg === 'right' ? 'prawej' : 'lewej'} nogi` : `${index + 1} · lekko`);
        scene.extras = index === 3 ? '<path d="M132 276H178" stroke="#e8c46a" stroke-width="3"/><text x="188" y="279" font-size="10" fill="#e8c46a">AKCENT</text>' : '';
        return scene;
      } });
  }
  BW.register('ankling', { title: 'Ankling', durationMs: 700, view: 'side', sourceVerified: false,
    notes: ['Athletics Ireland: małe kroki, z niskim przejściem stopy nad przeciwną kostką; tułów pozostaje wysoko.',
      'Osobny tor stopy podkreśla przetoczenie w stawie skokowym i niski krok, bez unoszenia kolana jak w skipie A.',
      'Tor i tempo podglądu są ilustracyjne; kadencji i czasów kontaktu nie mierzono z filmu.'],
    sources: [{ title: 'Athletics Ireland · Ankling, strona16', url: 'https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=16', videoUrl: 'https://www.youtube.com/watch?v=E8u20hnng7A' }],
    sample: sampleAnkling });
  register('low_dribble', 'Niski dribble', 'low', 'continuous', ['Tor krótkiego koła stopy na niskiej wysokości. To drill biegowy, bez piłki.'], 1600);
  register('high_dribble', 'Wysoki dribble', 'high', 'continuous', ['Wyższy cykl nogi niż w niskim dribble; nie jest to kopnięcie prostą nogą.'], 1700);

  for (const [id, title, sequence] of [
    ['skip_a_to_d', 'Skip A → Skip D', ['a_skip', 'd_skip']],
    ['skip_b_alternate_bounds', 'Skip B → wieloskok naprzemienny', ['b_skip', 'alternate_leg_bounds']],
    ['dribble_to_sprint_transition', 'Dribble → sprint', ['low_dribble', 'high_dribble', 'free_acceleration_sprint']],
  ]) BW.register(id, { title, durationMs: sequence.length * 2200, view: 'side', sourceVerified: false,
    notes: ['Połączenie kilku wzorców. Moment i wykonanie przejścia wymagają oddzielnej oceny; poprawność części nie zatwierdza całego zestawu.'],
    sample(p) { const scene = BW.compose(sequence, mod(p));scene.phase = title + ' · ' + (scene.phase || 'przejście');return scene; } });

  scope.BWAnim.skipModelSample = sampleSkip;
})(typeof window === 'object' ? window : globalThis);

/* Candidate teaching reconstructions. No numerical cadence/joint angles are
 * claimed as measured from reference footage. Ground is y264. */
(function(scope){
 'use strict';
 const A=scope.BWAnim,M=A.math,G=264,TA=57,TB=56;
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mod=(x,n=1)=>(x%n+n)%n;
 const mix=(a,b,t)=>a+(b-a)*t,smooth=t=>t*t*(3-2*t);
 const pt=(a,b,t)=>[mix(a[0],b[0],t),mix(a[1],b[1],t)];
 const bez=(a,b,c,d,t)=>[0,1].map(i=>(1-t)**3*a[i]+3*(1-t)**2*t*b[i]+3*(1-t)*t*t*c[i]+t**3*d[i]);
 const rotate=(v,a)=>{const r=a*Math.PI/180;return[v[0]*Math.cos(r)-v[1]*Math.sin(r),v[0]*Math.sin(r)+v[1]*Math.cos(r)];};
 const sole=a=>{const toe=rotate([16,11],a),heel=rotate([-7,11],a);return{toe,heel,lowest:Math.max(toe[1],heel[1])};};
 function limb(hip,target,contact=false,angle=0){
  const end=[target[0],Math.min(target[1],G-sole(angle).lowest-(contact?0:.025))];
  if(contact)end[1]=G-sole(angle).lowest;
  const result=M.leg(hip,end,contact,angle);return{...result,footAngle:angle,contact,local:0};
 }
 function scene(p,hip,right,left,extra={}){return{p,hip,right,left,view:'side',phase:'Bieg',groundOffset:0,...extra};}
 function standing(p=0,spread=0,theta=0){const hip=[154,142];return scene(p,hip,limb(hip,[148-spread,253],true),limb(hip,[158+spread,253],true),{torsoAngle:theta,armDrive:0,phase:'Ustawienie'});}
 function run(p,lean=0,intensity=1){
  p=mod(p);const support=.29,weight=clamp((lean-4)/26),baseY=mix(141.5,149,weight),landing=mix(4,-7,weight),stride=27,hip=[154-landing,baseY];
  // Both feet are off the floor between stance windows. Body rises modestly.
  const half=mod(p*2),st=half/2;
  intensity=clamp(intensity,.2,1);
  hip[1]-=st>support?5*intensity*Math.sin(Math.PI*(st-support)/(.5-support)):0;
  function leg(local){
   local=mod(local);const contact=local<support;
   let rel,angle;
   if(contact){const u=local/support;angle=u<.25?6*(1-smooth(u/.25)):u>.7?9*smooth((u-.7)/.3):0;const s=sole(angle);rel=[landing-stride*u+16-s.toe[0],G-s.lowest-hip[1]];}
   else if(local<.54){const u=(local-support)/(.54-support),toe=sole(9);rel=bez([landing-stride+16-toe.toe[0],G-toe.lowest-baseY],[-35,80],[-31,41],[12,44],u);angle=mix(9,-14,smooth(u));}
   else if(local<.7){const u=(local-.54)/.16;rel=bez([12,44],[25,40],[44,48],[45,56],u);angle=-14;}
   else{const u=(local-.7)/.3,s=sole(6);rel=bez([45,56],[44,79],[20,104],[landing+16-s.toe[0],G-s.lowest-baseY],u);angle=mix(-14,6,smooth(u));}
   if(!contact&&intensity<1){const q=(local-support)/(1-support),a=sole(9),b=sole(6),low=[mix(landing-stride+16-a.toe[0],landing+16-b.toe[0],q),mix(G-a.lowest-baseY,G-b.lowest-baseY,q)-14*Math.sin(Math.PI*q)];rel=pt(low,rel,intensity);angle=mix(mix(9,6,q)-7*Math.sin(Math.PI*q),angle,intensity);}
   const l=limb(hip,[hip[0]+rel[0],hip[1]+rel[1]],contact,angle);l.local=local;l.contactId=contact?'stance':null;return l;
  }
  const right=leg(p),left=leg(p+.5),armDrive=clamp((right.knee[1]-left.knee[1])/49,-1,1);
  return scene(p,hip,right,left,{torsoAngle:lean,armDrive,groundOffset:p*stride/support,phase:right.contact||left.contact?'Podpór i pchnięcie podłoża':'Faza lotu',intensity});
 }
 function blend(a,b,t,p){
  const hip=pt(a.hip,b.hip,t);
  function l(id){const x=a[id],y=b[id],end=pt(x.ankle,y.ankle,t),angle=mix(x.footAngle||0,y.footAngle||0,t);return limb(hip,end,x.contact&&y.contact,angle);}
  const aa=armCoordinates(a),bb=armCoordinates(b),arms={right:{elbow:pt(aa.right.elbow,bb.right.elbow,t),wrist:pt(aa.right.wrist,bb.right.wrist,t)},left:{elbow:pt(aa.left.elbow,bb.left.elbow,t),wrist:pt(aa.left.wrist,bb.left.wrist,t)}};
  return scene(p,hip,l('right'),l('left'),{torsoAngle:mix(a.torsoAngle||0,b.torsoAngle||0,t),armDrive:mix(a.armDrive||0,b.armDrive||0,t),arms,phase:'Przejście do pierwszego kroku'});
 }
 const candidate=['Rekonstrukcja poglądowa do wspólnego sprawdzenia; rytm i pozycje stawów nie są pomiarem nagrania.'];
 function reg(id,title,sample,duration=3000,notes=[],view='side'){
  A.register(id,{title,durationMs:duration,view,sourceVerified:false,notes:[...candidate,...notes],sample});
 }
 function fade(p){return Math.min(clamp(p/.07),clamp((1-p)/.07));}
 function finishPose(p,pose){pose.p=p;pose.opacity=fade(p);return pose;}
 function armCoordinates(s){
  const result={};for(const side of['right','left']){if(s.arms&&s.arms[side]){result[side]=s.arms[side];continue;}const far=side==='left',front=s.view==='front',shoulder=pt(s.hip,s.hip,0),shift=rotate(front?[far?-16:16,-58]:[-1,-59],s.torsoAngle||0);shoulder[0]+=shift[0];shoulder[1]+=shift[1];const swing=(s.armDrive||0)*(far?-1:1),a=swing*.6,el=front?[(far?-1:1)*(11+3*Math.abs(swing)),27-4*swing]:[Math.sin(a)*30,Math.cos(a)*30],wr=front?[(far?-1:1)*(5+2*Math.abs(swing)),46-14*swing]:[el[0]+Math.cos(a)*23,el[1]-Math.sin(a)*23];const e=rotate(el,s.torsoAngle||0),w=rotate(wr,s.torsoAngle||0);result[side]={elbow:[shoulder[0]+e[0],shoulder[1]+e[1]],wrist:[shoulder[0]+w[0],shoulder[1]+w[1]]};}return result;
 }
 function airMove(hip,from,to,u,angleFrom,angleTo,lift=12){const v=smooth(clamp(u)),end=pt(from,to,v);end[1]-=lift*Math.sin(Math.PI*v);return limb(hip,end,false,mix(angleFrom,angleTo,v));}

 // Wall tasks: hands remain on the wall; the support foot stays fixed.
 function wallPose(p,side=0){
  const hip=[155,151.25],support=[106,253],raised=[194,194],right=side<.5?limb(hip,support,true):limb(hip,raised,false,-12),left=side<.5?limb(hip,raised,false,-12):limb(hip,support,true);
  return scene(p,hip,right,left,{torsoAngle:30,armDrive:0,arms:{right:{elbow:[216,98],wrist:[237,91]},left:{elbow:[211,100],wrist:[237,94]}},extras:'<path d="M250 35V264" stroke="#a3b5c4" stroke-width="6"/><path d="M253 35h16v229h-16" fill="#243a4d"/>',phase:'Utrzymaj linię ciała i podparcie dłoni'});
 }
 function wallSwitch(p,count){
  let side=0;const start=.23,spacing=.15,width=.075;
  for(let i=0;i<count;i++){const at=start+i*spacing;if(p>=at+width)side=(i+1)%2;else if(p>at){const a=wallPose(p,i%2),b=wallPose(p,(i+1)%2),s=blend(a,b,smooth((p-at)/width),p);s.arms=a.arms;s.torsoAngle=30;s.extras=a.extras;s.phase=`Zmiana ${i+1} z ${count}`;s.opacity=fade(p);return s;}}
  const out=wallPose(p,side);out.phase=p<start?'Pozycja wyjściowa przy ścianie':`Zatrzymanie po ${count===1?'jednej zmianie':count===2?'dwóch zmianach':'trzech zmianach'}`;return finishPose(p,out);
 }
 reg('wall_march','Marsz przy ścianie',p=>{
  const u=mod(p*2),side=p<.5?0:1;
  const a=wallPose(p,side),b=wallPose(p,1-side);
  if(u<.45){a.phase='Uniesienie kolana · spokojny marsz przy ścianie';return a;}
  const support=side===0?'right':'left',moving=side===0?'left':'right',out={...a};
  if(u<.67){out[moving]=airMove(a.hip,a[moving].ankle,b[moving].ankle,(u-.45)/.22,-12,0,5);out.phase='Opuść nogę · druga stopa pozostaje na ziemi';}
  else if(u<.75){out[moving]=b[moving];out.phase='Krótki podwójny podpór · przenieś ciężar';}
  else{out[moving]=b[moving];out[support]=airMove(a.hip,a[support].ankle,b[support].ankle,(u-.75)/.25,0,-12,6);out.phase='Unieś drugie kolano · zachowaj pojedynczy podpór';}
  return out;
 },3200,['W fazie podporu noga jest wydłużona, bez przeprostu.']);
 reg('wall_single_switch','Pojedyncza zmiana przy ścianie',p=>wallSwitch(p,1),2800);
 reg('wall_double_switch','Podwójna zmiana przy ścianie',p=>wallSwitch(p,2),2800);
 reg('wall_triple_switch','Potrójna zmiana przy ścianie',p=>wallSwitch(p,3),3000);

 reg('acceleration_mechanics','Mechanika przyspieszenia',p=>run(p,30),1000,['Pokaz jednego cyklu, nie całego odcinka sprintu.']);
 reg('max_velocity_high_volume','Prędkość maksymalna',p=>run(p,4),900,['Objętość wynika z planu; animacja pokazuje technikę pojedynczego cyklu.']);
 function accelerationSegment(p,cycles=5,offset=0){const lean=mix(32,8,smooth(p)),out=run(mod(offset+p*cycles),lean);out.p=p;out.groundOffset=p*cycles*27/.29;out.phase=p<.3?'Pierwsze kroki · pchaj podłoże za siebie':p<.8?'Narastanie prędkości · stopniowe unoszenie tułowia':'Bieg przez koniec odcinka';return out;}
 reg('free_acceleration_sprint','Swobodny sprint akceleracyjny',p=>finishPose(p,accelerationSegment(p,5)),5000);
 reg('progressive_build_up_sprint','Progresywny bieg narastający',p=>{
  const cycles=3*p+2*p*p,out=run(mod(cycles),mix(18,3,p),mix(.45,1,p));out.p=p;out.groundOffset=cycles*27/.29;out.phase=p<.35?'Spokojne wejście w bieg':p<.75?'Płynne narastanie prędkości':'Szybki, swobodny bieg';return finishPose(p,out);
 },5000);
 reg('flying_sprint','Sprint lotny',p=>{
  const q=p-.72,cycles=p<.3?3*p+5*p*p:p<.72?1.35+6*(p-.3):3.87+6*q-4/.56*q*q;
  const out=run(mod(cycles),p<.3?mix(18,3,p/.3):3);out.p=p;out.groundOffset=cycles*27/.29;
  out.phase=p<.3?'Rozbieg przed strefą':p<.72?'Odcinek lotny · wysoka swobodna pozycja':'Stopniowe wyhamowanie za strefą';out.extras=`<rect x="20" y="22" width="${320*(p<.3?.3:p<.72?.42:.28)}" height="5" fill="${p<.3?'#8196b0':p<.72?'#5387ad':'#deb173'}"/><text x="20" y="17" fill="#a9c0d2" font-size="10">ROZBIEG · LOTNY · WYHAMOWANIE</text>`;return finishPose(p,out);
 },6000,['Podział stref jest schematem; odległości i dawkę bierze się z sesji.']);
 reg('upright_football_sprint','Piłkarski sprint wyprostowany',p=>{const out=run(mod(p*4),4);out.p=p;out.groundOffset=p*4*27/.29;out.phase='Wysoka, swobodna pozycja sprintu';return out;},3600);
 reg('fast_relaxed_fast_run','Szybko–luźno–szybko',p=>{
  const third=Math.min(2,Math.floor(p*3)),time=4*p+Math.sin(2*Math.PI*p)/(2*Math.PI),out=run(mod(time),4,.85+.15*Math.cos(2*Math.PI*p));out.p=p;out.groundOffset=time*27/.29;out.phase=['Szybko · kontrolowana prędkość','Luźno · zachowaj rytm i rozluźnij barki','Ponownie szybko · płynne przyspieszenie'][third];return out;
 },5000);
 reg('bwprep:walk','Lekki trucht',p=>{const out=run(p,3,.45);out.phase='Lekki trucht · spokojna praca ramion';return out;},1600,['Identyfikator historyczny „walk” oznacza w tej sesji lekki trucht.']);
 reg('bwprep:run','Bieg narastająco',p=>{const cycles=2*p+2*p*p,out=run(mod(cycles),mix(12,3,p),mix(.45,.9,p));out.p=p;out.groundOffset=cycles*27/.29;out.phase='Rozgrzewkowy bieg narastający';return finishPose(p,out);},4200);

 function initialStart(kind,p){
  if(kind==='push'){
   const hip=[152,223],foot=[43.2,253];return scene(p,hip,limb(hip,foot,true),limb(hip,foot,true),{torsoAngle:74,armDrive:0,arms:{right:{elbow:[215,229],wrist:[219,254]},left:{elbow:[211,230],wrist:[215,254]}},phase:'Podpór przodem · dłonie pod barkami',extras:'<path d="M210 263h17" stroke="#d9a17b" stroke-width="2"/>'});
  }
  if(kind==='kneel'){
   const hip=[146,201],rearAngle=65,rear=[91.56,G-sole(rearAngle).lowest];return scene(p,hip,limb(hip,[203,253],true),limb(hip,rear,true,rearAngle),{torsoAngle:8,armDrive:.7,phase:'Półklęk · jedna stopa z przodu, tylne kolano nisko',extras:'<ellipse cx="146" cy="263" rx="8" ry="1" fill="#9abbca" opacity=".5"/>'});
  }
  if(kind==='lateral'||kind==='cross'){
   const hip=[154,149],cross=kind==='cross';return scene(p,hip,limb(hip,[cross?165:132,253],true),limb(hip,[cross?148:177,253],true),{view:'front',torsoAngle:0,armDrive:0,phase:cross?'Ustawienie skrzyżne · noga przechodzi przed drugą':'Pozycja bokiem do kierunku startu',extras:'<path d="M215 238h36m-8-5 8 5-8 5" stroke="#6b94b4" fill="none" stroke-width="2"/>'});
  }
  if(kind==='turn'){const out=standing(p,6,0);out.facing=-1;out.phase='Pozycja przed obrotem · wariant do uzgodnienia';return out;}
  if(kind==='fall'){const angle=mix(0,15,smooth(clamp(p/.22))),base=standing(p,0,angle),r=angle*Math.PI/180;base.hip=[154+112.95*Math.sin(r),253-112.95*Math.cos(r)];base.right=limb(base.hip,[154,253],true);base.left=limb(base.hip,[154,253],true);base.phase='Pochylenie całego ciała od stawów skokowych';return base;}
  const hip=[154,151];return scene(p,hip,limb(hip,[169,253],true),limb(hip,[125,253],true),{torsoAngle:23,armDrive:.6,phase:'Pozycja wykroczna · ciężar z przodu'});
 }
 // Step one foot while the original support stays planted; only then rise and
 // swing the rear leg. This avoids sliding a grounded foot across the start.
 function startTransfer(from,to,u,p,options={}){
  const split=.4,out={...from,p,opacity:1},aa=armCoordinates(from),bb=armCoordinates(to);
  // Push-up start: the left foot advances while the opposite (right) arm
  // releases. The left hand stays planted until the new left-foot support.
  const shoulderShift=rotate([-1,-59],from.torsoAngle||0),shoulder=[from.hip[0]+shoulderShift[0],from.hip[1]+shoulderShift[1]];
  const released=options.releaseOppositeArm?{right:{elbow:[shoulder[0]+14,shoulder[1]+26],wrist:[shoulder[0]+32,shoulder[1]+12]},left:aa.left}:aa;
  if(u<split){
   out.left=airMove(from.hip,from.left.ankle,to.left.ankle,u/split,from.left.footAngle||0,to.left.footAngle||0,16);
   if(u===0)out.left=from.left;
   const v=smooth(u/split);out.arms=options.releaseOppositeArm?{right:{elbow:pt(aa.right.elbow,released.right.elbow,v),wrist:pt(aa.right.wrist,released.right.wrist,v)},left:aa.left}:aa;
   if(options.releaseOppositeArm){out.extras='<path d="M210 263h11" stroke="#d9a17b" stroke-width="2"/>';out.phase='Lewa stopa pod biodro i prawa ręka w ruch · lewa dłoń pozostaje w podporze';}
   else out.phase='Przenieś wolną stopę pod biodro · druga noga pozostaje w podporze';return out;
  }
  const q=smooth((u-split)/(1-split)),hip=pt(from.hip,to.hip,q);out.hip=hip;
  out.left=limb(hip,to.left.ankle,true,to.left.footAngle||0);
  out.right=airMove(hip,from.right.ankle,to.right.ankle,(u-split)/(1-split),from.right.footAngle||0,to.right.footAngle||0,10);
  if(u===split)out.right=limb(hip,from.right.ankle,true,from.right.footAngle||0);
  out.torsoAngle=mix(from.torsoAngle||0,to.torsoAngle||0,q);out.armDrive=mix(from.armDrive||0,to.armDrive||0,q);
  out.arms={right:{elbow:pt(released.right.elbow,bb.right.elbow,q),wrist:pt(released.right.wrist,bb.right.wrist,q)},left:{elbow:pt(released.left.elbow,bb.left.elbow,q),wrist:pt(released.left.wrist,bb.left.wrist,q)}};
  out.extras='';out.phase='Pchnięcie z nowego podporu · tylna noga i ręce ruszają do biegu';return out;
 }
 function start(kind,p){
  const hold=kind==='audio'?.34:.26,transfer=.18;
  if(p<hold){const out=initialStart(kind==='audio'?'split':kind,p);if(kind==='audio'){out.phase='Czekaj na sygnał · bez przedwczesnego ruchu';out.extras='<circle cx="297" cy="44" r="12" fill="#526477"/><text x="276" y="68" fill="#b9cbd8" font-size="9">CZEKAJ</text>';}return finishPose(p,out);}
  const target=accelerationSegment(clamp((p-hold-transfer)/(1-hold-transfer)),4,.5);
  if(p<hold+transfer){const u=(p-hold)/transfer,from=initialStart(kind==='audio'?'split':kind,hold),to=run(.5,32),out=startTransfer(from,to,u,p,{releaseOppositeArm:kind==='push'});out.opacity=fade(p);const viewChange=kind==='turn'||kind==='lateral'||kind==='cross';
   if(viewChange){out.view=u<.4?from.view:'side';out.facing=u<.4?(from.facing||1):1;out.opacity*=u<.4?clamp((.4-u)/.13):clamp((u-.4)/.13);}else{out.view='side';out.facing=1;}
   if(kind==='audio')out.extras='<circle cx="297" cy="44" r="12" fill="#8cb5d3"/><text x="278" y="68" fill="#b9cbd8" font-size="9">START</text>';if(kind==='turn')out.extras='<path d="M282 37a13 13 0 1 1 20 12m-2-8 3 9-9 1" fill="none" stroke="#6b94b4" stroke-width="2"/>';return out;}
  target.p=p;target.opacity=fade(p);if(kind==='audio')target.extras='<circle cx="297" cy="44" r="9" fill="#8cb5d3"/>';return target;
 }
 reg('falling_start','Start z upadku',p=>start('fall',p),5400);
 reg('split_stance_start','Start z pozycji wykrocznej',p=>start('split',p),5400);
 reg('push_up_start','Start z podporu',p=>start('push',p),5800,['Położenie dłoni oraz pierwszy krok wymagają porównania z wybranym filmem.']);
 reg('half_kneeling_start','Start z półklęku',p=>start('kneel',p),5600);
 reg('lateral_start_acceleration','Start boczny do przyspieszenia',p=>start('lateral',p),5400,['Ustawienie pokazano z przodu, przyspieszenie z boku; przejście ujęcia nie jest pomiarem obrotu ciała.']);
 reg('crossover_start_acceleration','Start skrzyżny do przyspieszenia',p=>start('cross',p),5400,['Skrzyżne ustawienie i wybór nogi do uzgodnienia; dwa ujęcia podglądu.']);
 reg('turn_and_go_start','Start obróć się i biegnij',p=>start('turn',p),5600,['Brak dokładnego wzorca źródłowego: pokazany obrót jest wariantem DO UZGODNIENIA, nie zatwierdzoną instrukcją.']);
 reg('app_audio_reaction_start','Start reakcyjny na sygnał',p=>start('audio',p),5800,['W podglądzie sygnał pokazano wizualnie; reakcja następuje dopiero po sygnale.']);

 function curve(p,reactive){
  const u=reactive?clamp((p-.32)/.68):p;
  let out;if(reactive&&p<.18)out=standing(p,5);else if(reactive&&p<.32)out=startTransfer(standing(p,5),run(.5,5),(p-.18)/.14,p);else out=run(mod((reactive?.5:0)+u*4),5);
  out.p=p;out.groundOffset=u*4*27/.29;
  const t=mix(Math.PI,0,u),cx=284+29*Math.cos(t),cy=62-19*Math.sin(t);
  out.extras=`<rect x="240" y="20" width="102" height="73" rx="8" fill="#102334"/><path d="M255 63Q284 22 313 63" stroke="#698a9e" stroke-width="2" fill="none"/><circle cx="${cx}" cy="${cy}" r="4" fill="#90b8d6"/><text x="248" y="85" fill="#a5bfce" font-size="8">TOR BIEGU Z GÓRY</text>`;
  out.phase=reactive&&p<.18?'Czekaj na kierunek · bez zgadywania':'Płynny bieg po łuku · bez ostrego cięcia';return finishPose(p,out);
 }
 reg('football_curved_sprint','Sprint po łuku',p=>curve(p,false),4400,['Tor biegu pokazano dodatkowo z góry. Widok boczny nie odwzorowuje przechylenia do środka łuku; potrzebna ocena ujęcia przestrzennego.']);
 reg('reactive_curved_sprint','Reaktywny sprint po łuku',p=>curve(p,true),4800,['Wybór łuku pokazany schematycznie. Dokładne ustawienie ciała na łuku wymaga odrębnego ujęcia i oceny.']);
 reg('resisted_sled_acceleration','Przyspieszenie z oporem sań',p=>{
  const out=run(mod(p*3),31),[hx,hy]=out.hip;out.p=p;out.groundOffset=p*3*27/.29;out.phase='Pchaj podłoże za siebie · opór sań';out.extras=`<path d="M${hx-9} ${hy+1}L48 231" stroke="#bdc6ce" stroke-width="1.5"/><path d="M25 254h53l-6 8H31Z" fill="#496275"/><rect x="44" y="230" width="18" height="24" rx="3" fill="#647f90"/><path d="M42 236h22m-22 5h22" stroke="#203746" stroke-width="2"/><path d="M${hx-10} ${hy-3}l9 5" stroke="#e4b36f" stroke-width="4"/>`;return out;
 },4000,['Schemat pokazuje sanie ciągnięte pasem. Ciężar i opór dobiera się z planu, nie z animacji.']);
})(typeof window==='object'?window:globalThis);

/* Human-animation candidates: jump/landing/preparation families.
 * Motion timing is pedagogical, not measured motion capture. Each variant needs
 * review against its selected reference before technical approval. */
(function (scope) {
  'use strict';
  const A = scope.BWAnim, M = A.math;
  const G = 264, BASE = 142;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mod = x => (x % 1 + 1) % 1;
  const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;
  const lerpPoint = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
  const bz = (a, b, c, d, t) => [0, 1].map(i => (1-t)**3*a[i] + 3*(1-t)**2*t*b[i] + 3*(1-t)*t*t*c[i] + t**3*d[i]);
  const grounded = (x, angle = 0) => M.groundedAnkle(x, angle);
  const leg = (hip, ankle, contact = false, angle = 0) => ({ ...M.leg(hip, ankle, contact, angle), contact, footAngle: angle, local: 0 });
  const scene = (p, hip, right, left, phase, other = {}) => ({ p, hip, right, left, phase, view: 'side', groundSpeed: 0, ...other });
  const register = (id, title, durationMs, view, sample, notes = []) => A.register(id, {
    title, durationMs, view, sourceVerified: false,
    notes: ['Rekonstrukcja do osobnej oceny: ustawienie, lądowanie i rytm nie są pomiarem nagrania.', ...notes], sample
  });
  const frontLeg = (hip, ankle, contact, side = 1) => {
    // Front projection: flexion in depth shortens apparent segments; do not
    // force a sideways knee displacement to preserve a side-view bone length.
    const knee = lerpPoint(hip, ankle, .505);
    knee[0] += side * Math.min(2, Math.abs(ankle[0] - hip[0]) * .05);
    return { knee, ankle, contact, footAngle: 0, local: 0 };
  };
  const armIK = (shoulder, wrist, bend) => {
    const dx=wrist[0]-shoulder[0],dy=wrist[1]-shoulder[1],d=Math.hypot(dx,dy);
    const a=(30*30-23*23+d*d)/(2*d),h=Math.sqrt(Math.max(0,30*30-a*a));
    return { elbow:[shoulder[0]+a*dx/d+bend*h*dy/d,shoulder[1]+a*dy/d-bend*h*dx/d],wrist };
  };

  // Alternating contacts without a same-foot extra contact: this follows the
  // app's bounds / horizontal-power instructions, not the high-skip rhythm.
  function alternatingBound(p, height, distance) {
    p=mod(p);const half=mod(p*2),contact=half<.24;
    const jump=contact?0:Math.sin(Math.PI*(half-.24)/.76);
    const hip=[154,BASE+(contact?3*Math.sin(Math.PI*half/.24):-height*jump)];
    function boundLeg(local) {
      let rel, hit=local<.12, angle=0;
      if(hit){const foot=grounded(158-distance*local,0);return leg(hip,foot,true,0);}
      if(local<.38){const start=[4-distance*.12,111];rel=bz(start,[-26,81],[22,47],[57,56],(local-.12)/.26);}
      else if(local<.8)rel=[57,56];
      else rel=bz([57,56],[57,78],[17,104],[4,111],(local-.8)/.2);
      angle=-12*Math.sin(Math.PI*(local-.12)/.88);
      return leg(hip,[hip[0]+rel[0],hip[1]+rel[1]],false,angle);
    }
    const right=boundLeg(p),left=boundLeg(mod(p+.5));
    return scene(p,hip,right,left,contact?'Lądowanie na przeciwnej nodze → odbicie':'Lot · przeciwne kolano prowadzi',{
      armDrive:clamp((right.knee[1]-left.knee[1])/57,-1,1),groundOffset:distance*p,groundSpeed:distance,
      extras:`<path d="M40 28H${40+distance}" fill="none" stroke="#0b4778" stroke-width="1.5"/><path d="M${35+distance} 24l5 4-5 4" fill="none" stroke="#0b4778"/>`
    });
  }
  register('alternate_leg_bounds','Wieloskok naprzemienny',1900,'side',p=>alternatingBound(p,19,72),[
    'Jedna noga wybija, przeciwna przyjmuje następny kontakt. Bez dodatkowego kontaktu tej samej stopy.'
  ]);
  register('power_skip_distance','Power skip na odległość',2100,'side',p=>alternatingBound(p,12,96),[
    'Wariant zgodny z obecną instrukcją aplikacji: lądowanie na przeciwnej nodze. Wymaga porównania z docelową demonstracją.',
    'Dystans pokazuje przesunięcie podłoża; stopa nie sięga po długość kroku daleko przed biodro.'
  ]);

  register('power_skip_height','Power skip na wysokość',2300,'side',p=>{
    p=mod(p);const base=A.compose(['a_skip'],p),t=p*39;
    let extra=0;
    if(t>5&&t<13)extra=16*Math.sin(Math.PI*(t-5)/8);
    if(t>24&&t<31)extra=16*Math.sin(Math.PI*(t-24)/7);
    // Elevate the whole pose only during the existing long flight. Do not
    // move a planted foot upwards or add a fictitious ground contact.
    if(base.right.contact||base.left.contact)extra=0;
    const shift=point=>[point[0],point[1]-extra];
    const lift=limb=>({...limb,knee:shift(limb.knee),ankle:shift(limb.ankle)});
    return {...base,p,hip:shift(base.hip),right:lift(base.right),left:lift(base.left),
      phase:extra>0?'Wysokie odbicie · lot':'Kontakt → odbicie → powrót na tę samą nogę',
      extras:'<path d="M62 168V80m-5 6 5-6 5 6" fill="none" stroke="#0b4778" stroke-width="1.5"/>'};
  },['Propozycja wysokiego skipu z powrotem na tę samą nogę. Wyższa trajektoria i jej czas wymagają osobnego uzgodnienia.']);

  function scissor(p, height, holdLabel) {
    p=mod(p);const second=p>=.5,q=mod(p*2),swap=second?-1:1;
    const airborne=q>=.2&&q<.7,u=clamp((q-.2)/.5);
    const progress=airborne?smooth(u):q<.2?0:1;
    const spread=22*mix(swap,-swap,progress);
    let y=144;
    if(q<.2)y+=7*Math.sin(Math.PI*q/.2);
    else if(airborne)y-=height*Math.sin(Math.PI*u);
    else y+=8*Math.sin(Math.PI*clamp((q-.7)/.3));
    const hip=[154,y],ankleY=airborne?253-height*Math.sin(Math.PI*u):253;
    const right=leg(hip,[154+spread,ankleY],!airborne),left=leg(hip,[154-spread,ankleY],!airborne);
    return scene(p,hip,right,left,airborne?'Wymiana nóg w locie':q<.2?'Krótki wykrok · obunóż → wybicie':holdLabel,{armDrive:spread/30});
  }
  register('scissor_bounds','Wyskoki nożycowe · lądowanie obunóż',2600,'side',p=>scissor(p,13,'Lądowanie na OBU stopach · kontrola'),[
    'Dwa kontakty równocześnie w nowym ustawieniu, zgodnie z instrukcją aplikacji. To nie wieloskok naprzemienny.'
  ]);
  register('scissor_exchange_jump','Skok nożycowy z wymianą',3600,'side',p=>scissor(p,24,'Lądowanie obunóż w nowym wykroku · stabilizacja'),[
    'Pełniejsza wymiana i dłuższa stabilizacja niż w niskich scissor bounds. Dokładna odmiana wymaga osobnego wyboru.'
  ]);
  register('straight_leg_run_bound','Prosta noga → bound',5200,'side',p=>{
    const pose=A.compose(['d_skip','alternate_leg_bounds'],p);
    return {...pose,phase:(p<.5?'1. Bieg z prawie prostymi nogami':'2. Wieloskok naprzemienny')+' · '+pose.phase};
  },['Nazwa biblioteki łączy run/bound. Pokazano dwa jawnie rozdzielone fragmenty, nie uznano ich za ten sam ruch.']);

  // Low elastic contacts, rather than a flat-footed squat-jump body bob.
  // Timing and ranges below are illustrative teaching choices, NOT a measured
  // source cadence or a prescription. The shoe rolls around one fixed forefoot
  // point while grounded. During flight it keeps that pivot model but rises
  // clear of the floor; all contact/flight boundary positions are continuous.
  const pogoTiming = {
    bilateral_pogo: { contactMs:180, flightMs:200, height:4.5, softKnee:1.0 },
    single_leg_hops: { contactMs:200, flightMs:240, height:6.3, softKnee:1.5 },
    lateral_pogo: { contactMs:190, flightMs:210, height:5.0, softKnee:1.0 }
  };
  function forefootAnkle(toeX, angle, clearance=0) {
    const toe=M.sole(angle).toe;
    return [toeX-toe[0],G-toe[1]-clearance];
  }
  function pogo(p, lateral=false, oneLeg=false) {
    p=mod(p);const timing=pogoTiming[lateral?'lateral_pogo':oneLeg?'single_leg_hops':'bilateral_pogo'];
    const cycleMs=timing.contactMs+timing.flightMs,stance=timing.contactMs/cycleMs;
    const half=lateral?(p>=.5?1:0):0,q=lateral?mod(p*2):p;
    const from=lateral?(half?172:136):154,to=lateral?(half?136:172):154;
    const airborne=q>=stance,u=airborne?(q-stance)/(1-stance):q/stance;
    // Lower the heel under control, then rise through the forefoot. The
    // angular derivatives match across take-off, landing and the loop seam.
    const angle=airborne
      ? 22+(20*Math.PI*timing.flightMs/timing.contactMs)*u*(1-u)
      : 22-20*Math.sin(Math.PI*u);
    const clearance=airborne?16*timing.height*u*u*(1-u)*(1-u):0;
    const x=airborne?mix(from,to,smooth(u)):from,spread=oneLeg?0:8;
    const centre=forefootAnkle(x+16,angle,clearance);
    const reach=112.85-(airborne?0:timing.softKnee*Math.sin(Math.PI*u)**2);
    const hip=[centre[0],centre[1]-Math.sqrt(reach*reach-spread*spread)];
    const r=forefootAnkle(x+16+spread,angle,clearance),l=forefootAnkle(x+16-spread,angle,clearance);
    let right=leg(hip,r,!airborne,angle),left=oneLeg?leg(hip,[hip[0]-15,hip[1]+77],false,-8):leg(hip,l,!airborne,angle);
    if(lateral){
      // Frontal knee projection is deliberately not a sagittal angle target.
      // Use the actual 57:56 segment ratio: the generic .505 approximation
      // would over-extend a projected thigh in this near-straight pose.
      const projected=(ankle,side)=>{
        const knee=lerpPoint(hip,ankle,57/113);
        knee[0]+=side*Math.min(2,Math.abs(ankle[0]-hip[0])*.05);
        return{...frontLeg(hip,ankle,!airborne,side),knee,footAngle:angle};
      };
      right=projected(r,1);left=projected(l,-1);
    }
    const phase=airborne?(lateral?'Niski lot w bok · obie stopy':'Niski lot · stopy pod biodrami')
      :u<.5?'Przodostopie · kontrolowane opuszczenie pięty':'Odbicie ze stawu skokowego · kolano miękkie';
    return scene(p,hip,right,left,phase,{
      view:lateral?'front':'side',projection:lateral?'frontal':undefined,armDrive:0,
      ankleAction:airborne?'flight':u<.5?'absorb':'push'
    });
  }
  register('bilateral_pogo','Pogo obunóż',380,'side',p=>pogo(p),[
    'Obie stopy przyjmują kontakt i odbijają jednocześnie. Przodostopie pozostaje podporą, pięta opuszcza się pod kontrolą, potem unosi.',
    'Niskie odbicie z pracy stawu skokowego; kolana miękkie, bez blokowania. Rytm podglądu jest poglądowy, nie zmierzony z filmu.'
  ]);
  register('lateral_pogo','Pogo boczne obunóż',800,'front',p=>pogo(p,true),[
    'Dwa niskie podskoki w przeciwnych kierunkach w jednym cyklu; obie stopy lądują razem.',
    'Widok z przodu pokazuje kierunek i jednoczesny kontakt. Szczegół pracy pięty i stawu skokowego porównuj z ujęciem bocznym, nie odczytuj kąta z projekcji czołowej.'
  ]);
  register('single_leg_hops','Podskoki jednonóż',440,'side',p=>pogo(p,false,true),[
    'Jedna noga pozostaje podporowa przez całą serię; zmiana strony jest osobnym powtórzeniem.',
    'Pokazano niski sprężysty wariant. Pięta pracuje pod kontrolą, kolano lekko amortyzuje; nie blokuj nogi. Wyższe i dalsze skoki wymagają odrębnego wariantu.'
  ]);
  for(const[id,timing]of Object.entries(pogoTiming))A.models[id].teachingTiming={
    cycleMs:timing.contactMs+timing.flightMs,contactMs:timing.contactMs,flightMs:timing.flightMs,
    cyclesPerLoop:id==='lateral_pogo'?2:1,sourceMeasured:false
  };

  register('snap_down','Snap-down bez dodatkowego wyskoku',3200,'side',p=>{
    p=mod(p);let crouch;
    if(p<.22)crouch=0;else if(p<.34)crouch=smooth((p-.22)/.12);else if(p<.72)crouch=1;else crouch=1-smooth((p-.72)/.28);
    const hip=[154-14*crouch,142+33*crouch],right=leg(hip,grounded(162),true),left=leg(hip,grounded(146),true);
    const angle=20*crouch,rad=angle*Math.PI/180,shoulder=[hip[0]+59*Math.sin(rad),hip[1]-59*Math.cos(rad)];
    const highR=[shoulder[0]+9,shoulder[1]-48],lowR=[shoulder[0]+28,shoulder[1]+28],highL=[shoulder[0]-8,shoulder[1]-47],lowL=[shoulder[0]-11,shoulder[1]+37];
    return scene(p,hip,right,left,p<.22?'Stań wysoko · ręce nad głową':p<.34?'Szybkie zejście · obie stopy na ziemi':p<.72?'Zatrzymaj półprzysiad · amortyzacja':'Spokojny powrót do ustawienia',{
      torsoAngle:angle,arms:{right:armIK(shoulder,lerpPoint(highR,lowR,crouch),1),left:armIK(shoulder,lerpPoint(highL,lowL,crouch),-1)}
    });
  },['Wybrano wersję z szybkiego zejścia, bez podskoku. Opis biblioteki miesza snap-down/niskie pogo; ta animacja nie pokazuje wersji pogo.']);

  // Repetition reset is explicitly faded. Planted feet are never dragged back
  // across the floor as if this were part of the jump technique.
  function resetBlend(p, start, landing, sampleStart, sampleLanding) {
    if(p<.9)return{...sampleLanding(),opacity:1-smooth((p-.85)/.05),phase:'Koniec powtórzenia · wygaszenie podglądu',reset:true};
    if(p<.95){const t=smooth((p-.9)/.05),hip=lerpPoint(landing,start,t);return scene(p,hip,leg(hip,[hip[0]+9,251],false),leg(hip,[hip[0]-7,251],false),'Powrót do startu · pętla demonstracji',{opacity:0,reset:true});}
    return{...sampleStart(),opacity:smooth((p-.95)/.05),phase:'Ustawienie do następnego powtórzenia',reset:true};
  }
  register('broad_jump','Skok w dal z miejsca',4200,'side',p=>{
    p=mod(p);const start=[116,156],land=[225,173],startFeet=[125,111],endFeet=[235,221];
    function withSwing(pose,wrist){
      const rad=(pose.torsoAngle||0)*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
      const turn=v=>[v[0]*c-v[1]*s,v[0]*s+v[1]*c];
      const delta=turn([-1,-59]),shoulder=[pose.hip[0]+delta[0],pose.hip[1]+delta[1]],target=turn(wrist);
      const near=[shoulder[0]+target[0],shoulder[1]+target[1]],far=[near[0]-1.5,near[1]+1];
      // Both arms share one synchronized swing; never use the renderer's
      // default alternating running-arm motion during an obunóż broad jump.
      return {...pose,arms:{right:{shoulder,...armIK(shoulder,near,1)},left:{shoulder,...armIK(shoulder,far,1)}}};
    }
    function planted(hip,feet,phase,wrist=[28,23]){return withSwing(scene(p,hip,leg(hip,grounded(feet[0]),true),leg(hip,grounded(feet[1]),true),phase,{torsoAngle:18}),wrist);}
    if(p>=.85)return resetBlend(p,start,land,()=>planted(start,startFeet,''),()=>planted(land,endFeet,''));
    if(p<.18){const u=p/.18;return planted([116,156+19*smooth(u)],startFeet,'Zamach obu ramion i cofnięcie bioder · obie stopy',lerpPoint([28,23],[-34,15],smooth(u)));}
    if(p<.27){const u=(p-.18)/.09;return planted([116,175-33*smooth(u)],startFeet,'Oba ramiona w przód · wyprost i wybicie OBUNÓŻ',bz([-34,15],[-28,42],[42,35],[32,-25],smooth(u)));}
    if(p<.63){const u=(p-.27)/.36,q=smooth(u),x=mix(116,225,q),rise=36*Math.sin(Math.PI*u),hip=[x,142-rise],ankleY=253-rise-13*Math.sin(Math.PI*u);
      return withSwing(scene(p,hip,leg(hip,[x+mix(9,10,q),ankleY],false,-5*Math.sin(Math.PI*u)),leg(hip,[x+mix(-5,-4,q),ankleY],false,-5*Math.sin(Math.PI*u)),'Lot do przodu · obie stopy nad podłożem',{torsoAngle:18-6*Math.sin(Math.PI*u)}),lerpPoint([32,-25],[36,0],q));}
    const u=clamp((p-.63)/.12);return planted([225,142+31*smooth(u)],endFeet,'Lądowanie OBUNÓŻ → amortyzacja i zatrzymanie',lerpPoint([36,0],[28,23],smooth(u)));
  },['Wyraźnie rozdzielono obunóż wybicie, lot i obunóż lądowanie. Wygaszenie po zatrzymaniu oznacza wyłącznie powtórkę animacji.']);

  register('lateral_bound_to_stick','Skok boczny i zatrzymanie',5600,'front',p=>{
    p=mod(p);const start=[116,151],land=[220,160];
    function planted(hip,isLanding){const stance=isLanding?[220,253]:[116,253],free=isLanding?[239,231]:[96,229];
      return scene(p,hip,isLanding?frontLeg(hip,free,false,1):frontLeg(hip,stance,true,1),isLanding?frontLeg(hip,stance,true,-1):frontLeg(hip,free,false,-1),'Zatrzymaj lądowanie na przeciwnej nodze · 2 sekundy',{view:'front',projection:'frontal',armDrive:0});}
    if(p>=.85)return resetBlend(p,start,land,()=>planted(start,false),()=>planted(land,true));
    if(p<.16)return {...planted([116,151+7*Math.sin(Math.PI*p/.16)],false),phase:'Podpór jednonóż → odepchnięcie w bok'};
    if(p<.4){const u=(p-.16)/.24,q=smooth(u),x=mix(116,220,q),rise=25*Math.sin(Math.PI*u),hip=[x,151-rise],r=lerpPoint([116,253],[239,231],q),l=lerpPoint([96,229],[220,253],q);r[1]-=rise;l[1]-=rise;return scene(p,hip,frontLeg(hip,r,false,1),frontLeg(hip,l,false,-1),'Lot w bok · przejęcie na przeciwną nogę',{view:'front',projection:'frontal',armDrive:0});}
    return planted([220,151+9*smooth(clamp((p-.4)/.06))],true);
  },['Przeciwna noga przyjmuje lądowanie, potem pozycja pozostaje nieruchoma przez ponad2sekundy. Widok z przodu; segmenty są skrócone przez projekcję.']);

  register('bwprep:ankle','Kolano nad stopę · pięta na ziemi',3000,'side',p=>{
    p=mod(p);const q=(1-Math.cos(2*Math.PI*p))/2,hip=[145+17*q,159],right=leg(hip,grounded(176),true),left=leg(hip,grounded(126),true);
    return scene(p,hip,right,left,p<.5?'Przenieś kolano do przodu · pięta pozostaje na podłożu':'Spokojny powrót · stopa bez odrywania pięty',{torsoAngle:7,armDrive:0,ankleAction:p<.5?'dorsiflexion':'return'});
  },['Pokazano mobilizację wykroczną. Wysokość podparcia i dokładny zakres należy uzgodnić z wariantem sesji.']);

  register('bwprep:adductor','Rock-back przywodziciela',3800,'front',p=>{
    p=mod(p);const rock=(1-Math.cos(2*Math.PI*p))/2,hip=[150-10*rock,220],right={knee:lerpPoint(hip,[240,253],.505),ankle:[240,253],contact:true,footAngle:0,local:0},left={knee:[160,258.4],ankle:[128,253],contact:true,footAngle:0,local:0};
    const angle=75,rad=angle*Math.PI/180,shoulder=[hip[0]+59*Math.sin(rad),hip[1]-59*Math.cos(rad)];
    return scene(p,hip,right,left,rock<.5?'Cofnij biodra · dłonie i kolano podporowe na macie':'Wróć spokojnie · boczna noga pozostaje długa',{
      view:'front',projection:'frontal',torsoAngle:angle,arms:{right:armIK(shoulder,[212,252],1),left:armIK(shoulder,[190,252],-1)},
      extras:'<path d="M108 264H268" stroke="#94a3b8" stroke-width="3"/><path d="M132 208h-20m5-4-5 4 5 4" fill="none" stroke="#0b4778" stroke-width="1.5"/>'
    });
  },['Poglądowy widok ukośny: jedna noga wyprowadzona w bok, druga zgięta i podparta kolanem. Projekcja nie służy do odczytu kąta kolana.']);

  register('bwprep:march','Marsz z uniesieniem kolana',3200,'side',p=>{
    const base=A.compose(['a_march'],p);return{...base,phase:'Rozgrzewka · '+base.phase};
  },['Ten sam wzorzec co marsz A, w spokojniejszej demonstracji przygotowania biegowego; bez dodatkowego odbicia.']);
})(typeof window==='object'?window:globalThis);

/* Proposed COD teaching sequences. Event counts are explicit; these paths have
 * not been measured from video and must be reviewed before publication. */
(function (scope) {
  'use strict';
  const B = scope.BWAnim, M = B.math;
  const G = 264, clamp = x => Math.max(0, Math.min(1, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const mod = x => (x % 1 + 1) % 1;
  const pt = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
  const curve = (a, b, c, d, t) => [0, 1].map(i => (1-t)**3*a[i]+3*(1-t)**2*t*b[i]+3*(1-t)*t*t*c[i]+t**3*d[i]);
  const ankle = x => [x, 253];
  const leg = (hip, a, contact) => ({ ...M.leg(hip, a, contact, 0), footAngle: 0 });
  const opacity = p => Math.min(1, clamp(p / .035), clamp((1 - p) / .055));
  function scene(p, hip, right, left, extra) {
    return { p, hip, right: leg(hip, right.ankle || right, Boolean(right.contact)), left: leg(hip, left.ankle || left, Boolean(left.contact)), view: 'side', groundSpeed: 0, groundOffset: 0, armDrive: .25, torsoAngle: 7, ...extra };
  }
  function standing(p, x = 160, y = 164, feet = [154, 174]) {
    return scene(p, [x, y], { ankle: ankle(feet[0]), contact: true }, { ankle: ankle(feet[1]), contact: true }, { phase: 'Stabilne zatrzymanie · kolana pozostają ugięte', armDrive: 0, torsoAngle: 3 });
  }
  // World-space feet remain fixed in each stance; the body advances over them.
  function run(p, from = 110, to = 146, cycles = 1.5, initial) {
    p = clamp(p); const count = p * cycles, hip = [mix(from, to, p), 147 - 3 * Math.sin(4 * Math.PI * count) ** 2];
    const offset = initial ? initial.right.ankle[0] - from : 6;
    const limbs = [0, .5].map(shift => {
      const a = count + shift, q = mod(a), index = Math.floor(a), startP = (index - shift) / cycles;
      const land = mix(from, to, startP) + offset, next = land + (to - from) / cycles;
      if (q < .28) return { ankle: ankle(land), contact: true };
      const u = (q - .28) / .72;
      return { ankle: curve([land, 253], [land - 3, 207], [next - 4, 207], [next, 253], u), contact: false };
    });
    if (initial && p < .13) {
      const u = ease(p / .13);
      hip[1] = mix(initial.hip[1], hip[1], u);
      limbs[1].ankle = pt(initial.left.ankle, limbs[1].ankle, u);
      limbs[1].contact = p === 0;
    }
    const upperBlend = initial ? ease(p / .13) : 1;
    return scene(p, hip, limbs[0], limbs[1], {
      phase: 'Bieg do strefy hamowania',
      armDrive: mix(initial?.armDrive ?? 0, Math.sin(count * Math.PI * 2) * .8, upperBlend),
      torsoAngle: mix(initial?.torsoAngle ?? 13, 13, upperBlend),
    });
  }
  // Each numbered step has one swing and one new contact. A third step lifts
  // and replants the first foot; it is not a relabelled two-contact animation.
  function braking(p, steps = 3, initial) {
    p = clamp(p); initial = initial || run(1);
    const endX = steps === 2 ? 163 : 169;
    const hip = [mix(initial.hip[0], endX, ease(p)), mix(initial.hip[1], 164, ease(p))];
    const targets = steps === 2 ? [162, 174] : [157, 168, 179];
    const index = Math.min(steps - 1, Math.floor(p * steps)), u = p === 1 ? 1 : p * steps - index;
    const current = [initial.right.ankle.slice(), initial.left.ankle.slice()], contacts = [initial.right.contact, initial.left.contact];
    for (let i = 0; i < index; i++) { current[i % 2] = ankle(targets[i]); contacts[i % 2] = true; }
    const side = index % 2, start = current[side];
    if (u < .65) {
      current[side] = curve(start, [start[0], Math.min(start[1], 253) - 24], [targets[index] - 3, 223], ankle(targets[index]), ease(u / .65));
      contacts[side] = false;
    } else { current[side] = ankle(targets[index]); contacts[side] = true; }
    const upperBlend = ease(p / .10);
    return scene(p, hip, { ankle: current[0], contact: contacts[0] }, { ankle: current[1], contact: contacts[1] }, {
      phase: `Krok hamowania ${index + 1}/${steps}${u >= .65 ? ' · kontakt' : ' · przygotowanie kontaktu'}`,
      armDrive: mix(initial.armDrive ?? 0, mix(.35, 0, p), upperBlend),
      torsoAngle: mix(initial.torsoAngle ?? 13, mix(9, 3, p), upperBlend),
      stepCounter: { current: index + 1, total: steps },
    });
  }
  function stopAction(p, steps) {
    let s;
    if (p < .30) s = run(p / .30);
    else if (p < .75) s = braking((p - .30) / .45, steps);
    else s = braking(1, steps);
    if (p >= .75) s.phase = `Zatrzymanie po ${steps} kontaktach hamowania · utrzymaj pozycję`;
    return { ...s, p, opacity: opacity(p) };
  }
  function reaccelerate(p, steps = 3) {
    const held = braking(1, steps); let s;
    if (p < .23) s = run(p / .23);
    else if (p < .53) s = braking((p - .23) / .30, steps);
    else if (p < .60) { s = held; s.phase = 'Kontrola środka masy · przygotuj ponowne pchnięcie'; }
    else {
      const q = (p - .60) / .40;
      s = run(q, held.hip[0], 238, 2.2, held);
      s.phase = 'Ponowne przyspieszenie · pchnij podłoże za siebie';
      s.torsoAngle = mix(held.torsoAngle ?? 3, mix(22, 12, q), ease(q / .13));
    }
    return { ...s, p, opacity: opacity(p) };
  }
  function frontLeg(hip, a, contact) {
    // Frontal coordinates are a projection: knee tracks the foot, while limb
    // depth is intentionally not represented by a sideways bending knee.
    const dx = a[0] - hip[0], midY = hip[1] + (a[1] - hip[1]) * .50;
    return { ankle: a, knee: [hip[0] + dx * .76, midY], contact, footAngle: 0 };
  }
  function frontNeutral(p, x = 160, y = 159) {
    const hip = [x, y];
    return { p, hip, right: frontLeg(hip, ankle(x + 14), true), left: frontLeg(hip, ankle(x - 14), true), view: 'front', projection: 'frontal', groundSpeed: 0, groundOffset: 0, armDrive: 0, torsoAngle: 0, phase: 'Gotowość · kolana miękkie i stopy pod biodrami' };
  }
  function frontExit(p, direction = 1, startY = 164) {
    p = clamp(p / .90); const hip = [160 + direction * 38 * ease(p), mix(startY,160,ease(p)) + 2 * Math.sin(Math.PI * p)];
    let right, left;
    if (p < .53) {
      const u = ease(p / .53);
      right = { ankle: curve([174,253],[178,230],[204,230],[212,253],u), contact: p === 0 };
      left = { ankle: ankle(146), contact: true };
    } else {
      const u = ease((p - .53) / .47);
      right = { ankle: ankle(212), contact: true };
      left = { ankle: curve([146,253],[155,231],[182,231],[186,253],u), contact: p >= 1 };
      if (p >= 1) left.ankle = ankle(186);
    }
    if (direction < 0) {
      const reflect = limb => ({ ...limb, ankle: [320 - limb.ankle[0], limb.ankle[1]] });
      [right, left] = [reflect(left), reflect(right)];
    }
    return { p, hip, right: frontLeg(hip, right.ankle, right.contact), left: frontLeg(hip, left.ankle, left.contact), view: 'front', projection: 'frontal', groundSpeed: 0, groundOffset: 0, armDrive: direction * .35 * ease(p / .12),
      phase: p < .53 ? 'Odepchnięcie · pierwszy krok w kierunku wyjścia' : 'Dostaw krok i kontynuuj przyspieszenie', torsoAngle: 0 };
  }
  function gatePlan(direction, p, colour, type = 'cut') {
    const x = direction < 0 ? 260 : 328, label = direction < 0 ? 'LEWO' : direction > 0 ? 'PRAWO' : 'PRZÓD';
    return `<g aria-hidden="true" font-family="system-ui" font-size="8"><rect x="247" y="31" width="99" height="99" rx="9" fill="#0b1422" stroke="#314760"/><text x="255" y="44" fill="#c9dbea">PLAN Z GÓRY</text><path d="M294,118V82L${x},61" fill="none" stroke="${colour || '#83abc9'}" stroke-width="2"/><path d="M${x-5},58h10" stroke="${colour || '#83abc9'}" stroke-width="4"/><circle cx="294" cy="82" r="3" fill="#f3c17b"/><text x="253" y="125" fill="#c9dbea">${type === 'cut' ? 'hamuj → wyjście' : label}</text></g>`;
  }
  function cutAction(p, options = {}) {
    const direction = options.direction || 1; let s;
    if (p < .28) s = run(p / .28, 110, 146, 1.5);
    else if (p < .55) s = braking((p - .28) / .27, 3);
    else if (p < .61) {
      s = frontNeutral(p, 160, 164); s.phase = 'Zbliżenie cięcia z przodu · kolano w osi stopy';
    } else s = frontExit((p - .61) / .39, direction);
    s.extras = gatePlan(direction, p, options.colour);
    return { ...s, p, opacity: opacity(p) };
  }
  function fiveOhFive(p, reactive = false) {
    const stop = braking(1, 3); let s;
    if (p < .30) { s = run(p / .30, 112, 146, 1.5); s.phase = 'Rozbieg 10 m → bramka → 5 m do linii zwrotu'; }
    else if (p < .53) s = braking((p - .30) / .23, 3);
    else if (p < .64) {
      s = stop; s.phase = reactive ? 'Sygnał → obróć ciało o 180° na ugiętej nodze' : 'Zwrot 180° · obniż biodra i zmień kierunek';
      s.opacity = Math.abs((p - .585) / .055); s.facing = p < .585 ? 1 : -1; s.mirrorX = stop.hip[0];
    } else {
      // Coordinates advance to the right before reflection about a FIXED turn
      // axis. The resulting athlete moves left, with fixed stance toes. A
      // moving hip-centred mirror would make planted feet slide on the floor.
      const returnAxis = stop.hip[0];
      s = run((p - .64) / .36, returnAxis, 2 * returnAxis - 115, 2, stop);
      s.facing = -1; s.mirrorX = returnAxis;
      s.phase = reactive ? 'Po zwrocie 180° · przyspiesz w nowym kierunku' : 'Powrót 5 m przez bramkę pomiarową';
    }
    const pathY = p < .53 ? mix(121, 52, p / .53) : p < .64 ? 52 : mix(52, 88, (p - .64) / .36);
    s.extras = `<g aria-hidden="true" font-family="system-ui" font-size="7.5"><rect x="245" y="31" width="104" height="119" rx="9" fill="#0b1422" stroke="#314760"/><text x="252" y="43" fill="#c9dbea">${reactive ? 'ZWROT 180°' : 'TEST 5–0–5'}</text><path d="M270,126V53H288V90" fill="none" stroke="#83abc9" stroke-width="2"/><path d="M261,89h35M261,53h35" stroke="#f3c17b" stroke-width="2"/><circle cx="${p < .64 ? 270 : 288}" cy="${pathY}" r="3" fill="#ffffff"/><text x="301" y="115" fill="#b3c5d9">${reactive?'':'10 m'}</text><text x="301" y="74" fill="#b3c5d9">${reactive?'':'5 m'}</text><text x="250" y="141" fill="#b3c5d9">${reactive?'sygnał · zwrot · wyjście':'rozbieg · zwrot · powrót'}</text></g>`;
    return { ...s, p, opacity: Math.min(opacity(p), s.opacity === undefined ? 1 : s.opacity) };
  }
  function forwardFront(p, startY = 159) {
    const q = mod(p * 2.2), launch=ease(p/.12),hip = [160, mix(startY,148 - 3 * Math.sin(q * Math.PI * 2) ** 2,launch)];
    const limbs = [q, mod(q+.5)].map((v,i) => {
      const contact = v < .36, x = i ? 146 : 174;
      const y=contact?253:253-35*Math.sin(Math.PI*(v-.36)/.64);
      return frontLeg(hip,[x,i?mix(253,y,launch):y],contact||(i&&p===0));
    });
    return { ...frontNeutral(p), hip, right: limbs[0], left: limbs[1], armDrive: Math.sin(q*Math.PI*2), phase: 'Pierwsze kroki do przodu · wyjście przez wskazaną bramkę' };
  }
  function frontBrake(p) {
    p = clamp(p); const hip=[160,mix(148,164,ease(p))];
    const initialY=253-35*Math.sin(Math.PI*(.5-.36)/.64);
    const right={ankle:[174,p<.5?mix(initialY,253,ease(p*2)):253],contact:p>=.5};
    const left={ankle:[146,p<.5?253:253-10*Math.sin(Math.PI*(p-.5)*2)],contact:p<=.5||p>=1};
    return{...frontNeutral(p),hip,right:frontLeg(hip,right.ankle,right.contact),left:frontLeg(hip,left.ankle,left.contact),phase:`Po sygnale · krótki krok hamowania ${p<.5?'1':'2'}/2`};
  }
  function cueAction(p, visual) {
    const count=visual?2:3,turn = Math.min(count-1, Math.floor(p*count)), q = p*count-turn, direction = [-1, 1, 0][turn]; let s;
    if(visual){
      if(q<.23){s=forwardFront(q/.23*(.5/2.2));s.phase='Lekki ruch do przodu · czekaj na kolor';}
      else if(q<.52)s=frontBrake((q-.23)/.29);
      else s=direction?frontExit((q-.52)/.48,direction):forwardFront((q-.52)/.48,164);
    }else{
      if(q < .30) { s = frontNeutral(q); s.phase = q < .23 ? 'Czekaj na sygnał · nie rozpoczynaj ruchu' : 'Usłysz kierunek → rozpocznij ruch'; }
      else s = direction ? frontExit((q-.30)/.70, direction,159) : forwardFront((q-.30)/.70);
    }
    const colour = visual ? (direction < 0 ? '#69b6ff' : direction > 0 ? '#ffb55d' : '#9bea97') : '#c0dcf5';
    const cue = q < .23 ? 'GOTOWOŚĆ' : direction < 0 ? '← LEWO' : direction > 0 ? 'PRAWO →' : '↑ PRZÓD';
    s.extras = gatePlan(q<.23?0:direction,q,q<.23?'#708397':colour,'cue')+`<g aria-hidden="true" font-family="system-ui" font-size="10"><rect x="21" y="20" width="112" height="25" rx="8" fill="${q < .23 ? '#26374b' : colour}"/><text x="29" y="36" fill="${q < .23 ? '#c9dbea' : '#102032'}">${visual ? '● ' : '♪ '}${cue}</text></g>`;
    return { ...s, p, opacity: opacity(q) };
  }
  const common = ['Animacja robocza do wspólnego sprawdzenia; trajektorie i czasy nie są pomiarem nagrania.', 'Kolana uginają się przy hamowaniu. Nie przenosimy prostego wysokiego podporu skipu A na lądowanie i cięcie.'];
  function register(id,title,durationMs,sample,notes,view='side') {
    B.register(id,{title,durationMs,view,sourceVerified:false,notes:[...common,...(notes||[])],sample});
  }
  register('run_two_step_stop','Bieg i zatrzymanie w dwóch krokach',4200,p=>stopAction(p,2),['Dwa nowe kontakty hamowania: prawa, lewa; następnie widoczna stabilizacja.']);
  register('progressive_run_three_step_stop','Bieg i zatrzymanie w trzech krokach',5000,p=>stopAction(p,3),['Trzy nowe kontakty hamowania: prawa, lewa, prawa; następnie widoczna stabilizacja.']);
  register('progressive_deceleration_5_10_15','Progresywne hamowanie 5 → 10 → 15 m',13500,p=>{
    const stage=Math.min(2,Math.floor(p*3)),q=p*3-stage,s=stopAction(q,3);
    return{...s,p,phase:`Wejście ${[5,10,15][stage]} m · ${s.phase}`,extras:`<text x="22" y="25" fill="#e4c58f" font-size="11" font-family="system-ui">Wejście ${[5,10,15][stage]} m · etap ${stage+1}/3</text>`};
  },['5/10/15 m opisuje kolejne dystanse wejścia. Trzy kroki w animacji to przykład, nie sztywny wymóg dla każdego dystansu.']);
  register('accel_decel_reaccel','Przyspieszenie–hamowanie–ponowne przyspieszenie',5900,p=>reaccelerate(p),['Widoczne obniżenie bioder i krótka kontrola przed drugim startem.']);
  register('deceleration_lateral_exit','Hamowanie z wyjściem bocznym',5800,p=>cutAction(p),['Zbliżenie pokazuje pierwsze dwa kroki bocznego wyjścia po hamowaniu; mapa wskazuje dalszy kierunek biegu.','Widok zmienia się na przedni przy detalu wyjścia.']);
  register('planned_cut','Zaplanowane cięcie',5700,p=>cutAction(p,{direction:-1}),['Kierunek jest znany przed rozpoczęciem: w tym powtórzeniu w lewo.','Widok z przodu przedstawia ustawienie stopy i kolana w detalu cięcia; mapa pokazuje kierunek całej akcji.']);
  register('cut_and_reaccelerate','Cięcie i ponowne przyspieszenie',6200,p=>{
    if(p<.70)return{...cutAction(p/.70,{direction:1}),p};
    const q=(p-.70)/.30,s=run(q,160,238,2);return{...s,p,opacity:Math.min(opacity(p),clamp(q/.07)),phase:'Po cięciu · dalszy bieg i ponowne przyspieszenie',extras:gatePlan(1,p)};
  },['Osobne ujęcia: detal cięcia z przodu, następnie dalszy bieg z boku. Krótkie wygaszenie rozdziela zmianę kamery.']);
  register('planned_505','Zaplanowany test 5–0–5',6500,p=>fiveOhFive(p),['Standard 5–0–5: 10 m rozbiegu przed bramką, 5 m do linii zwrotu i 5 m powrotu przez bramkę.','Plan nie przedstawia testu 5–10–5. Obrót sylwetki pokazano z krótkim przejściem widoku, bez skręcania kolana w miejscu.']);
  register('reactive_180_turn','Reaktywny obrót 180°',6800,p=>{
    const s=fiveOhFive(p,true);if(p<.30)s.phase='Bieg do przodu · oczekiwanie na sygnał';if(p>=.30&&p<.35)s.phase='Sygnał → rozpocznij hamowanie';return s;
  },['Pokaz ma z góry wybrany moment sygnału. Nie jest testem czasu reakcji.','Zwrot jest osobnym zdarzeniem po hamowaniu, bez wymuszania prostego kolana.']);
  register('app_audio_forward_left_right','Sygnał audio: przód/lewo/prawo',15600,p=>cueAction(p,false),['Symbol nuty zastępuje dźwięk w tym podglądzie. Najpierw sygnał, potem pierwszy ruch.','Sekwencja kierunków w podglądzie jest stała. Docelowe zadanie aplikacji wymaga losowania i równych stron.'],'front');
  register('app_visual_colour_cue_cod','Sygnał wizualny/kolor i zmiana kierunku',15900,p=>cueAction(p,true),['Kolor oraz strzałka wspólnie oznaczają kierunek.','Lekki ruch do przodu poprzedza sygnał; po sygnale pokazano dwa krótkie kontakty hamowania i dopiero wyjście. Frontalny widok jest projekcją, bez pomiaru głębokości.'],'front');
})(typeof window==='object'?window:globalThis);

/* Contact order observed in LRAN A-skip-1.mp4, frames 58..97 at 30000/1001 fps.
 * Contact boundaries have about one source-frame uncertainty. Joint trajectories
 * are a teaching reconstruction, not measured motion capture. */
(function(scope){
'use strict';
const cycleFrames=39,cycleMs=cycleFrames*1001/30,thigh=57,shin=56,ground=264;
const mod=(x,n)=>(x%n+n)%n,lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>t*t*(3-2*t);
const bezier=(a,b,c,d,t)=>[0,1].map(i=>(1-t)**3*a[i]+3*(1-t)**2*t*b[i]+3*(1-t)*t*t*c[i]+t**3*d[i]);
function contactAngle(u){return u<.3?6*(1-smooth(u/.3)):u<.65?0:10*smooth((u-.65)/.35);}
function soleOffset(angle){const r=angle*Math.PI/180;return[16*Math.cos(r)-11*Math.sin(r),16*Math.sin(r)+11*Math.cos(r)];}
// User correction: extend the support knee in high support, retaining a small
// absorption phase. 179.5 degrees avoids a mathematical hyperextension.
function supportState(left,second,u){
 const recontact=left?12:13,angle=contactAngle(u),toe=soleOffset(angle);
 const anchor=second?2-2*u*(17-recontact):4-10*u,x=anchor+16-toe[0];
 const kneeAngle=u<.18?lerp(170,166,smooth(u/.18)):u<.55?lerp(166,179.5,smooth((u-.18)/.37)):179.5;
 const distance=Math.sqrt(thigh*thigh+shin*shin-2*thigh*shin*Math.cos(kneeAngle*Math.PI/180));
 const relativeY=Math.sqrt(distance*distance-x*x),ankleY=ground-toe[1];
 return{angle,x,relativeY,hipY:ankleY-relativeY,kneeAngle};
}
function knee(hip,ankle){
 const dx=ankle[0]-hip[0],dy=ankle[1]-hip[1],d=Math.hypot(dx,dy),a=(thigh*thigh-shin*shin+d*d)/(2*d),h=Math.sqrt(Math.max(0,thigh*thigh-a*a));
 return[hip[0]+a*dx/d+h*dy/d,hip[1]+a*dy/d-h*dx/d];
}
function hipY(t){
 const left=t>=19,s=left?t-19:t,recontact=left?12:13,block=left?20:19;
 if(s<5)return supportState(left,false,s/5).hipY;
 if(s<recontact){const u=(s-5)/(recontact-5);return lerp(supportState(left,false,1).hipY,supportState(left,true,0).hipY,u)-12*Math.sin(Math.PI*u);}
 if(s<17)return supportState(left,true,(s-recontact)/(17-recontact)).hipY;
 const u=(s-17)/(block-17);return lerp(supportState(left,true,1).hipY,supportState(!left,false,0).hipY,u)-3*Math.sin(Math.PI*u);
}
function limb(t,hip,left){
 const local=mod(t-(left?19:0),39),recontact=left?12:13,block=left?20:19;
 const first=local<5,second=local>=recontact&&local<17,contact=first||second;
 let relative,footAngle,contactId=null;
 if(contact){
  const u=first?local/5:(local-recontact)/(17-recontact),state=supportState(left,second,u);footAngle=state.angle;
  relative=[state.x,state.relativeY];contactId=first?'first':'return';
 }else if(local<recontact){
  const u=(local-5)/(recontact-5);footAngle=lerp(10,6,smooth(u));
  const toe=soleOffset(footAngle),anchor=lerp(-6,2,smooth(u));
  const x=anchor+16-toe[0],a=lerp(179.5,170,smooth(u))*Math.PI/180,d2=thigh*thigh+shin*shin-2*thigh*shin*Math.cos(a);
  relative=[x,Math.sqrt(d2-x*x)];
 }else if(local<block){
  const u=(local-17)/(block-17),end=supportState(left,true,1);
  relative=bezier([end.x,end.relativeY],[-8,110],[-11,106],[-10,103],u);
  footAngle=lerp(10,-10,smooth(u));
 }else if(local<block+5){
  const u=(local-block)/5;relative=bezier([-10,103],[-20,79],[28,47],[57,56],u);footAngle=lerp(-10,-14,smooth(u));
 }else if(local<36){relative=[57,56];footAngle=-14;
 }else{
  const u=(local-36)/3,start=supportState(left,false,0);relative=bezier([57,56],[57,78],[16,108],[start.x,start.relativeY],u);footAngle=lerp(-14,6,smooth(u));
 }
 const ankle=[hip[0]+relative[0],hip[1]+relative[1]];
 return{ankle,knee:knee(hip,ankle),contact,local:local/39,contactId,footAngle};
}
function sample(p){
 p=mod(p,1);const t=p*39,hip=[154,hipY(t)],right=limb(t,hip,false),left=limb(t,hip,true);
 return{p,t,hip,right,left,armDrive:Math.max(-1,Math.min(1,(right.knee[1]-left.knee[1])/57))};
}
scope.ballwiseObservedA={sample,cycleMs,cycleFrames,source:{url:'https://lran.org.uk/technique-drills-2',video:'https://lran.org.uk/wp-content/uploads/2017/09/A-skip-1.mp4',startFrame:58,endFrame:97,fps:30000/1001,contactFrameUncertainty:1}};
})(typeof window==='object'?window:globalThis);

(function(scope){
'use strict';const A=scope.BWAnim;
const groups={
 sprint_ramp_warmup:['RAMP do sprintu',['bwprep:walk','bwprep:ankle','bwprep:adductor','bwprep:march','ankling','bwprep:run']],
 'legacy:6':['Ankling + niskie dribbles',['ankling','low_dribble']],
 'legacy:8':['Pogo + snap-down',['bilateral_pogo','snap_down']],
 'legacy:11':['Podskoki jednonóż + skok w dal',['single_leg_hops','broad_jump']],
 'legacy:12':['Skip A/B i akcent',['a_skip','b_skip','a_accent']],
 'legacy:14':['Starty z różnych pozycji',['split_stance_start','lateral_start_acceleration','push_up_start']],
 'legacy:15':['Falling start + split stance',['falling_start','split_stance_start']],
 'legacy:16':['Rozgrzewka biegowa i skipy',['bwprep:walk','ankling','a_skip','b_skip','bwprep:run']],
};
for(const[id,[title,ids]]of Object.entries(groups))A.register(id,{durationMs:ids.reduce((n,k)=>n+(A.models[k]?.durationMs??2500),0),view:'mixed',title,notes:['Zestaw kilku ćwiczeń. Każdy składnik i przejście wymagają osobnej oceny.'],sourceVerified:false,sequence:ids,sample:p=>A.compose(ids,p)});
const observed=scope.ballwiseObservedA;
A.register('a_skip_add_step',{durationMs:5200,view:'side',title:'Skip A add-step · dwa rytmy według opisu sesji',notes:['Użytkownik rozróżnia: z dostawieniem = obie stopy pod biodrami; z przejściem = dodatkowe odbicie na tej samej nodze.','Starsza nazwa add-step jest ogólna. Pokazujemy oba warianty po kolei; docelowy wybór musi wynikać z opisu jednostki.'],sourceVerified:false,sequence:['review:a_skip:gather','review:a_skip:extra_bounce'],sample:p=>A.compose(['review:a_skip:gather','review:a_skip:extra_bounce'],p)});
A.register('a_skip',{durationMs:observed.cycleMs,view:'side',title:'Skip A · z odbiciem i powrotem na tę samą nogę',notes:['Wyprost w wysokim podporze; niewielkie ugięcie przy amortyzacji.','Kolejność kontaktów odczytana z cyklu LRAN; trajektorie stawów są rekonstrukcją.','Ta sekwencja nie zastępuje wariantu ciągłego ani dostawienia.'],contactTimingObserved:true,sourceVerified:false,sample(p){return{...observed.sample(p),view:'side',groundSpeed:78,phase:'Skip A · kontakt → odbicie → powrót → zmiana'};}});
})(typeof window==='object'?window:globalThis);

/* Explicit variant scope for the app player. No source-certification claims. */
(function(scope){
'use strict';const A=scope.BWAnim,M=A.math;
const sourceA=A.models.a_skip;
A.register('review:a_skip:extra_bounce',{...sourceA,id:'review:a_skip:extra_bounce',title:'Skip A · z przejściem (dodatkowe odbicie)'});
for(const kind of['b','c','d'])A.models[`review:${kind}_skip:extra_bounce`].title=`Skip ${kind.toUpperCase()} · z przejściem (dodatkowe odbicie)`;
for(const id of['a_skip_no_add_step','switch_skip_a','double_switch_skip_a','ankling','low_dribble','high_dribble',...['a','b','c','d'].flatMap(k=>[`review:${k}_skip:gather`,`review:${k}_skip:continuous`])]){
 const m=A.models[id];if(m)m.notes=['Schemat szczegółu pozycji i wymiany w miejscu. Przemieszczanie oraz dawkę wykonuj według sesji.',...(m.notes??[])];
}
A.register('straight_leg_run_bound:run',{...A.models['review:d_skip:continuous'],id:'straight_leg_run_bound:run',title:'Bieg z prawie prostymi nogami · szczegół cyklu',notes:['Wybrany wariant: bieg. Schemat szczegółu ruchu z biodra i kontaktu stopy.','Kolana pozostają miękkie, bez blokowania. Dystans wykonania wynika z sesji.']});
A.register('straight_leg_run_bound:bound',{durationMs:2400,view:'side',title:'Odbicia z prawie prostymi nogami · szczegół cyklu',sourceVerified:false,notes:['Wybrany wariant: odbicia. Dłuższy lot niż w biegu; ustawienie wymaga porównania z filmem dla tego wariantu.'],sample(p){
 p=M.mod(p);const half=M.mod(p*2),contactEnd=.44,q=half<contactEnd?half/contactEnd*.68:.68+(half-contactEnd)/(1-contactEnd)*.32;
 const base=A.models['review:d_skip:continuous'].sample((p<.5?0:.5)+q*.5),rise=!base.right.contact&&!base.left.contact?9*Math.sin(Math.PI*(half-contactEnd)/(1-contactEnd)):0;
 const lift=point=>[point[0],point[1]-rise],limb=l=>({...l,knee:lift(l.knee),ankle:lift(l.ankle)});
 return{...base,p,hip:lift(base.hip),right:limb(base.right),left:limb(base.left),phase:rise>0?'Lot · ruch z biodra przy długiej nodze':'Sprężysty kontakt · kolano bez blokowania'};
}});
// Resolve composed clocks only after every final override has been registered.
// A child receives its native elapsed time instead of an arbitrary parent stretch.
const composed={
 skip_a_to_d:['a_skip','d_skip'],
 skip_b_alternate_bounds:['b_skip','alternate_leg_bounds'],
 dribble_to_sprint_transition:['low_dribble','high_dribble','free_acceleration_sprint'],
 straight_leg_run_bound:['d_skip','alternate_leg_bounds']
};
for(const[id,sequence]of Object.entries(composed))A.models[id].sequence=sequence;
const resolved=new Set();
function resolveClock(id,stack=new Set()){
 if(resolved.has(id))return A.models[id].durationMs;
 const model=A.models[id];if(!model)throw new Error('Missing sequence child '+id);
 if(stack.has(id))throw new Error('Cyclic animation sequence '+id);
 if(model.sequence){const next=new Set([...stack,id]);model.durationMs=model.sequence.reduce((sum,child)=>sum+resolveClock(child,next),0);}
 resolved.add(id);return model.durationMs;
}
for(const id of Object.keys(A.models))resolveClock(id);
})(typeof window==='object'?window:globalThis);

/* Exercise-specific visual emphasis. A highlighted region is a coaching aid,
 * not a motion-capture measurement or a prescription of joint angles/tempo.
 * This module never changes a supplied pose, contact, duration or ground path.
 * describe().markers[].point is in the original, UNMIRRORED scene coordinates;
 * apply the renderer's facing/mirrorX transform before computing a camera box. */
(function (scope) {
  'use strict';
  const A = scope.BWAnim;
  const entries = Object.create(null);
  const sequences = new Set([
    'a_skip_add_step', 'skip_a_to_d', 'skip_b_alternate_bounds', 'dribble_to_sprint_transition',
    'sprint_ramp_warmup', 'legacy:6', 'legacy:8', 'legacy:11', 'legacy:12', 'legacy:14', 'legacy:15', 'legacy:16'
  ]);
  const point = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  const fmt = n => Number(n).toFixed(3);
  const rotate = (p, degrees) => {
    const a = degrees * Math.PI / 180;
    return [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
  };
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  function define(ids, data) {
    for (const id of ids) {
      if (entries[id]) throw new Error('Duplicate coaching identity: ' + id);
      entries[id] = Object.freeze({ ...data, focus: Object.freeze([...data.focus]) });
    }
  }
  const skipA = {
    focus: ['hip', 'knee'], title: 'Biodro i uniesienie kolana', marker: 'lift',
    cue: 'Unoś kolano ruchem z biodra. Ręka po przeciwnej stronie współpracuje z nogą.',
    contactCue: 'Wysoki podpór jest wydłużony; przy przyjęciu kontaktu zachowaj miękką amortyzację.',
    flightCue: 'Pozwól nodze swobodnej wrócić pod biodro. Nie sięgaj stopą daleko przed siebie.'
  };
  const skipB = {
    focus: ['hip', 'knee'], title: 'Otwarcie kolana i powrót nogi', marker: 'lift',
    cue: 'Najpierw uniesienie uda, potem otwarcie kolana i aktywny powrót nogi pod biodro.',
    contactCue: 'Przyjmij kontakt blisko biodra; nie blokuj kolana i nie szukaj podłoża daleko z przodu.',
    flightCue: 'Wyróżnione kolano pokazuje zmianę z uniesienia do otwarcia nogi, a potem jej powrót.'
  };
  const skipC = {
    focus: ['knee'], title: 'Zgięcie kolana i powrót pięty', marker: 'fold',
    cue: 'Skracaj nogę zgięciem kolana. Pięta wraca pod biodro; tułów pozostaje spokojny.',
    contactCue: 'Krótki, sprężysty kontakt; nie unoś uda wysoko jak w skipie A.',
    flightCue: 'Obserwuj zgięcie kolana, zamiast odchylać tułów, by dosięgnąć piętą pośladka.'
  };
  const straight = {
    focus: ['hip'], title: 'Ruch nogi z biodra', marker: 'hip',
    cue: 'Noga pozostaje długa, a ruch prowadzi biodro. Kolana nie są blokowane w przeproście.',
    contactCue: 'Kontakt stopy jest pod kontrolą; zachowaj miękkie kolano mimo długiej nogi.',
    flightCue: 'Prowadź długą nogę z biodra. Nie zamieniaj ruchu w wysokie kopnięcie.'
  };
  const march = {
    focus: ['hip', 'knee'], title: 'Uniesienie kolana w marszu', marker: 'lift',
    cue: 'Unoś udo z biodra, zachowując stabilny tułów. Druga stopa zapewnia podpór.',
    contactCue: 'Kontroluj zmianę podporu; marsz nie zawiera fazy lotu ani dodatkowego odbicia.'
  };
  const wall = {
    focus: ['hip', 'ankle'], title: 'Wymiana nóg i pchnięcie z podporu', marker: 'wall',
    cue: 'Utrzymaj linię tułowia i nogi podporowej. Wymiana wychodzi z bioder, dłonie podpierają o ścianę.',
    contactCue: 'Pchnij podłoże nogą podporową; nie załamuj tułowia w pasie.',
    flightCue: 'Zmieniaj nogi bez utraty ustawienia całego ciała. To nie podskok na wysokość.'
  };
  const spring = {
    focus: ['ankle'], title: 'Sprężysta praca stawu skokowego', marker: 'ankles',
    cue: 'Najważniejsza jest praca stawu skokowego i stopy. Biodra i kolana pozostają spokojne, lecz nie zablokowane.',
    contactCue: 'Staw skokowy przyjmuje kontakt i przechodzi do odbicia. To niski podskok, nie przysiad.',
    flightCue: 'Krótki lot: przygotuj stopę do następnego sprężystego kontaktu.'
  };
  const bounds = {
    focus: ['hip', 'ankle'], title: 'Odepchnięcie i przeciwne kolano', marker: 'bound',
    cue: 'Noga podporowa odpycha podłoże, a przeciwne udo prowadzi ruch. Nie wydłużaj kroku sięganiem stopą.',
    contactCue: 'Przejdź od przyjęcia kontaktu do odepchnięcia; nie blokuj nogi podporowej.',
    flightCue: 'Obserwuj przeciwne kolano i przygotowanie następnego kontaktu.'
  };
  const landing = {
    focus: ['hip', 'knee'], title: 'Amortyzacja biodrem i kolanem', marker: 'landing',
    cue: 'Przyjmij obciążenie ugięciem bioder i kolan, z kolanem prowadzonym w kierunku stopy.',
    contactCue: 'Zatrzymaj pozycję po kontakcie. Kolano pozostaje miękkie, a miednica pod kontrolą.',
    flightCue: 'Przygotuj ułożenie nóg do kontaktu. Kontrola lądowania jest ważniejsza niż dodatkowa wysokość.'
  };
  const acceleration = {
    focus: ['hip', 'ankle'], title: 'Pchnięcie podłoża w przyspieszeniu', marker: 'bound',
    cue: 'Pchaj podłoże za siebie, utrzymując pochylenie całego ciała. Ręce współpracują naprzemiennie z nogami.',
    contactCue: 'Noga podporowa kieruje odepchnięcie za ciało; nie składaj tułowia w pasie.',
    flightCue: 'Szybko przygotuj wolną nogę do następnego kontaktu pod kontrolowanym tułowiem.'
  };
  const upright = {
    focus: ['hip', 'arms'], title: 'Cykl nogi i naprzemienna praca rąk', marker: 'running',
    cue: 'Prowadź cykl nogi z biodra, ze swobodną pracą rąk po przeciwnych stronach. Nie unoś barków.',
    contactCue: 'Przejdź płynnie przez kontakt; utrzymaj biodra i tułów w stabilnej pozycji.',
    flightCue: 'Noga i przeciwna ręka współpracują. Rozluźnij barki i dłonie.'
  };
  const start = {
    focus: ['hip', 'ankle'], title: 'Pozycja startowa i pierwsze pchnięcie', marker: 'start',
    cue: 'Z pozycji startowej przejdź do pchnięcia podłoża i pierwszego kroku, bez sięgania stopą w dal.',
    setupCue: 'Najpierw ustaw stabilną pozycję. Wyróżnienie pokazuje biodro i nogę, z której zaczyna się pchnięcie.',
    contactCue: 'Wykorzystaj podpór do pierwszego pchnięcia. Tułów i biodra rozpoczynają ruch razem.',
    flightCue: 'Przygotuj kolejny kontakt, a ręce prowadź naprzemiennie z nogami.'
  };
  const brake = {
    focus: ['hip', 'knee'], title: 'Obniżenie bioder i kontrola kolana', marker: 'landing',
    cue: 'Obniż biodra i przyjmuj obciążenie kolejnymi kontaktami. Kolana uginają się przy hamowaniu.',
    contactCue: 'Wyróżnione biodro i kolano pokazują amortyzację; nie przenoś prostego podporu skipu A na hamowanie.',
    flightCue: 'Przygotuj następny kontakt hamowania, utrzymując kontrolę środka masy.'
  };
  const cut = {
    focus: ['hip', 'knee'], title: 'Podpór i kontrola kolana przy zmianie kierunku', marker: 'landing',
    cue: 'Najpierw kontrola hamowania, potem pchnięcie w nowym kierunku. Kolano prowadź zgodnie ze stopą.',
    setupCue: 'Utrzymaj gotowość i reaguj dopiero na sygnał. Kierunek szczegółowego wykonania wynika z sesji.',
    contactCue: 'Kontroluj kolano i biodro nad nogą podporową; nie skręcaj kolana na nieruchomej stopie.',
    flightCue: 'Przygotuj kolejne pchnięcie w kierunku wyjścia. Sylwetka pokazuje jedynie schemat detalu.'
  };

  define(['a_skip', 'review:a_skip:gather', 'review:a_skip:extra_bounce', 'review:a_skip:continuous', 'a_skip_no_add_step'], skipA);
  define(['b_skip', 'review:b_skip:gather', 'review:b_skip:extra_bounce', 'review:b_skip:continuous'], skipB);
  define(['c_skip', 'review:c_skip:gather', 'review:c_skip:extra_bounce', 'review:c_skip:continuous'], skipC);
  define(['d_skip', 'review:d_skip:gather', 'review:d_skip:extra_bounce', 'review:d_skip:continuous', 'straight_leg_run_bound:run', 'straight_leg_run_bound:bound'], straight);
  define(['a_march', 'bwprep:march'], march);
  define(['switch_skip_a', 'double_switch_skip_a', 'a_switch_progression'], {
    ...skipA, title: 'Szybka wymiana nóg z bioder',
    cue: 'Zmień pozycję nóg ruchem z bioder, a potem utrzymaj nowe ustawienie. Nie szukaj dodatkowego podskoku.'
  });
  define(['a_accent'], { ...skipA, title: 'Kolano i wyróżniony kontakt w rytmie 3 + 1', cue: 'W serii obserwuj wyróżniony kontakt. Akcent nie oznacza wymuszonego wysokiego skoku.' });
  define(['c_accent'], { ...skipC, title: 'Zgięcie kolana i krótszy czwarty cykl', cue: 'Utrzymaj pracę kolana skipu C i krótszy akcent w czwartym cyklu. Drugą serię wykonuje przeciwna strona.' });
  define(['power_skip_height'], { ...bounds, title: 'Odepchnięcie w górę i uniesienie przeciwnego kolana', contactCue: 'Pchnij podłoże do wysokiego odbicia. Powrót na tę samą nogę pozostaje częścią tego wariantu.' });
  define(['power_skip_distance', 'alternate_leg_bounds'], bounds);
  define(['wall_march', 'wall_single_switch', 'wall_double_switch', 'wall_triple_switch'], wall);
  define(['ankling'], {
    ...spring, title: 'Staw skokowy i niski powrót stopy', marker: 'ankles',
    cue: 'Wyróżniony jest staw skokowy. Utrzymaj niski cykl stopy, bez wysokiego unoszenia kolana.',
    contactCue: 'Przejdź sprężyście przez kontakt, z pracą stawu skokowego. Kolano pozostaje spokojne, bez sztywnego blokowania.',
    flightCue: 'Wolna stopa wraca nisko nad podłożem, przygotowana do kolejnego kontaktu.'
  });
  define(['low_dribble'], {
    ...spring, title: 'Małe koło stopy nad podłożem',
    cue: 'Obserwuj niski, krótki tor stopy. Jest to drill biegowy bez piłki, nie wysokie unoszenie kolana.',
    contactCue: 'Przyjmij niski kontakt i prowadź krótki cykl stopy, bez wysokiego unoszenia uda.',
    flightCue: 'Stopa zakreśla niewielki tor nisko nad podłożem, przygotowana do następnego kontaktu.'
  });
  define(['high_dribble'], { ...skipA, title: 'Wyższy cykl uda i stopy', cue: 'Prowadź wyższy cykl nogi niż w niskim dribble. Udo i kolano prowadzą, zamiast kopnięcia prostą nogą.' });
  define(['bilateral_pogo', 'lateral_pogo'], spring);
  define(['single_leg_hops'], {
    ...spring, marker: 'ankleSupport', title: 'Sprężysta praca stawu skokowego nogi skaczącej',
    cue: 'Wyróżniona noga przyjmuje kontakt i wykonuje kolejne odbicie. Druga noga pozostaje swobodna.',
    contactCue: 'Przejdź przez sprężysty kontakt tej samej stopy. Swobodna noga nie przejmuje podporu.'
  });
  define(['scissor_bounds', 'scissor_exchange_jump'], {
    ...landing, title: 'Wymiana nóg w locie i przyjęcie kontaktu',
    cue: 'Wymień nogi w locie, a następnie przyjmij kontakt w nowym wykroku. W tym wariancie lądują obie stopy.'
  });
  define(['snap_down', 'lateral_bound_to_stick'], landing);
  define(['broad_jump'], {
    ...landing, focus: ['arms', 'hip', 'knee'], marker: 'broadJump', title: 'Wspólny zamach rąk, odbicie i lądowanie',
    cue: 'Wspólny zamach obu rąk wspiera wybicie obunóż. Po locie przyjmij kontakt z amortyzacją bioder i kolan.',
    preparationCue: 'Cofnij biodra i wykonaj wspólny zamach obu rąk do tyłu, przygotowując wybicie obunóż.',
    takeoffCue: 'Obie nogi odpychają podłoże, a obie ręce prowadzą zamach w przód i w górę.',
    flightCue: 'W locie obie ręce współpracują z nogami. Przygotuj obunóż kontakt bez sięgania w przeprost.'
  });
  define(['acceleration_mechanics', 'free_acceleration_sprint', 'resisted_sled_acceleration'], acceleration);
  define(['max_velocity_high_volume', 'flying_sprint', 'upright_football_sprint', 'fast_relaxed_fast_run', 'progressive_build_up_sprint', 'bwprep:run', 'bwprep:walk'], upright);
  define(['falling_start', 'split_stance_start', 'half_kneeling_start', 'lateral_start_acceleration', 'crossover_start_acceleration', 'turn_and_go_start', 'app_audio_reaction_start'], start);
  define(['push_up_start'], {
    ...start, focus: ['arms', 'hip'], marker: 'pushStart', title: 'Podpór dłoni i przeniesienie nogi pod biodro',
    setupCue: 'Dłonie podpierają ciało. Następnie noga podchodzi pod biodro, a przeciwna ręka rozpoczyna pracę.',
    cue: 'Zachowaj podpór dłoni do przejęcia obciążenia przez nogę. Ręka przeciwna do nogi w ruchu rozpoczyna pracę.'
  });
  define(['football_curved_sprint', 'reactive_curved_sprint'], {
    ...upright, title: 'Cykl kroku na łuku',
    cue: 'Zachowaj płynny cykl kroku i pracę rąk. Widok boczny nie mierzy przechylenia ciała do środka łuku.'
  });
  define(['progressive_run_three_step_stop', 'run_two_step_stop', 'progressive_deceleration_5_10_15', 'accel_decel_reaccel'], brake);
  define(['deceleration_lateral_exit', 'planned_cut', 'planned_505', 'cut_and_reaccelerate', 'app_audio_forward_left_right', 'app_visual_colour_cue_cod', 'reactive_180_turn'], cut);
  define(['bwprep:ankle'], {
    focus: ['ankle'], marker: 'ankleMobility', title: 'Ruch kolana nad stopą w stawie skokowym',
    cue: 'Przenieś kolano do przodu nad stopą, zachowując piętę na podłożu. To mobilizacja, nie sprężyste odbicie.',
    contactCue: 'Pięta pozostaje na podłożu podczas spokojnego przesunięcia kolana i powrotu.'
  });
  define(['bwprep:adductor'], {
    focus: ['hip'], marker: 'hip', title: 'Cofanie bioder przy długiej nodze bocznej',
    cue: 'Cofaj biodra przy stabilnym podparciu dłoni i kolana. Noga wyprowadzona w bok pozostaje długa.'
  });
  define(['a_skip_add_step'], { ...skipA, title: 'Wybór rytmu z opisu sesji', cue: 'Wybierz dostawienie obu stóp lub dodatkowe odbicie na tej samej nodze. Starsza nazwa sama nie określa rytmu.' });
  define(['straight_leg_run_bound'], { ...straight, title: 'Wybór biegu lub odbić', cue: 'Wybierz wariant z sesji. Bieg z długą nogą i odbicia mają różny rytm i czas lotu.' });
  define(['skip_a_to_d'], { ...skipA, title: 'Zmiana akcentu: kolano → ruch z biodra', cue: 'W pierwszej części obserwuj uniesienie kolana, w drugiej dłuższą nogę prowadzoną z biodra.' });
  define(['skip_b_alternate_bounds'], { ...skipB, title: 'Otwarcie kolana → wieloskok naprzemienny', cue: 'Najpierw cykl skipu B, następnie odepchnięcie i kontakt na przeciwnej nodze w wieloskoku.' });
  define(['dribble_to_sprint_transition'], { ...spring, title: 'Niski cykl stopy → cykl sprintu', cue: 'Z niskiego toru stopy przejdź do wyższego cyklu nogi i przyspieszenia, zgodnie z etapem demonstracji.' });
  define(['sprint_ramp_warmup', 'legacy:6', 'legacy:8', 'legacy:11', 'legacy:12', 'legacy:14', 'legacy:15', 'legacy:16'], {
    focus: ['sequence'], marker: 'sequence', title: 'Akcent zmienia się razem z ćwiczeniem',
    cue: 'Zestaw zawiera osobne ćwiczenia. Wyróżnienie dotyczy aktualnie widocznego składnika, nie całej serii naraz.'
  });

  function tempoFor(id) {
    const model = A && A.models[id];
    if (!model) return null;
    const observed = Boolean(model.contactTimingObserved);
    return {
      durationMs: model.durationMs,
      label: observed ? 'Rytm kontaktów odczytany z fragmentu LRAN; pozycje odtworzone poglądowo.' : 'Tempo demonstracji poglądowe; rytm i dawkę wykonania określa sesja.',
      basis: observed ? 'observed_contacts_reconstructed_pose' : 'illustrative_timing',
      contactTimingObserved: observed,
      verified: false
    };
  }
  function forModel(id) {
    const entry = entries[id];
    return entry ? { ...entry, id, tempo: tempoFor(id) } : null;
  }
  function selectedLegs(scene, mode) {
    const legs = ['right', 'left'].filter(side => point(scene[side]?.ankle) && point(scene[side]?.knee));
    if (!legs.length) return [];
    if (mode === 'support') {
      const supported = legs.filter(side => scene[side].contact);
      return supported.length ? supported : [legs.reduce((a, b) => scene[a].ankle[1] >= scene[b].ankle[1] ? a : b)];
    }
    if (mode === 'lift') {
      const free = legs.filter(side => !scene[side].contact), choices = free.length ? free : legs;
      return [choices.reduce((a, b) => scene[a].knee[1] <= scene[b].knee[1] ? a : b)];
    }
    return legs;
  }
  function regions(scene, entry) {
    const out = [], angle = Number.isFinite(scene.torsoAngle) ? scene.torsoAngle : 0;
    const push = (joint, side, center, rx, ry, rotation = 0) => {
      if (point(center)) out.push({ joint, side, point: [...center], center: [...center], rx, ry, rotation });
    };
    const hip = () => push('hip', 'center', scene.hip, 18, 15, angle);
    const knee = side => push('knee', side, scene[side].knee, 12, 12);
    const ankle = side => push('ankle', side, scene[side].ankle, 15, 10);
    const arms = () => {
      for (const side of ['left', 'right']) {
        const arm = scope.BWDrawHuman?.armPoints(scene, side, angle, scene.view === 'front');
        if (arm && point(arm.elbow) && point(arm.wrist)) push('arm', side, [(arm.elbow[0]+arm.wrist[0])/2, (arm.elbow[1]+arm.wrist[1])/2], 11, 18, Math.atan2(arm.wrist[0]-arm.elbow[0],arm.elbow[1]-arm.wrist[1])*180/Math.PI);
      }
    };
    switch (entry.marker) {
      case 'ankleMobility': ankle('right'); break;
      case 'ankles': selectedLegs(scene, 'all').forEach(ankle); break;
      case 'ankleSupport': selectedLegs(scene, 'support').forEach(ankle); break;
      case 'hip': hip(); break;
      case 'lift': hip(); selectedLegs(scene, 'lift').forEach(knee); break;
      case 'fold': selectedLegs(scene, 'lift').forEach(knee); break;
      case 'wall': hip(); selectedLegs(scene, 'support').forEach(ankle); break;
      case 'landing': hip(); selectedLegs(scene, 'support').forEach(knee); break;
      case 'bound':
      case 'start': hip(); selectedLegs(scene, 'support').forEach(ankle); break;
      case 'broadJump':
        hip();
        if (/zamach|wyprost|wybicie|lot do przodu/i.test(String(scene.phase || ''))) arms();
        else selectedLegs(scene, 'support').forEach(knee);
        break;
      case 'running': hip(); arms(); break;
      case 'pushStart': hip(); arms(); break;
      // Sequences resolve to an explicit child before reaching this branch.
      case 'sequence': break;
    }
    return out;
  }
  function describe(id, scene) {
    if (!entries[id]) return null;
    const child = sequences.has(id) && entries[scene?.sequenceId] ? scene.sequenceId : id;
    const entry = entries[child];
    if (!scene || !point(scene.hip)) return { ...forModel(child), rootId: id, markers: [] };
    const phase = String(scene.phase || '');
    const contacts = Boolean(scene.right?.contact || scene.left?.contact);
    const setup = /czekaj|gotowość|pozycja (?:startowa|wykroczna|przed obrotem)|ustawienie skrzyżne|podpór przodem/i.test(phase);
    let cue = entry.cue;
    if (entry.preparationCue && /zamach|cofnięcie bioder/i.test(phase)) cue = entry.preparationCue;
    else if (entry.takeoffCue && /wyprost|wybicie/i.test(phase)) cue = entry.takeoffCue;
    else if (setup && entry.setupCue) cue = entry.setupCue;
    else if (/lot/i.test(phase) && entry.flightCue) cue = entry.flightCue;
    else if (contacts && entry.contactCue) cue = entry.contactCue;
    else if (!contacts && entry.flightCue) cue = entry.flightCue;
    if (id.includes(':gather')) cue += ' W rytmie z dostawieniem obie stopy spotykają się pod biodrami.';
    else if (id.includes(':extra_bounce') || id === 'a_skip') cue += ' W tym rytmie występuje dodatkowy kontakt tej samej nogi.';
    else if (id.includes(':continuous') || id === 'a_skip_no_add_step') cue += ' Kontakty następują naprzemiennie, bez dodatkowego powrotu na tę samą nogę.';
    const tempo = child === id ? tempoFor(id) : {
      ...tempoFor(id), componentDurationMs: A.models[child]?.durationMs,
      basis: 'illustrative_composition', contactTimingObserved: false,
      label: 'Tempo zestawu poglądowe; każdy składnik i przejście wymagają osobnej oceny.'
    };
    return { ...forModel(child), rootId: id, tempo, cue, phase, markers: regions(scene, entry) };
  }
  function overlay(scene, id) {
    const description = describe(id, scene);
    if (!description || !description.markers.length) return '';
    const mirrorX = Number.isFinite(scene.mirrorX) ? scene.mirrorX : scene.hip[0];
    const transform = scene.facing < 0 ? ` transform="translate(${fmt(mirrorX * 2)} 0) scale(-1 1)"` : '';
    const shapes = description.markers.map(marker => {
      const [x, y] = marker.center, rotation = marker.rotation ? ` transform="rotate(${fmt(marker.rotation)} ${fmt(x)} ${fmt(y)})"` : '';
      const region = `<ellipse class="bw-focus-region bw-focus-${marker.joint}" cx="${fmt(x)}" cy="${fmt(y)}" rx="${fmt(marker.rx)}" ry="${fmt(marker.ry)}" fill="var(--bw-focus-fill, #b8d3e9)" fill-opacity=".24" stroke="var(--bw-focus-ink, #075083)" stroke-opacity=".72" stroke-width="1.1"${rotation}/>`;
      // A small curved direction cue, not a measured-angle wedge.
      const arc = marker.joint === 'ankle' ? `<path class="bw-focus-ankle-arc" d="M${fmt(x-10)},${fmt(y-4)} Q${fmt(x-10)},${fmt(y-13)} ${fmt(x-1)},${fmt(y-13)} M${fmt(x-4)},${fmt(y-16)} L${fmt(x-1)},${fmt(y-13)} L${fmt(x-5)},${fmt(y-11)}" fill="none" stroke="var(--bw-focus-ink, #075083)" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>` : '';
      return region + arc;
    }).join('');
    return `<g class="bw-coaching-emphasis" aria-hidden="true" pointer-events="none"${transform}>${shapes}</g>`;
  }
  scope.BWCoaching = { forModel, describe, overlay, ids: Object.freeze(Object.keys(entries)), version: '2026.10.30.19', sourceCertification: false };
})(typeof window === 'object' ? window : globalThis);
