import {describe,it,expect} from "vitest";
import {applyReadiness} from "./planEngine";
import {buildReadiness} from "./readinessModel";
import type {Profile,SessionDay} from "./types";
const session={dayName:"Czwartek",dayOfWeek:4,goalLabel:"Siła",reason:"",safetyNote:null,whyToday:"",riskManaged:"",avoidToday:"",mdLabel:null,slotLabel:null,date:"2026-10-15",title:"Siła",dayType:"training",sessionType:"Siła",goalOfSession:"Siła",intensity:"wysoka",durationMin:60,
 sections:{warmup:[],main:[{name:"Przysiad",prescription:"4 × 6"}],accessory:[],footballTransfer:[],cooldown:[]},secondSession:null} as SessionDay;
describe("severe signals override averages",()=>{
 it.each([6,7,8,9,10])("very poor sleep still reduces training at overall %s",overall=>{
  const r={...buildReadiness(session.date,{sleep:1,fatigue:1,jointPain:0}),overall};
  const result=applyReadiness({...session,secondSession:{...session}},r,{painInjury:false} as Profile).session;
  expect(result.intensity).toBe("niska");expect(result.secondSession).toBeNull();
 });
});
