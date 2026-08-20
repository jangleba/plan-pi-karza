import { generatePlan } from "../lib/loadwise/planEngine";
import { validatePlanExerciseContract } from "../lib/loadwise/planExerciseContract";
const profile: any = {
  name:"T", age:18, position:"midfielder", level:"advanced", goal:"speed", secondaryLimiter:"return",
  clubTrainingDays:[1,3,5], individualTrainingDays:[1,2,3,5,6,7], unavailableDays:[], usualMatchDay:null,
  matchDate:"2026-08-23", equipment:[], painInjury:false, doubleSessionsAllowed:"yes_if_safe",
  guardianConsent:true, onboardingComplete:true, createdAt:new Date().toISOString(),
  seasonPhase:"preseason", seasonStage:null, competitionLevel:"okregowka", weeklyMatches:true,
  hasGym:true, hasPitch:true, hasSprintSpace:true,
};
try {
  const plan = generatePlan(profile, new Date(2026,7,20));
  console.log("ok", plan.length, validatePlanExerciseContract(plan).length);
} catch (e:any) {
  console.log(e.message.slice(0,4000));
}
