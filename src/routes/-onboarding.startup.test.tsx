// @vitest-environment jsdom
import { act, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildProfile } from "@/lib/loadwise/store/model";
import type { Profile } from "@/lib/loadwise/types";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  store: {
    completeOnboarding: vi.fn(),
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
  mocks.store.completeOnboarding.mockReset();
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

it("collects explicit strength preparation in onboarding and submits it with the profile", async () => {
  mocks.store.hydrated = true;
  mocks.store.state.profile = {
    ...buildProfile({ full_name: "Zawodnik" }, { age: 21, position: "midfielder" }, null)!,
    birthDate: "2005-03-12",
    onboardingComplete: true,
    level: "advanced",
    competitionLevel: "iv_liga",
    goal: "endurance",
    secondaryLimiter: "strength",
    currentPitchFeelings: ["training_without_direction"],
    desiredPitchFeelings: ["ready_full_match"],
    matchDate: null,
    matchDates: [],
    weeklyMatches: false,
    seasonPhase: "preseason",
    seasonPhaseOverride: true,
  };
  await render();
  for (const checkbox of host.querySelectorAll<HTMLButtonElement>('[role="checkbox"]'))
    if (checkbox.getAttribute("aria-checked") !== "true") await act(async () => checkbox.click());
  for (let step = 0; step < 5; step++) {
    await act(async () =>
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Dalej")!.click(),
    );
  }
  expect(host.querySelector("[data-step]")?.getAttribute("data-step"), host.textContent ?? "").toBe(
    "conditions",
  );
  for (const [id, value] of [
    ["onboarding-strength-level", "advanced"],
    ["onboarding-movement", "high"],
    ["onboarding-supervision", "none"],
  ]) {
    await act(async () => {
      const select = host.querySelector<HTMLSelectElement>(`#${id}`)!;
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  await act(async () => {
    const input = host.querySelector<HTMLInputElement>("#onboarding-strength-months")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "48");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(mocks.store.completeOnboarding).not.toHaveBeenCalled();
  await act(async () =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Zapisz")!.click(),
  );
  expect(mocks.store.completeOnboarding).toHaveBeenCalledOnce();
  expect(mocks.store.completeOnboarding.mock.calls[0][0]).toMatchObject({
    goal: "endurance",
    gymExperienceLevel: "advanced",
    strengthTrainingMonths: 48,
    movementCompetence: "high",
    supervisionLevel: "none",
  });
});
