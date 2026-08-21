import type {
  ExerciseInstructionStep,
  ExerciseItem,
  SessionDay,
  TrainingExercise,
} from "./types";
import { getExerciseDefinition, isApprovedCanonicalExercise } from "./exerciseLibrary";

export type PlanExerciseContractIssueCode =
  | "empty-own-session"
  | "placeholder-exercise"
  | "invalid-exercise-id"
  | "missing-prescription"
  | "missing-execution-instructions";

export interface PlanExerciseContractIssue {
  date: string;
  slot: 1 | 2;
  code: PlanExerciseContractIssueCode;
  exerciseName?: string;
  message: string;
}

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^sesja kontrolna$/i,
  /^ćwiczenie kontrolne$/i,
  /zgodnie z opisem dnia/i,
  /trening zgodnie z opisem/i,
  /placeholder/i,
  /do uzupełnienia/i,
  /\btodo\b/i,
];

interface ContractExercise {
  exerciseId?: string;
  name: string;
  prescription: string;
  technique?: string;
  instructionSteps?: ExerciseInstructionStep[];
  exerciseSource: "flat" | "structured";
}

function structuredPrescription(exercise: TrainingExercise): string {
  return (
    exercise.displayPrescription?.trim() ||
    [exercise.sets && exercise.reps ? `${exercise.sets} × ${exercise.reps}` : exercise.reps || exercise.sets]
      .concat([exercise.duration, exercise.loadTarget, exercise.rpe])
      .filter(Boolean)
      .join(" · ")
  );
}

function collectSessionExercises(session: SessionDay): ContractExercise[] {
  const structuredExercises =
    session.structuredSections?.flatMap((section) =>
      section.blocks.flatMap((block) =>
        block.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          name: exercise.name,
          prescription: structuredPrescription(exercise),
          technique: exercise.technique,
          instructionSteps: exercise.instructionSteps,
          exerciseSource: "structured" as const,
        })),
      ),
    ) ?? [];

  if (structuredExercises.length > 0) {
    return structuredExercises;
  }

  const sectionExercises = [
    ...session.sections.warmup,
    ...session.sections.main,
    ...session.sections.accessory,
    ...session.sections.footballTransfer,
    ...session.sections.cooldown,
  ].map((exercise) => ({
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    prescription: String(exercise.displayPrescription ?? exercise.prescription ?? "").trim(),
    technique: exercise.technique,
    instructionSteps: exercise.instructionSteps,
    exerciseSource: "flat" as const,
  }));

  if (sectionExercises.length > 0) {
    return sectionExercises;
  }

  return (session.exercises ?? []).map((exercise) => ({
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    prescription: String(exercise.displayPrescription ?? exercise.prescription ?? "").trim(),
    technique: exercise.technique,
    instructionSteps: exercise.instructionSteps,
    exerciseSource: "flat" as const,
  }));
}

function hasInstructionSteps(steps: ExerciseInstructionStep[] | undefined): boolean {
  return Boolean(
    steps?.some(
      (step) => step.title?.trim().length || step.description?.trim().length,
    ),
  );
}

function validateOwnSession(
  session: SessionDay,
  slot: 1 | 2,
): PlanExerciseContractIssue[] {
  if (session.dayType !== "training") {
    return [];
  }

  const issues: PlanExerciseContractIssue[] = [];
  const exercises = collectSessionExercises(session);

  if (exercises.length === 0) {
    issues.push({
      date: session.date,
      slot,
      code: "empty-own-session",
      message: `Własna sesja ${session.date}, slot ${slot}, nie zawiera żadnego ćwiczenia.`,
    });

    return issues;
  }

  for (const exercise of exercises) {
    const canonical = exercise.exerciseId
      ? getExerciseDefinition(exercise.exerciseId)
      : undefined;
    if (!isApprovedCanonicalExercise(canonical)) {
      issues.push({
        date: session.date,
        slot,
        code: "invalid-exercise-id",
        exerciseName: exercise.name,
        message:
          `Ćwiczenie "${exercise.name}" w sesji ${session.date}, slot ${slot}, ` +
          "nie ma zatwierdzonego kanonicznego ID.",
      });
    }

    const name = String(exercise.name ?? "").trim();
    const prescription = String(exercise.prescription ?? "").trim();
    const searchableText = `${name} ${prescription}`;
    const isPlaceholder =
      name.length === 0 ||
      (prescription.length === 0 && !exercise.exerciseId) ||
      PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(searchableText));

    if (!isPlaceholder) {
      if (prescription.length === 0) {
        issues.push({
          date: session.date,
          slot,
          code: "missing-prescription",
          exerciseName: exercise.name,
          message:
            `Ćwiczenie "${exercise.name}" w sesji ${session.date}, slot ${slot}, ` +
            "nie zawiera czytelnej dawki dla zawodnika.",
        });
      }

      const hasInstructions =
        hasInstructionSteps(exercise.instructionSteps) ||
        String(exercise.technique ?? "").trim().length > 0 ||
        Boolean(canonical?.instructionsPl?.some((step) => step.trim().length > 0));

      if (!hasInstructions) {
        issues.push({
          date: session.date,
          slot,
          code: "missing-execution-instructions",
          exerciseName: exercise.name,
          message:
            `Ćwiczenie "${exercise.name}" w sesji ${session.date}, slot ${slot}, ` +
            "nie ma instrukcji wykonania widocznych dla zawodnika.",
        });
      }

      continue;
    }

    issues.push({
      date: session.date,
      slot,
      code: "placeholder-exercise",
      exerciseName: exercise.name,
      message:
        `Niedozwolony placeholder w sesji ${session.date}, slot ${slot}: ` +
        `"${exercise.name}".`,
    });
  }

  return issues;
}

export function validatePlanExerciseContract(
  plan: SessionDay[],
): PlanExerciseContractIssue[] {
  const issues: PlanExerciseContractIssue[] = [];

  for (const day of plan) {
    issues.push(...validateOwnSession(day, 1));

    if (day.secondSession) {
      issues.push(...validateOwnSession(day.secondSession, 2));
    }
  }

  return issues;
}

export function assertPlanExerciseContract(plan: SessionDay[]): void {
  const issues = validatePlanExerciseContract(plan);

  if (issues.length === 0) {
    return;
  }

  const details = issues
    .map(
      (issue) =>
        `[${issue.code}] ${issue.date}, slot ${issue.slot}: ${issue.message}`,
    )
    .join("\n");

  throw new Error(
    `[PLAN_EXERCISE_CONTRACT] Plan zawiera niepełne albo placeholderowe sesje:\n${details}`,
  );
}