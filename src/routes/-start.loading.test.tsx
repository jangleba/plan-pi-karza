// @vitest-environment jsdom
import { act, Suspense, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: {
    state: { profile: { onboardingComplete: true }, plan: [], modifications: {} },
    todaySession: null,
    todayIso: "2026-10-25",
    hydrated: true,
    hydrationError: null as string | null,
  },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  useNavigate: () => vi.fn(),
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
