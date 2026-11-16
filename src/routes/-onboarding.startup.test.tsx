// @vitest-environment jsdom
import { act, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildProfile } from "@/lib/loadwise/store/model";
import type { Profile } from "@/lib/loadwise/types";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  store: {
    hydrated: false,
    hydrationError: null as string | null,
    state: { profile: null as Profile | null },
  },
  auth: { user: { id: "owner", user_metadata: {} }, loading: false },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({ edit: true }) }),
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: () => mocks.store }));
vi.mock("@/components/loadwise/AppLaunchScreen", () => ({
  AppLaunchScreen: () => <p>loading-account</p>,
}));
vi.mock("@/components/loadwise/AppDataError", () => ({ AppDataError: () => <p>account-error</p> }));

import { Route } from "./onboarding";
const Component = Route.options.component as ComponentType;
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.store.hydrated = false;
  mocks.store.hydrationError = null;
  mocks.store.state.profile = null;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = () => act(async () => root.render(<Component />));

it("initializes profile editing from the hydrated account after a direct page visit", async () => {
  await render();
  expect(host.textContent).toBe("loading-account");
  mocks.store.state.profile = {
    ...buildProfile({ full_name: "Zapisany zawodnik" }, { age: 22, position: "forward" }, null)!,
    onboardingComplete: true,
    birthDate: "2004-05-15",
  };
  mocks.store.hydrated = true;
  await render();

  for (const checkbox of host.querySelectorAll<HTMLButtonElement>('[role="checkbox"]'))
    if (checkbox.getAttribute("aria-checked") !== "true") await act(async () => checkbox.click());
  await act(async () =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Dalej")!.click(),
  );
  expect(host.querySelector<HTMLInputElement>("#name")?.value).toBe("Zapisany zawodnik");
  expect(host.querySelector<HTMLInputElement>("#birth-date")?.value).toBe("2004-05-15");
});

it("keeps the form closed after a failed account read instead of offering a blank overwrite", async () => {
  mocks.store.hydrated = true;
  mocks.store.hydrationError = "network failed";
  await render();
  expect(host.textContent).toBe("account-error");
  expect(host.querySelector("input")).toBeNull();
});
