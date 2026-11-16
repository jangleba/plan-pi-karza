import type { Profile, TrainingSection } from "../types";
import type { EngineSession } from "./model";
import { hasVerifiedAdvancedStrength } from "./preparation";

/** A coached strength/power organisation, not a guarantee of acute potentiation.
 * These conservative starting doses are product choices, not a measured 1RM. */
export const UPPER_CONTRAST = {
  rounds: 2,
  pressReps: 5,
  throwReps: 3,
  transition: 240,
  roundRest: 180,
} as const;

export function upperContrastIneligibility(r: EngineSession, p: Profile): string | null {
  if (!r.roles.includes("strengthA")) return "Para wyciskania i rzutu należy do siłowni A.";
  if (!hasVerifiedAdvancedStrength(p) || p.supervisionLevel !== "full")
    return "Para wymaga zaawansowanego przygotowania siłowego i obecności trenera.";
  if (
    r.variant === "compact" ||
    r.phase !== "development" ||
    ["maintenance", "deload", "reentry", "foundation"].includes(r.strengthFocus?.mode ?? "") ||
    p.painInjury ||
    ["transition", "return_injury"].includes(p.seasonPhase)
  )
    return "Bieżący wariant, kalendarz lub faza wymagają zwykłych serii zamiast dodatkowego kontrastu.";
  if (
    r.organization === "contrast" ||
    r.organization === "complex" ||
    r.exercises.some((e) => e.dose.cluster || e.role === "iso_primer")
  )
    return "Zachowano wybraną metodę główną; nie dokładamy do niej drugiego kontrastu.";
  const requested = p.trainingMethodPreferences?.gymExercises?.upperPower;
  if (requested && requested !== "med_ball_throw")
    return "Do poziomego wyciskania pasuje rzut sprzed klatki; wybrany inny rzut pozostaje osobnym zadaniem.";
  const push = r.exercises.find((e) => e.role === "push");
  if (!push || !["barbell_bench_press", "dumbbell_bench_press"].includes(push.exerciseId))
    return "Para wymaga dostępnego wyciskania leżąc ze sztangą lub hantlami.";
  return null;
}

/** Called after calendar/focus selection, on a fresh base, before time fitting. */
export function applyUpperContrast(
  recipe: EngineSession,
  p: Profile,
  eligible: (id: string) => boolean,
): EngineSession {
  recipe = withoutUpperContrast(recipe);
  if (
    p.trainingMethodPreferences?.upperBodyContrast !== true ||
    !recipe.roles.includes("strengthA")
  )
    return recipe;
  const reason =
    upperContrastIneligibility(recipe, p) ??
    (!eligible("med_ball_throw")
      ? "Brakuje potwierdzonej piłki lekarskiej lub zabezpieczonej strefy rzutów."
      : null);
  const r = structuredClone(recipe);
  const push = r.exercises.find((e) => e.role === "push");
  if (reason) {
    if (push) push.reason += ` ${reason}`;
    return r;
  }
  if (!push) return r;
  const pull = r.exercises.find((e) => e.role === "pull");
  const originalPair = r.strengthPairs?.find((pair) => pair.label === "B");
  r.upperContrast = {
    exerciseIds: [push.exerciseId, "med_ball_throw"],
    transitionSeconds: UPPER_CONTRAST.transition,
    roundRestSeconds: UPPER_CONTRAST.roundRest,
    originalPushDose: structuredClone(push.dose),
    originalPushReason: push.reason,
    ...(pull ? { originalPullDose: structuredClone(pull.dose) } : {}),
    ...(originalPair ? { originalUpperPair: structuredClone(originalPair) } : {}),
  };
  r.strengthPairs = r.strengthPairs?.filter((pair) => pair.label !== "B");
  if (pull) {
    pull.dose.restSeconds = 90;
    delete pull.dose.postRestSeconds;
  }
  push.dose = {
    sets: UPPER_CONTRAST.rounds,
    reps: UPPER_CONTRAST.pressReps,
    rir: 2,
    restSeconds: UPPER_CONTRAST.transition,
    intent: "controlled",
  };
  push.reason +=
    " Para siła–moc: po wyciskaniu pełne 4 min przerwy przed rzutem. Dobierz ciężar do zapasu; nie jest to próba maksymalna ani gwarantowana potencjacja.";
  r.exercises.splice(r.exercises.indexOf(push) + 1, 0, {
    exerciseId: "med_ball_throw",
    role: "upper_power",
    ...(push.strengthStage ? { strengthStage: push.strengthStage } : {}),
    dose: {
      sets: UPPER_CONTRAST.rounds,
      reps: UPPER_CONTRAST.throwReps,
      restSeconds: UPPER_CONTRAST.roundRest,
      postRestSeconds: UPPER_CONTRAST.roundRest,
      intent: "explosive",
    },
    reason:
      "Szybki wyrzut lekkiej piłki sprzed klatki; osobne próby i pełny odpoczynek. Przerwij serię przy wyraźnym spowolnieniu.",
  });
  return r;
}

/** A short budget removes the whole optional contrast and restores ordinary work. */
export function withoutUpperContrast(recipe: EngineSession, reason?: string): EngineSession {
  if (!recipe.upperContrast) return recipe;
  const r = structuredClone(recipe),
    pair = r.upperContrast!;
  r.exercises = r.exercises.filter((e) => e.exerciseId !== pair.exerciseIds[1]);
  const push = r.exercises.find((e) => e.exerciseId === pair.exerciseIds[0]);
  const pull = r.exercises.find((e) => e.role === "pull");
  if (push) {
    push.dose = pair.originalPushDose;
    push.reason = reason ?? pair.originalPushReason;
  }
  if (pull && pair.originalPullDose) pull.dose = pair.originalPullDose;
  if (pair.originalUpperPair)
    r.strengthPairs = [...(r.strengthPairs ?? []), pair.originalUpperPair];
  delete r.upperContrast;
  return r;
}

export function renderUpperContrast(sections: TrainingSection[], r: EngineSession): void {
  const pair = r.upperContrast;
  const section =
    pair &&
    sections.find((s) =>
      pair.exerciseIds.every((id) =>
        s.blocks.some(
          (block) => block.exercises.length === 1 && block.exercises[0].exerciseId === id,
        ),
      ),
    );
  if (!pair || !section) return;
  const blocks = pair.exerciseIds.map((id) =>
    section.blocks.find((b) => b.exercises.length === 1 && b.exercises[0].exerciseId === id),
  );
  if (!blocks[0] || !blocks[1]) return;
  const at = section.blocks.indexOf(blocks[0]);
  const rows = blocks.map((b, i) => ({
    ...b!.exercises[0],
    label: `B${i + 1}`,
    ...(i === 1 ? { restAfterPair: `${pair.roundRestSeconds} s` } : {}),
  }));
  const merged = {
    ...blocks[0],
    title: "Kontrast · wyciskanie i rzut",
    blockType: "superset" as const,
    executionProtocol: "superset-rounds-v1" as const,
    restAfterBlock: `${pair.roundRestSeconds} s`,
    exercises: rows,
  };
  section.blocks = section.blocks.filter((b) => b !== blocks[0] && b !== blocks[1]);
  section.blocks.splice(at, 0, merged);
}
