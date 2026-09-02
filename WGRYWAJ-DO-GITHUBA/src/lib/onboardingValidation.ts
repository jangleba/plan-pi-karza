import type { DoubleSessions } from "@/lib/loadwise/types";

interface ScheduleStepAnswers {
  doubleSessions: DoubleSessions | null;
  matchDate: string | null;
}

/** Data meczu wzbogaca plan, ale jej brak nie może blokować konfiguracji. */
export function isScheduleStepComplete({
  doubleSessions,
}: ScheduleStepAnswers): boolean {
  return doubleSessions !== null;
}
