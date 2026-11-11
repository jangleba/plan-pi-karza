import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "gte", "lt", "limit", "order", "abortSignal"])
    chain[name] = () => chain;
  chain.then = (resolve: (value: unknown) => void) =>
    resolve({
      data: [
        { exercise_key: "squat", performed_at: "2026-10-13T16:00:00Z", weight_kg: 60, reps: 5 },
        { exercise_key: "squat", performed_at: "2026-11-03T16:00:00Z", weight_kg: 66, reps: 5 },
      ],
      error: null,
    });
  return { supabase: { from: () => chain } };
});

import { completedFromLogs, reviewEndedCycle } from "./cycleReviewData";
import { shouldShowCycleCard } from "./useCycleReview";
import type { CycleStartRecord, Profile, SessionDay, SessionModification } from "./types";

function day(date: string, type: string, dbId: string, extra: Partial<SessionDay> = {}) {
  return {
    date,
    dayType: "training",
    type,
    dbId,
    title: type,
    durationMin: 45,
    secondSession: null,
    cycleId: "old",
    ...extra,
  } as unknown as SessionDay;
}

const plan: SessionDay[] = [
  day("2026-10-12", "strength_power", "a"),
  day("2026-10-13", "club_training", "b", { dayType: "club", isClubSession: true }),
  day("2026-10-14", "sprint_acceleration", "c"),
  day("2026-11-08", "football_technical", "d"),
];

describe("dane końca cyklu", () => {
  it("wykonanie z dziennika: sesje planu i zamienione, bez pominiętych", () => {
    const swap = {
      date: "2026-11-08",
      session: day("2026-11-08", "endurance_running", "swap-1"),
    } as unknown as SessionModification;
    const rows = completedFromLogs(plan, [swap], {
      a: { completed: true, rpe: 6, notes: "" },
      c: { completed: false, status: "missed", rpe: null, notes: "" },
      "swap-1": { completed: true, rpe: 7, notes: "" },
      unknown: { completed: true, rpe: 5, notes: "" },
    });
    expect(rows.map((row) => [row.key, row.date, row.category, row.rpe])).toEqual([
      ["a", "2026-10-12", "gym", 6],
      ["swap-1", "2026-11-08", "endurance", 7],
    ]);
  });

  it("buduje podsumowanie i regułę startu tylko dla naturalnego końca cyklu", async () => {
    const profile = { age: 16, seasonPhase: "inseason", weeklyMatches: true } as Profile;
    const input = {
      userId: "u1",
      profile,
      plan,
      modifications: [],
      completions: { a: { completed: true, rpe: 6, notes: "" } },
      readiness: [],
    };
    // Plan sięga dziś — to przebudowa w trakcie cyklu, nie koniec.
    expect(await reviewEndedCycle({ ...input, todayIso: "2026-11-08" })).toBeNull();
    const record = await reviewEndedCycle({ ...input, todayIso: "2026-11-09" });
    expect(record).toMatchObject({
      kind: "consistency",
      youth: true,
      reviewedCycleId: "old",
      review: { planned: 3, done: 1, progress: "up" },
    });
  });
});

describe("karta na Start", () => {
  const record = {
    kind: "progress",
    youth: false,
    reviewedCycleId: "old",
    review: { startDate: "2026-10-12", endDate: "2026-11-08" },
  } as CycleStartRecord;

  it("pokazuje świeże, niezamknięte podsumowanie", () => {
    expect(shouldShowCycleCard(record, "2026-11-09", [])).toBe(true);
    expect(shouldShowCycleCard(record, "2026-11-09", ["old"])).toBe(false);
    expect(shouldShowCycleCard(record, "2026-12-15", [])).toBe(false);
    expect(shouldShowCycleCard(null, "2026-11-09", [])).toBe(false);
  });
});
