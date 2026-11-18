// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReadinessAdjustmentCard } from "./ReadinessAdjustmentCard";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import { gymAthlete } from "@/lib/loadwise/engineV2/testFixtures";
import { buildReadiness } from "@/lib/loadwise/readinessModel";
import { READINESS_ADJUSTMENT_REASON } from "@/lib/loadwise/todayReadinessAdjustment";
import type { Profile, SessionDay, SessionModification } from "@/lib/loadwise/types";

const mocks = vi.hoisted(() => ({ useLoadwise: vi.fn() }));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: mocks.useLoadwise }));

const profile: Profile = {
  ...gymAthlete,
  age: 21,
  goal: "strength",
  healthPersonalizationEnabled: true,
};
const plan: SessionDay[] = generateTrainingPlan(profile, {
  startDate: "2026-11-16",
  weeks: 1,
  sessionDurationMode: "full",
  weeklyTargets: { strength: 2, speed: "auto", endurance: 1 },
  fillRestDays: true,
  minFullRestDays: 1,
}).plan.map((day, i) => ({ ...day, dbId: `s${i}`, dayDbId: `d${i}`, planDbId: "plan" }));
const strength = plan.find((day) => day.engineV2?.roles.includes("strengthA"))!;
const today = strength.date;

let root: Root, host: HTMLDivElement;
const apply = vi.fn(async () => {});
const undo = vi.fn(async () => {});
const render = (state: Record<string, unknown>) => {
  mocks.useLoadwise.mockImplementation(() => ({
    state: { profile, plan, completions: {}, readiness: {}, modifications: {}, ...state },
    applyModification: apply,
    undoModification: undo,
  }));
  return act(async () => root.render(<ReadinessAdjustmentCard todayIso={today} />));
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("a skipped check-in leaves the full session and shows nothing", async () => {
  await render({});
  expect(apply).not.toHaveBeenCalled();
  expect(host.textContent).toBe("");
});

it("an adequate check-in leaves the full session", async () => {
  await render({
    readiness: {
      [today]: buildReadiness(today, { sleep: 9, fatigue: 2, soreness: 2, jointPain: 0 }),
    },
  });
  expect(apply).not.toHaveBeenCalled();
});

it("a low check-in stores today's lighter session once, then explains what changed after a refresh", async () => {
  const readiness = buildReadiness(today, { sleep: 2, fatigue: 9, soreness: 8, jointPain: 0 });
  await render({ readiness: { [today]: readiness } });
  expect(apply).toHaveBeenCalledTimes(1);
  const [date, type, next, original, reason] = apply.mock.calls[0] as unknown as [
    string,
    string,
    SessionDay,
    SessionDay,
    string,
  ];
  expect(date).toBe(today);
  expect(type).toBe("swap");
  expect(reason.startsWith(READINESS_ADJUSTMENT_REASON)).toBe(true);
  expect(original.date).toBe(today);
  expect(next.readinessAdjustment?.changes.length).toBeGreaterThan(0);
  // Re-render with the same state does not store it twice.
  await render({ readiness: { [today]: readiness } });
  expect(apply).toHaveBeenCalledTimes(1);
  // After the refresh the stored overlay is the day: the card explains it and does nothing more.
  const overlay = {
    id: "m1",
    date: today,
    type: "swap",
    reason,
    safetyStatus: "swapped_by_user",
    session: { ...next, dbId: "adjusted" },
    originalSession: original,
    createdAt: "2026-11-16T07:00:00Z",
  } as unknown as SessionModification;
  apply.mockClear();
  await render({ readiness: { [today]: readiness }, modifications: { [today]: [overlay] } });
  expect(apply).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Trening dostosowany do check-inu");
  expect(host.textContent).toContain(`${readiness.overall}/10`);
  expect(host.querySelectorAll("li").length).toBeGreaterThan(0);
});

it("pain does not rewrite the recipe: the start block stays the answer", async () => {
  await render({
    readiness: {
      [today]: buildReadiness(today, {
        sleep: 8,
        fatigue: 3,
        soreness: 3,
        jointPain: 4,
        painLocation: "knee",
        altersMovement: true,
      }),
    },
  });
  expect(apply).not.toHaveBeenCalled();
});

it("a started session is not touched", async () => {
  const readiness = buildReadiness(today, { sleep: 2, fatigue: 9, soreness: 8, jointPain: 0 });
  await render({
    readiness: { [today]: readiness },
    completions: { [strength.dbId!]: { completed: false, status: "started", rpe: 0, notes: "" } },
  });
  expect(apply).not.toHaveBeenCalled();
});
