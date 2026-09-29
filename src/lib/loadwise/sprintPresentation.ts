import type { SessionDay, TrainingSection, TrainingExercise } from "./types";
import { getExerciseDefinition, specialistEquipmentForExercise } from "./exerciseLibrary";
import {
  equipmentNamesFor,
  canonicalExerciseName,
  resolveDefinitionForExercise,
} from "./sessionPresentation";

const SPRINT_BLOCK_FLOW = [
  { key: "ramp", index: "01", title: "Przygotowanie RAMP", estMin: 10 },
  { key: "skip", index: "02", title: "Skipy A → C → B → D", estMin: 8 },
  { key: "technical", index: "03", title: "Drille techniczne", estMin: 8 },
  { key: "plyo", index: "04", title: "Plyometria", estMin: 6 },
  {
    key: "resisted",
    index: "05",
    title: "Opór / przygotowanie startu",
    estMin: 5,
  },
  { key: "main", index: "06", title: "Sprint główny", estMin: 10 },
  {
    key: "terminal",
    index: "07",
    title: "Hamowanie / zwrotność / łuk",
    estMin: 6,
  },
  { key: "cooldown", index: "08", title: "Wyciszenie", estMin: 4 },
] as const;
const SPRINT_SKIP_PRESCRIPTION = "2 × 15–20 m";
export const SPRINT_RUNNER_CONTAINER_CLASS = "space-y-3 overflow-x-hidden";

type SprintBlockKey = (typeof SPRINT_BLOCK_FLOW)[number]["key"];

export type SprintExerciseView = {
  id: string;
  exercise: TrainingExercise;
  canonicalName: string;
  prescription: string;
  showSkipSetLabels?: boolean;
};

export type SprintBlockView = {
  key: SprintBlockKey;
  index: string;
  title: string;
  estimatedMin: number;
  exercises: SprintExerciseView[];
  /** Pusty obowiązkowy blok sprintu = błąd danych, nie prawidłowy wynik. */
  hasDataError?: boolean;
};

type SprintExerciseMeta = {
  exercise: TrainingExercise;
  sectionType: TrainingSection["type"];
};

type SprintResolvedDetails = {
  purpose: string | null;
  howTo: string | null;
  cues: string[];
  errors: string[];
  safety: string | null;
  equipment: string;
  noEquipmentReplacement: string;
};

function cleanSprintPrescription(value: string): string {
  return value
    .replace(/\bpowt\.?\b/gi, "")
    .replace(/\b(\d+)\s*seri[aeyi]?\s*×\s*/gi, (_m, count: string) =>
      Number(count) > 1 ? `${count} × ` : "",
    )
    .replace(/\s*·\s*/g, " · ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim()
    .replace(/[.]+$/g, "")
    .trim();
}

export function formatSprintPrescription(e: TrainingExercise): string {
  const joinDeduped = (parts: string[]) =>
    parts
      .map((part) => cleanSprintPrescription(part))
      .filter(Boolean)
      .filter(
        (part, index, all) =>
          all.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index,
      )
      .join(" · ");

  const fromFields = [e.reps, e.duration].filter(Boolean) as string[];
  if (fromFields.length) return joinDeduped(fromFields);
  const display = e.displayPrescription?.trim();
  if (!display) return "";
  return joinDeduped(display.split("·"));
}

function isSprintRunnerTerminalExercise(exercise: TrainingExercise): boolean {
  const definition = exercise.exerciseId ? getExerciseDefinition(exercise.exerciseId) : undefined;
  const qualities = definition?.speedQualities ?? [];
  return qualities.some((quality) =>
    [
      "deceleration",
      "planned_change_of_direction",
      "reactive_agility",
      "reacceleration",
      "curved_sprint",
    ].includes(quality),
  );
}

function sprintRoleForExercise(meta: SprintExerciseMeta): TrainingExercise["speedRole"] | null {
  if (meta.exercise.speedRole) return meta.exercise.speedRole;
  if (meta.sectionType === "cooldown") return "cooldown";
  const definition = meta.exercise.exerciseId
    ? getExerciseDefinition(meta.exercise.exerciseId)
    : undefined;
  const role = definition?.sessionRoles?.[0];
  if (!role) return meta.sectionType === "warmup" ? "preparation" : null;
  if (role === "preparation" && meta.sectionType !== "warmup") return "cooldown";
  return role;
}

function sprintBlockKeyForExercise(meta: SprintExerciseMeta): SprintBlockKey | null {
  const id = meta.exercise.exerciseId ?? "";
  const explicitRole = meta.exercise.speedRole;

  // Jawnie oznaczony drill techniczny pozostaje drillem,
  // nawet jeśli używa ruchu podobnego do skipu.
  if (explicitRole === "technical") return "technical";

  const role = sprintRoleForExercise(meta);

  // Kanoniczne skipy muszą trafić do osobnego bloku,
  // zanim uwzględnimy rolę wywnioskowaną z biblioteki.
  if (id === "a_skip" || id === "b_skip" || id === "c_skip" || id === "d_skip") {
    return "skip";
  }

  if (role === "technical") return "technical";
  if (role === "conditioning" || (!role && !id)) return null;
  if (role === "cooldown") return "cooldown";
  if (role === "preparation" || role === "primer") return "ramp";
  if (role === "resisted") return "resisted";
  if (role === "terminal") return "terminal";
  if (!role && isSprintRunnerTerminalExercise(meta.exercise)) return "terminal";
  if (role === "secondary" || id === "scissor_bounds") return "plyo";
  if (role === "primary") return "main";
  return null;
}

export function resolveSprintExerciseDetails(exercise: TrainingExercise): SprintResolvedDetails {
  const definition = exercise.exerciseId ? getExerciseDefinition(exercise.exerciseId) : undefined;
  const cues = (
    definition?.coachingCues ??
    exercise.cue?.split(/[.;]\s*/).filter(Boolean) ??
    []
  ).slice(0, 3);
  const errors = (
    definition?.commonErrors ?? (exercise.commonMistake ? [exercise.commonMistake] : [])
  ).slice(0, 2);
  const equipment = equipmentNamesFor(specialistEquipmentForExercise(definition)).join(", ");
  const noEquipmentReplacementId =
    definition?.replacementIds?.find((candidateId) => {
      const candidate = getExerciseDefinition(candidateId);
      return candidate && specialistEquipmentForExercise(candidate).length === 0;
    }) ?? null;
  const noEquipmentReplacement = noEquipmentReplacementId
    ? (getExerciseDefinition(noEquipmentReplacementId)?.displayNamePl ?? noEquipmentReplacementId)
    : equipment
      ? "Brak zatwierdzonej zamiany bez sprzętu"
      : "Nie dotyczy — ćwiczenie bez sprzętu";
  return {
    purpose: exercise.purpose ?? definition?.objective ?? definition?.stimulus ?? null,
    howTo:
      definition?.instructionsPl?.join(" ") ??
      exercise.instructionSteps
        ?.map((step) => [step.title, step.description].filter(Boolean).join(" — "))
        .join(" ") ??
      exercise.technique ??
      null,
    cues,
    errors,
    safety: definition?.injuryCautions?.[0] ?? null,
    equipment: equipment || "Masa ciała",
    noEquipmentReplacement,
  };
}

export function buildSprintRunnerBlocks(sections: TrainingSection[]): SprintBlockView[] {
  const buckets: Record<SprintBlockKey, SprintExerciseMeta[]> = {
    ramp: [],
    skip: [],
    technical: [],
    plyo: [],
    resisted: [],
    main: [],
    terminal: [],
    cooldown: [],
  };
  for (const section of sections) {
    for (const block of section.blocks) {
      for (const exercise of block.exercises) {
        const meta: SprintExerciseMeta = {
          exercise,
          sectionType: section.type,
        };
        const key = sprintBlockKeyForExercise(meta);
        if (key) buckets[key].push(meta);
      }
    }
  }

  const skipById = new Map<string, SprintExerciseMeta>();
  for (const meta of buckets.skip) {
    const id = resolveDefinitionForExercise(meta.exercise)?.id ?? meta.exercise.exerciseId;
    if (id && !skipById.has(id)) skipById.set(id, meta);
  }

  return SPRINT_BLOCK_FLOW.map((block) => {
    const source =
      block.key === "skip"
        ? (["a_skip", "c_skip", "b_skip", "d_skip"]
            .map((id) => skipById.get(id))
            .filter(Boolean) as SprintExerciseMeta[])
        : buckets[block.key];
    const exercises = source.map((meta) => ({
      id: meta.exercise.id,
      exercise: meta.exercise,
      // Każdy blok korzysta z tej samej zatwierdzonej polskiej nazwy bibliotecznej.
      canonicalName: canonicalExerciseName(meta.exercise),
      prescription:
        block.key === "skip" ? SPRINT_SKIP_PRESCRIPTION : formatSprintPrescription(meta.exercise),
      showSkipSetLabels: block.key === "skip",
    }));
    return {
      key: block.key,
      index: block.index,
      title: block.title,
      estimatedMin: block.estMin,
      exercises,
      hasDataError: exercises.length === 0 && block.key !== "cooldown",
    };
  });
}

export function isSprintRunnerSession(session: SessionDay): boolean {
  if (session.speedGeneratorVersion) {
    return !session.classification || session.classification.isSpeed;
  }
  return Boolean(
    session.classification?.isSpeed &&
    (session.classification.isAcceleration || session.classification.isMaxVelocity),
  );
}
