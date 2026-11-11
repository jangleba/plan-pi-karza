import type { Profile, TrainingBlock, TrainingExercise, TrainingSection } from "./types";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import { getExerciseDefinition, resolveExerciseByName } from "./exerciseLibrary";

export type StrengthMethod = "foundation" | "straight_sets" | "power_first" | "contrast";
export interface StrengthMethodContext {
  mdLabel?: string | null;
  weekPhase?: string;
  readiness?: number;
}
export interface StrengthMethodDecision {
  method: StrengthMethod;
  reason: string;
}

/** Conservative product routing, not a validated readiness score or a universal training-age cutoff. */
export function selectStrengthMethod(
  profile: Profile,
  context: StrengthMethodContext = {},
): StrengthMethodDecision {
  const a = buildAthleteTrainingProfile(profile);
  const foundation =
    ["none", "beginner"].includes(a.gymExperienceLevel) ||
    (a.strengthTrainingAge ?? 0) < 6 ||
    a.movementCompetenceLevel === "low";
  if (foundation)
    return {
      method: "foundation",
      reason: "Osobne serie i nauka ruchu; brak potwierdzonego stażu lub podstawowy poziom siłowy.",
    };
  const powerGoal = profile.goal === "power" || profile.goal === "speed";
  const contrast =
    powerGoal &&
    a.age !== null &&
    a.age >= 18 &&
    a.gymExperienceLevel === "advanced" &&
    (a.strengthTrainingAge ?? 0) >= 24 &&
    a.movementCompetenceLevel === "high" &&
    a.exerciseSafetyProfile.allowHeavyCompounds &&
    !["adaptation", "deload"].includes(context.weekPhase ?? "adaptation") &&
    // A match in three days alone does not downgrade the method (product rule).
    !["MD-2", "MD-1", "MD", "MD+1", "MD+2"].includes(context.mdLabel ?? "") &&
    (context.readiness === undefined || context.readiness >= 7) &&
    (profile.clubTrainingDays ?? []).length < 4;
  if (contrast)
    return {
      method: "contrast",
      reason:
        "Jedna para siła–moc dla doświadczonego dorosłego; pełny odpoczynek między ćwiczeniami i seriami.",
    };
  return powerGoal
    ? {
        method: "power_first",
        reason: "Krótki blok mocy przed siłą; bez przeplatania ciężkiego ćwiczenia ze skokiem.",
      }
    : {
        method: "straight_sets",
        reason: "Priorytet siły: kończysz serie ćwiczenia przed przejściem do następnego.",
      };
}

const definition = (e: TrainingExercise) =>
  getExerciseDefinition(e.exerciseId ?? "") ?? resolveExerciseByName(e.name);
const power = (e: TrainingExercise) =>
  ["power", "plyometric"].includes(definition(e)?.category ?? "");
const key = (e: TrainingExercise) => definition(e)?.id ?? e.name.trim().toLocaleLowerCase("pl-PL");
const maxNumber = (s: string | undefined, fallback: number) =>
  Math.max(
    ...(s?.match(/\d+(?:[.,]\d+)?/g)?.map((n) => Number(n.replace(",", "."))) ?? [fallback]),
  );

/** Pure: keep stable exercise IDs. Optional duplicate work is removed instead of accumulating repair sets. */
export function applyStrengthProgramming(
  sections: TrainingSection[],
  decision: StrengthMethodDecision,
): TrainingSection[] {
  // Already-normalized blocks are still deduplicated; profile changes can demote an old contrast.
  const seen = new Set<string>();
  const firstPower = sections
    .flatMap((s) => (s.type === "main" ? s.blocks.flatMap((b) => b.exercises) : []))
    .find(power);
  const method = decision.method;
  const prepared: TrainingSection[] = sections
    .map((section) => {
      if (["warmup", "cooldown", "prep"].includes(section.type)) return section;
      const blocks: TrainingBlock[] = [];
      for (const source of section.blocks) {
        const aPair =
          source.blockType === "contrast" && source.exercises.some((e) => e.label === "A1");
        const work = source.exercises.filter((e) => {
          const id = key(e);
          if (seen.has(id)) return false;
          // At most one ballistic/landing exercise. B is a strength exercise, never a second contrast by default.
          if (power(e) && firstPower && key(e) !== key(firstPower)) return false;
          seen.add(id);
          return true;
        });
        if (!work.length) continue;
        const effectivePair =
          method === "contrast" &&
          aPair &&
          work.length === 2 &&
          work.some(
            (e) =>
              e.label === "A1" &&
              !e.wasAdjustedForAthleteProfile &&
              ["external", "axial"].includes(definition(e)?.loadingType ?? ""),
          ) &&
          work.some((e) => power(e) && definition(e)?.id !== "snap_down");
        const exercises = work.map((e) => {
          const { restAfterPair: _pairRest, ...withoutPairRest } = e;
          const timed = !!e.duration || /\d\s*(s|sek|min)\b/i.test(e.reps ?? "");
          const plain = timed ? { ...withoutPairRest, rir: undefined } : withoutPairRest;
          const isPower = power(e);
          const powerPrescription = isPower
            ? {
                rir: undefined,
                rpe: undefined,
                loadTarget:
                  definition(e)?.id === "snap_down"
                    ? "Kontrolowane lądowanie"
                    : "Szybki ruch, pełna kontrola",
              }
            : {};
          if (effectivePair)
            return {
              ...e,
              ...powerPrescription,
              sets: "3",
              restAfterExercise: power(e) ? undefined : "3 min",
              restAfterPair: power(e) ? "3 min" : undefined,
            };
          const foundation = method === "foundation";
          return {
            ...plain,
            ...powerPrescription,
            ...(foundation
              ? {
                  sets: String(Math.min(2, maxNumber(e.sets, 2))),
                  ...(isPower ? { reps: "3" } : {}),
                }
              : {}),
            restAfterExercise:
              !e.restAfterPair && e.restAfterExercise && !/do [AB]\d/i.test(e.restAfterExercise)
                ? e.restAfterExercise
                : isPower
                  ? "90–120 s"
                  : e.label === "A1"
                    ? foundation
                      ? "90 s"
                      : "2–3 min"
                    : "60–90 s",
          };
        });
        if (effectivePair) {
          blocks.push({
            ...source,
            title: "Para siła–moc",
            exercises,
            restAfterBlock: "3 min",
            safetyNotes:
              "Jedna seria siły → odpoczynek 3 min → jedna seria mocy → odpoczynek 3 min. Jeśli spada jakość, wydłuż odpoczynek albo zakończ blok.",
          });
        } else {
          for (const exercise of exercises)
            blocks.push({
              ...source,
              id: source.exercises.length > 1 ? `${source.id}:${exercise.id}` : source.id,
              title: exercise.name,
              blockType: "single",
              intent: power(exercise) ? "power" : source.intent,
              exercises: [exercise],
              restAfterBlock: undefined,
            });
        }
      }
      return { ...section, blocks };
    })
    .filter((s) => s.blocks.length);
  // Separate power before strength, while keeping preparation at the beginning and accessories at the end.
  if (
    method !== "contrast" ||
    !prepared.some((s) => s.blocks.some((b) => b.blockType === "contrast"))
  ) {
    for (const section of prepared) {
      if (section.type !== "main") continue;
      section.blocks = [
        ...section.blocks.filter((b) => b.exercises.every(power)),
        ...section.blocks.filter((b) => !b.exercises.every(power)),
      ];
    }
  }
  const original = JSON.stringify(sections);
  return JSON.stringify(prepared) === original ? sections : prepared;
}

/** Planning estimate includes work, programmed rests and transitions; it is never a stopwatch measurement. */
export function estimateStrengthMinutes(sections: TrainingSection[]): number {
  let seconds = 120;
  for (const section of sections)
    for (const block of section.blocks) {
      for (const e of block.exercises) {
        const execution=e.methodExecution;
        if(execution && ["intervals","reactive","continuous"].includes(execution.mode)) {
          const count=execution.rounds*execution.repetitions;
          // Distance work has an approximate planning allowance, never a claimed measured speed/time.
          const perAttempt=execution.workSeconds ?? ((execution.distanceM??10)+(execution.runInM??0))/4 + ((execution.runOutM??0)>0?10:0);
          seconds += count*perAttempt + execution.rounds*Math.max(0,execution.repetitions-1)*execution.restSeconds + Math.max(0,execution.rounds-1)*execution.roundRestSeconds + 25;
          continue;
        }
        const sets = maxNumber(e.sets, 1);
        const time = e.duration?.match(/(\d+(?:[.,]\d+)?)\s*(min|s|sek)/i);
        let perSet: number;
        if (time)
          perSet =
            Number(time[1].replace(",", ".")) *
            (/min/i.test(time[2]) ? 60 : 1) *
            (/stron|str\.|każd/i.test(e.duration ?? "") ? 2 : 1);
        else if (/\d.*(?:\bs\b|sek|utrzymania)/i.test(e.reps ?? ""))
          perSet = maxNumber(e.reps, 15) * (/stron|str\.|każd/i.test(e.reps ?? "") ? 2 : 1);
        else {
          const tempo = e.tempo
            ?.match(/^\d(?:[–-]\d){2,3}$/)?.[0]
            .split(/[–-]/)
            .map(Number)
            .reduce((a, b) => a + b, 0);
          perSet =
            maxNumber(e.reps, 8) *
            (power(e) ? 2 : (tempo ?? 3)) *
            (/stron|str\.|każd/i.test(e.reps ?? "") ? 2 : 1);
        }
        const restText = e.restAfterPair ?? e.restAfterExercise;
        const rest = restText
          ? maxNumber(restText, 60) * (/min/i.test(restText) ? 60 : 1)
          : sets > 1
            ? 60
            : 0;
        // Rest after A1 is between paired exercises too; A2's last post-pair rest is not needed.
        const restCount =
          block.blockType === "contrast" && !power(e) ? sets : Math.max(0, sets - 1);
        const clusterRest=e.methodExecution?.mode==="cluster"?sets*Math.max(0,(e.methodExecution.repGroups?.length??1)-1)*e.methodExecution.restSeconds:0;
        seconds += sets * perSet + restCount * rest + clusterRest + 25;
      }
    }
  return Math.max(15, Math.ceil(seconds / 300) * 5);
}
