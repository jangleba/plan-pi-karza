import { describe,it,expect } from 'vitest';
import { scenarios,scenarioVariant } from '../../features/football-iq-match/scenarios';
import { evaluateDecision } from '../../features/football-iq-match/engine';
import { simulate } from '../../features/football-iq-match/simulation';
import { createPlayback,samplePlayback } from '../../features/football-iq-match/playback';
import { saveIQAttempt,loadIQHistory } from '../../features/football-iq-match/history';
import { buildJumpTimeline,measureJump,GRAVITY } from '../../features/browser-lab/measurement';
import { timedMeasurement } from '../../features/browser-lab/results';
import { selectLongJumpWindow, type PoseFrame } from '../../features/browser-lab/longJumpAuto';
import { calculateFieldMasKmh,paceRangeFromMas } from '../running/engine';
const modes=['reference','empty','reverse','first_only','missing_last'] as const;
const cases=scenarios.flatMap(base=>[0,1,2].flatMap(variant=>modes.map(mode=>({base,variant,mode}))));
describe('audit IQ: 270 tactical sequences and replay consistency',()=>{
  it.each(cases)('$base.id/$variant/$mode',({base,variant,mode})=>{
    const s=scenarioVariant(base,variant);
    const a=mode==='reference'?s.referenceActions:mode==='empty'?[]:mode==='reverse'?[...s.referenceActions].reverse():mode==='first_only'?s.referenceActions.slice(0,1):s.referenceActions.slice(0,-1);
    const sim=simulate(s,a);const evaln=evaluateDecision(s,a,5);
    expect(['strong','conditional','risky']).toContain(evaln.level);
    if(mode==='reference')expect(evaln.level).toBe('strong');
    if(mode==='empty')expect(evaln.level).not.toBe('strong');
    if(!sim.valid||sim.lost)expect(evaln.level).not.toBe('strong');
    expect(samplePlayback(createPlayback(s,a),1).ball).toEqual(sim.final.ball);
    for(const f of sim.frames){expect(Number.isFinite(f.ball.x)&&Number.isFinite(f.ball.y)).toBe(true);for(const p of f.positions.values())expect(Number.isFinite(p.x)&&Number.isFinite(p.y)).toBe(true);}
  });
  it('IQ history deduplicates one attempt and separates accounts',()=>{const m=new Map<string,string>();const store={getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);}};const attempt={id:'qa',scenarioId:scenarios[0].id,variant:0,verdict:'strong' as const,createdAt:'2026-10-14T10:00:00Z',decisionSeconds:5,mode:'challenge' as const};saveIQAttempt('a',attempt,store);saveIQAttempt('a',attempt,store);expect(loadIQHistory('a',store)).toHaveLength(1);expect(loadIQHistory('b',store)).toHaveLength(0);});
});
describe('audit Lab: numerical measurement resolution and rejection',()=>{
  function timeline(fps:number){return buildJumpTimeline(Array.from({length:fps*8},(_,i)=>({cts:i,timescale:fps,duration:1})));}
  const jumps=[15,24,30,60,120,240,300].flatMap(fps=>[0.2,0.4,0.6,0.8,1].map(t=>({fps,t})));
  it.each(jumps)('jump at $fps FPS, t=$t',({fps,t})=>{const axis=timeline(fps);const start=Math.max(1,Math.floor(fps/2));const end=start+Math.round(t*fps);const r=measureJump(axis,start,end);expect(r.heightCm).toBeCloseTo(GRAVITY*r.flightSeconds**2*100/8,8);expect(r.resolutionMinCm).toBeLessThanOrEqual(r.heightCm);expect(r.resolutionMaxCm).toBeGreaterThanOrEqual(r.heightCm);});
  const timed=[15,30,60,120,240].flatMap(fps=>[1.5,2,3,4].map(seconds=>({fps,seconds})));
  it.each(timed)('sprint at $fps FPS t=$seconds',({fps,seconds})=>{const axis=timeline(fps);const start=fps;const end=start+Math.round(seconds*fps);const r=timedMeasurement('sprint_10m',axis,start,end);expect(r.primaryValue).toBeCloseTo((end-start)/fps,8);expect(Math.abs(r.primaryValue-seconds)).toBeLessThanOrEqual(1/fps);expect(r.primaryUnit).toBe('s');});
  it('duplicate timestamps are rejected',()=>expect(()=>buildJumpTimeline([{cts:0,timescale:30,duration:1},{cts:0,timescale:30,duration:1},{cts:1,timescale:30,duration:1}])).toThrow());
  it('automatic long-jump selector rejects ground translation with no airborne/contact evidence',()=>{
    const xs=[0.2,0.2,0.2,0.25,0.35,0.5,0.65,0.79,0.8,0.8,0.8,0.8];
    const poses:PoseFrame[]=xs.map((x,i)=>({frameIndex:i*10+1,hip:[x,0.45],shoulders:[x,0.25],heels:[[x-0.02,0.82],[x+0.02,0.82]],toes:[[x-0.01,0.84],[x+0.03,0.84]],confidence:0.9,bodyHeight:0.6}));
    expect(()=>selectLongJumpWindow(poses)).toThrow();
  });
  it('no fabricated MAS from invalid duration or tiny distance',()=>{expect(calculateFieldMasKmh(50,300)).toBeNull();expect(calculateFieldMasKmh(1400,0)).toBeNull();});
  it('1445 m in 5 minutes yields 17.34 km/h and correct 65–75% pace',()=>{const mas=calculateFieldMasKmh(1445,300)!;expect(mas).toBe(17.34);const r=paceRangeFromMas(mas,65,75)!;expect(r.fastestSecPerKm).toBe(277);expect(r.slowestSecPerKm).toBe(319);});
});
