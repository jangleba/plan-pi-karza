// @vitest-environment jsdom
import { act, Suspense, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initialState, buildProfile } from "@/lib/loadwise/store/model";
import type { LoadwiseState } from "@/lib/loadwise/types";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import { addIsoDays } from "@/lib/isoDate";
const mocks = vi.hoisted(() => ({
  state: {} as LoadwiseState,
  navigate: vi.fn(),
  today: "2026-11-02",
  requested: undefined as string | undefined,
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: unknown) => ({
    options,
    useSearch: () => ({ week: mocks.requested }),
  }),
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: import("react").ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/loadwise/store", () => ({
  applyExerciseReplacements: (s: unknown) => s,
  useLoadwise: () => ({
    state: mocks.state,
    todayIso: mocks.today,
    todaySession: mocks.state.plan[0],
  }),
}));
vi.mock("@/components/loadwise/ui", () => ({ AppHeader: () => <h1>Plan</h1> }));
vi.mock("@/components/loadwise/UpcomingWeekPrompt", () => ({ UpcomingWeekPrompt: () => null }));
vi.mock("@/components/loadwise/WeeklyGateSheet", () => ({ WeeklyGateSheet: () => null }));
import { Route } from "./_tabs.plan";
const Component = Route.options.component as ComponentType & { preload?: () => Promise<unknown> };
let root: Root, host: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  mocks.navigate.mockReset();
  mocks.today = "2026-11-02";
  mocks.requested = undefined;
  mocks.state = {
    ...initialState,
    profile: buildProfile(
      { full_name: "Jan", onboarding_completed: true },
      { age: 22, level: "intermediate", season_phase: "offseason" },
      null,
    ),
    plan: Array.from({ length: 14 }, (_, i) =>
      sessionFixture({ date: addIsoDays("2026-11-02", i), dbId: `day-${i}` }),
    ),
  };
  await Component.preload?.();
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
async function render() {
  await act(async () =>
    root.render(
      <Suspense fallback="loading">
        <Component />
      </Suspense>,
    ),
  );
}
it("stores the selected week in the current history entry so session back navigation can restore it", async () => {
  await render();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Następny tydzień"]')!.click(),
  );
  expect(host.querySelector(".bw-week-nav strong")?.textContent).toBe("Tydzień 2");
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/plan",
    search: { week: "2026-11-09" },
    replace: true,
  });
});
it("honours an explicit previous-week selection while automatic entry uses the current week", async () => {
  mocks.today = "2026-11-09";
  mocks.requested = "2026-11-02";
  await render();
  expect(host.querySelector(".bw-week-nav strong")?.textContent).toBe("Tydzień 1");
});
it("opens the current week automatically when no week was explicitly requested", async () => {
  mocks.today = "2026-11-09";
  await render();
  expect(host.querySelector(".bw-week-nav strong")?.textContent).toBe("Tydzień 2");
});
it("advances a retained Plan screen on Monday even when last week's selection remains in the URL", async () => {
  mocks.today = "2026-11-08";
  mocks.requested = "2026-11-02";
  await render();
  expect(host.querySelector(".bw-week-nav strong")?.textContent).toBe("Tydzień 1");
  mocks.today = "2026-11-09";
  await render();
  expect(host.querySelector(".bw-week-nav strong")?.textContent).toBe("Tydzień 2");
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/plan",
    search: { week: undefined },
    replace: true,
  });
});
