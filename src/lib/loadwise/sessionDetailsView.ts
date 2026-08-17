import type { SessionDay } from "./types";

export function detailStatusLabel(session: SessionDay): string {
  return session.loadLabelOverride ?? session.intensity;
}

export function detailDecisionNote(session: SessionDay): string | null {
  if (session.loadLabelOverride === "Wstrzymaj trening") {
    return (
      session.safetyNote ??
      "Wstrzymaj trening i skonsultuj się z lekarzem lub fizjoterapeutą."
    );
  }
  if (session.loadLabelOverride === "Ogranicz obciążenie") {
    return (
      session.safetyNote ??
      "Niska gotowość — zgłoś ją trenerowi przed treningiem i ogranicz obciążenie zgodnie z jego decyzją. Przerwij wysiłek, jeśli pojawi się lub nasili ból."
    );
  }
  if (session.dayType === "club") return "Klub = główne obciążenie.";
  if (session.dayType === "match") return "Dziś mecz — bez dodatkowego treningu.";
  if (session.mdLabel === "MD-1") return "MD-1 = tylko aktywacja, bez ciężkich nóg.";
  if (session.dayType === "recovery") return "Regeneracja — bez intensywności.";
  if (session.intensity === "wysoka") return "Mocny dzień — rozgrzej się solidnie.";
  return null;
}
