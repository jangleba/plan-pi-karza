/* eslint-disable @typescript-eslint/no-explicit-any -- isolated Supabase and onboarding audit fixtures */
import { describe,it,expect } from 'vitest';
import { emptyFuelData,manualFuelContext,planFuelContexts,resolveFuelTiming,minutesToFuelStart,writeFuelData,readFuelData,fuelStorageKey } from '../fuel/experience';
import { practicalRecipes,relativeFuelTiming,chooseFuelContext,createRecipeEntry } from '../fuel/practical';
import { FOODS,FOOD_BY_ID,RECIPES,mealNutrition,equivalentSwap } from '../fuel/catalog';
import { sessionKindFrom } from '../fuel/planAdapter';
import { planFuelReminders,DEFAULT_FUEL_REMINDERS } from '../fuel/reminderPlan';
import { normalizeSessionCategory } from '../loadwise/sessionClassification';
import type { SessionDay } from '../loadwise/types';
import type { SessionKind } from '../fuel/types';
const now=Date.parse('2026-10-14T12:00:00');
const storage=()=>{const m=new Map<string,string>();return{getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);}};};
function day(patch:Partial<SessionDay>={}):SessionDay{return normalizeSessionCategory({date:'2026-10-14',dayName:'Środa',dayOfWeek:3,dayType:'training',title:'Interwały tlenowe',sessionType:'Wytrzymałość',goalLabel:'Siła i stabilność',intensity:'umiarkowana',durationMin:45,dbId:'a',dayDbId:'d',reason:'',whyToday:'',safetyNote:null,goalOfSession:'Rozwój wydolności',riskManaged:'',avoidToday:'',mdLabel:null,slotLabel:null,sections:{warmup:[],main:[],accessory:[],footballTransfer:[],cooldown:[]},secondSession:null,...patch} as SessionDay);}
const kinds:SessionKind[]=['match','football','speed','strength','endurance','recovery','none'];
const cases=kinds.flatMap(kind=>['low','moderate','high'].flatMap(load=>[null,15,30,60,90,120,180].flatMap(minutes=>['all','vegetarian','vegan'].flatMap(diet=>['ordinary','quick','portable','excluded'].map(option=>({kind,load,minutes,diet,option}))))));
describe('audit Fuel: 1764 timing, sport, diet and preference combinations',()=>{
  it.each(cases)('$kind/$load/$minutes/$diet/$option',({kind,load,minutes,diet,option})=>{
    const data=emptyFuelData();data.preferences.diet=diet as any;
    if(option==='quick')data.preferences.quick=true;
    if(option==='portable')data.preferences.portable=true;
    if(option==='excluded')data.preferences.excludedFoodIds=['banana','skyr','milk'];
    const timing=minutes===null?{phase:kind==='none'?'ordinary':'before',startsAt:null} as const:relativeFuelTiming(minutes,now)!;
    const recipes=practicalRecipes({context:manualFuelContext('2026-10-14',kind,60,load as any),timing,now,data});
    for(const r of recipes){
      for(const l of r.lines){expect(data.preferences.excludedFoodIds).not.toContain(l.foodId);if(diet==='vegan')expect(FOOD_BY_ID[l.foodId].vegan).toBe(true);if(diet==='vegetarian')expect(FOOD_BY_ID[l.foodId].vegetarian).toBe(true);}
      if(option==='quick')expect(r.prepMin).toBeLessThanOrEqual(5);
      if(option==='portable')expect(r.portable).toBe(true);
      const n=mealNutrition(r.lines);expect(n).not.toBeNull();for(const v of Object.values(n!))expect(Number.isFinite(v)&&v>=0).toBe(true);
      if(minutes!==null&&minutes<=60&&kind!=='none')expect(r.snack).toBe(true);
    }
  });
});
describe('audit Fuel: data boundaries and integration',()=>{
  it('endurance session remains endurance under a strength profile goal',()=>expect(sessionKindFrom(day())).toBe('endurance'));
  it('football session remains football under a speed profile goal',()=>expect(sessionKindFrom(day({title:'Przyjęcie i podanie',sessionType:'Technika piłkarska',goalOfSession:'Gra z piłką',goalLabel:'Szybkość'}))).toBe('football'));
  it('unknown start time stays unknown',()=>expect(resolveFuelTiming(planFuelContexts([day()],day().date,{})[0]).startsAt).toBeNull());
  it('completed first slot selects pending second slot',()=>{const first=day({secondSession:day({dbId:'b',title:'Siła',sessionType:'Siła'})});const contexts=planFuelContexts([first],first.date,{a:{completed:true,rpe:6,notes:''}});expect(chooseFuelContext(contexts,null,first.date)?.key).toContain(':b:2');});
  it('separate accounts cannot see one another food preferences or entries',()=>{const s=storage();const a=emptyFuelData();a.preferences.excludedFoodIds=['banana'];a.entries=[createRecipeEntry(RECIPES[0],'ctx','eaten',now,'unique-entry')];expect(writeFuelData(s,'a',a,now)).toBe(true);expect(readFuelData(s,'b',now).entries).toHaveLength(0);expect(readFuelData(s,'b',now).preferences.excludedFoodIds).toHaveLength(0);expect(readFuelData(s,'a',now).entries).toHaveLength(1);});
  it('corrupt storage produces safe empty data',()=>{const s=storage();s.setItem(fuelStorageKey('a'),'{broken');expect(readFuelData(s,'a',now)).toEqual(emptyFuelData());});
  it('write failure is observable',()=>expect(writeFuelData({setItem:()=>{throw Error('quota');}},'a',emptyFuelData(),now)).toBe(false));
  it('removed session cancels corresponding reminder',()=>{const context=manualFuelContext('2026-10-14','strength',60,'high');const data=emptyFuelData();data.timings[context.key]=relativeFuelTiming(120,now)!;const preferences={...DEFAULT_FUEL_REMINDERS,enabled:true};expect(planFuelReminders({userId:'a',contexts:[context],data,preferences,now})).toHaveLength(1);expect(planFuelReminders({userId:'a',contexts:[],data,preferences,now})).toHaveLength(0);});
  it('past scheduled start must not remain a zero-minutes before-training state',()=>{const c=planFuelContexts([day({scheduledStartTime:'10:00'})],'2026-10-14',{})[0];const timing=resolveFuelTiming(c);expect(timing.phase==='before'&&minutesToFuelStart(timing,now)===0).toBe(false);});
  it('ordinary meal at half portion sums half the nutrient totals',()=>{const full=mealNutrition(RECIPES[0].lines)!;const half=mealNutrition(RECIPES[0].lines.map(l=>({...l,grams:l.grams/2})))!;for(const k of Object.keys(full) as Array<keyof typeof full>)expect(half[k]).toBeCloseTo(full[k]/2,8);});
  it('unknown ingredient yields no invented nutrition',()=>expect(mealNutrition([{foodId:'invented-food',grams:100}])).toBeNull());
});
describe('audit Fuel: all comparable ingredient swaps',()=>{
  const swaps=FOODS.flatMap(a=>FOODS.filter(b=>a.role===b.role&&a.id!==b.id).map(b=>({a,b})));
  it.each(swaps)('$a.id -> $b.id',({a,b})=>{const result=equivalentSwap({foodId:a.id,grams:100},b.id);if(result){expect(result.foodId).toBe(b.id);expect(result.grams>=5&&result.grams<=700&&Number.isFinite(result.grams)).toBe(true);}});
});
