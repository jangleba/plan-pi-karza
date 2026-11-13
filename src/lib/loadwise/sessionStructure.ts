import { hydrateTrainingExerciseFromDefinition } from "./exerciseLibrary";
import type { ExerciseItem, TrainingBlock, TrainingExercise, TrainingSection } from "./types";

/**
 * Zamiana formatu sesji: sekcje strukturalne (bloki, serie łączone) ⇄ płaskie
 * listy ćwiczeń zapisane w starszych planach. Sama konwersja — bez układania
 * treningu. Wydzielone z usuniętego generatora siłowni.
 */

let __uid = 0;
function uid(prefix: string): string {
  __uid += 1;
  return `${prefix}-${__uid}`;
}
function ex(e: Omit<TrainingExercise, "id" | "completed">): TrainingExercise {
  return { id: uid("ex"), completed: false, ...e };
}
function block(b: Omit<TrainingBlock, "id">): TrainingBlock {
  return { id: uid("blk"), ...b };
}
function section(s: Omit<TrainingSection, "id">): TrainingSection {
  return { id: uid("sec"), ...s };
}

/** Spłaszcza strukturalne sekcje do płaskich list (persist + fallback UI). */
/**
 * Exercise instance IDs must be unique inside one session: logs, the method
 * validator and the runner address exercises by ID. Only a repeated ID gets a
 * deterministic suffix, so IDs that were already unique (and any history
 * recorded against them) stay exactly as they were.
 */
export function ensureUniqueExerciseIds(sections: TrainingSection[]): TrainingSection[] {
  const seen = new Set<string>();
  return sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => ({
      ...block,
      exercises: block.exercises.map((exercise) => {
        let id = exercise.id;
        for (let copy = 2; seen.has(id); copy += 1) id = `${exercise.id}~${copy}`;
        seen.add(id);
        return id === exercise.id ? exercise : { ...exercise, id };
      }),
    })),
  }));
}

export function structuredToFlat(sections: TrainingSection[]): {
  warmup: ExerciseItem[];
  main: ExerciseItem[];
  accessory: ExerciseItem[];
  footballTransfer: ExerciseItem[];
  cooldown: ExerciseItem[];
} {
  const toItem = (e: TrainingExercise) => {
    const parts = [
      e.sets && e.reps ? `${e.sets} × ${e.reps}` : e.reps || e.sets,
      e.duration,
      e.rpe,
      e.loadTarget,
    ]
      .filter(Boolean)
      .join(", ");
    const item: ExerciseItem = {
      name: e.label ? `${e.label} — ${e.name}` : e.name,
      exerciseId: e.exerciseId,
      animationVariant: e.animationVariant,
      purpose: e.purpose,
      visualId: e.visualId,
      displayPrescription: e.displayPrescription,
      instructionSteps: e.instructionSteps,
      prescription: parts || "wg techniki",
      rest: e.restAfterExercise || e.restAfterPair || undefined,
      cue: e.cue,
      technique: e.technique,
      commonMistake: e.commonMistake,
      easier: e.regression,
      harder: e.progression,
    };
    return item;
  };
  const out = {
    warmup: [] as ExerciseItem[],
    main: [] as ExerciseItem[],
    accessory: [] as ExerciseItem[],
    footballTransfer: [] as ExerciseItem[],
    cooldown: [] as ExerciseItem[],
  };
  for (const sec of sections) {
    const items = sec.blocks.flatMap((b) => b.exercises.map(toItem));
    if (sec.type === "warmup") out.warmup.push(...items);
    else if (sec.type === "cooldown") out.cooldown.push(...items);
    else if (sec.type === "accessory") out.accessory.push(...items);
    else out.main.push(...items);
  }
  return out;
}

/** Mapuje płaskie sekcje ExerciseItem na pojedyncze bloki (fallback dla starych planów). */
export function flatToStructured(sections: {
  warmup: ExerciseItem[];
  main: ExerciseItem[];
  accessory: ExerciseItem[];
  footballTransfer: ExerciseItem[];
  cooldown: ExerciseItem[];
}): TrainingSection[] {
  __uid = 0;

  const byRole = (items: ExerciseItem[], ...roles: Array<ExerciseItem["speedRole"]>) =>
    items.filter((item) => roles.includes(item.speedRole));
  const notByRole = (items: ExerciseItem[], ...roles: Array<ExerciseItem["speedRole"]>) =>
    items.filter((item) => !roles.includes(item.speedRole));

  const normalized = {
    warmup: [...sections.warmup, ...byRole(sections.main, "preparation", "primer")],
    main: notByRole(sections.main, "preparation", "primer", "cooldown"),
    accessory: notByRole(sections.accessory, "cooldown"),
    footballTransfer: sections.footballTransfer,
    cooldown: [
      ...sections.cooldown,
      ...byRole(sections.main, "cooldown"),
      ...byRole(sections.accessory, "cooldown"),
    ],
  };

  const groups: {
    title: string;
    type: TrainingSection["type"];
    items: ExerciseItem[];
  }[] = [
    { title: "Rozgrzewka", type: "warmup", items: normalized.warmup },
    { title: "Część główna", type: "main", items: normalized.main },
    {
      title: "Część dodatkowa / stabilizacja",
      type: "accessory",
      items: normalized.accessory,
    },
    {
      title: "Transfer piłkarski",
      type: "main",
      items: normalized.footballTransfer,
    },
    { title: "Wyciszenie", type: "cooldown", items: normalized.cooldown },
  ];

  return ensureUniqueExerciseIds(
    groups
      .filter((g) => g.items.length > 0)
      .map((g) =>
        section({
          title: g.title,
          type: g.type,
          blocks: [
            block({
              title: "",
              blockType: "single",
              intent:
                g.type === "warmup" || g.type === "cooldown"
                  ? "mobility"
                  : g.items.some((item) => item.speedRole === "terminal")
                    ? "braking"
                    : "strength",
              exercises: g.items.map((it) =>
                hydrateTrainingExerciseFromDefinition(
                  ex({
                    name: it.name,
                    exerciseId: it.exerciseId,
                    animationVariant: it.animationVariant,
                    speedRole: it.speedRole,
                    purpose: it.purpose,
                    visualId: it.visualId,
                    displayPrescription: it.displayPrescription,
                    instructionSteps: it.instructionSteps,
                    reps: it.prescription,
                    restAfterExercise: it.rest,
                    cue: it.cue,
                    technique: it.technique,
                    commonMistake: it.commonMistake,
                    regression: it.easier,
                    progression: it.harder,
                  }),
                ),
              ),
            }),
          ],
        }),
      ),
  );
}
