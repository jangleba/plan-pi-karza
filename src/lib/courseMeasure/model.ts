/** Preparatory course measurement only; never a performance-test result. */
export const COURSE_TARGET_MIN = 1;
export const COURSE_TARGET_MAX = 30;

export interface CourseMeasurement {
  targetMeters: number;
  measuredMeters: number;
  method: "arkit";
  approximate: true;
}

export function validCourseTarget(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= COURSE_TARGET_MIN &&
    value <= COURSE_TARGET_MAX
  );
}

/** Read only explicit single distances; do not guess ranges or flying-sprint sums. */
export function explicitCourseDistances(
  exercises: ReadonlyArray<{
    reps?: string;
    duration?: string;
    displayPrescription?: string;
  }>,
): number[] {
  const values = new Set<number>();
  for (const exercise of exercises) {
    for (const text of [
      exercise.reps,
      exercise.duration,
      exercise.displayPrescription,
    ]) {
      if (!text) continue;
      if (/\d\s*(?:[-–—+]|do)\s*\d/i.test(text)) continue;
      for (const match of text.matchAll(
        /(?<![\p{L}\d.,+\-–—])(\d+(?:[.,]\d+)?)\s*m\b(?!\s*\/)/giu,
      )) {
        const meters = Number(match[1].replace(",", "."));
        if (validCourseTarget(meters)) values.add(meters);
      }
    }
  }
  return [...values].sort((a, b) => a - b);
}

export function parseCourseMeasurement(
  value: unknown,
  target: number,
): CourseMeasurement {
  if (!value || typeof value !== "object")
    throw new Error("Nie udało się odczytać miarki.");
  const result = value as Record<string, unknown>;
  if (
    !validCourseTarget(target) ||
    result.targetMeters !== target ||
    typeof result.measuredMeters !== "number" ||
    !Number.isFinite(result.measuredMeters) ||
    result.measuredMeters <= 0 ||
    result.measuredMeters > 60 ||
    result.method !== "arkit" ||
    result.approximate !== true
  ) {
    throw new Error("Pomiar jest nieprawidłowy. Wyznacz odcinek ponownie.");
  }
  return {
    targetMeters: target,
    measuredMeters: result.measuredMeters,
    method: "arkit",
    approximate: true,
  };
}
