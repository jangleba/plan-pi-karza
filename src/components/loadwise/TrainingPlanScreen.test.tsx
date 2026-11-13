// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { PlanScreen } from "./TrainingPlanScreen";
import { buildProfile, initialState } from "@/lib/loadwise/store/model";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import type { LoadwiseState } from "@/lib/loadwise/types";
const mock = vi.hoisted(() => ({
  store: null as unknown as Record<string, unknown>,
  activate: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: () => mock.store }));
vi.mock("@/components/loadwise/ui", () => ({ AppHeader: () => null }));
vi.mock("@tanstack/react-router", async (importActual) => ({
  ...(await importActual<object>()),
  useNavigate: () => mock.navigate,
}));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
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
