import { it } from "vitest";
import { generatePlan, weekRanges } from "./planEngine";
import { countWeekRoles, countLimitationSessions } from "./planRules";
it("dbg", () => {
const START = new Date("2026-07-13T00:00:00");
const prof:any = {name:"T",age:20,position:"midfielder",level:"intermediate",goal:"speed",secondaryLimiter:"strength",clubTrainingDays:[],individualTrainingDays:[1,2,3,4,5,6],usualMatchDay:null,matchDate:null,equipment:[],painInjury:false,doubleSessionsAllowed:"no",guardianConsent:true,onboardingComplete:true,createdAt:"2026-01-01",seasonPhase:"preseason",seasonStage:null,competitionLevel:"iv_liga",weeklyMatches:false,hasGym:true,hasPitch:true,hasSprintSpace:true};
const plan = generatePlan(prof, START, 28);
const weeks = weekRanges(START, plan.length).filter(r=>r.end-r.start===7).map(r=>plan.slice(r.start,r.end));
weeks.forEach((w,i)=>{
  console.log("week",i, "speedMand", countWeekRoles(w,"speed").mandatory, "strLim", countLimitationSessions(w,"strength"));
  console.log(w.map(d=>d.sessionType).join(" | "));
});
});
