import { buildAthleteTrainingProfile } from "./athleteProfile";
import { isExerciseAllowedForProfile } from "./exerciseLibrary";
import { normalizeSessionCategory } from "./sessionClassification";
import type { Profile, SessionDay } from "./types";

/** Final catalog gate: rebuilds must not reintroduce exercises the profile excludes. */
export function gateProfileExercises(session: SessionDay, profile: Profile): SessionDay {
  const athlete = buildAthleteTrainingProfile(profile);
  const allowed = (e: { exerciseId?: string }) => isExerciseAllowedForProfile(e.exerciseId, athlete).ok;
  let result = session;
  if (session.dayType !== "club" && session.dayType !== "match" && !session.externalCommitment) {
    const structuredSections = session.structuredSections?.map(s => ({...s,
      blocks: s.blocks.map(b => ({...b, exercises:b.exercises.filter(allowed)})).filter(b=>b.exercises.length),
    })).filter(s=>s.blocks.length);
    const sections = {
      warmup:(session.sections.warmup ?? []).filter(allowed),
      main:(session.sections.main ?? []).filter(allowed),
      accessory:(session.sections.accessory ?? []).filter(allowed),
      footballTransfer:(session.sections.footballTransfer ?? []).filter(allowed),
      cooldown:(session.sections.cooldown ?? []).filter(allowed),
    };
    result = {...session, sections, structuredSections, exercises:session.exercises?.filter(allowed)};
    if (!Object.values(sections).some(items=>items.length) && session.dayType === "training") {
      result = {...result, dayType:"rest", title:"Odpoczynek — brak odpowiedniej sesji",
        sessionType:"Odpoczynek", durationMin:0, intensity:"niska", speedGeneratorVersion:undefined,
        reason:"Dostępny zestaw ćwiczeń nie spełnia ograniczeń profilu."};
    }
  }
  return normalizeSessionCategory({...result, secondSession:session.secondSession ? gateProfileExercises(session.secondSession, profile):null});
}
