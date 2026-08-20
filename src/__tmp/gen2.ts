import { generatePlan } from "../lib/loadwise/planEngine";
const profile: any = {
  name:"T", age:18, position:"midfielder", level:"advanced", goal:"strength", secondaryLimiter:"return",
  clubTrainingDays:[3], individualTrainingDays:[1,2,3,4,5,6,7], unavailableDays:[], usualMatchDay:null,
  matchDate:"2026-08-23", equipment:[], painInjury:false, doubleSessionsAllowed:"no",
  guardianConsent:true, onboardingComplete:true, createdAt:new Date().toISOString(),
  seasonPhase:"preseason", seasonStage:null, competitionLevel:"okregowka", weeklyMatches:true,
  hasGym:true, hasPitch:true, hasSprintSpace:true,
};
const plan = generatePlan(profile, new Date(2026,7,20));
const d = plan.find(p=>p.sections.main.length>0)!;
console.log(JSON.stringify({title:d.title, w:d.sections.warmup, c:d.sections.cooldown, a:d.sections.accessory},null,1).slice(0,2000));
