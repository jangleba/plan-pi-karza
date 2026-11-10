import type { SessionDay, SessionCompletion } from "./types";
import { sessionPrescription } from "./planIdentity";

/**
 * Daily check-in: exactly three training decisions. No questions about
 * health, pain, sleep, stress, mood or motivation, and no readiness score
 * derived from earlier answers or notes.
 */
export type DailyPlanCheckinAction = "train" | "less_time" | "cannot_today";

export interface DailyPlanCheckin {
  date: string;
  action: DailyPlanCheckinAction;
  /** Planned own minutes for „Mam mniej czasu”; null for the other choices. */
  minutes: number | null;
  completedAt: string;
}

const STORAGE_PREFIX = "ballwise:daily-plan-checkin:v3";
const ACTIONS: DailyPlanCheckinAction[] = ["train", "less_time", "cannot_today"];

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function dailyPlanCheckinStorageKey(userId: string, date: string): string {
  return `${STORAGE_PREFIX}:${userId}:${date}`;
}

export function readDailyPlanCheckin(
  userId: string,
  date: string,
  storage: Pick<Storage, "getItem"> | null = browserStorage(),
): DailyPlanCheckin | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(dailyPlanCheckinStorageKey(userId, date));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DailyPlanCheckin>;
    if (
      parsed.date !== date ||
      !ACTIONS.includes(parsed.action as DailyPlanCheckinAction) ||
      !parsed.completedAt
    )
      return null;
    return {
      date,
      action: parsed.action as DailyPlanCheckinAction,
      minutes: typeof parsed.minutes === "number" ? parsed.minutes : null,
      completedAt: parsed.completedAt,
    };
  } catch {
    return null;
  }
}

export function saveDailyPlanCheckin(
  userId: string,
  date: string,
  action: DailyPlanCheckinAction,
  minutes: number | null = null,
  storage: Pick<Storage, "setItem"> | null = browserStorage(),
  now = new Date(),
): DailyPlanCheckin {
  const record: DailyPlanCheckin = {
    date,
    action,
    minutes: action === "less_time" ? minutes : null,
    completedAt: now.toISOString(),
  };
  try {
    storage?.setItem(dailyPlanCheckinStorageKey(userId, date), JSON.stringify(record));
  } catch {
    // The plan change is already persisted. Keep confirmation in the open view.
  }
  return record;
}

/** Unieważnia decyzję dnia, gdy silnik przebudował plan pod nią. */
export function clearDailyPlanCheckin(
  userId: string,
  date: string,
  storage: Pick<Storage, "removeItem"> | null = browserStorage(),
): void {
  try {
    storage?.removeItem(dailyPlanCheckinStorageKey(userId, date));
  } catch {
    /* Unavailable cache cannot prevent a committed plan change. */
  }
}

export function isSessionLocked(
  session: SessionDay | null | undefined,
  completions: Record<string, SessionCompletion> = {},
): boolean {
  if (!session) return false;
  const log = session.dbId ? completions[session.dbId] : undefined;
  return Boolean(
    session.executionProtected ||
    log?.completed ||
    log?.status === "started" ||
    log?.status === "completed",
  );
}

/** Both slots, without deriving health or readiness from training choices. */
export function hasProtectedExecution(
  day: SessionDay,
  completions: Record<string, SessionCompletion> = {},
): boolean {
  return [day, day.secondSession].some((slot) => isSessionLocked(slot, completions));
}

/** The day as planned before today's check-in changed it. */
export function checkinBase(day: SessionDay): SessionDay {
  return day.checkinBaseSession ?? day;
}

/** Restores the plan as it was before today's check-in (explicit athlete choice). */
export function restorePlannedDay(day: SessionDay): SessionDay {
  const base = checkinBase(day);
  return { ...base, checkinBaseSession: null, checkinTimeBudgetMin: null };
}

/** Same prescription in both slots: re-applying the decision must not write again. */
export function sameDayPlan(a: SessionDay, b: SessionDay): boolean {
  const second = (day: SessionDay) =>
    day.secondSession ? sessionPrescription(day.secondSession) : null;
  return sessionPrescription(a) === sessionPrescription(b) && second(a) === second(b);
}

export function buildUnavailableSession(session: SessionDay): SessionDay {
  return {
    ...session,
    dbId: undefined,
    sessionId: undefined,
    isUnavailable: true,
    dayType: "rest",
    type: "rest",
    externalCommitment: false,
    isClubSession: false,
    isOwnSession: false,
    isRecoveryOrPrehab: false,
    title: "Dziś bez treningu",
    goalLabel: "Zmiana dostępności",
    intensity: "niska",
    durationMin: 0,
    reason: "Zawodnik oznaczył, że dziś nie może trenować.",
    whyToday: "Dzisiejsza sesja nie zostanie wykonana.",
    goalOfSession: "Bez treningu w tym dniu.",
    riskManaged:
      "Opuszczona praca nie jest automatycznie przenoszona na kolejny dzień ani dokładana później.",
    avoidToday: "Nie nadrabiaj pominiętej objętości.",
    loadLabelOverride: null,
    sections: {
      warmup: [],
      main: [],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    structuredSections: undefined,
    exercises: undefined,
    classification: undefined,
    secondSession: null,
    slotLabel: null,
  };
}

/**
 * „Dziś nie mogę”: today's unstarted sessions are dropped for today only.
 * Nothing is moved to another day automatically; started or completed
 * sessions stay exactly as recorded.
 */
export function buildCannotTodayDay(
  day: SessionDay,
  completions: Record<string, SessionCompletion> = {},
): SessionDay {
  const base = checkinBase(day);
  const firstLocked = isSessionLocked(base, completions);
  const second = base.secondSession ?? null;
  const secondLocked = isSessionLocked(second, completions);
  if (firstLocked) {
    if (!second || secondLocked) return day;
    return {
      ...base,
      secondSession: null,
      slotLabel: null,
      checkinBaseSession: base,
      checkinTimeBudgetMin: null,
    };
  }
  return {
    ...buildUnavailableSession(base),
    secondSession: secondLocked ? second : null,
    slotLabel: secondLocked ? "Sesja 1" : null,
    checkinBaseSession: base,
    checkinTimeBudgetMin: null,
  };
}
