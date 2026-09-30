// @vitest-environment jsdom
import { act, Suspense, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type AnyRouter,
} from "@tanstack/react-router";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/loadwise/types";
import { ActivityExitProvider } from "@/components/loadwise/ActivityExitGuard";
import { Route } from "./_tabs.profil";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  state: { profile: null as Profile | null },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component: ComponentType }) => ({ options }),
}));
vi.mock("@/lib/loadwise/auth", () => ({
  useAuth: () => ({
    user: { id: "guardian", email: "guardian@example.com" },
    signOut: mocks.signOut,
    requestAccountEmailChange: vi.fn(),
  }),
}));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({ state: mocks.state, updateProfile: vi.fn() }),
}));

const ProfileScreen = Route.options.component as ComponentType & {
  preload?: () => Promise<unknown>;
};
let host: HTMLDivElement;
let root: Root;
let router: AnyRouter;

beforeAll(async () => {
  await ProfileScreen.preload?.();
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  mocks.signOut.mockReset();
  mocks.state.profile = {
    name: "Player",
    age: 17,
    accountOwnerType: "guardian",
    birthDate: "2009-01-01",
    position: "midfielder",
    level: "advanced",
    goal: "speed",
    secondaryLimiter: null,
    clubTrainingDays: [2, 4],
    individualTrainingDays: [],
    usualMatchDay: null,
    matchDate: null,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "yes_if_safe",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-01-01",
    seasonPhase: "inseason",
    seasonStage: "match_week",
    competitionLevel: "academy",
    weeklyMatches: false,
    hasGym: false,
    hasPitch: true,
    hasSprintSpace: true,
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  router.history.destroy();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === text,
  );
  expect(button, `Missing button: ${text}`).toBeDefined();
  await act(async () => button!.click());
}

it("keeps the handover draft on Stay and discards it before delayed signout navigation", async () => {
  let completeSignOut!: () => void;
  mocks.signOut.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        completeSignOut = resolve;
      }),
  );
  const rootRoute = createRootRoute({
    component: () => (
      <ActivityExitProvider>
        <Outlet />
      </ActivityExitProvider>
    ),
  });
  const profile = createRoute({
    getParentRoute: () => rootRoute,
    path: "/profil",
    component: () => (
      <Suspense fallback="Loading">
        <ProfileScreen />
      </Suspense>
    ),
  });
  const auth = createRoute({
    getParentRoute: () => rootRoute,
    path: "/auth",
    component: () => <h1>Signed out</h1>,
  });
  router = createRouter({
    routeTree: rootRoute.addChildren([profile, auth]),
    history: createMemoryHistory({ initialEntries: ["/profil"] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });
  await router.load();
  await act(async () => root.render(<RouterProvider router={router} />));
  const email = host.querySelector<HTMLInputElement>("#transfer-email")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      email,
      "player@example.com",
    );
    email.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("Wyloguj się");
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Adres przekazania konta nie został wysłany.",
  );
  await click("Zostań");
  expect(email.value).toBe("player@example.com");
  await click("Wyloguj się");
  await click("Odrzuć i przejdź");
  expect(mocks.signOut).toHaveBeenCalledOnce();
  expect(router.state.location.pathname).toBe("/profil");
  expect(email.value).toBe("");
  // The provider's one-tick route bypass has ended before Auth resolves.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await act(async () => completeSignOut());
  expect(router.state.location.pathname).toBe("/auth");
  expect(host.textContent).toContain("Signed out");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
