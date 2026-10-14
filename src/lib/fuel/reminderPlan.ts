import { localDate, resolveFuelTiming, type FuelContext, type FuelDeviceData } from "./experience";

export interface FuelReminderPreferences {
  enabled: boolean;
  prepare: boolean;
  pack: boolean;
  after: boolean;
  matchTomorrow: boolean;
  quietStart: string;
  quietEnd: string;
}
export const DEFAULT_FUEL_REMINDERS: FuelReminderPreferences = {
  enabled: false,
  prepare: true,
  pack: false,
  after: false,
  matchTomorrow: false,
  quietStart: "22:00",
  quietEnd: "07:00",
};
export interface FuelReminder {
  id: number;
  key: string;
  userId: string;
  contextKey: string;
  at: number;
  expiresAt: number;
  kind: "prepare" | "pack" | "after" | "match";
  title: string;
  body: string;
}
export const REMINDER_ID_MIN = 1_610_000_000;
export const REMINDER_ID_MAX = 1_619_999_999;
export const isFuelNotificationId = (id: number) => id >= REMINDER_ID_MIN && id <= REMINDER_ID_MAX;
export const reminderStorageKey = (id: string) => `ballwise:fuel-reminders:v1:${id}`;
const validClock = (s: unknown): s is string =>
  typeof s === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s);

export function readReminderPreferences(
  storage: Pick<Storage, "getItem">,
  id: string,
): FuelReminderPreferences {
  try {
    const raw = JSON.parse(storage.getItem(reminderStorageKey(id)) ?? "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULT_FUEL_REMINDERS };
    return {
      enabled: raw.enabled === true,
      prepare: raw.prepare !== false,
      pack: raw.pack === true,
      after: raw.after === true,
      matchTomorrow: raw.matchTomorrow === true,
      quietStart: validClock(raw.quietStart) ? raw.quietStart : "22:00",
      quietEnd: validClock(raw.quietEnd) ? raw.quietEnd : "07:00",
    };
  } catch {
    return { ...DEFAULT_FUEL_REMINDERS };
  }
}

export function reminderId(key: string): number {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return REMINDER_ID_MIN + ((h >>> 0) % 10_000_000);
}

export function outsideQuietHours(at: number, p: FuelReminderPreferences): number {
  const date = new Date(at);
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const start = toMin(p.quietStart),
    end = toMin(p.quietEnd),
    minute = date.getHours() * 60 + date.getMinutes();
  if (start === end) return at;
  const quiet = start < end ? minute >= start && minute < end : minute >= start || minute < end;
  if (!quiet) return at;
  if (start > end && minute >= start) date.setDate(date.getDate() + 1);
  date.setHours(Math.floor(end / 60), end % 60, 0, 0);
  return date.getTime();
}

export function planFuelReminders(input: {
  userId: string;
  contexts: FuelContext[];
  data: FuelDeviceData;
  preferences: FuelReminderPreferences;
  now: number;
}): FuelReminder[] {
  const { userId, contexts, data, preferences: p, now } = input;
  if (!p.enabled || !userId) return [];
  const plans: FuelReminder[] = [];
  const add = (
    c: FuelContext,
    kind: FuelReminder["kind"],
    at: number,
    expiresAt: number,
    title: string,
    body: string,
  ) => {
    const adjusted = outsideQuietHours(at, p);
    if (!Number.isFinite(adjusted) || now >= expiresAt || adjusted >= expiresAt) return;
    const stable = `${userId}:${c.key}:${kind}`;
    plans.push({
      id: reminderId(stable),
      key: `${stable}:${at}`,
      userId,
      contextKey: c.key,
      kind,
      at: adjusted,
      expiresAt,
      title,
      body,
    });
  };
  for (const c of contexts) {
    const timing = resolveFuelTiming(c, data.timings[c.key]);
    const chosen = data.entries.find((e) => e.contextKey === c.key && e.status === "selected");
    const title = chosen?.title;
    if (
      c.date === localDate(now) &&
      !c.completed &&
      timing?.phase === "before" &&
      timing.startsAt !== null
    ) {
      const start = timing.startsAt;
      const eaten = data.entries.some(
        (e) =>
          e.contextKey === c.key &&
          e.status === "eaten" &&
          e.eatenAt !== null &&
          e.eatenAt > start - 4 * 3_600_000,
      );
      const remaining = timing.presetMin ?? 120;
      if (p.prepare && !eaten) {
        const offset = remaining > 90 ? 75 : remaining > 45 ? 35 : 15;
        add(
          c,
          "prepare",
          start - offset * 60_000,
          start,
          "Przygotuj zestaw na trening",
          title ? `${title}. Twój wybór czeka w Fuel.` : "Sprawdź propozycję jedzenia przed sesją.",
        );
      }
      if (p.pack)
        add(
          c,
          "pack",
          start - 10 * 60_000,
          start,
          "Sprawdź zestaw do zabrania",
          "Przygotuj wybrane jedzenie i napój. Lista czeka w Fuel.",
        );
    }
    const endedAt = c.endedAt ?? timing?.endedAt;
    if (
      p.after &&
      (c.completed || timing?.phase === "after") &&
      endedAt &&
      Number.isFinite(endedAt)
    ) {
      const ateAfter = data.entries.some(
        (e) => e.status === "eaten" && e.eatenAt !== null && e.eatenAt >= endedAt,
      );
      if (!ateAfter)
        add(
          c,
          "after",
          endedAt + 15 * 60_000,
          endedAt + 2 * 3_600_000,
          "Propozycja po treningu",
          "Zajrzyj do Fuel, jeśli chcesz wybrać posiłek po sesji.",
        );
    }
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (p.matchTomorrow && c.kind === "match" && c.date === localDate(tomorrow.getTime())) {
      const at = new Date(now);
      at.setHours(18, 0, 0, 0);
      const expiry = new Date(now);
      expiry.setHours(23, 59, 0, 0);
      add(
        c,
        "match",
        at.getTime(),
        expiry.getTime(),
        "Przygotuj jedzenie na jutro",
        "Jutro masz mecz w Planie. Zapisz zestaw do zabrania.",
      );
    }
  }
  return plans
    .sort((a, b) => a.at - b.at)
    .filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i)
    .slice(0, 12);
}

export function snoozedReminder(
  reminder: FuelReminder,
  now: number,
  preferences: FuelReminderPreferences,
): FuelReminder | null {
  const at = outsideQuietHours(now + 15 * 60_000, preferences);
  return at < reminder.expiresAt ? { ...reminder, at, key: `${reminder.key}:snooze:${at}` } : null;
}

export function reminderCalendar(start: number): string {
  const stamp = (n: number) =>
    new Date(n)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const at = start - 15 * 60_000;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BallWise//Fuel//PL",
    "BEGIN:VEVENT",
    `UID:fuel-${start}@ballwise.local`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(at)}`,
    `DTEND:${stamp(at + 5 * 60_000)}`,
    "SUMMARY:BallWise — przygotuj zestaw na trening",
    "DESCRIPTION:Sprawdź wybrane jedzenie i napój w Fuel.",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:PT0M",
    "DESCRIPTION:Przygotuj zestaw na trening",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
