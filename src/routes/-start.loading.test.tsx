// @vitest-environment jsdom
import { act, Suspense, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  store: {
    state: { profile: { onboardingComplete: true }, plan: [], modifications: {} },
    todaySession: null,
    todayIso: "2026-10-25",
    hydrated: true,
    syncing: false,
    hydrationError: "Nie udało się wczytać konta." as string | null,
    planGenerating: false,
  },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({ ...mocks.store, refreshPlanIfNeeded: mocks.refresh }),
}));
vi.mock("@/components/loadwise/ui", () => ({ ProfileAvatar: () => <span>Avatar</span> }));
import { Route } from "./_tabs.start";
const Component = Route.options.component as ComponentType & { preload?: () => Promise<unknown> };
beforeAll(async () => { await Component.preload?.(); });
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.refresh.mockReset();
  mocks.store.syncing = false;
  mocks.store.planGenerating = false;
  mocks.store.hydrationError = "Nie udało się wczytać konta.";
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
  await act(async () => root.render(<Suspense fallback="loading"><Component /></Suspense>));
};

it("retries reading after a failed hydration without generating over an unknown server plan", async () => {
  await render();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Nie udało się wczytać planu");
  const dispatch = vi.spyOn(window, "dispatchEvent");
  await act(async () => host.querySelector("button")!.click());
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "ballwise:server-state-changed" }));
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("waits for a server read, then generates only when a successful read confirms a missing plan", async () => {
  mocks.store.syncing = true;
  mocks.store.hydrationError = null;
  await render();
  expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(mocks.refresh).not.toHaveBeenCalled();
  mocks.store.syncing = false;
  await render();
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  await render();
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});
