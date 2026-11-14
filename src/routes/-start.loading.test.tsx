// @vitest-environment jsdom
import { act, Suspense, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { buildProfile, initialState } from "@/lib/loadwise/store/model";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import type { LoadwiseState, SessionCompletion, SessionModification } from "@/lib/loadwise/types";

const mocks = vi.hoisted(() => ({
  store: {
    state: {
      profile: { onboardingComplete: true },
      plan: [],
      modifications: {},
    } as unknown as LoadwiseState,
    todaySession: null,
    todayIso: "2026-10-25",
    hydrated: true,
    hydrationError: null as string | null,
  },
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ preloadRoute: vi.fn(async () => {}) }),
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => mocks.store,
}));
vi.mock("@/components/loadwise/ui", () => ({ ProfileAvatar: () => <span>Avatar</span> }));
import { Route } from "./_tabs.start";
const Component = Route.options.component as ComponentType & { preload?: () => Promise<unknown> };
beforeAll(async () => {
  await Component.preload?.();
});
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.store.hydrated = true;
  mocks.store.todayIso = "2026-11-02";
  mocks.store.state = {
    ...initialState,
    profile: buildProfile({ full_name: "Test" }, { age: 20, position: "midfielder" }, null),
  };
  mocks.navigate.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const render = async () => {
  await act(async () =>
    root.render(
      <Suspense fallback="loading">
        <Component />
      </Suspense>,
    ),
  );
};

it("shows the loading state until the account is read", async () => {
  mocks.store.hydrated = false;
  await render();
  expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(host.textContent).not.toContain("Plan wkrótce");
});

it("offers the planner after reading the account", async () => {
  mocks.store.hydrated = true;
  mocks.store.hydrationError = null;
  await render();
  expect(host.textContent).toContain("Przygotuj swój plan");
});

it("opens the next unfinished effective slot instead of a completed base session", async () => {
  const state = mocks.store.state;
  const generated = generateTrainingPlan(state.profile!, {
    startDate: "2026-11-02",
    weeks: 1,
  }).plan;
  const base = { ...generated.find((d) => d.engineV2)!, dbId: "primary", dayDbId: "today-day" };
  const added = { ...base, dbId: "second", title: "Zmieniony drugi trening" };
  const modification = {
    id: "mod",
    date: base.date,
    type: "add",
    reason: "additional",
    session: added,
    createdAt: "2026-11-01T12:00:00Z",
  } as SessionModification;
  mocks.store.todayIso = base.date;
  mocks.store.state = {
    ...state,
    plan: [base],
    modifications: { [base.date]: [modification] },
    completions: { primary: { completed: true, status: "completed" } as SessionCompletion },
  };
  await render();
  expect(host.querySelector(".bw-plan-soon")?.textContent).toContain("Zmieniony drugi trening");
  await act(async () => (host.querySelector(".bw-plan-soon") as HTMLButtonElement).click());
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/sesja/$date",
    params: { date: base.date },
    search: { slot: 2 },
  });
});

it("recognizes an expired cycle and offers one 'Podsumuj plan' action leading to Progress, without creating a plan", async () => {
  const state = mocks.store.state;
  mocks.store.state = {
    ...state,
    plan: generateTrainingPlan(state.profile!, { startDate: "2026-10-05", weeks: 1 }).plan,
  };
  await render();
  expect(host.textContent).toContain("Cykl zakończony");
  expect(host.querySelector(".bw-plan-soon")?.textContent).toContain("Podsumuj plan");
  await act(async () => (host.querySelector(".bw-plan-soon") as HTMLButtonElement).click());
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/postep" });
  expect(mocks.store.state.plan[0].date).toBe("2026-10-05");
});
