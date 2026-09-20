import type { SessionDay, SessionModification } from "./types";

const DAILY_SECOND_PREFIX = "[daily-checkin:second-";

function byCreatedAt(a: SessionModification, b: SessionModification): number {
  return a.createdAt.localeCompare(b.createdAt);
}

function cleanSecond(session: SessionDay): SessionDay {
  return {
    ...session,
    slotLabel: "Sesja 2",
    secondSession: null,
  };
}

/**
 * Nakłada aktywne modyfikacje na jeden dzień planu.
 *
 * Reguły są celowo proste:
 * - ostatnia zamiana jest wersją bazową dnia,
 * - dodana jednostka zajmuje wyłącznie wolny drugi slot,
 * - wpis check-inu dotyczący drugiej sesji zastępuje stary drugi slot,
 * - nigdy nie powstaje trzecia sesja.
 */
export function resolveModifiedDay(
  source: SessionDay,
  modifications: SessionModification[] = [],
): SessionDay {
  const ordered = [...modifications].sort(byCreatedAt);
  const swap = ordered.filter((item) => item.type === "swap").at(-1);
  const additions = ordered.filter((item) => item.type === "add");
  const dailySecond = additions
    .filter((item) => item.reason.startsWith(DAILY_SECOND_PREFIX))
    .at(-1);
  const ordinaryAddition = additions
    .filter((item) => !item.reason.startsWith(DAILY_SECOND_PREFIX))
    .at(-1);

  let day: SessionDay = swap ? { ...swap.session } : { ...source };
  const second =
    dailySecond?.session ??
    day.secondSession ??
    ordinaryAddition?.session ??
    null;

  day = {
    ...day,
    date: source.date,
    dayName: source.dayName,
    dayOfWeek: source.dayOfWeek,
    dayDbId: source.dayDbId,
    slotLabel: second ? "Sesja 1" : null,
    secondSession: second
      ? cleanSecond({ ...second, date: source.date })
      : null,
  };

  return day;
}

/** Jedna skuteczna wersja planu dla Start, Plan, Fuel, Postępu i automatyzacji. */
export function resolveEffectivePlan(
  plan: SessionDay[],
  modifications: Record<string, SessionModification[]> = {},
): SessionDay[] {
  return plan.map((day) =>
    resolveModifiedDay(day, modifications[day.date] ?? []),
  );
}

/** Wszystkie realne sloty planu, maksymalnie dwa na dzień. */
export function effectiveSessions(plan: SessionDay[]): SessionDay[] {
  return plan.flatMap(
    (day) => [day, day.secondSession].filter(Boolean) as SessionDay[],
  );
}
