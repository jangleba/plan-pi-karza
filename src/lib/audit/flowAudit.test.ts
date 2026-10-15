/* eslint-disable @typescript-eslint/no-explicit-any -- isolated Supabase and onboarding audit fixtures */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { buildProfile, initialState } from '../loadwise/store/model';
import { createProfileActions } from '../loadwise/store/profileActions';
import { createPlanActions } from '../loadwise/store/planActions';
import { persistMonthlyPlan } from '../loadwise/persist';
import { generatePlan } from '../loadwise/planEngine';
import { createPlanPersistence, loadSessionHistory } from '../loadwise/store/repository';
import { resolveEffectiveDay, applyCheckInToPlanDay } from '../loadwise/dailyCheckin';
import { buildReadiness } from '../loadwise/readinessModel';
import { normalizeSessionCategory } from '../loadwise/sessionClassification';
import { buildLighterSession } from '../loadwise/dailyPlanCheckin';
import { ageOnDate } from '../loadwise/agePolicy';
import { effectiveSeasonPhase } from '../loadwise/seasonValidation';
import { normalizeCurrentPitchFeelings, normalizeDesiredPitchFeelings } from '../loadwise/playerDirection';
import type { Profile, SessionDay, SessionModification } from '../loadwise/types';
const m=vi.hoisted(()=>({writes:[] as Array<{table:string;payload:Record<string,unknown>}>,rows:{} as Record<string,unknown>}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from(table:string){const chain:any={
  upsert:(payload:Record<string,unknown>)=>{m.writes.push({table,payload});return chain;},
  insert:(payload:Record<string,unknown>)=>{m.writes.push({table,payload});return chain;},
  update:()=>chain,delete:()=>chain,gte:()=>chain,
  select:()=>chain,eq:()=>chain,in:()=>chain,maybeSingle:()=>chain,
  then:(resolve:any,reject:any)=>Promise.resolve({error:null,data:m.rows[table]??{updated_at:'2026-10-14T10:00:00Z'}}).then(resolve,reject)};
  return chain;
},rpc:async()=>({data:null,error:null})}}));
beforeEach(()=>{m.writes.length=0;m.rows={};});
const profile:Profile={name:'Audit',age:22,position:'midfielder',level:'intermediate',goal:'strength',secondaryLimiter:'speed',
  clubTrainingDays:[2,4],individualTrainingDays:[1,2,3,4,5,6],usualMatchDay:null,matchDate:'2026-10-18',equipment:[],
  painInjury:false,doubleSessionsAllowed:'yes_if_safe',guardianConsent:true,onboardingComplete:true,createdAt:'2026-10-01',
  seasonPhase:'inseason',seasonStage:'match_week',competitionLevel:'iv_liga',weeklyMatches:true,hasGym:true,hasPitch:true,hasSprintSpace:true,
  healthPersonalizationEnabled:true};
function session(patch:Partial<SessionDay>={}):SessionDay{return normalizeSessionCategory({
  date:'2026-10-14',dayName:'Środa',dayOfWeek:3,dayType:'training',title:'Siła',goalLabel:'Siła',intensity:'wysoka',durationMin:60,
  reason:'',safetyNote:null,whyToday:'',sessionType:'Siła',goalOfSession:'Siła',riskManaged:'',avoidToday:'',mdLabel:null,slotLabel:null,
  dbId:'session-a',dayDbId:'day-a',sections:{warmup:[],main:[{name:'Przysiad',prescription:'4 × 6'}],accessory:[],footballTransfer:[],cooldown:[]},
  secondSession:null,...patch} as SessionDay);}
async function roundTrip(p:Profile){
  const persistence=createPlanPersistence({id:'qa'},'2026-10-14');
  const actions=createProfileActions({user:{id:'qa'},state:initialState,setState:()=>{},todayIso:'2026-10-14',
    saveProfileRows:persistence.saveProfileRows,savePlanToDb:async()=>[],generatingRef:{current:false},setPlanGenerating:()=>{}});
  await actions.completeOnboarding(p);
  const prof=m.writes.find(w=>w.table==='profiles')!.payload;
  const ath=m.writes.find(w=>w.table==='athlete_profiles')!.payload;
  const answers=m.writes.find(w=>w.table==='onboarding_answers')!.payload.answers_json as Record<string,unknown>;
  return buildProfile({...prof,onboarding_completed:true},ath,answers)!;
}
describe('audit: actual profile persistence mapping',()=>{
  it('preserves common planning fields across save and hydration',async()=>{
    const p=await roundTrip(profile);
    for(const k of ['goal','secondaryLimiter','level','position','hasGym','hasPitch','hasSprintSpace','clubTrainingDays','individualTrainingDays','matchDate','healthPersonalizationEnabled'] as const) expect(p[k]).toEqual(profile[k]);
  });
  it('preserves selected pain locations across save and hydration',async()=>{
    const p=await roundTrip({...profile,painInjury:true,painLocations:['hamstring']});
    expect(p.painLocations).toEqual(['hamstring']);
  });
  it('preserves deliberate nonstandard season after reload',async()=>{
    const p=await roundTrip({...profile,seasonPhase:'preseason',seasonPhaseOverride:true});
    expect(effectiveSeasonPhase(p,new Date('2026-10-14T00:00:00'))).toBe('preseason');
  });
  it('history reads actual duration 83 min rather than planned 60 min',async()=>{
    m.rows.training_sessions=[{id:'session-a',training_day_id:'day-a',session_type:'strength_power',title:'Siła',duration_min:60}];
    m.rows.training_days=[{id:'day-a',date:'2026-10-14',day_type:'training'}];
    const result=await loadSessionHistory('qa',[{session_id:'session-a',completed:true,duration_minutes:83,rpe:7}]);
    expect(result[0].durationMin).toBe(83);
  });
  it('changing next week preserves the identifier of a completed prior-week session',async()=>{
    const debug=vi.spyOn(console,'debug').mockImplementation(()=>undefined);
    try{
      const plan=generatePlan(profile,new Date('2026-10-12T00:00:00'),14);
      await persistMonthlyPlan('qa',profile,plan);
      const completed=plan.find(d=>d.date==='2026-10-13')!;
      const oldId=completed.dbId!;
      let current={...initialState,profile,plan,completions:{[oldId]:{completed:true,rpe:6,notes:'done'}}};
      const actions=createPlanActions({user:{id:'qa'},state:current,todayIso:'2026-10-14',
        setState:(u:any)=>{current=typeof u==='function'?u(current):u;},
        saveProfileRows:async()=>null,savePlanToDb:async()=>[],replacementInFlightRef:{current:new Set<string>()}});
      await actions.confirmWeeklyTransition(1,['2026-10-25'],false);
      expect(current.plan.find(d=>d.date==='2026-10-13')?.dbId).toBe(oldId);
    }finally{debug.mockRestore();}
  });
});
describe('audit: modification and readiness compose correctly',()=>{
  it('saved swap cannot bypass a low-readiness adjustment',()=>{
    const day=session();const r=buildReadiness(day.date,{sleep:1,fatigue:10,jointPain:0});
    const mod:SessionModification={id:'m',date:day.date,type:'swap',reason:'swap',safetyStatus:'swapped_by_user',session:session({dbId:'new'}),originalSession:day,createdAt:'2026-10-14T08:00:00Z'};
    const effective=resolveEffectiveDay(day,r,profile,[mod]);
    expect(effective.intensity).not.toBe('wysoka');
  });
  it('saved added slot is adapted after a severe check-in',()=>{
    const day=session();const r=buildReadiness(day.date,{sleep:1,fatigue:10,jointPain:0});
    const mod:SessionModification={id:'m',date:day.date,type:'add',reason:'add',safetyStatus:'added_by_user',session:session({dbId:'new'}),originalSession:null,createdAt:'2026-10-14T08:00:00Z'};
    const effective=resolveEffectiveDay(day,r,profile,[mod]);
    expect(effective.secondSession?.intensity).not.toBe('wysoka');
  });
  it('readiness adaptation is idempotent and reversible without compounding',()=>{
    const day=session();const r=buildReadiness(day.date,{sleep:7,fatigue:4,jointPain:0});
    const a=applyCheckInToPlanDay([day],day.date,r,profile);
    const b=applyCheckInToPlanDay(a.plan,day.date,r,profile);
    expect(b.plan).toEqual(a.plan);
    const full=applyCheckInToPlanDay(a.plan,day.date,buildReadiness(day.date,{sleep:10,fatigue:1,jointPain:0,stress:1}),profile);
    expect(full.plan[0].durationMin).toBe(day.durationMin);
  });
  it('worse readiness 3 should not yield a larger dose than readiness 4',()=>{
    const day=session();const r=buildReadiness(day.date,{sleep:7,fatigue:3,jointPain:0});
    const three=resolveEffectiveDay(day,{...r,overall:3},profile);
    const four=resolveEffectiveDay(day,{...r,overall:4},profile);
    expect(three.durationMin).toBeLessThanOrEqual(four.durationMin);
  });
  it('readiness 6 reduces prescribed strength volume, not only the duration label',()=>{
    const day=session();const r=buildReadiness(day.date,{sleep:7,fatigue:3,jointPain:0});
    const effective=resolveEffectiveDay(day,{...r,overall:6},profile);
    expect(effective.durationMin).toBeLessThan(day.durationMin);
    expect(effective.sections.main[0].prescription).not.toBe(day.sections.main[0].prescription);
  });
  it('lighter repeated from same base has stable dose',()=>{
    const day=session();expect(buildLighterSession(day)).toEqual(buildLighterSession(day));
  });
});

// Execute the real object initializer in onboarding.tsx, with isolated fixture
// variables. This tests the production mapping, not a recreated mapping or UI.
function onboardingProfile(existing:Profile):Profile{
  const source=ts.createSourceFile('onboarding.tsx',readFileSync('src/routes/onboarding.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let expression='';
  function walk(n:ts.Node){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='profile'&&n.initializer&&n.type?.getText(source)==='Profile') expression=n.initializer.getText(source);ts.forEachChild(n,walk);}
  walk(source);if(!expression) throw Error('onboarding production initializer not found');
  const variables:Record<string,unknown>={existing,name:existing.name,ageNum:existing.age,birthDate:existing.birthDate,
    accountOwnerType:'athlete',guardianName:'',user:{email:'fixture@example.invalid'},guardianEmailVerified:true,consent:true,isGuardianChild:false,
    consents:{health_data:true},position:existing.position,level:existing.level,goal:existing.goal,secondaryLimiter:existing.secondaryLimiter,
    clubDays:existing.clubTrainingDays,availableDays:existing.individualTrainingDays,unavailableDays:[],noMatch:false,matchDate:existing.matchDate,
    equipment:existing.equipment,painInjury:existing.painInjury,painLocations:existing.painLocations||[],seasonPhase:existing.seasonPhase,
    seasonStage:existing.seasonStage,competitionLevel:existing.competitionLevel,weeklyMatches:existing.weeklyMatches,seasonPhaseOverride:true,
    seasonValidation:{status:'override'},hasGym:existing.hasGym,hasPitch:existing.hasPitch,hasSprintSpace:existing.hasSprintSpace,
    currentFeelings:['lacking_speed'],desiredFeelings:['fast_and_light'],normalizeCurrentPitchFeelings,normalizeDesiredPitchFeelings};
  const code=ts.transpileModule('return '+expression+';',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  return new Function(...Object.keys(variables),code)(...Object.values(variables));
}
describe('audit: actual onboarding edit initializer',()=>{
  it('editing an unrelated field preserves measured field MAS',()=>{
    const old={...profile,fieldMasKmh:17.34,fieldMasTestedAt:'2026-10-10',runningProgressionLevel:2,runningProgressionUpdatedAt:'2026-10-12'};
    const p=onboardingProfile(old);expect(p.fieldMasKmh).toBe(17.34);expect(p.runningProgressionLevel).toBe(2);
  });
  it('editing preserves the second explicit match date',()=>{
    const p=onboardingProfile({...profile,matchDates:['2026-10-18','2026-10-21']});
    expect(p.matchDates).toContain('2026-10-21');
  });
});
describe('audit: age and malformed dates',()=>{
  it.each([['2013-10-14','2026-10-13',12],['2013-10-14','2026-10-14',13],['2010-10-14','2026-10-14',16],['2008-10-14','2026-10-14',18]])('birthday %s/%s', (born,now,age)=>expect(ageOnDate(born,now)).toBe(age));
  it('rejects impossible birth date rather than rolling into March',()=>expect(ageOnDate('2010-02-31','2026-10-14')).toBeNull());
});
