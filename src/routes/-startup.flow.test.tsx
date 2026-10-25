// @vitest-environment jsdom
import { act, Suspense, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  auth: { user: { id: "owner" } as { id: string } | null, loading: false },
  store: {
    hydrated: true,
    hydrationError: "network failed" as string | null,
    state: { profile: { onboardingComplete: true }, plan: [{ date: "2026-10-25" }] },
  },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: () => mocks.store }));
vi.mock("@/components/loadwise/AppDataError", () => ({ AppDataError: () => <p>account-error</p> }));
import { Route } from "./index";
const Component = Route.options.component as ComponentType & { preload?: () => Promise<unknown> };
beforeAll(async () => {
  await Component.preload?.();
});
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.navigate.mockReset();
  mocks.auth.user = { id: "owner" };
  mocks.auth.loading = false;
  mocks.store.state.plan = [{ date: "2026-10-25" }];
  mocks.store.hydrationError = "network failed";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
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
it("opens an existing plan despite a failed background refresh instead of remaining on the launch screen", async () => {
  await render();
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/start", replace: true });
});
it("shows a recoverable account error when no usable plan exists; never sends the user to onboarding on a failed read", async () => {
  mocks.store.state.plan = [];
  await render();
  expect(host.textContent).toBe("account-error");
  expect(mocks.navigate).not.toHaveBeenCalled();
});
it("opens login when there is no signed-in user", async () => {
  mocks.auth.user = null;
  await render();
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/auth", replace: true });
});
