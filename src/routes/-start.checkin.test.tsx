// @vitest-environment jsdom
import { act, Suspense, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initialState, buildProfile } from "@/lib/loadwise/store/model";
import type { LoadwiseState, SessionDay } from "@/lib/loadwise/types";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";

const mocks = vi.hoisted(() => ({
  state: {} as LoadwiseState,
  todaySession: null as SessionDay | null,
  user: { id: "checkin-owner" },
  refresh: vi.fn(),
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ preloadRoute: vi.fn(async () => {}) }),
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({
    state: mocks.state,
    todaySession: mocks.todaySession,
    todayIso: "2026-09-29",
    hydrated: true,
    syncing: false,
    hydrationError: null,
    planGenerating: false,
    refreshPlanIfNeeded: mocks.refresh,
  }),
}));
vi.mock("@/components/loadwise/StartDashboard", () => ({
  StartDashboard: ({ onCheckin }: { onCheckin: () => void }) => (
    <button onClick={onCheckin}>Plan na dziś</button>
  ),
}));
vi.mock("@/components/loadwise/UpcomingWeekPrompt", () => ({ UpcomingWeekPrompt: () => null }));
vi.mock("@/components/loadwise/ModifySheet", () => ({ ModifySheet: () => null }));
vi.mock("@/components/loadwise/ui", () => ({ ProfileAvatar: () => null }));
import { Route } from "./_tabs.start";
const Component = Route.options.component as ComponentType & { preload?: () => Promise<unknown> };
let root: Root, host: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  mocks.state = {
    ...initialState,
    profile: buildProfile(
      { full_name: "Jan", onboarding_completed: true },
      { age: 22, level: "intermediate" },
      null,
    ),
    plan: [
      sessionFixture({ secondSession: sessionFixture({ dbId: "second", slotLabel: "Sesja 2" }) }),
    ],
  };
  mocks.todaySession = mocks.state.plan[0];
  await Component.preload?.();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <Suspense fallback="loading">
        <Component />
      </Suspense>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === text || b.getAttribute("aria-label") === text,
  );
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
}
it("reopens the primary check-in at its first question after dismissing changes", async () => {
  await click("Plan na dziś");
  await click("Chcę coś zmienić");
  expect(document.body.textContent).toContain("Co chcesz zmienić?");
  await click("Zamknij");
  await click("Plan na dziś");
  expect(document.body.textContent).toContain("Czy dzisiejszy plan jest aktualny?");
  expect(document.body.textContent).not.toContain("Co chcesz zmienić?");
});
it("reopens second-session check-in at its initial question", async () => {
  await click("Plan na dziś");
  await click("Trenuję według planu");
  await click("Tak");
  await click("Chcę coś zmienić");
  expect(document.body.textContent).toContain("Co zmienić w drugiej sesji?");
  await click("Zamknij");
  await click("Plan na dziś");
  await click("Trenuję według planu");
  expect(document.body.textContent).toContain("Czy chcesz dziś wykonać również drugi trening?");
});
