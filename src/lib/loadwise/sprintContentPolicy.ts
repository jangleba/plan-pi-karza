import type { SessionDay } from "./types";
import { getExerciseDefinition } from "./exerciseLibrary";
import { classifySession, normalizeSessionCategory } from "./sessionClassification";

/** Product boundary: sprint practice is kept separate from practice with a ball. */
export function isBallExercise(exercise: { name: string; exerciseId?: string; prescription?: string; reps?: string; cue?: string; technique?: string }): boolean {
  const definition = getExerciseDefinition(exercise.exerciseId ?? "");
  if (definition?.family === "football_ball_work") return true;
  const text = [exercise.exerciseId, exercise.name, exercise.prescription, exercise.reps,
    exercise.cue, exercise.technique, ...(definition?.equipmentRequired ?? [])].join(" ")
    .replace(/\bbez\s+piłk[ąięa]\b/gi, "")
    .replace(/\bwithout\s+(?:a\s+)?ball\b/gi, "");
  return /pił(?:k(?:a|ą|ę|i|ach|ami|om)|ce)(?!\p{L})|(?:^|[\s_-])ball(?:[\s_-]|$)|dribbl|drybling|with_ball|ball_work/iu.test(text);
}

export function isDedicatedSprintSession(session: SessionDay): boolean {
  if (session.dayType === "club" || session.dayType === "match" || session.externalCommitment) return false;
  return Boolean(session.speedGeneratorVersion) || classifySession(session).category === "speed_sprint";
}

/** Applies equally to flat persisted content, structured runners and manual swaps. */
export function enforceSprintOnlyContent(session: SessionDay): SessionDay {
  const secondSession = session.secondSession ? enforceSprintOnlyContent(session.secondSession) : null;
  if (!isDedicatedSprintSession(session) || session.executionProtected)
    return secondSession === session.secondSession ? session : { ...session, secondSession };
  const clean = <T extends { name: string; exerciseId?: string }>(items: T[]) => items.filter(item => !isBallExercise(item));
  const sections = {
    warmup: clean(session.sections.warmup), main: clean(session.sections.main),
    accessory: clean(session.sections.accessory), footballTransfer: [],
    cooldown: clean(session.sections.cooldown),
  };
  const structuredSections = session.structuredSections?.map(section => ({
    ...section, blocks: section.blocks.map(block => ({ ...block, exercises: clean(block.exercises) }))
      .filter(block => block.exercises.length > 0),
  })).filter(section => section.blocks.length > 0);
  const exercises = session.exercises ? clean(session.exercises) : undefined;
  const remainingMain = structuredSections?.length
    ? structuredSections.filter(section => section.type === "main").flatMap(section => section.blocks).length
    : sections.main.length + (exercises?.length ?? 0);
  if (!remainingMain) return normalizeSessionCategory({
    ...session, dayType: "recovery", type: "recovery", title: "Wybierz sesję sprinterską bez piłki",
    sessionType: "Regeneracja", intensity: "niska", durationMin: 0,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    structuredSections: undefined, exercises: undefined, speedGeneratorVersion: undefined, classification: undefined,
    safetyNote: "Ta starsza rozpiska wymagała piłki. Wybierz osobną sesję techniczną albo nową sesję sprintu.",
    secondSession,
  });
  return { ...session, sections, structuredSections, exercises, secondSession };
}
