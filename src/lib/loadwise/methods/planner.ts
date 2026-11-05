import { applyStrengthProgramming } from "../strengthProgramming";
import { balanceStrengthSections } from "../strengthSessionBalance";
import { computeLoadTags } from "../sessionLoadTags";
import type { Profile, SessionDay, TrainingSection } from "../types";
import {
  normalizeSessionCategory,
  isBallTechnicalSession,
  isEnduranceSession,
  isSpeedSession,
  isStrengthSession,
} from "../sessionClassification";
import { buildAthleteTrainingProfile } from "../athleteProfile";
import { getExerciseDefinition, isExerciseAllowedForProfile } from "../exerciseLibrary";
import { estimateStrengthMinutes } from "../strengthProgramming";
import { structuredToFlat } from "../strengthBlocks";
import {
  buildFieldMethod,
  buildStrengthMethod,
  methodPhase,
  profileWithMethodEquipment,
} from "./builders";
import { getTrainingMethod } from "./catalogue";
import { normalizeMethodConditions, trainingMethodEligibility } from "./eligibility";
import type { MethodSessionConditions, TrainingMethodId } from "./types";

export function methodRecipeKey(sections: TrainingSection[] = []): string {
  const text = JSON.stringify(
    sections.map((s) => [
      s.type,
      s.blocks.map((b) => [
        b.blockType,
        b.exercises.map((e) => [
          e.exerciseId,
          e.sets,
          e.reps,
          e.duration,
          e.displayPrescription,
          e.rir,
          e.tempo,
          e.restAfterExercise,
          e.restAfterPair,
          e.methodExecution,
        ]),
      ]),
    ]),
  );
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export function hasCurrentMethodRecipe(session: SessionDay): boolean {
  return (
    session.trainingMethods?.recipeVersion === "47" &&
    session.trainingMethods.recipeKey === methodRecipeKey(session.structuredSections)
  );
}
export function sessionMethodDomain(
  session: SessionDay,
): "strength" | "sprint" | "conditioning" | "skills" | null {
  if (
    session.dayType === "club" ||
    session.dayType === "match" ||
    session.dayType === "rest" ||
    session.externalCommitment ||
    session.durationMin <= 0
  )
    return null;
  if (isStrengthSession(session)) return "strength";
  if (isSpeedSession(session)) return "sprint";
  if (isEnduranceSession(session)) return "conditioning";
  if (isBallTechnicalSession(session)) return "skills";
  return null;
}
export function methodMatchesSession(id: TrainingMethodId, session: SessionDay): boolean {
  const domain = sessionMethodDomain(session),
    m = getTrainingMethod(id);
  return (
    !!domain &&
    m?.role === "workout" &&
    (m.domain === domain || (domain === "strength" && m.domain === "power"))
  );
}
const TITLE: Partial<Record<TrainingMethodId, string>> = {
  M26: "Spokojny bieg ciągły",
  M27: "Tempo submaksymalne",
  M28: "Interwały tlenowe: długie odcinki",
  M29: "Interwały tlenowe: krótkie odcinki",
  M30: "RSA: powtarzane sprinty",
  M31: "Interwały bardzo wysokiej intensywności",
  M18: "Sprint: przyspieszenie",
  M19: "Sprint: prędkość maksymalna",
  M20: "Sprint: przyspieszenie z oporem",
  M21: "Sprint: kontrolowana asysta",
  M22: "Sprint: wytrzymałość szybkościowa",
  M23: "Sprint: kontrolowane hamowanie",
  M24: "Sprint: zaplanowana zmiana kierunku",
  M25: "Sprint: zwinność reaktywna",
  M32: "Technika: przyjęcie i wybór kierunku",
  M33: "Gra zadaniowa 2 na 2",
};
export function createMethodSession(
  session: SessionDay,
  profile: Profile,
  id: TrainingMethodId,
  rawConditions: MethodSessionConditions = {},
  selection: "automatic" | "athlete" = "athlete",
): SessionDay {
  if (session.executionProtected)
    throw new Error("Rozpoczęty lub zakończony trening zachowuje swój zapisany układ.");
  if (!methodMatchesSession(id, session))
    throw new Error("Ta metoda nie odpowiada celowi tej sesji.");
  const conditions = normalizeMethodConditions(rawConditions),
    gate = trainingMethodEligibility(id, profile, session, conditions);
  if (!gate.allowed) throw new Error(gate.reasons.join(" "));
  const m = getTrainingMethod(id)!,
    strength = m.domain === "strength" || m.domain === "power";
  const preserveAutomatic =
    strength &&
    selection === "automatic" &&
    (!profile.trainingMethodPreferences?.strength ||
      profile.trainingMethodPreferences.strength === "auto") &&
    session.structuredSections?.some((s) => s.type === "main");
  const sections = preserveAutomatic
    ? balanceStrengthSections(
        applyStrengthProgramming(session.structuredSections!, {
          method: id === "M02" ? "foundation" : id === "M06" ? "power_first" : "straight_sets",
          reason: "Zachowano kompletny trening oraz dawkę wynikającą z fazy i poziomu.",
        }),
        profile,
      )
    : strength
      ? buildStrengthMethod(session, profile, id, conditions)
      : buildFieldMethod(session, profile, id, conditions);
  const athlete = buildAthleteTrainingProfile(profileWithMethodEquipment(profile, conditions));
  const instances = new Set<string>();
  for (const e of sections.flatMap((s) => s.blocks.flatMap((b) => b.exercises))) {
    if (instances.has(e.id))
      throw new Error("Dwa ćwiczenia mają ten sam zapis serii. Wybierz ponownie metodę.");
    instances.add(e.id);
    const def = getExerciseDefinition(e.exerciseId ?? "");
    const allowed = isExerciseAllowedForProfile(def, athlete);
    if (!allowed.ok) throw new Error(`${e.name}: ${allowed.reasons.join(" ")}`);
    if (m.domain === "sprint" && def?.requiresBall)
      throw new Error("Sesja sprinterska nie zawiera ćwiczeń z piłką.");
  }
  const mainIds = sections
    .filter((s) => s.type === "main" || s.type === "accessory")
    .flatMap((s) => s.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId)));
  if (new Set(mainIds).size !== mainIds.length)
    throw new Error("Metoda powtarza to samo ćwiczenie; wybierz prostszy wariant.");
  const estimate = estimateStrengthMinutes(sections);
  const next = normalizeSessionCategory({
    ...session,
    title: TITLE[id] ?? session.title,
    structuredSections: sections,
    sections: structuredToFlat(sections),
    exercises: undefined,
    durationMin: estimate,
    loadTags: undefined,
    ...(selection === "athlete"
      ? {
          intensity:
            id === "M26"
              ? ("niska" as const)
              : m.highCost || ["M03", "M04", "M08", "M18", "M28", "M29", "M30", "M31"].includes(id)
                ? ("wysoka" as const)
                : ("umiarkowana" as const),
        }
      : {}),
    trainingMethods: {
      schema: "ballwise-methods-v1",
      recipeVersion: "47",
      primary: id,
      support: [
        "M01",
        "M35",
        ...(strength ? ["M37" as const] : []),
        ...(m.domain === "skills" ? ["M34" as const] : []),
      ],
      organization: ["M38", "M41", "M42", "M43", "M44"],
      selection,
      conditions,
      reason:
        selection === "athlete"
          ? "Twój wybór, sprawdzony względem profilu i warunków tej sesji."
          : `Cel: ${profile.goal}; etap: ${methodPhase(session)}. Dawka obejmuje pracę i odpoczynek.`,
      recipeKey: methodRecipeKey(sections),
    },
  });
  return { ...next, loadTags: computeLoadTags(next) };
}
/** Removes obsolete clocks too: readiness adaptation never re-expands into the original full dose. */
export function clearMethodRecipe(session: SessionDay): SessionDay {
  if (!session.trainingMethods) return session;
  const structuredSections = session.structuredSections?.map((s) => ({
    ...s,
    blocks: s.blocks.map((b) => ({
      ...b,
      exercises: b.exercises.map((e) => ({ ...e, methodExecution: undefined })),
    })),
  }));
  return {
    ...session,
    trainingMethods: undefined,
    structuredSections,
    sections: structuredSections?.length ? structuredToFlat(structuredSections) : session.sections,
  };
}
export function enforceMethodEligibility(session: SessionDay, profile: Profile): SessionDay {
  if (session.executionProtected || !session.trainingMethods) return session;
  const gate = trainingMethodEligibility(
    session.trainingMethods.primary,
    profile,
    session,
    session.trainingMethods.conditions,
  );
  if (gate.allowed && hasCurrentMethodRecipe(session)) return session;
  const clean = clearMethodRecipe(session);
  if (!hasCurrentMethodRecipe(session)) return clean;
  // Profile/equipment change invalidates the selected method. Never keep specialist work behind a new label.
  const domain = sessionMethodDomain(session),
    fallback: TrainingMethodId =
      domain === "strength"
        ? "M02"
        : domain === "conditioning"
          ? "M26"
          : domain === "skills"
            ? "M32"
            : "M23";
  try {
    return createMethodSession(
      clean,
      profile,
      fallback,
      session.trainingMethods.conditions,
      "automatic",
    );
  } catch {
    return {
      ...clean,
      loadLabelOverride: "Wstrzymaj trening",
      safetyNote:
        "Warunki wybranej metody zmieniły się. Wybierz dostępny wariant przed rozpoczęciem.",
      durationMin: 0,
    };
  }
}
export function applyAutomaticMethod(session: SessionDay, profile: Profile, index = 0): SessionDay {
  if (
    session.executionProtected ||
    session.trainingMethods ||
    session.readinessAdjustedDate ||
    profile.painInjury ||
    profile.seasonPhase === "return_injury"
  )
    return session;
  const domain = sessionMethodDomain(session),
    phase = methodPhase(session),
    preferences = profile.trainingMethodPreferences;
  if (!domain) return session;
  // Preserve tested speed/technical catalogues. These can be changed explicitly after confirming space/participants.
  if (domain === "sprint" || domain === "skills") return session;
  if (
    domain === "conditioning" &&
    (/rower|basen|bike|pool/i.test(session.title) ||
      session.classification?.subcategory === "field_mas_test")
  )
    return session;
  // The existing running engine already prescribes measured-MAS paces and progression. Keep that prescription intact.
  if (domain === "conditioning" && session.sections.main.some((e) => /\/km/.test(e.prescription)))
    return session;
  let id: TrainingMethodId = domain === "strength" ? "M02" : "M26";
  const preference = domain === "strength" ? preferences?.strength : preferences?.conditioning;
  if (
    preference &&
    preference !== "auto" &&
    !getTrainingMethod(preference)?.requiresCoach &&
    trainingMethodEligibility(preference, profile, session).allowed
  )
    id = preference;
  else if (domain === "strength") {
    const advanced = trainingMethodEligibility("M03", profile, session).allowed;
    if (advanced) {
      id = profile.goal === "speed" || profile.goal === "power" ? "M06" : "M03";
      if (
        preferences?.periodization === "undulating" &&
        phase === "development" &&
        index % 2 === 1 &&
        trainingMethodEligibility("M08", profile, session).allowed
      )
        id = "M08";
    }
  } else if (
    profile.level !== "beginner" &&
    /interwa|interval|rsa|powtarzan/i.test(session.title) &&
    phase !== "deload"
  ) {
    id = index % 2 === 0 ? "M28" : "M29";
  }
  if (!trainingMethodEligibility(id, profile, session).allowed)
    id = domain === "strength" ? "M02" : "M26";
  try {
    return createMethodSession(session, profile, id, {}, "automatic");
  } catch {
    return session;
  }
}
export function applyPlanTrainingMethods(plan: SessionDay[], profile: Profile): SessionDay[] {
  let gym = 0,
    conditioning = 0;
  return plan.map((day) => {
    const apply = (s: SessionDay) => {
      const domain = sessionMethodDomain(s);
      const index = domain === "strength" ? gym++ : domain === "conditioning" ? conditioning++ : 0;
      return applyAutomaticMethod(s, profile, index);
    };
    const primary = apply(day),
      secondSession = day.secondSession ? apply(day.secondSession) : day.secondSession;
    return primary === day && secondSession === day.secondSession
      ? day
      : { ...primary, secondSession };
  });
}

/** A small strength exposure; no claim that this is the minimum effective dose for every athlete. */
export function createStrengthMicrodose(session: SessionDay, profile: Profile): SessionDay {
  const basic = createMethodSession(session, profile, "M02", {}, "athlete");
  const sections = basic.structuredSections!.map((s) => ({
    ...s,
    blocks: s.blocks.slice(0, s.type === "main" ? 1 : s.type === "accessory" ? 1 : 2).map((b) => ({
      ...b,
      exercises: b.exercises.slice(0, 1).map((e) => ({
        ...e,
        sets: s.type === "main" ? "2" : "1",
        ...(s.type === "warmup" || s.type === "prep"
          ? { duration: "60 s", reps: undefined }
          : s.type === "cooldown"
            ? { duration: "60 s", reps: undefined }
            : {}),
        restAfterPair: undefined,
        restAfterExercise: s.type === "main" ? "90 s" : e.restAfterExercise,
        methodExecution: undefined,
      })),
    })),
  }));
  const next = {
    ...basic,
    title: "Siłownia: krótka dawka podstaw",
    structuredSections: sections,
    sections: structuredToFlat(sections),
    durationMin: estimateStrengthMinutes(sections),
  };
  if (next.durationMin > 20)
    throw new Error(
      "Tego układu nie skracamy kosztem przygotowania lub przerw. Wybierz pełną sesję albo lżejszą aktywność.",
    );
  next.trainingMethods = {
    ...basic.trainingMethods!,
    organization: [...basic.trainingMethods!.organization, "M40"],
    reason: "Ograniczono liczbę zadań i serii; przerwy oraz przygotowanie pozostają częścią dawki.",
    recipeKey: methodRecipeKey(sections),
  };
  return next;
}
