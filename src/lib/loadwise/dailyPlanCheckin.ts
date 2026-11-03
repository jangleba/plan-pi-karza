import type { SessionDay, SessionCompletion } from "./types";
import { reduceDailySessionDose } from "./dailyDose";

export type DailyPlanCheckinAction =
  "keep" | "lighter" | "swap" | "add" | "week_change" | "unavailable";

export type SecondSessionCheckinAction = "keep" | "lighter" | "swap" | "remove";

export interface DailyPlanCheckin {
  date: string;
  primaryAction: DailyPlanCheckinAction;
  secondAction: SecondSessionCheckinAction | null;
  completedAt: string;
}

const STORAGE_PREFIX = "ballwise:daily-plan-checkin:v2";

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function dailyPlanCheckinStorageKey(userId: string, date: string): string {
  return `${STORAGE_PREFIX}:${userId}:${date}`;
}

function isPrimaryAction(value: unknown): value is DailyPlanCheckinAction {
  return ["keep", "lighter", "swap", "add", "week_change", "unavailable"].includes(String(value));
}

function isSecondAction(value: unknown): value is SecondSessionCheckinAction {
  return ["keep", "lighter", "swap", "remove"].includes(String(value));
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
      !isPrimaryAction(parsed.primaryAction) ||
      (parsed.secondAction !== null && !isSecondAction(parsed.secondAction)) ||
      !parsed.completedAt
    )
      return null;
    return {
      date,
      primaryAction: parsed.primaryAction,
      secondAction: parsed.secondAction ?? null,
      completedAt: parsed.completedAt,
    };
  } catch {
    return null;
  }
}

export function saveDailyPlanCheckin(
  userId: string,
  date: string,
  primaryAction: DailyPlanCheckinAction,
  secondAction: SecondSessionCheckinAction | null,
  storage: Pick<Storage, "setItem"> | null = browserStorage(),
  now = new Date(),
): DailyPlanCheckin {
  const record: DailyPlanCheckin = {
    date,
    primaryAction,
    secondAction,
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

/** Both slots, without deriving health or readiness from training choices. */
export function hasProtectedExecution(
  day: SessionDay,
  completions: Record<string, SessionCompletion> = {},
): boolean {
  return [day, day.secondSession].some((slot) => {
    if (!slot) return false;
    const log = slot.dbId ? completions[slot.dbId] : undefined;
    return Boolean(
      slot.executionProtected ||
      log?.completed ||
      log?.status === "started" ||
      log?.status === "completed",
    );
  });
}

/** Fewer work sets/intervals, with the original technique, intensity and recovery. */
export function buildLighterSession(session: SessionDay): SessionDay {
  if (session.executionProtected)
    throw new Error("Rozpoczęta lub wykonana sesja nie może być zmieniona tym panelem.");
  if (session.loadLabelOverride === "Lżejszy wariant") return session;
  const externalCommitment =
    session.externalCommitment === true ||
    session.dayType === "club" ||
    session.dayType === "match";

  if (externalCommitment) {
    return {
      ...session,
      dbId: undefined,
      sessionId: undefined,
      loadLabelOverride: "Ogranicz obciążenie",
      whyToday: "Wybrałeś dziś lżejszy udział.",
      safetyNote: "Ustal mniejszy udział z trenerem przed rozpoczęciem.",
    };
  }

  return {
    ...reduceDailySessionDose(session),
    dbId: undefined,
    sessionId: undefined,
    title: `${session.title} — lżej`,
    reason: "Zawodnik wybrał lżejszy wariant dzisiejszej jednostki.",
    whyToday: "Zachowujemy cel sesji przy mniejszym obciążeniu.",
    riskManaged:
      "Mniej serii lub odcinków. Rozgrzewka, intensywność wykonania i przerwy pozostają z planu.",
    loadLabelOverride: "Lżejszy wariant",
    classification: undefined,
  };
}

/** Usuwa wyłącznie drugi slot, zachowując bieżącą pierwszą sesję. */
export function withoutSecondSession(session: SessionDay): SessionDay {
  return {
    ...session,
    dbId: undefined,
    sessionId: undefined,
    secondSession: null,
    slotLabel: null,
  };
}

/**
 * Gdy pierwsza sesja odpada, przenosi wybraną drugą sesję do jedynego
 * aktywnego slotu dnia. Dzięki temu nie zostaje pusty „slot 1”.
 */
export function promoteSecondSession(
  day: SessionDay,
  replacement: SessionDay | null = day.secondSession,
): SessionDay {
  if (!replacement) return buildUnavailableSession(day);

  return {
    ...replacement,
    dbId: undefined,
    sessionId: undefined,
    dayDbId: day.dayDbId,
    date: day.date,
    dayName: day.dayName,
    dayOfWeek: day.dayOfWeek,
    mdRelation: day.mdRelation,
    mdLabel: day.mdLabel,
    slotLabel: null,
    secondSession: null,
    reason: "Pierwsza sesja została usunięta; pozostaje wybrana druga jednostka.",
    whyToday: "Wykonujesz tylko wybraną drugą sesję.",
  };
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
    reason: "Zawodnik oznaczył dzisiejszą jednostkę jako niedostępną.",
    whyToday: "Dzisiejsza sesja nie może zostać wykonana.",
    goalOfSession: "Bez treningu w tym dniu.",
    riskManaged: "Sesja nie jest nadrabiana na siłę tego samego dnia.",
    avoidToday: "Nie wykonuj pominiętej objętości dodatkowo.",
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
