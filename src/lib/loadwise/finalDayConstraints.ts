import { reduceSessionDose } from "./sessionDose";
import type { Profile, SessionDay } from "./types";
import { assessDaySpeedLoad } from "./speedLoad";
import { classifySession, normalizeSessionCategory } from "./sessionClassification";
export const isExternal = (s: SessionDay) => Boolean(s.externalCommitment || s.dayType === "club" || s.dayType === "match");
export function withoutOwnSpeed(s: SessionDay, reason: string): SessionDay {
  if (isExternal(s)) return s;
  return normalizeSessionCategory({...s,dayType:"rest",type:"rest",sessionType:"Odpoczynek",
    title:"Odpoczynek",goalOfSession:"Odpoczynek",intensity:"niska",durationMin:0,
    reason,whyToday:reason,classification:undefined,speedGeneratorVersion:undefined,
    structuredSections:undefined,exercises:undefined,
    sections:{warmup:[],main:[],accessory:[],footballTransfer:[],cooldown:[]},secondSession:null});
}
export function enforceFinalDayConstraints(plan: SessionDay[], profile: Profile): SessionDay[] {
  const result = plan.map(day=>{
    const second = day.secondSession;
    let main: SessionDay = {...day, secondSession:null};
    let extra: SessionDay | null = second ? {...second, secondSession:null}:null;
    if (profile.hasSprintSpace === false) {
      if (assessDaySpeedLoad(main).realExposureCount) main = withoutOwnSpeed(main,"Brak miejsca do bezpiecznego sprintu.");
      if (extra && assessDaySpeedLoad(extra).realExposureCount) extra = isExternal(extra) ? extra:null;
    }
    if (extra && !isExternal(extra) && (classifySession(main).category === classifySession(extra).category ||
        JSON.stringify(main.sections) === JSON.stringify(extra.sections))) extra = null;
    if (extra && (profile.age < 16 || profile.level === "beginner") && main.intensity === "wysoka" && extra.intensity === "wysoka") {
      if (!isExternal(extra)) extra = {...reduceSessionDose(extra,0.6),intensity:"umiarkowana",durationMin:Math.round(extra.durationMin*0.6)};
      else if (!isExternal(main)) main = {...reduceSessionDose(main,0.6),intensity:"umiarkowana",durationMin:Math.round(main.durationMin*0.6)};
      else main = {...main,safetyNote:"Dwa duże obciążenia zewnętrzne — ustal udział z trenerem."};
    }
    return {...main,secondSession:extra,slotLabel:extra ? day.slotLabel:null};
  });
  for (let i=1;i<result.length;i++) {
    const previous = result[i-1];
    let current = result[i];
    const adjacent = Date.parse(current.date+"T12:00:00Z") - Date.parse(previous.date+"T12:00:00Z") === 86400000;
    if (!adjacent || !assessDaySpeedLoad(previous).blocksAdjacentSpeedDay || !assessDaySpeedLoad(current).realExposureCount) continue;
    const reason = "Odpoczynek po wcześniejszej ekspozycji szybkościowej.";
    const second = current.secondSession;
    if (assessDaySpeedLoad({...current,secondSession:null}).realExposureCount && !isExternal(current)) {
      current = {...withoutOwnSpeed(current,reason),secondSession:second};
    }
    if (current.secondSession && assessDaySpeedLoad({...current.secondSession,secondSession:null}).realExposureCount && !isExternal(current.secondSession)) {
      current = {...current,secondSession:null,slotLabel:null};
    }
    // Preserve real matches/club commitments even if the external calendar is congested.
    if (assessDaySpeedLoad(current).realExposureCount) current = {...current,safetyNote:"Bliskie obciążenia zewnętrzne — omów udział z trenerem."};
    result[i]=current;
  }
  return result;
}
