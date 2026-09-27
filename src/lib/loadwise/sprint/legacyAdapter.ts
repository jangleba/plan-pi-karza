import type { SprintBlock, SprintExercise, SprintSession } from "./types";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseRestSeconds(value: unknown): number | undefined {
  if (typeof value === "number") return Math.max(0, Math.round(value));
  const match = text(value).match(/(\d+)\s*(s|sek|min)/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  return match[2].toLowerCase().startsWith("min") ? amount * 60 : amount;
}

function adaptExercise(value: unknown, index: number): SprintExercise {
  const source = record(value);
  const title = text(source.title ?? source.name, `Ćwiczenie ${index + 1}`);
  return {
    id: text(source.id ?? source.key, `exercise-${index + 1}`),
    title,
    prescription: text(source.prescription ?? source.volume ?? source.dose, "Według planu"),
    sets: number(source.sets, 1),
    restSeconds: parseRestSeconds(source.restSeconds ?? source.rest),
    visualSrc: text(source.visualSrc ?? source.imageSrc ?? source.image) || undefined,
    intent: text(source.intent ?? source.goal) || undefined,
    howTo: list(source.howTo ?? source.steps).map((item) => text(item)).filter(Boolean),
    avoid: text(source.avoid ?? source.warning ?? source.mistake) || undefined,
    details: text(source.details ?? source.description) || undefined,
  };
}

function adaptBlock(value: unknown, index: number): SprintBlock {
  const source = record(value);
  const exercises = list(source.exercises ?? source.items ?? source.drills).map(adaptExercise);
  return {
    id: text(source.id ?? source.key, `block-${index + 1}`),
    number: text(source.number, String(index + 1).padStart(2, "0")),
    title: text(source.title ?? source.name, `Blok ${index + 1}`),
    estimatedMinutes: number(source.estimatedMinutes ?? source.minutes ?? source.durationMinutes, 0),
    exercises,
  };
}

/**
 * Adapter nie usuwa danych silnika. Normalizuje popularne nazwy pól starego ekranu.
 * Jeśli aplikacja ma już SprintSession w nowym formacie, nie używaj adaptera.
 */
export function adaptLegacySprintSession(value: unknown): SprintSession {
  const source = record(value);
  const blocks = list(source.blocks ?? source.phases ?? source.sections).map(adaptBlock);
  return {
    id: text(source.id ?? source.sessionId, "sprint-session"),
    title: text(source.title ?? source.name, "Sprint: akceleracja"),
    estimatedMinutes: number(source.estimatedMinutes ?? source.minutes ?? source.durationMinutes, blocks.reduce((sum, block) => sum + block.estimatedMinutes, 0)),
    blocks,
  };
}

