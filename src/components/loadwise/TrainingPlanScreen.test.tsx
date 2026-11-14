// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { PlanScreen } from "./TrainingPlanScreen";
import { buildProfile, initialState } from "@/lib/loadwise/store/model";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import type { LoadwiseState, SessionDay } from "@/lib/loadwise/types";
import { trainingStorageKey } from "@/lib/loadwise/trainingDetails";
const mock = vi.hoisted(() => ({
  store: null as unknown as Record<string, unknown>,
  activate: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: () => mock.store }));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "plan-test" } }) }));
vi.mock("@/components/loadwise/ui", () => ({ AppHeader: () => null }));
vi.mock("@tanstack/react-router", async (importActual) => ({
  ...(await importActual<object>()),
  useNavigate: () => mock.navigate,
}));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mock.activate.mockReset();
  mock.navigate.mockReset();
  mock.store = {
    state: {
      ...initialState,
      profile: buildProfile({ full_name: "Test" }, { age: 20, position: "midfielder" }, null),
    },
    todayIso: "2026-11-02",
    hydrated: true,
    syncing: false,
    activatePlanV2: mock.activate,
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("shows the four-week preview and only saves after an explicit click", async () => {
  await act(async () => root.render(<PlanScreen />));
  expect(mock.activate).not.toHaveBeenCalled();
  expect(host.textContent).toContain("4 tygodnie");
  expect(host.textContent).toContain("2026-11-29");
  const save = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.startsWith("Zapisz plan"),
  )!;
  await act(async () => save.click());
  expect(mock.activate).toHaveBeenCalledOnce();
  expect(mock.activate.mock.calls[0][0].plan).toHaveLength(28);
});
it("keeps the preview and explains a failed write instead of claiming success", async () => {
  mock.activate.mockRejectedValueOnce(new Error("Brak połączenia"));
  await act(async () => root.render(<PlanScreen />));
  const save = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.startsWith("Zapisz plan"),
  )!;
  await act(async () => save.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Brak połączenia");
  expect(host.textContent).toContain("Podgląd");
  expect(host.textContent).not.toContain("Otwórz trening");
});
it("does not enable writes until hydration finishes", async () => {
  mock.store.hydrated = false;
  await act(async () => root.render(<PlanScreen />));
  const save = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.startsWith("Zapisz plan"),
  )!;
  expect(save.disabled).toBe(true);
});

it("restores the saved time budget after hydration and uses it when rebuilding", async () => {
  await act(async () => root.render(<PlanScreen />));
  const state = mock.store.state as LoadwiseState;
  const saved = generateTrainingPlan(state.profile!, {
    startDate: "2026-11-02",
    weeks: 1,
    minutesPerSession: 35,
  }).plan;
  mock.store.state = { ...state, activePlanId: "saved-budget", plan: saved };
  await act(async () => root.render(<PlanScreen />));
  const time = host.querySelector<HTMLSelectElement>('select[aria-label="Czas na jednostkę"]')!;
  expect(time.value).toBe("35");
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Przygotuj kolejny plan"))!
      .click(),
  );
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent?.startsWith("Zapisz plan"))!
      .click(),
  );
  expect(mock.activate.mock.calls[0][0].minutesPerSession).toBe(35);
});

it("does not carry an unsaved budget choice into another saved plan", async () => {
  await act(async () => root.render(<PlanScreen />));
  const time = host.querySelector<HTMLSelectElement>('select[aria-label="Czas na jednostkę"]')!;
  await act(async () => {
    time.value = "45";
    time.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(time.value).toBe("45");
  const state = mock.store.state as LoadwiseState;
  const plan = generateTrainingPlan(state.profile!, {
    startDate: "2026-11-02",
    weeks: 1,
    minutesPerSession: 60,
  }).plan;
  mock.store.state = { ...state, activePlanId: "different-plan", plan };
  await act(async () => root.render(<PlanScreen />));
  expect(
    host.querySelector<HTMLSelectElement>('select[aria-label="Czas na jednostkę"]')!.value,
  ).toBe("60");
});

it("recognizes an expired cycle and prepares today's next window only on request", async () => {
  const state = mock.store.state as LoadwiseState;
  const old = generateTrainingPlan(state.profile!, { startDate: "2026-10-05", weeks: 4 }).plan;
  mock.store.state = { ...state, activePlanId: "old-cycle", plan: old };
  await act(async () => root.render(<PlanScreen />));
  expect(host.textContent).toContain("Cykl zakończony");
  expect(host.textContent).not.toContain("Twój plan · 4 tygodnie");
  expect(mock.activate).not.toHaveBeenCalled();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Przygotuj kolejny plan")!
      .click(),
  );
  expect(host.textContent).toContain("Nowy plan rozpoczyna się 2026-11-02");
  expect(host.textContent).toContain("2026-11-29");
  expect((mock.store.state as LoadwiseState).plan).toBe(old);
  expect(mock.activate).not.toHaveBeenCalled();
});

it("offers an explicit profile update and lets the player return to the saved snapshot", async () => {
  const state = mock.store.state as LoadwiseState;
  const saved = generateTrainingPlan(state.profile!, { startDate: "2026-11-02", weeks: 1 }).plan;
  mock.store.state = { ...state, plan: saved, profile: { ...state.profile!, goal: "speed" } };
  await act(async () => root.render(<PlanScreen />));
  expect(host.textContent).toContain("Profil zmienił się");
  await act(async () =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Zaktualizuj plan")!.click(),
  );
  expect(host.textContent).toContain("Twój plan · 4 tygodnie");
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Wróć do zapisanego planu")!
      .click(),
  );
  expect(host.textContent).not.toContain("Twój plan · 4 tygodnie");
  expect((mock.store.state as LoadwiseState).plan).toBe(saved);
  expect(mock.activate).not.toHaveBeenCalled();
});

it("prepares the next preview from the confirmed choices, continues the cycle and carries the summary", async () => {
  const state = mock.store.state as LoadwiseState;
  // A profile with real training days, so the ended cycle contains own sessions to summarize.
  const profile = {
    ...state.profile!,
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    hasPitch: true,
    hasSprintSpace: true,
  };
  const old = generateTrainingPlan(profile, { startDate: "2026-10-05", weeks: 4 }).plan;
  expect(old.some((d) => d.engineV2 || d.secondSession?.engineV2)).toBe(true);
  mock.store.state = { ...state, profile, activePlanId: "old-cycle", plan: old };
  localStorage.setItem(
    trainingStorageKey("next-plan-intent", "plan-test"),
    JSON.stringify({ planId: "old-cycle", minutes: 45, createdAt: "2026-11-02T08:00:00Z" }),
  );
  await act(async () => root.render(<PlanScreen />));
  // The preview opens by itself, with the chosen budget, and nothing is saved yet.
  expect(host.textContent).toContain("Twój plan · 4 tygodnie");
  expect(
    host.querySelector<HTMLSelectElement>('select[aria-label="Czas na jednostkę"]')!.value,
  ).toBe("45");
  expect(mock.activate).not.toHaveBeenCalled();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent?.startsWith("Zapisz plan"))!
      .click(),
  );
  const result = mock.activate.mock.calls[0][0];
  expect(result.minutesPerSession).toBe(45);
  expect(result.expectedPlanId).toBe("old-cycle");
  // the summary of the ended cycle is stamped on the new plan, so it stays in Progress
  expect(result.plan[0].cycleStart.review).toMatchObject({
    startDate: "2026-10-05",
    endDate: "2026-11-01",
  });
  expect(result.plan.every((d: { cycleStart?: unknown }) => d.cycleStart)).toBe(true);
  // the saved cycle is continued, not reset: week 5 of the same block
  const first = result.plan
    .flatMap((d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])])
    .find((s: SessionDay) => s.engineV2?.cycle)!;
  expect(first.engineV2!.cycle!.anchorDate).toBe("2026-10-05");
  expect(first.engineV2!.cycle!.weekIndex).toBeGreaterThanOrEqual(4);
});

it("ignores confirmed choices that belong to another saved plan", async () => {
  const state = mock.store.state as LoadwiseState;
  const old = generateTrainingPlan(state.profile!, { startDate: "2026-10-05", weeks: 4 }).plan;
  mock.store.state = { ...state, activePlanId: "old-cycle", plan: old };
  localStorage.setItem(
    trainingStorageKey("next-plan-intent", "plan-test"),
    JSON.stringify({ planId: "some-other-plan", minutes: 30, createdAt: "2026-11-02T08:00:00Z" }),
  );
  await act(async () => root.render(<PlanScreen />));
  expect(host.textContent).not.toContain("Twój plan · 4 tygodnie");
  expect(host.textContent).toContain("Cykl zakończony");
});

it("'Wróć do zapisanego planu' drops the confirmed choices instead of reopening the preview", async () => {
  const state = mock.store.state as LoadwiseState;
  const old = generateTrainingPlan(state.profile!, { startDate: "2026-10-05", weeks: 4 }).plan;
  mock.store.state = { ...state, activePlanId: "old-cycle", plan: old };
  const key = trainingStorageKey("next-plan-intent", "plan-test");
  localStorage.setItem(
    key,
    JSON.stringify({ planId: "old-cycle", minutes: 45, createdAt: "2026-11-02T08:00:00Z" }),
  );
  await act(async () => root.render(<PlanScreen />));
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Wróć do zapisanego planu")!
      .click(),
  );
  expect(host.textContent).not.toContain("Twój plan · 4 tygodnie");
  expect(localStorage.getItem(key)).toBe("null");
});

it("proposes an update after a moved match: names the change, shows the next days, saves only on request", async () => {
  const state = mock.store.state as LoadwiseState;
  const profile = {
    ...state.profile!,
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    hasPitch: true,
    hasSprintSpace: true,
    matchDates: ["2026-11-06"],
  };
  const saved = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 4 }).plan;
  mock.store.state = {
    ...state,
    profile: { ...profile, matchDates: ["2026-11-04"] },
    activePlanId: "saved",
    plan: saved,
  };
  await act(async () => root.render(<PlanScreen />));
  expect(host.textContent).toContain("Terminy meczów: 6.11 → 4.11");
  expect(mock.activate).not.toHaveBeenCalled();
  await act(async () =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Zaktualizuj plan")!.click(),
  );
  expect(host.textContent).toContain("Najbliższe 7 dni · zmiany");
  // the scope of the write is named before saving, including changes beyond the nearest week
  expect(host.textContent).toContain("Zapis zastąpi plan od 2026-11-02 do 2026-11-29");
  expect(host.textContent).toMatch(/Zmiany: \d+ w najbliższych 7 dniach/);
  expect(mock.activate).not.toHaveBeenCalled();
});

it("a change that reaches later weeks says so before the save", async () => {
  const state = mock.store.state as LoadwiseState;
  const profile = {
    ...state.profile!,
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    hasPitch: true,
    hasSprintSpace: true,
  };
  const saved = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 4 }).plan;
  // a lasting change (fewer available days) alters every week, not only the next seven days
  mock.store.state = {
    ...state,
    profile: { ...profile, individualTrainingDays: [2, 4] },
    activePlanId: "saved",
    plan: saved,
  };
  await act(async () => root.render(<PlanScreen />));
  await act(async () =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Zaktualizuj plan")!.click(),
  );
  expect(host.textContent).toContain("Dalsze tygodnie · zmiany");
  expect(host.textContent).toMatch(/w dalszych tygodniach \(poniżej\)/);
  expect(mock.activate).not.toHaveBeenCalled();
});

it("a new time budget opens a preview of the nearest sessions instead of changing the plan silently", async () => {
  const state = mock.store.state as LoadwiseState;
  const profile = {
    ...state.profile!,
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    hasPitch: true,
    hasSprintSpace: true,
  };
  const saved = generateTrainingPlan(profile, {
    startDate: "2026-11-02",
    weeks: 4,
    minutesPerSession: 75,
  }).plan;
  mock.store.state = { ...state, profile, activePlanId: "saved", plan: saved };
  await act(async () => root.render(<PlanScreen />));
  expect(host.textContent).not.toContain("Twój plan · 4 tygodnie");
  const time = host.querySelector<HTMLSelectElement>('select[aria-label="Czas na jednostkę"]')!;
  await act(async () => {
    time.value = "30";
    time.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.textContent).toContain("Twój plan · 4 tygodnie");
  expect(host.textContent).toContain("Czas na jednostkę: 75 → 30 min");
  expect(mock.activate).not.toHaveBeenCalled();
});
