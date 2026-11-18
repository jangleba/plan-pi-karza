/** Preparatory course measurement only; never a performance-test result. */
const COURSE_TARGET_MIN = 1;
const COURSE_TARGET_MAX = 30;

export interface CourseMeasurement {
  targetMeters: number;
  measuredMeters: number;
  method: "arkit";
  approximate: true;
}

export function validCourseTarget(value: number): boolean {
  return Number.isFinite(value) && value >= COURSE_TARGET_MIN && value <= COURSE_TARGET_MAX;
}

export function parseCourseMeasurement(value: unknown, target: number): CourseMeasurement {
  if (!value || typeof value !== "object") throw new Error("Nie udało się odczytać miarki.");
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
