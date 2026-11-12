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
  applyModification: vi.fn(async () => undefined),
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
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
    applyModification: mocks.applyModification,
  }),
}));
vi.mock("@/components/loadwise/StartDashboard", () => ({
  StartDashboard: ({ onCheckin }: { onCheckin: () => void }) => (
    <button onClick={onCheckin}>Plan na dziś</button>
  ),
}));
vi.mock("@/components/loadwise/UpcomingWeekPrompt", () => ({ UpcomingWeekPrompt: () => null }));
vi.mock("@/components/loadwise/ui", () => ({ ProfileAvatar: () => null }));
import { Route } from "./_tabs.start";
const Component = Route.options.component as ComponentType & { preload?: () => Promise<unknown> };
let root: Root, host: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  mocks.applyModification.mockClear();
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
function buttonLabels() {
  return [...document.querySelectorAll<HTMLButtonElement>("[role=group] button")].map((button) =>
    button.querySelector("span")?.textContent?.trim(),
  );
}
async function choose(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.querySelector("span")?.textContent?.trim() === label,
  );
  expect(button, label).toBeTruthy();
  await act(async () => button!.click());
}
it("shows exactly three decisions and no health questions", async () => {
  await click("Plan na dziś");
  expect(buttonLabels()).toEqual(["Trenuję", "Mam mniej czasu", "Dziś nie mogę"]);
  expect(document.body.textContent).not.toMatch(
    /ból|uraz|sen\b|stres|samopoczu|motywac|zmęcz|zdrow(?!ie i)|gotowo/i,
  );
});
it("„Trenuję” confirms without writing a plan change", async () => {
  await click("Plan na dziś");
  await choose("Trenuję");
  expect(mocks.applyModification).not.toHaveBeenCalled();
  expect(localStorage.getItem("ballwise:daily-plan-checkin:v3:checkin-owner:2026-09-29")).toContain(
    '"action":"train"',
  );
});
it("„Mam mniej czasu” offers only real shorter variants or an honest message", async () => {
  await click("Plan na dziś");
  await choose("Mam mniej czasu");
  expect(document.body.textContent).toContain("Ile masz dziś czasu?");
  expect(document.body.textContent).toContain("Rozgrzewka i pełne przerwy zostają");
  const minutes = [...document.body.textContent!.matchAll(/ok\. (\d+) min/g)].map((m) =>
    Number(m[1]),
  );
  expect(new Set(minutes).size).toBe(minutes.length);
});
it("„Dziś nie mogę” changes only today and never proposes moving the work", async () => {
  await click("Plan na dziś");
  await choose("Dziś nie mogę");
  expect(mocks.applyModification).toHaveBeenCalledTimes(1);
  const [date, type, session] = mocks.applyModification.mock.calls[0] as unknown as [
    string,
    string,
    SessionDay,
  ];
  expect(date).toBe("2026-09-29");
  expect(type).toBe("swap");
  expect(session.isUnavailable).toBe(true);
  expect(document.body.textContent).not.toContain("Chcesz przenieść tę sesję?");
});
it("reopens the check-in at its first step after leaving the time step", async () => {
  await click("Plan na dziś");
  await choose("Mam mniej czasu");
  expect(document.body.textContent).toContain("Ile masz dziś czasu?");
  await click("Zamknij");
  await click("Plan na dziś");
  expect(buttonLabels()).toEqual(["Trenuję", "Mam mniej czasu", "Dziś nie mogę"]);
});
