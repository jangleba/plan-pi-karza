// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanEndSummary } from "./PlanEndSummary";
import { ProgressWorkspace } from "./ProgressWorkspace";
import { buildPlanSummary } from "@/lib/loadwise/planSummary";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import { initialState } from "@/lib/loadwise/store/model";
import type { LoadwiseState, Profile, SessionDay } from "@/lib/loadwise/types";

vi.mock("@/components/loadwise/ui", () => ({ AppHeader: () => null }));
vi.mock("./CycleReviewHistory", () => ({ CycleReviewHistory: () => null }));
vi.mock("./ProgressDashboard", () => ({ ProgressDashboard: () => null }));
vi.mock("./ProgressHistory", () => ({ ProgressHistory: () => null }));

const profile = {
  name: "Plan end athlete",
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
  equipment: ["Hantle", "Guma oporowa", "Ławka"],
  unavailableEquipmentIds: [],
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
const plan = (): SessionDay[] =>
  generateTrainingPlan(profile, { startDate: "2026-10-05", weeks: 4 }).plan;
const summary = () =>
  buildPlanSummary({
    profile,
    plan: plan(),
    completions: {},
    history: [],
    readiness: {},
    todayIso: "2026-11-02",
  })!;

let root: Root, host: HTMLDivElement;
const button = (text: string) =>
  [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement;
const click = (text: string) => act(async () => button(text).click());
beforeEach(() => {
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

describe("end of plan summary and interview", () => {
  const render = async (onPrepare = vi.fn().mockResolvedValue(undefined)) => {
    await act(async () =>
      root.render(
        <PlanEndSummary
          summary={summary()}
          profile={profile}
          currentMinutes={75}
          onPrepare={onPrepare}
        />,
      ),
    );
    return onPrepare;
  };

  it("shows the summary first and no interview until asked; nothing is prepared by opening it", async () => {
    const onPrepare = await render();
    expect(host.textContent).toContain("Podsumowanie planu");
    expect(host.textContent).toContain("Własne sesje");
    expect(host.textContent).toContain("Sama frekwencja nie oznacza poprawy");
    expect(host.textContent).not.toContain("Krok 1 z 3");
    expect(onPrepare).not.toHaveBeenCalled();
  });

  it("walks three steps, shows what changes, and prepares only the confirmed changes", async () => {
    const onPrepare = await render();
    await click("Przygotuj kolejny plan");
    expect(host.textContent).toContain("Krok 1 z 3");
    await click("Dalej");
    expect(host.textContent).toContain("Krok 2 z 3");
    await click("Brakowało czasu");
    await click("Dalej");
    expect(host.textContent).toContain("Krok 3 z 3");
    // time was the barrier → budget one step lower, shown for confirmation
    expect(host.textContent).toContain("Co zmieniamy w kolejnym planie");
    expect(host.textContent).toContain("75 → 60 min");
    await click("Przygotuj podgląd planu");
    expect(onPrepare).toHaveBeenCalledTimes(1);
    const draft = onPrepare.mock.calls[0][0];
    expect(draft.minutes).toBe(60);
    expect(draft.profileChanged).toBe(false);
  });

  it("an unticked change is not applied", async () => {
    const onPrepare = await render();
    await click("Przygotuj kolejny plan");
    await click("Dalej");
    await click("Brakowało czasu");
    await click("Dalej");
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await click("Przygotuj podgląd planu");
    expect(onPrepare.mock.calls[0][0].minutes).toBe(75);
  });

  it("unclear text blocks the button until one concrete question is answered", async () => {
    const onPrepare = await render();
    await click("Przygotuj kolejny plan");
    await click("Dalej");
    await act(async () => {
      const area = host.querySelector("textarea")!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        area,
        "Było różnie",
      );
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Dalej");
    expect(host.textContent).toContain("Czego dotyczy ta uwaga?");
    expect(button("Przygotuj podgląd planu").disabled).toBe(true);
    await click("To nie dotyczy planu");
    expect(button("Przygotuj podgląd planu").disabled).toBe(false);
    await click("Przygotuj podgląd planu");
    expect(onPrepare).toHaveBeenCalledTimes(1);
  });

  it("a failed preparation is shown and can be retried", async () => {
    const onPrepare = vi
      .fn()
      .mockRejectedValueOnce(new Error("Brak połączenia"))
      .mockResolvedValue(undefined);
    await act(async () =>
      root.render(
        <PlanEndSummary
          summary={summary()}
          profile={profile}
          currentMinutes={75}
          onPrepare={onPrepare}
        />,
      ),
    );
    await click("Przygotuj kolejny plan");
    await click("Dalej");
    await click("Dalej");
    await click("Przygotuj podgląd planu");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Brak połączenia");
    await click("Przygotuj podgląd planu");
    expect(onPrepare).toHaveBeenCalledTimes(2);
  });
});

describe("progress workspace at the end of a plan", () => {
  const state = (days: SessionDay[]): LoadwiseState => ({ ...initialState, profile, plan: days });
  const mount = (days: SessionDay[], today: string, withHandler = true) =>
    act(async () =>
      root.render(
        <ProgressWorkspace
          state={state(days)}
          todayIso={today}
          planEnd={withHandler ? { currentMinutes: 75, onPrepare: vi.fn() } : undefined}
        />,
      ),
    );
  it("offers the summary only after the saved window has ended", async () => {
    await mount(plan(), "2026-11-02");
    expect(host.textContent).toContain("Podsumowanie planu");
    await mount(plan(), "2026-10-20");
    expect(host.textContent).not.toContain("Podsumowanie planu");
    await mount(plan(), "2026-11-02", false);
    expect(host.textContent).not.toContain("Podsumowanie planu");
  });
});
