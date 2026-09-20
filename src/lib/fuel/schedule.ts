import type { SessionCompletion, SessionDay } from "@/lib/loadwise/types";
import type { FuelSessionInput, SessionKind } from "./types";
import { sessionFromPlan, sessionKindFrom } from "./planAdapter";

export const FUEL_SCHEDULE_VERSION = 1;

export interface FuelSchedulePreferences {
  version: 1;
  defaults: Partial<Record<SessionKind, string>>;
  sessions: Record<string, string>;
}

export const EMPTY_FUEL_SCHEDULE: FuelSchedulePreferences = {
  version: FUEL_SCHEDULE_VERSION,
  defaults: {},
  sessions: {},
};

export function fuelScheduleStorageKey(userId: string): string {
  return `ballwise:fuel-schedule:v${FUEL_SCHEDULE_VERSION}:${userId}`;
}

function validClock(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function loadFuelSchedulePreferences(
  userId: string,
): FuelSchedulePreferences {
  if (typeof window === "undefined") return EMPTY_FUEL_SCHEDULE;
  try {
    const raw = window.localStorage.getItem(fuelScheduleStorageKey(userId));
    if (!raw) return EMPTY_FUEL_SCHEDULE;
    const parsed = JSON.parse(raw) as Partial<FuelSchedulePreferences>;
    const defaults = Object.fromEntries(
      Object.entries(parsed.defaults ?? {}).filter(([, clock]) =>
        validClock(clock),
      ),
    ) as FuelSchedulePreferences["defaults"];
    const sessions = Object.fromEntries(
      Object.entries(parsed.sessions ?? {}).filter(([, clock]) =>
        validClock(clock),
      ),
    );
    return { version: FUEL_SCHEDULE_VERSION, defaults, sessions };
  } catch {
    return EMPTY_FUEL_SCHEDULE;
  }
}

export function saveFuelSchedulePreferences(
  userId: string,
  preferences: FuelSchedulePreferences,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    fuelScheduleStorageKey(userId),
    JSON.stringify(preferences),
  );
}

export function rememberFuelStart(input: {
  preferences: FuelSchedulePreferences;
  session: Pick<FuelSessionInput, "kind" | "scheduleKey">;
  clock: string;
  rememberForKind: boolean;
}): FuelSchedulePreferences {
  if (!validClock(input.clock))
    throw new Error("Podaj godzinę w formacie HH:MM.");
  const sessions = { ...input.preferences.sessions };
  if (input.session.scheduleKey)
    sessions[input.session.scheduleKey] = input.clock;
  const defaults = { ...input.preferences.defaults };
  if (input.rememberForKind && input.session.kind !== "none") {
    defaults[input.session.kind] = input.clock;
  }
  return { version: FUEL_SCHEDULE_VERSION, sessions, defaults };
}

interface Candidate {
  session: SessionDay;
  slot: 1 | 2;
  key: string;
}

function candidates(
  plan: SessionDay[],
  todayIso: string,
  completions: Record<string, SessionCompletion>,
): Candidate[] {
  return plan
    .filter((day) => day.date >= todayIso && day.isUnavailable !== true)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((day) => {
      const out: Candidate[] = [];
      const mainDone = day.dbId ? completions[day.dbId]?.completed : false;
      if (day.dayType !== "rest" && (day.durationMin ?? 0) > 0 && !mainDone) {
        out.push({
          session: day,
          slot: 1,
          key: `${day.date}:${day.dbId ?? day.sessionId ?? "main"}:1`,
        });
      }
      if (day.secondSession && (day.secondSession.durationMin ?? 0) > 0) {
        const second = day.secondSession;
        const secondDone = second.dbId
          ? completions[second.dbId]?.completed
          : false;
        if (secondDone) return out;
        out.push({
          session: second,
          slot: 2,
          key: `${day.date}:${second.dbId ?? second.sessionId ?? "second"}:2`,
        });
      }
      return out;
    });
}

function startDate(date: string, clock: string): Date {
  return new Date(`${date}T${clock}:00`);
}

export function findNextFuelSession(input: {
  plan: SessionDay[];
  todayIso: string;
  now: Date;
  preferences: FuelSchedulePreferences;
  completions?: Record<string, SessionCompletion>;
}): FuelSessionInput {
  const all = candidates(
    input.plan,
    input.todayIso,
    input.completions ?? {},
  ).map((candidate) => {
    const kind = sessionKindFrom(candidate.session);
    const explicit = candidate.session.scheduledStartTime;
    const remembered =
      input.preferences.sessions[candidate.key] ??
      input.preferences.defaults[kind];
    const clock = validClock(explicit)
      ? explicit
      : validClock(remembered)
        ? remembered
        : null;
    const timestamp = clock
      ? startDate(candidate.session.date, clock).getTime()
      : null;
    return {
      ...candidate,
      kind,
      clock,
      timestamp,
      explicit: validClock(explicit),
    };
  });

  const selected = all
    .filter(
      (candidate) =>
        candidate.timestamp == null ||
        candidate.timestamp >= input.now.getTime(),
    )
    .sort((a, b) => {
      const byDate = a.session.date.localeCompare(b.session.date);
      if (byDate !== 0) return byDate;
      if (a.timestamp == null && b.timestamp != null) return -1;
      if (a.timestamp != null && b.timestamp == null) return 1;
      return (a.timestamp ?? 0) - (b.timestamp ?? 0);
    })[0];
  if (!selected) return sessionFromPlan(null, input.todayIso);

  const base = sessionFromPlan(selected.session, input.todayIso);
  const minutesToStart =
    selected.timestamp == null
      ? null
      : Math.max(
          0,
          Math.floor((selected.timestamp - input.now.getTime()) / 60_000),
        );
  return {
    ...base,
    minutesToStart,
    startClock: selected.clock,
    scheduleKey: selected.key,
    slot: selected.slot,
    timeSource: selected.clock
      ? selected.explicit
        ? "session"
        : "remembered"
      : null,
    subtitle:
      selected.slot === 2
        ? `Druga jednostka · ${base.subtitle ?? "plan"}`
        : base.subtitle,
  };
}

export function clearFuelSchedulePreferences(userId: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(fuelScheduleStorageKey(userId));
  }
}
