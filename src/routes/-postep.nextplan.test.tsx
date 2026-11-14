// @vitest-environment jsdom
import { Suspense, act, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import { initialState } from "@/lib/loadwise/store/model";
import { trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import type { Profile } from "@/lib/loadwise/types";

const mocks = vi.hoisted(() => ({
  store: null as unknown as Record<string, unknown>,
  navigate: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: () => mocks.store }));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "np-user" } }) }));
vi.mock("@/components/loadwise/ui", () => ({ AppHeader: () => null }));
vi.mock("@/components/progress/CycleReviewHistory", () => ({ CycleReviewHistory: () => null }));
vi.mock("@/components/progress/ProgressDashboard", () => ({ ProgressDashboard: () => null }));
vi.mock("@/components/progress/ProgressHistory", () => ({ ProgressHistory: () => null }));
vi.mock("@tanstack/react-router", async (importActual) => ({
  ...(await importActual<object>()),
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  useNavigate: () => mocks.navigate,
}));
import { Route } from "./_tabs.postep";

const profile = {
  name: "Route athlete",
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

const Screen = Route.options.component as ComponentType & { preload?: () => Promise<unknown> };
beforeAll(async () => {
  await Screen.preload?.();
});
let root: Root, host: HTMLDivElement;
const button = (text: string) =>
  [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement;
const click = (text: string) => act(async () => button(text).click());
const intentKey = trainingStorageKey("next-plan-intent", "np-user");

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  mocks.navigate.mockReset();
  mocks.updateProfile.mockReset().mockResolvedValue(undefined);
  mocks.store = {
    state: {
      ...initialState,
      profile,
      activePlanId: "old-cycle",
      plan: generateTrainingPlan(profile, { startDate: "2026-10-05", weeks: 4 }).plan,
    },
    todayIso: "2026-11-02",
    hydrated: true,
    syncing: false,
    updateProfile: mocks.updateProfile,
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <Suspense fallback="loading">
        <Screen />
      </Suspense>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("confirmed choices go to the next preview without saving a plan; an unchanged profile is not rewritten", async () => {
  await click("Przygotuj kolejny plan");
  await click("Dalej");
  await click("Brakowało czasu");
  await click("Dalej");
  await click("Przygotuj podgląd planu");
  expect(mocks.updateProfile).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem(intentKey)!)).toMatchObject({
    planId: "old-cycle",
    minutes: 60,
  });
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/plan" });
});

it("a profile change (missing equipment) is saved through the existing profile update first", async () => {
  await click("Przygotuj kolejny plan");
  await click("Dalej");
  await click("Dalej");
  await click("Hantle");
  await click("Przygotuj podgląd planu");
  expect(mocks.updateProfile).toHaveBeenCalledTimes(1);
  expect(mocks.updateProfile.mock.calls[0][0].unavailableEquipmentIds).toEqual(["dumbbell"]);
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/plan" });
});

it("a failed profile update stops the flow: no preview request is stored and nothing navigates", async () => {
  mocks.updateProfile.mockRejectedValueOnce(new Error("Brak połączenia"));
  await click("Przygotuj kolejny plan");
  await click("Dalej");
  await click("Dalej");
  await click("Hantle");
  await click("Przygotuj podgląd planu");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Brak połączenia");
  expect(localStorage.getItem(intentKey)).toBeNull();
  expect(mocks.navigate).not.toHaveBeenCalled();
});
