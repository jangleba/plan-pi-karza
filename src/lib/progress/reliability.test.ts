import { describe, expect, it } from "vitest";
import { buildMicrocycle, nextActionableSession } from "./center";
import type { SessionDay, SessionCompletion, SessionHistoryRecord } from "@/lib/loadwise/types";
const day = (id: string, date = "2026-10-18"): SessionDay => ({
  dbId: id,
  date,
  dayType: "training",
  type: "strength_power",
  title: id,
  durationMin: 40,
  dayName: "Niedziela",
  sessionType: "strength_power",
  goalLabel: "Siła",
  intensity: "umiarkowana",
  reason: "",
  safetyNote: null,
  whyToday: "",
  goalOfSession: "",
  riskManaged: "",
  avoidToday: "",
  mdLabel: null,
  slotLabel: null,
  sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
  secondSession: null,
});
const log = (key: string, rpe: number | null = 6): SessionHistoryRecord => ({
  key,
  date: "2026-10-18",
  title: key,
  category: "gym",
  durationMin: 35,
  rpe,
  notes: "",
});
const completed: SessionCompletion = { completed: true, status: "completed", rpe: 6, notes: "" };
describe("progress follows exact prescriptions and slots", () => {
  it("does not use unrelated archived work as adherence, while retaining actual work totals", () => {
    const report = buildMicrocycle([day("current")], [log("archived")], "2026-10-18");
    expect(report.executionPct).toBe(0);
    expect(report.completedCount).toBe(0);
    expect(report.totalMinutes).toBe(35);
  });
  it("counts exact completed IDs once, excludes testing on both sides, and does not suggest progressing without RPE", () => {
    const report = buildMicrocycle(
      [day("current"), { ...day("test"), type: "testing" } as unknown as SessionDay],
      [log("current", null), log("current", null)],
      "2026-10-18",
    );
    expect(report.plannedCount).toBe(1);
    expect(report.completedCount).toBe(1);
    expect(report.executionPct).toBe(100);
    expect(report.nextWeekDirection).toContain("Uzupełnij RPE");
    expect(report.nextWeekDirection).not.toContain("Możesz progresować");
  });
  it("returns the pending second slot, then tomorrow, then no CTA when all are complete", () => {
    const plan = [{ ...day("first"), secondSession: day("second") }, day("tomorrow", "2026-10-19")];
    expect(nextActionableSession(plan, { first: completed }, "2026-10-18")).toMatchObject({
      dbId: "second",
      slot: 2,
    });
    expect(
      nextActionableSession(plan, { first: completed, second: completed }, "2026-10-18"),
    ).toMatchObject({ dbId: "tomorrow", slot: 1 });
    expect(
      nextActionableSession(
        plan,
        { first: completed, second: completed, tomorrow: completed },
        "2026-10-18",
      ),
    ).toBeNull();
  });
});
