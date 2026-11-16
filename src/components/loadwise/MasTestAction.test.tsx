// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MasTestAction } from "./MasTestAction";
import { initialState } from "@/lib/loadwise/store/model";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import type { Profile, SessionDay } from "@/lib/loadwise/types";

const mock = vi.hoisted(() => ({
  store: null as unknown as Record<string, unknown>,
  activate: vi.fn(),
}));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: () => mock.store }));

const profile = {
  name: "Mas athlete",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "endurance",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [3, 6],
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
  doubleSessionsAllowed: "no",
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
const plan = () => {
  const days = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 2 }).plan;
  for (const d of days) {
    d.dayDbId = `day-${d.date}`;
    d.planDbId = "plan-1";
    slots(d).forEach((s, i) => {
      if (s.dayType !== "rest") s.dbId = `s-${s.date}-${i}`;
    });
  }
  return days;
};
let root: Root, host: HTMLDivElement;
const button = (t: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(t)) as
    HTMLButtonElement | undefined;
const set = (p: Profile = profile) => {
  mock.store = {
    state: { ...initialState, profile: p, plan: plan(), activePlanId: "plan-1" },
    todayIso: "2026-11-03",
    hydrated: true,
    syncing: false,
    activatePlanV2: mock.activate,
  };
};
const render = () => act(async () => root.render(<MasTestAction />));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mock.activate.mockReset().mockResolvedValue(undefined);
  set();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("starts with a compact row and offers the test only to eligible athletes", async () => {
  await render();
  expect(host.querySelector(".bw-plan-mas-row")?.textContent).toBe("Test biegowy 5 minUstal tempo");
  expect(button("Ustal tempo")).toBeTruthy();
  const details = host.querySelector<HTMLElement>(".bw-plan-mas-details")!;
  expect(details.hidden).toBe(true);
  expect(button("Ustal tempo")?.getAttribute("aria-controls")).toBe(details.id);
  expect(host.textContent).not.toContain("Jest dobrowolny");
  expect(host.textContent).not.toContain("GPS");
  expect(mock.activate).not.toHaveBeenCalled();
  set({ ...profile, age: 15 });
  await render();
  expect(host.textContent).toBe("");
  set({
    ...profile,
    fieldMasKmh: 15,
    fieldMasTestedAt: "2026-10-30",
    fieldMasSourceSessionId: "s",
  } as Profile);
  await render();
  expect(host.textContent).toBe("");
});

it("shows what it replaces, saves only on 'Zastosuj' and writes once through the plan activation", async () => {
  let finishSave!: () => void;
  mock.activate.mockImplementationOnce(
    () => new Promise<void>((resolve) => (finishSave = resolve)),
  );
  await render();
  await act(async () => button("Ustal tempo")!.click());
  expect(host.querySelector<HTMLElement>(".bw-plan-mas-details")?.hidden).toBe(false);
  expect(host.textContent).toContain(
    "Test 5 minut ustala Twoje tempo do kolejnych biegów. Jest dobrowolny.",
  );
  expect(host.textContent).toContain(
    "Ustal tempo: dobrowolny test 5-minutowy zamiast jednego spokojnego biegu.",
  );
  expect(host.textContent).toContain("zastąpiony testem 5 min");
  expect(host.textContent).toContain("Bez dystansu nie ustalimy tempa");
  expect(mock.activate).not.toHaveBeenCalled();
  await act(async () => button("Zastosuj")!.click());
  expect(mock.activate).toHaveBeenCalledTimes(1);
  const result = mock.activate.mock.calls[0][0];
  expect(result.expectedPlanId).toBe("plan-1");
  expect(
    result.plan
      .flatMap(slots)
      .some((s: SessionDay) => s.runningRecipe?.method === "field_mas_test"),
  ).toBe(true);
  expect(button("Zapisywanie…")?.disabled).toBe(true);
  expect(button("Anuluj")?.disabled).toBe(true);
  expect(host.querySelector<HTMLElement>(".bw-plan-mas-details")?.hidden).toBe(false);
  await act(async () => finishSave());
  expect(button("Ustal tempo")).toBeTruthy();
  expect(host.querySelector<HTMLElement>(".bw-plan-mas-details")?.hidden).toBe(true);
});

it("'Anuluj' leaves the plan alone and a failed write is shown, not reported as saved", async () => {
  await render();
  await act(async () => button("Ustal tempo")!.click());
  await act(async () => button("Anuluj")!.click());
  expect(button("Ustal tempo")).toBeTruthy();
  expect(host.textContent).not.toContain("Jest dobrowolny");
  expect(mock.activate).not.toHaveBeenCalled();
  mock.activate.mockRejectedValueOnce(new Error("Brak połączenia"));
  await act(async () => button("Ustal tempo")!.click());
  await act(async () => button("Zastosuj")!.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Brak połączenia");
  expect(button("Zastosuj")).toBeTruthy();
  expect(host.textContent).toContain("Bez dystansu nie ustalimy tempa");
  expect(mock.activate).toHaveBeenCalledTimes(1);
});

it("reveals the full refusal reason and test details only after requesting the test", async () => {
  mock.store = { ...mock.store, todayIso: "2026-11-16" };
  await render();
  expect(host.textContent).not.toContain("Plan nie obejmuje dzisiejszego dnia.");
  await act(async () => button("Ustal tempo")!.click());
  expect(host.textContent).toContain("Plan nie obejmuje dzisiejszego dnia.");
  expect(host.textContent).toContain("Jest dobrowolny.");
  expect(host.textContent).toContain("zapisanego dystansu (GPS) i czasu");
  expect(button("Zastosuj")).toBeUndefined();
  expect(mock.activate).not.toHaveBeenCalled();
  await act(async () => button("Zamknij")!.click());
  expect(host.textContent).not.toContain("Plan nie obejmuje dzisiejszego dnia.");
  expect(button("Ustal tempo")).toBeTruthy();
});

it("keeps an outdated proposal open with an error instead of saving it", async () => {
  await render();
  await act(async () => button("Ustal tempo")!.click());
  mock.store = { ...mock.store, todayIso: "2026-11-16" };
  await render();
  await act(async () => button("Zastosuj")!.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    "Plan zmienił się. Zacznij od nowa.",
  );
  expect(host.textContent).toContain("zastąpiony testem 5 min");
  expect(button("Anuluj")?.disabled).toBe(false);
  expect(mock.activate).not.toHaveBeenCalled();
});
