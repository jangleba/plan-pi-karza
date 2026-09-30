// @vitest-environment jsdom
import { act, Suspense, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/loadwise/types";
import type { ActivityExitOptions } from "@/components/loadwise/ActivityExitGuard";
import { Route } from "./onboarding";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  save: vi.fn(),
  guard: vi.fn(),
  hydrated: true,
  state: { profile: null as Profile | null },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
    useSearch: () => ({ edit: true }),
  }),
  useNavigate: () => mocks.navigate,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/loadwise/auth", () => ({
  useAuth: () => ({
    user: {
      id: "athlete-1",
      email: "player@example.com",
      email_confirmed_at: "2026-01-01",
      user_metadata: {},
    },
    loading: false,
    resendSignupConfirmation: vi.fn(),
  }),
}));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({
    state: mocks.state,
    hydrated: mocks.hydrated,
    completeOnboarding: mocks.save,
  }),
}));
vi.mock("@/components/loadwise/ActivityExitGuard", () => ({
  useActivityExitGuard: (options: ActivityExitOptions) => {
    mocks.guard(options);
    return { requestExit: (action: () => void) => action() };
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

const Onboarding = Route.options.component as ComponentType & { preload?: () => Promise<unknown> };
let host: HTMLDivElement;
let root: Root;

function profileFixture(): Profile {
  return {
    name: "Existing player",
    age: 24,
    birthDate: "2002-01-01",
    accountOwnerType: "athlete",
    position: "midfielder",
    level: "advanced",
    goal: "speed",
    secondaryLimiter: "speed",
    clubTrainingDays: [2, 4],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    unavailableDays: [],
    usualMatchDay: null,
    matchDate: "2026-10-04",
    equipment: [],
    painInjury: false,
    painLocations: [],
    healthPersonalizationEnabled: false,
    doubleSessionsAllowed: "yes_if_safe",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-01-01",
    seasonPhase: "inseason",
    seasonStage: "match_week",
    competitionLevel: "pro",
    weeklyMatches: true,
    hasGym: false,
    hasPitch: true,
    hasSprintSpace: true,
    currentPitchFeelings: ["lacking_speed"],
    desiredPitchFeelings: ["fast_and_light"],
  };
}

async function click(text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === text,
  );
  expect(button, `Missing button: ${text}`).toBeDefined();
  await act(async () => button!.click());
}

async function prepareEditedProfile() {
  await act(async () =>
    root.render(
      <Suspense fallback="Ładowanie">
        <Onboarding />
      </Suspense>,
    ),
  );
  expect(host.textContent).toContain("Krok 1 z 6");
  for (const label of ["Akceptacja Regulaminu", "Polityka prywatności"]) {
    await act(async () =>
      host.querySelector<HTMLButtonElement>(`[role="checkbox"][aria-label="${label}"]`)!.click(),
    );
  }
  await click("Dalej");
  const name = host.querySelector<HTMLInputElement>("#name")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      name,
      "Edited player",
    );
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
  for (let index = 0; index < 4; index++) await click("Dalej");
  expect(host.textContent).toContain("Krok 6 z 6");
}

beforeAll(async () => {
  await Onboarding.preload?.();
});

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  mocks.navigate.mockReset();
  mocks.save.mockReset();
  mocks.guard.mockReset();
  mocks.hydrated = true;
  mocks.state.profile = profileFixture();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("edited onboarding flow", () => {
  it("waits for stored profile hydration without replacing later player edits", async () => {
    mocks.hydrated = false;
    mocks.state.profile = null;
    async function render() {
      await act(async () =>
        root.render(
          <Suspense fallback="Ładowanie">
            <Onboarding />
          </Suspense>,
        ),
      );
    }
    await render();
    expect(host.textContent).not.toContain("Krok 1 z 6");
    mocks.state.profile = profileFixture();
    mocks.hydrated = true;
    await render();
    for (const label of ["Akceptacja Regulaminu", "Polityka prywatności"]) {
      await act(async () =>
        host.querySelector<HTMLButtonElement>(`[role="checkbox"][aria-label="${label}"]`)!.click(),
      );
    }
    await click("Dalej");
    const name = host.querySelector<HTMLInputElement>("#name")!;
    expect(name.value).toBe("Existing player");
    expect(host.querySelector<HTMLInputElement>("#birth-date")?.value).toBe("2002-01-01");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        name,
        "Draft player",
      );
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    mocks.state.profile = { ...profileFixture(), name: "Refreshed profile" };
    await render();
    expect(host.querySelector<HTMLInputElement>("#name")?.value).toBe("Draft player");
  });

  it("keeps six steps and completes the save before clearing the exit guard and redirecting", async () => {
    let completeSave!: () => void;
    mocks.save.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          completeSave = resolve;
        }),
    );
    await prepareEditedProfile();
    expect(mocks.guard).toHaveBeenLastCalledWith(
      expect.objectContaining({ dirty: true, busy: false }),
    );
    await click("Zapisz i wygeneruj plan");
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Edited player",
        birthDate: "2002-01-01",
        clubTrainingDays: [2, 4],
        healthPersonalizationEnabled: false,
        painInjury: false,
        painLocations: [],
        currentPitchFeelings: ["lacking_speed"],
        desiredPitchFeelings: ["fast_and_light"],
      }),
      expect.objectContaining({ terms: true, privacy: true, health_data: false }),
    );
    expect(mocks.guard).toHaveBeenLastCalledWith(
      expect.objectContaining({ dirty: true, busy: true }),
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
    await act(async () => completeSave());
    expect(mocks.guard).toHaveBeenLastCalledWith(
      expect.objectContaining({ dirty: false, busy: false }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/profil", replace: true });
  });

  it("retains the unsaved draft after failure and allows back/forward navigation and retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.save.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce(undefined);
    await prepareEditedProfile();
    await click("Zapisz i wygeneruj plan");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Connection lost");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.guard).toHaveBeenLastCalledWith(
      expect.objectContaining({ dirty: true, busy: false }),
    );
    for (let index = 0; index < 4; index++) await click("Wstecz");
    expect(host.querySelector<HTMLInputElement>("#name")?.value).toBe("Edited player");
    for (let index = 0; index < 4; index++) await click("Dalej");
    await click("Zapisz i wygeneruj plan");
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/profil", replace: true });
  });
});
