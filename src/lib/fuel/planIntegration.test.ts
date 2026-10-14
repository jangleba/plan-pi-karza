import { describe, expect, it } from "vitest";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import { resolveEffectivePlan } from "@/lib/loadwise/effectivePlan";
import type { SessionCompletion, SessionModification } from "@/lib/loadwise/types";
import { emptyFuelData, planFuelContexts, resolveFuelTiming } from "./experience";
import { chooseFuelContext, relativeFuelTiming } from "./practical";
import { DEFAULT_FUEL_REMINDERS, planFuelReminders } from "./reminderPlan";

const date = "2026-10-14";
const now = new Date(`${date}T12:00:00`).getTime();
const preferences = { ...DEFAULT_FUEL_REMINDERS, enabled: true };
const strength = () =>
  sessionFixture({
    date,
    dbId: "strength",
    title: "Siłownia",
    sessionType: "Siła",
    scheduledStartTime: "14:00",
  });

describe("Plan → Fuel → przypomnienie", () => {
  it("uses the actual scheduled start from Plan without requiring a second time entry", () => {
    const contexts = planFuelContexts([strength()], date, {});
    const reminders = planFuelReminders({
      userId: "athlete",
      contexts,
      data: emptyFuelData(),
      preferences,
      now,
    });
    expect(reminders).toHaveLength(1);
    expect(reminders[0].at).toBe(new Date(`${date}T12:45:00`).getTime());
  });

  it("preserves an explicit athlete override and keeps both session times separate", () => {
    const day = strength();
    day.secondSession = sessionFixture({
      date,
      dbId: "football",
      title: "Piłka",
      scheduledStartTime: "18:00",
    });
    const contexts = planFuelContexts([day], date, {});
    const data = emptyFuelData();
    data.timings[contexts[0].key] = relativeFuelTiming(60, now)!;
    expect(resolveFuelTiming(contexts[0], data.timings[contexts[0].key]).startsAt).toBe(
      now + 60 * 60_000,
    );
    expect(resolveFuelTiming(contexts[1], data.timings[contexts[1].key]).startsAt).toBe(
      new Date(`${date}T18:00:00`).getTime(),
    );
  });

  it("replaces an old training reminder after the effective plan changes to a rest day", () => {
    const source = strength();
    const cancelled = sessionFixture({ date, dbId: "rest", dayType: "rest", durationMin: 0 });
    const change: SessionModification = {
      id: "cancel",
      date,
      type: "swap",
      reason: "Nie mogę trenować",
      safetyStatus: "swapped_by_user",
      session: cancelled,
      originalSession: source,
      createdAt: `${date}T11:00:00Z`,
    };
    const contexts = planFuelContexts(
      resolveEffectivePlan([source], { [date]: [change] }),
      date,
      {},
    );
    expect(contexts).toEqual([]);
    expect(
      planFuelReminders({ userId: "athlete", contexts, data: emptyFuelData(), preferences, now }),
    ).toEqual([]);
  });

  it("completion changes Fuel to after-training while the remaining second session stays selectable", () => {
    const day = strength();
    day.secondSession = sessionFixture({ date, dbId: "football", title: "Piłka" });
    const completed: SessionCompletion = {
      completed: true,
      rpe: 6,
      notes: "",
      endedAt: `${date}T11:50:00`,
    };
    const contexts = planFuelContexts([day], date, { strength: completed });
    expect(resolveFuelTiming(contexts[0]).phase).toBe("after");
    expect(chooseFuelContext(contexts, null, date)?.key).toBe(contexts[1].key);
    expect(
      planFuelReminders({
        userId: "athlete",
        contexts: [contexts[0]],
        data: emptyFuelData(),
        preferences,
        now,
      }),
    ).toEqual([]);
  });
});
