import { getExerciseDefinition } from "./exerciseLibrary";
import { classifySession, normalizeSessionCategory } from "./sessionClassification";
import { planSessionType } from "./sessionRuntime";
import type { Profile, SessionDay } from "./types";

/**
 * Last naming pass: the title and the stored type must describe what the
 * athlete will actually do. Earlier passes may legitimately swap content
 * (equipment, method, safety), so the name is checked against the final
 * prescription instead of trusting the name chosen before those swaps.
 */

function workExercises(session: SessionDay): Array<{ exerciseId?: string }> {
  if (session.structuredSections?.length)
    return session.structuredSections
      .filter((section) => section.type === "main" || section.type === "accessory")
      .flatMap((section) => section.blocks.flatMap((block) => block.exercises));
  return [...(session.sections?.main ?? []), ...(session.sections?.accessory ?? [])];
}

const NO_EQUIPMENT_TITLE = /masa ciała|bez sprzętu/i;
const POWER_TITLE = /\bmoc(?:y|ą)?\b|power/i;

function usesEquipment(exercises: Array<{ exerciseId?: string }>): boolean {
  return exercises.some((exercise) =>
    (getExerciseDefinition(exercise.exerciseId ?? "")?.equipmentRequired ?? []).some(
      (item) => item !== "none" && item !== "band",
    ),
  );
}

function hasPowerWork(exercises: Array<{ exerciseId?: string }>): boolean {
  return exercises.some((exercise) => {
    const category = getExerciseDefinition(exercise.exerciseId ?? "")?.category;
    return category === "power" || category === "plyometric";
  });
}

export function alignSessionTitleWithContent(session: SessionDay, profile: Profile): SessionDay {
  if (session.executionProtected) return session;
  const secondSession = session.secondSession
    ? alignSessionTitleWithContent(session.secondSession, profile)
    : session.secondSession;
  let next: SessionDay =
    secondSession === session.secondSession ? session : { ...session, secondSession };

  if (classifySession(next).category === "gym_strength") {
    const work = workExercises(next);
    if (NO_EQUIPMENT_TITLE.test(next.title) && usesEquipment(work)) {
      next = {
        ...next,
        title: profile.hasGym ? "Siła bazowa na siłowni" : "Siła w domu (własny sprzęt)",
        sessionType: profile.hasGym ? "Siła / całe ciało" : "Siła — sprzęt domowy",
        goalOfSession: profile.hasGym
          ? "Siła bazowa z prostym obciążeniem i nauką wzorców ruchowych."
          : "Siła i stabilność z własnym sprzętem, bez dostępu do siłowni.",
      };
    }
    if (POWER_TITLE.test(next.title) && work.length > 0 && !hasPowerWork(work)) {
      next = {
        ...next,
        title: /siłowni/i.test(next.title) ? "Siła na siłowni" : "Siła i stabilizacja",
        sessionType: next.sessionType.replace(/\s*\/\s*moc\b|moc\s*\/\s*/i, "") || "Siła",
      };
    }
  }

  // The stored type is persisted as session_type. A stale value (e.g. a rest
  // day still marked as sprint) would mislabel the saved row.
  if (next.type) {
    const derived = planSessionType(next);
    if (derived !== next.type) next = { ...next, type: derived };
  }
  return next === session ? session : normalizeSessionCategory(next);
}
