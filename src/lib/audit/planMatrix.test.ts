import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generatePlan } from '../loadwise/planEngine';
import { assertPlanExerciseContract } from '../loadwise/planExerciseContract';
import { classifySession, isMainGymSession } from '../loadwise/sessionClassification';
import { assessDaySpeedLoad } from '../loadwise/speedLoad';
import { buildAthleteTrainingProfile } from '../loadwise/athleteProfile';
import { isExerciseAllowedForProfile } from '../loadwise/exerciseLibrary';
import type { Profile, Position, Level, Goal, SessionDay } from '../loadwise/types';

const positions: Position[] = ['goalkeeper','defender','midfielder','forward'];
const levels: Level[] = ['beginner','intermediate','advanced','elite'];
const goals: Goal[] = ['speed','strength','endurance','power','agility','general','mobility','return','matchready'];
const allDays = [1,2,3,4,5,6,7];
const variants: Array<{name: string; patch: Partial<Profile>}> = [
  {name:'open',patch:{}},
  {name:'club_match',patch:{clubTrainingDays:[2,4],matchDate:'2026-10-18',matchDates:['2026-10-18','2026-10-25'],weeklyMatches:true}},
  {name:'congested',patch:{clubTrainingDays:[1,2,4,5],matchDate:'2026-10-14',matchDates:['2026-10-14','2026-10-18'],weeklyMatches:true}},
  {name:'no_equipment',patch:{hasGym:false,hasPitch:false,hasSprintSpace:false}},
  {name:'two_available_days',patch:{individualTrainingDays:[2,4],unavailableDays:[1,3,5,6,7],doubleSessionsAllowed:'no'}},
  {name:'zero_available_days',patch:{individualTrainingDays:[],unavailableDays:allDays,doubleSessionsAllowed:'no'}},
  {name:'age13',patch:{age:13,accountOwnerType:'guardian',guardianConsent:true,doubleSessionsAllowed:'light_only'}},
  {name:'pain_return',patch:{painInjury:true,painLocations:['hamstring'],seasonPhase:'return_injury',secondaryLimiter:'return'}},
];
function makeProfile(position: Position, level: Level, goal: Goal, patch: Partial<Profile>): Profile {
  return {name:'Audit fixture',age:22,position,level,goal,secondaryLimiter:'strength',
    clubTrainingDays:[],individualTrainingDays:allDays,unavailableDays:[],usualMatchDay:null,matchDate:null,
    equipment:[],painInjury:false,doubleSessionsAllowed:level==='beginner'?'light_only':'yes_if_safe',
    guardianConsent:true,onboardingComplete:true,createdAt:'2026-10-01',seasonPhase:'inseason',
    seasonStage:'no_match_week',competitionLevel:'iv_liga',weeklyMatches:false,hasGym:true,hasPitch:true,
    hasSprintSpace:true,healthPersonalizationEnabled:true,seasonPhaseOverride:true,...patch};
}
const results: Array<Record<string,unknown>>=[];
function ordinal(date: string) {return Date.parse(date+'T12:00:00Z')/86400000;}
function dayOf(date: string) {return new Date(date+'T12:00:00Z').getUTCDay()||7;}
function compact(day: SessionDay) {
  const one=(s:SessionDay)=>({title:s.title,dayType:s.dayType,intensity:s.intensity,duration:s.durationMin,
    category:classifySession(s).category,md:s.mdLabel,unavailable:s.isUnavailable});
  return {date:day.date,main:one(day),second:day.secondSession?one(day.secondSession):null};
}
function inspect(plan: SessionDay[], p: Profile, days: number): string[] {
  const issues=new Set<string>();
  if(plan.length!==days || new Set(plan.map(d=>d.date)).size!==days) issues.add('calendar_shape');
  const gymDays=new Set(plan.filter(d=>isMainGymSession(d)||(d.secondSession&&isMainGymSession(d.secondSession))).map(d=>ordinal(d.date)));
  const gymWeeks=new Map<number,number>();
  const athlete=buildAthleteTrainingProfile(p);
  for(let i=0;i<plan.length;i++) {
    const day=plan[i]; const slots=[day,day.secondSession].filter(Boolean) as SessionDay[];
    if(gymDays.has(ordinal(day.date)) && gymDays.has(ordinal(day.date)-1)) issues.add('adjacent_gym_days');
    const nGym=slots.filter(isMainGymSession).length;
    if(nGym>1) issues.add('duplicate_gym_day');
    const mon=ordinal(day.date)-dayOf(day.date)+1;
    gymWeeks.set(mon,(gymWeeks.get(mon)||0)+nGym);
    // Current dailyScheduling deliberately ignores these legacy preference
    // flags. They are recorded below, not counted as current-policy failures.
    if(day.secondSession && (p.age<16||p.level==='beginner') && day.intensity==='wysoka' && day.secondSession.intensity==='wysoka') issues.add('two_high_sessions_youth_or_beginner');
    if(day.secondSession && classifySession(day).category===classifySession(day.secondSession).category) issues.add('duplicate_category');
    const load=assessDaySpeedLoad(day);
    if(load.hasDuplicateRealSpeedExposures) issues.add('duplicate_real_speed');
    if(i>0 && ordinal(day.date)-ordinal(plan[i-1].date)===1 && assessDaySpeedLoad(plan[i-1]).blocksAdjacentSpeedDay && load.realExposureCount>0) issues.add('adjacent_real_speed');
    for(const s of slots) {
      if(!Number.isFinite(s.durationMin)||s.durationMin<0||!s.title.trim()) issues.add('invalid_session_values');
      if(s.secondSession && s!==day) issues.add('third_slot');
      if((p.unavailableDays||[]).includes(dayOf(day.date)) && s.dayType!=='match' && s.dayType!=='club' && s.durationMin>0) issues.add('training_on_unavailable_day');
      if(!s.externalCommitment && s.dayType!=='club' && s.dayType!=='match' && s.mdLabel==='MD-1' && s.intensity==='wysoka') issues.add('high_own_md_minus_1');
      if(!p.hasSprintSpace && assessDaySpeedLoad({...s,secondSession:null}).realExposureCount>0) issues.add('real_speed_without_space');
      if(s.dayType==='club'||s.dayType==='match'||s.dayType==='rest') continue;
      const exercises=s.structuredSections?.length?s.structuredSections.flatMap(x=>x.blocks.flatMap(b=>b.exercises)):Object.values(s.sections).flat();
      for(const e of exercises) {
        const ok=isExerciseAllowedForProfile(e.exerciseId,athlete);
        if(!ok.ok) issues.add('exercise_not_allowed:'+String(e.exerciseId)+':'+ok.reasons.join('|'));
      }
    }
  }
  if([...gymWeeks.values()].some(n=>n>2)) issues.add('more_than_two_gym_per_week');
  for(const date of p.matchDates||[]) if(plan.some(d=>d.date===date) && !plan.some(d=>d.date===date&&d.dayType==='match')) issues.add('missing_explicit_match');
  try{assertPlanExerciseContract(plan);}catch(e){issues.add('exercise_contract:'+String(e));}
  return [...issues];
}
beforeAll(()=>vi.spyOn(console,'debug').mockImplementation(()=>undefined));
afterAll(()=>{writeFileSync(process.env.BALLWISE_AUDIT_MATRIX_OUTPUT ?? '../plan-matrix-results.json',JSON.stringify(results,null,2));vi.restoreAllMocks();});
const cases=positions.flatMap(position=>levels.flatMap(level=>goals.flatMap(goal=>variants.map(v=>({position,level,goal,...v})))));
describe('audit plan: 1152 independent onboarding profiles, 14 calendar days',()=>{
  it.each(cases)('$position/$level/$goal/$name',({position,level,goal,name,patch})=>{
    const p=makeProfile(position,level,goal,patch); let issues:string[]=[];let plan:SessionDay[]=[];
    try{plan=generatePlan(p,new Date('2026-10-12T00:00:00'),14);issues=inspect(plan,p,14);}
    catch(e){issues=['generation_exception:'+String(e)];}
    results.push({id:`${position}/${level}/${goal}/${name}`,profile:p,days:plan.length,issues,
      legacyPreferenceObservations:plan.some(d=>d.secondSession)&&p.doubleSessionsAllowed==='no'?['legacy_no_double_flag_ignored_by_current_policy']:[],
      plan:issues.length?plan.map(compact):undefined});
    expect(issues).toEqual([]);
  });
});
const boundaries=goals.flatMap(goal=>[0,1,2,3,4,5,6].map(offset=>({goal,offset})));
describe('audit calendar: 63 full-month plans starting on each weekday',()=>{
  it.each(boundaries)('$goal/start+$offset',({goal,offset})=>{
    const p=makeProfile('midfielder','intermediate',goal,{clubTrainingDays:[2,4],matchDate:'2026-10-18',matchDates:['2026-10-18','2026-10-25'],weeklyMatches:true});
    const start=new Date('2026-10-12T00:00:00'); start.setDate(start.getDate()+offset);
    let plan:SessionDay[]=[];let issues:string[]=[];
    try{plan=generatePlan(p,start,28);issues=inspect(plan,p,28);}catch(e){issues=['generation_exception:'+String(e)];}
    results.push({id:`month/${goal}/${offset}`,profile:p,days:plan.length,issues,plan:issues.length?plan.map(compact):undefined});
    expect(issues).toEqual([]);
  });
});
