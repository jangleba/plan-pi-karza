// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { PlanScreen } from "./TrainingPlanScreen";
import { buildProfile, initialState } from "@/lib/loadwise/store/model";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import type { LoadwiseState, SessionDay } from "@/lib/loadwise/types";
import type { PlanGymEvidence } from "@/lib/loadwise/planEvidence";
import { enqueueTrainingWrite } from "@/lib/loadwise/offlineTrainingQueue";
import { trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import { weeklyTargetCoverage } from "@/lib/loadwise/engineV2/weeklyTargets";
const mock = vi.hoisted(() => ({
  ownerId: "plan-test",
  store: null as unknown as Record<string, unknown>,
  activate: vi.fn(),
  navigate: vi.fn(),
  gym: { loading: false, available: true, records: [] } as PlanGymEvidence,
}));
vi.mock("@/lib/loadwise/useGymEvidence", () => ({ useGymEvidence: () => mock.gym }));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: () => mock.store }));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: mock.ownerId } }) }));
vi.mock("@/components/loadwise/ui", () => ({
  AppHeader: ({ right }: { right?: import("react").ReactNode }) => right ?? null,
}));
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
  mock.ownerId = "plan-test";
  mock.gym = { loading: false, available: true, records: [] };
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
it("shows the one-week preview and only saves after an explicit click", async () => {
  await act(async () => root.render(<PlanScreen />));
  expect(mock.activate).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Twój plan · 1 tydzień");
  expect(host.textContent).toContain("8 listopada");
  const save = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.startsWith("Zapisz plan"),
  )!;
  await act(async () => save.click());
  expect(mock.activate).toHaveBeenCalledOnce();
  expect(mock.activate.mock.calls[0][0].plan).toHaveLength(7);
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

it("defaults a new plan to whole sessions and limits time only after a deliberate choice", async () => {
  await act(async () => root.render(<PlanScreen />));
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Czas na jednostkę"]')!;
  expect(select.value).toBe("full");
  expect(mock.activate).not.toHaveBeenCalled();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent?.startsWith("Zapisz plan"))!
      .click(),
  );
  expect(mock.activate.mock.calls[0][0].sessionDurationMode).toBe("full");
  expect(mock.activate.mock.calls[0][0].plan[0].planInputs.sessionDurationMode).toBe("full");
  mock.activate.mockClear();
  await act(async () => {
    select.value = "30";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(select.value).toBe("30");
  expect(mock.activate).not.toHaveBeenCalled();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent?.startsWith("Zapisz plan"))!
      .click(),
  );
  expect(mock.activate.mock.calls[0][0]).toMatchObject({
    sessionDurationMode: "limited",
    minutesPerSession: 30,
  });
});

it("does not carry an unsaved time limit into another account's new plan", async () => {
  await act(async () => root.render(<PlanScreen />));
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Czas na jednostkę"]')!;
  await act(async () => {
    select.value = "30";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(select.value).toBe("30");
  mock.ownerId = "another-plan-athlete";
  await act(async () => root.render(<PlanScreen />));
  expect(select.value).toBe("full");
  expect(mock.activate).not.toHaveBeenCalled();
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

it("previews explicit weekly targets and saves the same choices only on request", async () => {
  await act(async () => root.render(<PlanScreen />));
  expect(host.querySelector('[aria-label="Pokrycie celów tygodniowych"]')).toBeNull();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "2 siłowe · 1 bieg · sprint automatycznie")!
      .click(),
  );
  expect(mock.activate).not.toHaveBeenCalled();
  expect(host.querySelector('[aria-label="Sprinty na tydzień"]')).toBeNull();
  expect(host.querySelector('[aria-label="Liczba sesji sprintu"]')?.textContent).toContain(
    "automatycznie",
  );
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Biegi na tydzień"]')!.value).toBe("1");
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Pełne dni odpoczynku"]')!.value).toBe(
    "1",
  );
  expect(host.querySelector<HTMLInputElement>(".bw-weekly-check input")!.checked).toBe(true);
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent?.startsWith("Zapisz plan"))!
      .click(),
  );
  const result = mock.activate.mock.calls[0][0];
  const targets = { strength: 2, speed: "auto", endurance: 1 } as const;
  expect(result.plan[0].planInputs).toMatchObject({
    weeklyTargets: targets,
    minFullRestDays: 1,
    fillRestDays: true,
  });
  // Counts come from physical slots, even if the profile cannot meet the request.
  const actual = weeklyTargetCoverage(result.plan, targets)[0];
  const cells = [...host.querySelectorAll(".bw-weekly-coverage details:first-of-type td")].map(
    (cell) => cell.textContent,
  );
  expect(cells).toEqual([
    `${actual.planned.strength} / 2`,
    `${actual.planned.speed} · automatycznie`,
    `${actual.planned.endurance} / 1`,
    `${actual.fullRestDays} / min. 1`,
  ]);
});

it("restores saved weekly choices and can explicitly reset them to the profile policy", async () => {
  const state = mock.store.state as LoadwiseState;
  const profile = { ...state.profile!, goal: "endurance" as const };
  const saved = generateTrainingPlan(profile, {
    startDate: "2026-11-02",
    weeks: 1,
    weeklyTargets: { strength: 2, speed: 2, endurance: 1 },
    fillRestDays: true,
    minFullRestDays: 1,
  }).plan;
  mock.store.state = { ...state, profile, plan: saved, activePlanId: "weekly-saved" };
  await act(async () => root.render(<PlanScreen />));
  expect(host.querySelector('[aria-label="Sprinty na tydzień"]')).toBeNull();
  expect(host.querySelector('[aria-label="Liczba sesji sprintu"]')?.textContent).toContain(
    "automatycznie",
  );
  expect(mock.activate).not.toHaveBeenCalled();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Automatycznie z profilu")!
      .click(),
  );
  expect(host.querySelector('[aria-label="Pokrycie celów tygodniowych"]')).toBeNull();
  expect(mock.activate).not.toHaveBeenCalled();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent?.startsWith("Zapisz plan"))!
      .click(),
  );
  const snapshot = mock.activate.mock.calls[0][0].plan[0].planInputs;
  expect(snapshot).not.toHaveProperty("weeklyTargets");
  expect(snapshot).not.toHaveProperty("fillRestDays");
  expect(snapshot).not.toHaveProperty("minFullRestDays");
});

it("drops an unsaved weekly request when another plan arrives and on return to the saved plan", async () => {
  const state = mock.store.state as LoadwiseState;
  const saved = generateTrainingPlan(state.profile!, { startDate: "2026-11-02", weeks: 1 }).plan;
  mock.store.state = { ...state, plan: saved, activePlanId: "first" };
  await act(async () => root.render(<PlanScreen />));
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "2 siłowe · 1 bieg · sprint automatycznie")!
      .click(),
  );
  expect(host.querySelector('[aria-label="Biegi na tydzień"]')).not.toBeNull();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Wróć do zapisanego planu")!
      .click(),
  );
  expect(host.querySelector('[aria-label="Biegi na tydzień"]')).toBeNull();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "2 siłowe · 1 bieg · sprint automatycznie")!
      .click(),
  );
  const other = generateTrainingPlan(state.profile!, {
    startDate: "2026-11-02",
    weeks: 1,
    weeklyTargets: { strength: 2, speed: 1, endurance: 2 },
    fillRestDays: false,
    minFullRestDays: 2,
  }).plan;
  mock.store.state = { ...state, plan: other, activePlanId: "other" };
  await act(async () => root.render(<PlanScreen />));
  expect(host.querySelector('[aria-label="Sprinty na tydzień"]')).toBeNull();
  expect(host.querySelector('[aria-label="Liczba sesji sprintu"]')?.textContent).toContain(
    "automatycznie",
  );
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Biegi na tydzień"]')!.value).toBe("2");
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Pełne dni odpoczynku"]')!.value).toBe(
    "2",
  );
  expect(host.querySelector<HTMLInputElement>(".bw-weekly-check input")!.checked).toBe(false);
  expect(mock.activate).not.toHaveBeenCalled();
});

it("restores the saved time budget when rejecting a preview before changing weekly targets", async () => {
  const state = mock.store.state as LoadwiseState;
  const saved = generateTrainingPlan(state.profile!, {
    startDate: "2026-11-02",
    weeks: 1,
    minutesPerSession: 75,
  }).plan;
  mock.store.state = { ...state, plan: saved, activePlanId: "saved" };
  await act(async () => root.render(<PlanScreen />));
  await act(async () => {
    const time = host.querySelector<HTMLSelectElement>('[aria-label="Czas na jednostkę"]')!;
    time.value = "45";
    time.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Wróć do zapisanego planu")!
      .click(),
  );
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Czas na jednostkę"]')!.value).toBe(
    "75",
  );
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "2 siłowe · 1 bieg · sprint automatycznie")!
      .click(),
  );
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent?.startsWith("Zapisz plan"))!
      .click(),
  );
  expect(mock.activate.mock.calls[0][0].minutesPerSession).toBe(75);
});

it("recognizes an expired cycle and prepares today's next window only on request", async () => {
  const state = mock.store.state as LoadwiseState;
  const old = generateTrainingPlan(state.profile!, { startDate: "2026-10-05", weeks: 4 }).plan;
  mock.store.state = { ...state, activePlanId: "old-cycle", plan: old };
  await act(async () => root.render(<PlanScreen />));
  expect(host.textContent).toContain("Cykl zakończony");
  expect(host.textContent).not.toContain("Twój plan · 1 tydzień");
  expect(mock.activate).not.toHaveBeenCalled();
  // The next week is never prepared here: the question about its match comes first (Progress).
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Przygotuj kolejny plan")!
      .click(),
  );
  expect(mock.navigate).toHaveBeenCalledWith({ to: "/postep" });
  expect(host.textContent).not.toContain("Twój plan · 1 tydzień");
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
  expect(host.textContent).toContain("Twój plan · 1 tydzień");
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Wróć do zapisanego planu")!
      .click(),
  );
  expect(host.textContent).not.toContain("Twój plan · 1 tydzień");
  expect((mock.store.state as LoadwiseState).plan).toBe(saved);
  expect(mock.activate).not.toHaveBeenCalled();
});

it("keeps the refresh reason in plan settings and the week alone on screen", async () => {
  const state = mock.store.state as LoadwiseState;
  const profile = {
    ...state.profile!,
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    hasPitch: true,
    hasSprintSpace: true,
  };
  const saved = generateTrainingPlan(profile, {
    startDate: "2026-11-02",
    weeks: 1,
  }).plan.map((day) => ({ ...day, generatorVersion: "ballwise-v2.old" }));
  mock.store.state = { ...state, profile, plan: saved };
  await act(async () => root.render(<PlanScreen />));
  const panel = host.querySelector<HTMLElement>(".bw-plan-settings-panel")!;
  expect(panel.hidden).toBe(true);
  // The default screen: settings button and the week, nothing else above it.
  const main = host.querySelector(".bw-plan-stack")!;
  expect(main.textContent).not.toMatch(/Test biegowy|kalibr|Plan wymaga|Ograniczenia/);
  expect(main.querySelector("details")).toBeNull();
  expect(main.querySelector(".bw-wk")).not.toBeNull();
  const button = host.querySelector<HTMLButtonElement>(".bw-plan-settings-button")!;
  expect(button.getAttribute("aria-label")).toBe("Ustawienia planu, wymagają uwagi");
  await act(async () => button.click());
  expect(panel.hidden).toBe(false);
  expect(panel.querySelector('.bw-plan-status-row [role="status"]')?.textContent).toBe(
    "Plan wymaga odświeżenia",
  );
  expect(panel.textContent).toContain(
    "Dostępna jest aktualna wersja silnika. Przygotuj plan ponownie.",
  );
  await act(async () => panel.querySelector<HTMLButtonElement>(".bw-plan-settings-close")!.click());
  expect(panel.hidden).toBe(true);
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
  expect(host.textContent).toContain("Twój plan · 1 tydzień");
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
  expect(host.textContent).not.toContain("Twój plan · 1 tydzień");
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
  expect(host.textContent).not.toContain("Twój plan · 1 tydzień");
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
  expect(host.textContent).toContain("Zapis zastąpi plan od 2 listopada do 29 listopada");
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
  // The preview card stays short; the change details are one tap away in plan settings.
  expect(host.querySelector(".bw-plan-preview-meta")?.textContent).toContain("29 listopada");
  expect(host.querySelector(".bw-plan-preview details")).toBeNull();
  const panel = host.querySelector<HTMLElement>(".bw-plan-settings-panel")!;
  await act(async () =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Szczegóły zmian")!.click(),
  );
  expect(panel.hidden).toBe(false);
  expect(panel.textContent).toContain("Zapis zastąpi plan od 2 listopada do 29 listopada");
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

it.each(["loading", "failed", "pending"])(
  "blocks plan preparation with %s gym evidence",
  async (status) => {
    mock.gym = {
      loading: status === "loading",
      available: status !== "failed",
      records:
        status === "pending" ? [{ pending: true } as PlanGymEvidence["records"][number]] : [],
    };
    await act(async () => root.render(<PlanScreen />));
    const save = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Zapisz plan"),
    );
    expect(save == null || save.disabled).toBe(true);
    expect(host.querySelector('[role="status"]')?.textContent).toBeTruthy();
    const evidence = host.querySelector(".bw-plan-notice")!;
    expect(evidence.getAttribute("role")).toBe("status");
    expect(evidence.closest("details")).toBeNull();
    expect(mock.activate).not.toHaveBeenCalled();
  },
);
it("invalidates the evidence lease if gym records change after the preview", async () => {
  await act(async () => root.render(<PlanScreen />));
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent?.startsWith("Zapisz plan"))!
      .click(),
  );
  const isCurrent = mock.activate.mock.calls[0][1] as () => boolean;
  expect(isCurrent()).toBe(true);
  mock.gym = {
    ...mock.gym,
    records: [
      {
        record_key: "changed",
        revision: 2,
        payload: {
          kind: "band_selection",
          version: 1,
          exerciseId: "gym_cmj_resisted",
          setupId: null,
        },
      } as PlanGymEvidence["records"][number],
    ],
  };
  await act(async () => root.render(<PlanScreen />));
  expect(isCurrent()).toBe(false);
});
it("a new queued write blocks a preview without waiting for a profile reload", async () => {
  await act(async () => root.render(<PlanScreen />));
  expect(
    [...host.querySelectorAll("button")].some((b) => b.textContent?.startsWith("Zapisz plan")),
  ).toBe(true);
  await act(async () => {
    enqueueTrainingWrite("plan-test", {
      kind: "gym_record",
      dedupeKey: "gym:equipment:x",
      payload: { user_id: "plan-test", record_key: "equipment:x", payload: {} },
    });
  });
  expect(
    [...host.querySelectorAll("button")].some((b) => b.textContent?.startsWith("Zapisz plan")),
  ).toBe(false);
  expect(mock.activate).not.toHaveBeenCalled();
});

it("an existing account under 16 keeps the account but sees no plan or settings", async () => {
  const state = mock.store.state as LoadwiseState;
  const adult = { ...state.profile!, individualTrainingDays: [1, 2, 3, 4, 5, 6, 7] };
  const saved = generateTrainingPlan(adult, { startDate: "2026-11-02", weeks: 1 }).plan;
  mock.store.state = { ...state, profile: { ...adult, age: 15 }, plan: saved };
  await act(async () => root.render(<PlanScreen />));
  expect(host.textContent).toContain("Plan niedostępny");
  expect(host.textContent).toContain("od 16 lat");
  expect(host.querySelector(".bw-wk")).toBeNull();
  expect(host.querySelector(".bw-plan-settings-button")).toBeNull();
  expect(mock.activate).not.toHaveBeenCalled();
});
