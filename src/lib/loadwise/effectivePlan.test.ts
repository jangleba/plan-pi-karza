import { selectEffectivePlan, selectPlanWeeks } from "./effectivePlanSelector";
import type { Profile, Readiness, SessionCompletion } from "./types";
import { describe, expect, it } from "vitest";
import type { SessionDay, SessionModification } from "./types";
import { effectiveSessions, resolveEffectivePlan, resolveModifiedDay } from "./effectivePlan";

function day(title: string, date = "2026-09-21"): SessionDay {
  return {
    date,
    dayName: "Poniedziałek",
    dayType: "training",
    title,
    goalLabel: title,
    intensity: "umiarkowana",
    durationMin: 45,
    reason: "test",
    safetyNote: null,
    whyToday: "test",
    sessionType: title,
    goalOfSession: "test",
    riskManaged: "test",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: {
      warmup: [],
      main: [],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    secondSession: null,
  };
}

function mod(
  id: string,
  type: "add" | "swap",
  session: SessionDay,
  reason = "test",
  createdAt = "2026-09-20T08:00:00.000Z",
): SessionModification {
  return {
    id,
    date: session.date,
    type,
    reason,
    safetyStatus: type === "add" ? "added_by_user" : "swapped_by_user",
    session,
    originalSession: null,
    createdAt,
  };
}

describe("effective plan", () => {
  it("używa ostatniej zamiany jako jedynej wersji sesji głównej", () => {
    const source = day("Siła A");
    const result = resolveModifiedDay(source, [
      mod("1", "swap", day("Siła B"), "", "2026-09-20T08:00:00.000Z"),
      mod("2", "swap", day("Siła C"), "", "2026-09-20T09:00:00.000Z"),
    ]);

    expect(result.title).toBe("Siła C");
    expect(result.date).toBe(source.date);
  });

  it("wkłada dodaną sesję w drugi slot i nie tworzy trzeciej", () => {
    const source = day("Siła");
    const result = resolveModifiedDay(source, [
      mod("1", "add", day("Technika"), "", "2026-09-20T08:00:00.000Z"),
      mod("2", "add", day("Bieg"), "", "2026-09-20T09:00:00.000Z"),
    ]);

    expect(result.slotLabel).toBe("Sesja 1");
    expect(result.secondSession?.title).toBe("Bieg");
    expect(effectiveSessions([result])).toHaveLength(2);
  });

  it("decyzja check-inu o drugiej sesji ma pierwszeństwo przed starym slotem", () => {
    const source = day("Siła");
    source.secondSession = day("Stara technika");
    const result = resolveModifiedDay(source, [
      mod(
        "second",
        "add",
        day("Technika — lżej"),
        "[daily-checkin:second-lighter] Druga sesja lżej.",
      ),
    ]);

    expect(result.secondSession?.title).toBe("Technika — lżej");
  });

  it("rozwiązuje modyfikacje osobno dla każdej daty", () => {
    const monday = day("Poniedziałek", "2026-09-21");
    const tuesday = day("Wtorek", "2026-09-22");
    const effective = resolveEffectivePlan([monday, tuesday], {
      [monday.date]: [mod("m", "swap", day("Nowy poniedziałek", monday.date))],
    });

    expect(effective.map((item) => item.title)).toEqual(["Nowy poniedziałek", "Wtorek"]);
  });
});

describe("shared read-only plan projection", () => {
  it("reuses one projection across views while its actual inputs stay unchanged", () => {
    const plan = [day("Technika")],
      modifications = {},
      completions = {},
      readiness = {};
    const context = { completions, readiness };
    expect(selectEffectivePlan(plan, modifications, { ...context })).toBe(
      selectEffectivePlan(plan, modifications, context),
    );
    expect(selectEffectivePlan(plan, modifications, context)).toEqual(
      resolveEffectivePlan(plan, modifications, context),
    );
  });
  it("keeps command copies separate from the adapted display and from writable results", () => {
    const plan = [day("Technika")],
      modifications = {};
    const ui = selectEffectivePlan(plan, modifications);
    expect(selectEffectivePlan(plan, modifications, {})).not.toBe(ui);
    const writable = resolveEffectivePlan(plan, modifications);
    writable[0].title = "Nowy zapis";
    expect(ui[0].title).toBe("Technika");
  });
  it("invalidates a projection when the base plan or a modification changes", () => {
    const plan = [day("Technika")],
      modifications = {};
    const initial = selectEffectivePlan(plan, modifications);
    const changed = { [plan[0].date]: [mod("swap", "swap", day("Inna sesja"))] };
    expect(selectEffectivePlan(plan, changed)[0].title).toBe("Inna sesja");
    expect(selectEffectivePlan([...plan], modifications)).not.toBe(initial);
  });
  it("applies a new safety check-in immediately instead of reusing the earlier safe day", () => {
    const plan = [day("Technika")],
      modifications = {},
      readiness = {};
    const profile = { age: 20, painInjury: false, healthPersonalizationEnabled: true } as Profile;
    const before = selectEffectivePlan(plan, modifications, { profile, readiness });
    const next = {
      [plan[0].date]: { date: plan[0].date, overall: 8, altersMovement: true } as Readiness,
    };
    const after = selectEffectivePlan(plan, modifications, { profile, readiness: next });
    expect(after).not.toBe(before);
    expect(after[0].loadLabelOverride).toBe("Wstrzymaj trening");
    expect(
      selectEffectivePlan(plan, modifications, { profile: { ...profile }, readiness: next }),
    ).not.toBe(after);
  });
  it("replaces the display with a newly recorded execution snapshot", () => {
    const plan = [{ ...day("Technika"), dbId: "one" }],
      modifications = {},
      completions = {};
    const before = selectEffectivePlan(plan, modifications, { completions });
    const next = {
      one: {
        completed: true,
        status: "completed",
        executionSnapshot: day("Wykonany trening"),
      } as SessionCompletion,
    };
    const after = selectEffectivePlan(plan, modifications, { completions: next });
    expect(after).not.toBe(before);
    expect(after[0].title).toBe("Wykonany trening");
  });
});

it("reuses the prepared week decoration and rebuilds it for changed inputs", () => {
  const plan = selectEffectivePlan([day("Technika")], {});
  const weeks = selectPlanWeeks(plan, null);
  expect(selectPlanWeeks(plan, null)).toBe(weeks);
  expect(selectPlanWeeks([...plan], null)).not.toBe(weeks);
  expect(selectPlanWeeks(plan, undefined)).not.toBe(weeks);
});
