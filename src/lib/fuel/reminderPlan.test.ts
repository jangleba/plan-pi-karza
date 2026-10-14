import { describe, expect, it } from "vitest";
import { emptyFuelData, localDate, manualFuelContext } from "./experience";
import { createRecipeEntry, relativeFuelTiming } from "./practical";
import { RECIPES } from "./catalog";
import {
  DEFAULT_FUEL_REMINDERS,
  outsideQuietHours,
  planFuelReminders,
  readReminderPreferences,
  reminderCalendar,
  snoozedReminder,
} from "./reminderPlan";
const now = new Date("2026-10-14T12:00:00").getTime();
const context = manualFuelContext(localDate(now), "football", 60, "moderate");
const preferences = { ...DEFAULT_FUEL_REMINDERS, enabled: true };
function fixture() {
  const data = emptyFuelData();
  data.timings[context.key] = relativeFuelTiming(120, now)!;
  return data;
}
describe("Fuel reminders", () => {
  it("requires opt-in and a real user-entered start", () => {
    expect(
      planFuelReminders({
        userId: "u",
        contexts: [context],
        data: fixture(),
        preferences: DEFAULT_FUEL_REMINDERS,
        now,
      }),
    ).toEqual([]);
    expect(
      planFuelReminders({
        userId: "u",
        contexts: [context],
        data: emptyFuelData(),
        preferences,
        now,
      }),
    ).toEqual([]);
  });
  it("uses stable deadlines across countdown changes, but replaces them when the user moves the start", () => {
    const data = fixture();
    const a = planFuelReminders({ userId: "u", contexts: [context], data, preferences, now })[0];
    const b = planFuelReminders({
      userId: "u",
      contexts: [context],
      data,
      preferences,
      now: now + 40 * 60_000,
    })[0];
    expect(a.key).toBe(b.key);
    expect(a.at).toBe(b.at);
    data.timings[context.key] = relativeFuelTiming(180, now)!;
    const c = planFuelReminders({ userId: "u", contexts: [context], data, preferences, now })[0];
    expect(c.id).toBe(a.id);
    expect(c.key).not.toBe(a.key);
  });
  it("a chosen meal does not suppress a reminder, but confirming it eaten does", () => {
    const data = fixture();
    data.entries = [createRecipeEntry(RECIPES[0], context.key, "selected", now, "1")];
    expect(
      planFuelReminders({ userId: "u", contexts: [context], data, preferences, now }),
    ).toHaveLength(1);
    data.entries[0].status = "eaten";
    data.entries[0].eatenAt = now;
    expect(planFuelReminders({ userId: "u", contexts: [context], data, preferences, now })).toEqual(
      [],
    );
  });
  it("does not send a postponed pre-training reminder after the training start or during quiet hours", () => {
    const late = new Date("2026-10-14T23:00:00").getTime();
    expect(outsideQuietHours(late, preferences)).toBe(new Date("2026-10-15T07:00:00").getTime());
    const data = fixture();
    data.timings[context.key] = relativeFuelTiming(60, late)!;
    expect(
      planFuelReminders({ userId: "u", contexts: [context], data, preferences, now: late }),
    ).toEqual([]);
    const r = planFuelReminders({
      userId: "u",
      contexts: [context],
      data: fixture(),
      preferences,
      now,
    })[0];
    expect(snoozedReminder(r, r.expiresAt - 5 * 60_000, preferences)).toBeNull();
  });
  it("after-training reminders use a confirmed end and stop after a later meal", () => {
    const c = { ...context, completed: true, endedAt: now };
    const p = { ...preferences, after: true };
    const data = emptyFuelData();
    expect(
      planFuelReminders({ userId: "u", contexts: [c], data, preferences: p, now })[0].kind,
    ).toBe("after");
    data.entries = [createRecipeEntry(RECIPES[0], context.key, "eaten", now + 1000, "1")];
    expect(planFuelReminders({ userId: "u", contexts: [c], data, preferences: p, now })).toEqual(
      [],
    );
  });
  it("keeps account ids separate, sanitizes invalid settings and exports UTC calendar events", () => {
    const a = planFuelReminders({
      userId: "a",
      contexts: [context],
      data: fixture(),
      preferences,
      now,
    })[0];
    const b = planFuelReminders({
      userId: "b",
      contexts: [context],
      data: fixture(),
      preferences,
      now,
    })[0];
    expect(a.id).not.toBe(b.id);
    expect(
      readReminderPreferences({ getItem: () => '{"enabled":true,"quietStart":"99:88"}' }, "a")
        .quietStart,
    ).toBe("22:00");
    const calendar = reminderCalendar(now + 60 * 60_000);
    expect(calendar).toContain("BEGIN:VALARM\r\n");
    expect(calendar).toMatch(/DTSTART:\d{8}T\d{6}Z/);
  });
});
