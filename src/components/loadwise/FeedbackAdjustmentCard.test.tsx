// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackAdjustmentCard } from "./FeedbackAdjustmentCard";
import { initialState } from "@/lib/loadwise/store/model";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import type { Profile, SessionCompletion, SessionDay } from "@/lib/loadwise/types";

const mock = vi.hoisted(() => ({
  store: null as unknown as Record<string, unknown>,
  activate: vi.fn(),
}));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: () => mock.store }));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "card-test" } }) }));

const profile = {
  name: "Card athlete",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [1],
  individualTrainingDays: [2, 3, 4, 5, 6, 7],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  matchDates: [],
  equipment: [
    "barbell",
    "rack",
    "dumbbell",
    "machine",
    "band",
    "bench",
    "med_ball",
    "nordic_setup",
  ],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "full",
} as unknown as Profile;
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
function plan() {
  const days = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 2 }).plan;
  for (const d of days) {
    d.dayDbId = `day-${d.date}`;
    d.planDbId = "plan-1";
    slots(d).forEach((s, i) => {
      if (s.dayType !== "rest") s.dbId = `s-${s.date}-${i}`;
    });
  }
  return days;
}
const club = (patch: Partial<SessionCompletion> = {}): Record<string, SessionCompletion> => ({
  "s-2026-11-02-0": {
    completed: true,
    status: "completed",
    rpe: 8,
    notes: "",
    durationMin: 90,
    durationSource: "club_default",
    activityTags: ["technical"],
    feedbackVersion: 1,
    endedAt: "2026-11-02T19:30:00Z",
    ...patch,
  },
});
let root: Root, host: HTMLDivElement;
const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as
    HTMLButtonElement | undefined;
const setStore = (completions = club(), planDays = plan()) => {
  mock.store = {
    state: { ...initialState, profile, plan: planDays, completions, activePlanId: "plan-1" },
    todayIso: "2026-11-03",
    hydrated: true,
    syncing: false,
    activatePlanV2: mock.activate,
  };
};
const render = () => act(async () => root.render(<FeedbackAdjustmentCard />));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mock.activate.mockReset().mockResolvedValue(undefined);
  setStore();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("feedback adjustment card", () => {
  it("shows one calm card with concrete before/after lines and does not change anything by itself", async () => {
    await render();
    expect(host.textContent).toContain("Po ciężkim treningu klubowym");
    expect(host.querySelectorAll("li").length).toBeGreaterThan(0);
    expect(button("Zastosuj")).toBeTruthy();
    expect(button("Zostaw plan")).toBeTruthy();
    expect(mock.activate).not.toHaveBeenCalled();
  });

  it("shows nothing without heavy feedback, with RPE missing, or before hydration", async () => {
    setStore(club({ rpe: 6 }));
    await render();
    expect(host.textContent).toBe("");
    setStore(club({ rpe: null }));
    await render();
    expect(host.textContent).toBe("");
    setStore();
    (mock.store as { hydrated: boolean }).hydrated = false;
    await render();
    expect(host.textContent).toBe("");
  });

  it("'Zostaw plan' hides the card and leaves the saved plan untouched", async () => {
    await render();
    await act(async () => button("Zostaw plan")!.click());
    expect(host.textContent).toBe("");
    expect(mock.activate).not.toHaveBeenCalled();
  });

  it("'Zastosuj' writes once through the version-checked activation, from today, on the observed plan", async () => {
    let release!: () => void;
    mock.activate.mockImplementation(() => new Promise<void>((r) => (release = r)));
    await render();
    await act(async () => button("Zastosuj")!.click());
    await act(async () => button("Zastosuj")?.click());
    expect(mock.activate).toHaveBeenCalledTimes(1);
    const result = mock.activate.mock.calls[0][0];
    expect(result.expectedPlanId).toBe("plan-1");
    expect(result.plan[0].date).toBe("2026-11-03");
    expect(result.plan.some((d: SessionDay) => d.feedbackAdjustments?.length)).toBe(true);
    await act(async () => release());
  });

  it("a failed or conflicting write is shown as an error, keeps the card and is not reported as success", async () => {
    mock.activate.mockRejectedValueOnce(new Error("Plan zmienił się na innym urządzeniu."));
    await render();
    await act(async () => button("Zastosuj")!.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("innym urządzeniu");
    expect(button("Zastosuj")).toBeTruthy();
    expect(host.textContent).not.toContain("Zapisano");
  });

  it("does not offer the same proposal again once it is part of the saved plan", async () => {
    await render();
    await act(async () => button("Zastosuj")!.click());
    const applied = mock.activate.mock.calls[0][0].plan as SessionDay[];
    setStore(club(), [...plan().filter((d) => d.date < "2026-11-03"), ...applied]);
    await render();
    expect(host.textContent).toBe("");
  });
});
