import type { ExerciseItem, SessionDay, TrainingExercise } from "./types";

const scaled = (value: number, factor: number) => Math.max(1, Math.round(value * factor));

/** Adjust the work quantity, preserving load, rest, tempo and movement identity. */
export function reducePrescription(value: string | undefined, factor: number): string | undefined {
  if (!value) return value;
  if (/^\s*\d+\s*[×x]\s*\d+(?:\s*[–-]\s*\d+)?\s*(?:m|km|s|sek|min)\b/i.test(value))
    return value.replace(
      /^(\s*)(\d+)(\s*[×x])/i,
      (_, space: string, count: string, times: string) =>
        `${space}${scaled(Number(count), factor)}${times}`,
    );
  if (/^\s*\d+\s*[×x]\s*\d+/i.test(value))
    return value.replace(
      /^(\s*\d+\s*[×x]\s*)(\d+)(?:\s*[–-]\s*(\d+))?/i,
      (_, prefix: string, low: string, high?: string) =>
        `${prefix}${scaled(Number(low), factor)}${high ? `–${scaled(Number(high), factor)}` : ""}`,
    );
  // A standalone count, duration, or distance is a quantity; percentages are intensity.
  if (/^\s*\d+(?:\s*[–-]\s*\d+)?\s*(?:s|sek|min|m|km|powt\.?|razy)?\s*$/i.test(value))
    return value.replace(/\d+/g, (n) => String(scaled(Number(n), factor)));
  return value;
}

export function reduceSessionDose(session: SessionDay, factor: number): SessionDay {
  if (factor >= 1) return session;
  const flat = (item: ExerciseItem): ExerciseItem => ({
    ...item,
    prescription: reducePrescription(item.prescription, factor) ?? item.prescription,
    displayPrescription: reducePrescription(item.displayPrescription, factor),
  });
  const structured = (item: TrainingExercise): TrainingExercise => ({
    ...item,
    reps: item.reps ? reducePrescription(item.reps, factor) : item.reps,
    duration: item.duration ? reducePrescription(item.duration, factor) : item.duration,
    groundContacts: item.groundContacts == null ? undefined : scaled(item.groundContacts, factor),
    // A formatted label must never continue to advertise the original dose.
    displayPrescription: reducePrescription(item.displayPrescription, factor),
  });
  return {
    ...session,
    durationMin: Math.max(1, Math.round(session.durationMin * factor)),
    sections: {
      ...session.sections,
      main: (session.sections.main ?? []).map(flat),
      accessory: (session.sections.accessory ?? []).map(flat),
      footballTransfer: (session.sections.footballTransfer ?? []).map(flat),
    },
    exercises: session.exercises?.map(flat),
    structuredSections: session.structuredSections?.map((section) =>
      ["warmup", "prep", "cooldown"].includes(section.type)
        ? section
        : {
            ...section,
            blocks: section.blocks.map((block) => ({
              ...block,
              exercises: block.exercises.map(structured),
            })),
          },
    ),
  };
}
