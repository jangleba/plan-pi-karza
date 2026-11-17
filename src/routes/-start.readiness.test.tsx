// @vitest-environment jsdom
import { act, Suspense, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { buildProfile, initialState } from "@/lib/loadwise/store/model";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import { sessionStartIssue } from "@/lib/loadwise/engineV2/planStatus";
import type {
  LoadwiseState,
  Profile,
  Readiness,
  SessionCompletion,
  SessionDay,
} from "@/lib/loadwise/types";

const mocks = vi.hoisted(() => ({
  store: {
    state: {} as LoadwiseState,
    todayIso: "2026-11-02",
    hydrated: true,
    saveReadiness: vi.fn<(value: Readiness) => Promise<void>>(),
    startSession: vi.fn(),
    activatePlanV2: vi.fn(),
  },
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ preloadRoute: vi.fn(async () => {}) }),
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: () => mocks.store }));
vi.mock("@/components/loadwise/ui", () => ({ ProfileAvatar: () => <span>Avatar</span> }));
// The bottom panel (vaul) is replaced by a plain container; its content is the real form.
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ open, children }: { open: boolean; children: import("react").ReactNode }) =>
    open ? <div data-panel>{children}</div> : null,
  DrawerContent: ({ children }: { children: import("react").ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: import("react").ReactNode }) => <h2>{children}</h2>,
}));

import { Route } from "./_tabs.start";

const Component = Route.options.component as ComponentType & { preload?: () => Promise<unknown> };
beforeAll(async () => {
  await Component.preload?.();
});

let host: HTMLDivElement;
let root: Root;
let session: SessionDay;
const ownSessions = (plan: SessionDay[]) =>
  plan
    .flatMap((day) => [day, ...(day.secondSession ? [day.secondSession] : [])])
    .filter((day) => day.engineV2);

function prepareAccount(healthConsent = true) {
  const profile: Profile = {
    ...buildProfile({ full_name: "Jan Testowy" }, { age: 24, position: "midfielder" }, null)!,
    age: 24,
    level: "advanced",
    goal: "strength",
    seasonPhase: "preseason",
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    clubTrainingDays: [],
    unavailableDays: [],
    weeklyMatches: false,
    usualMatchDay: null,
    matchDate: null,
    matchDates: [],
    painInjury: false,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    equipment: ["dumbbell", "band", "barbell", "rack", "bench"],
    healthPersonalizationEnabled: healthConsent,
    onboardingComplete: true,
  };
  const plan = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 4 }).plan.map(
    (day, index) => ({
      ...day,
      dbId: `session-${index}-1`,
      secondSession: day.secondSession
        ? { ...day.secondSession, dbId: `session-${index}-2` }
        : null,
    }),
  );
  session = ownSessions(plan).find((day) =>
    day.engineV2!.roles.some((role) => role === "strengthA" || role === "strengthB"),
  )!;
  expect(session).toBeDefined();
  mocks.store.todayIso = session.date;
  mocks.store.state = { ...initialState, profile, plan };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  prepareAccount();
  mocks.navigate.mockReset();
  mocks.store.startSession.mockReset();
  mocks.store.activatePlanV2.mockReset();
  mocks.store.saveReadiness.mockReset().mockImplementation(async (value) => {
    await Promise.resolve();
    mocks.store.state = {
      ...mocks.store.state,
      readiness: { ...mocks.store.state.readiness, [value.date]: value },
    };
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = () =>
  act(async () =>
    root.render(
      <Suspense fallback="loading">
        <Component />
      </Suspense>,
    ),
  );
const button = (label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent?.trim() === label,
  )!;
const click = (element: HTMLButtonElement) => act(async () => element.click());
async function select(label: string, value: string) {
  const element = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  expect(element).not.toBeNull();
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function pick(label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(
    `fieldset[aria-label="${label}"] input[value="${value}"]`,
  );
  expect(input).not.toBeNull();
  await act(async () => input!.click());
}
async function fill(values = ["8", "3", "2", "0"], painLocation?: string) {
  await click(button("Uzupełnij"));
  const labels = ["Jakość snu", "Zmęczenie", "Ból mięśni", "Ból stawów lub urazowy"];
  for (const [index, label] of labels.entries()) await pick(label, values[index]);
  if (painLocation) await select("Miejsce bólu", painLocation);
}
const issue = (completion?: SessionCompletion, prescribed = session) =>
  sessionStartIssue({
    session: prescribed,
    profile: mocks.store.state.profile,
    readiness: mocks.store.state.readiness[mocks.store.todayIso],
    todayIso: mocks.store.todayIso,
    completion,
  });
function expectNoTrainingWrites() {
  expect(mocks.store.startSession).not.toHaveBeenCalled();
  expect(mocks.store.activatePlanV2).not.toHaveBeenCalled();
}

it("keeps health fields closed without consent and opens profile consent management explicitly", async () => {
  prepareAccount(false);
  await render();
  expect(host.querySelector('form[aria-label="Check-in samopoczucia"]')).toBeNull();
  expect(host.querySelector(".bw-readiness-card select")).toBeNull();
  await click(button("Edytuj profil i zgody"));
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/onboarding", search: { edit: true } });
  expect(mocks.store.saveReadiness).not.toHaveBeenCalled();
  expectNoTrainingWrites();
});

it("lets the athlete open today's session without submitting the optional check-in", async () => {
  await render();
  expect(button("Uzupełnij")).toBeDefined();
  expect(issue()).toBeNull();
  await click(host.querySelector<HTMLButtonElement>(".bw-plan-soon")!);
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/sesja/$date",
    params: { date: session.date },
    search: { slot: 1 },
  });
  expect(mocks.store.saveReadiness).not.toHaveBeenCalled();
  expectNoTrainingWrites();
});

it("lets the athlete skip a filled check-in and still open today's session without saving it", async () => {
  await render();
  await fill();
  await click(button("Pomiń na dziś"));
  expect(host.textContent).toContain("Check-in pominięty na dziś");
  expect(host.querySelector('form[aria-label="Check-in samopoczucia"]')).toBeNull();
  expect(mocks.store.state.readiness[mocks.store.todayIso]).toBeUndefined();
  expect(mocks.store.saveReadiness).not.toHaveBeenCalled();
  await click(host.querySelector<HTMLButtonElement>(".bw-plan-soon")!);
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/sesja/$date",
    params: { date: session.date },
    search: { slot: 1 },
  });
  expectNoTrainingWrites();
});

it("awaits an explicit readiness save, updates today's summary and preserves the 28-day plan", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const save = mocks.store.saveReadiness.getMockImplementation()!;
  mocks.store.saveReadiness.mockImplementation(async (value) => {
    await pending;
    await save(value);
  });
  const plan = mocks.store.state.plan;
  const completions = mocks.store.state.completions;
  const originalPlan = structuredClone(plan);
  await render();
  await fill();
  expect(mocks.store.saveReadiness).not.toHaveBeenCalled();
  await click(button("Zapisz check-in"));
  expect(mocks.store.saveReadiness).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      date: session.date,
      sleep: 8,
      fatigue: 3,
      soreness: 2,
      jointPain: 0,
    }),
  );
  expect(mocks.store.state.readiness[session.date]).toBeUndefined();
  expect(button("Zapisywanie…").disabled).toBe(true);
  await act(async () => {
    release();
    await pending;
  });
  await render();
  expect(host.querySelector(".bw-readiness-saved")?.textContent).toContain("Check-in zapisany");
  expect(mocks.store.state.readiness[session.date]).toMatchObject({
    sleep: 8,
    fatigue: 3,
    soreness: 2,
    jointPain: 0,
  });
  expect(mocks.store.state.plan).toBe(plan);
  expect(mocks.store.state.plan).toEqual(originalPlan);
  expect(mocks.store.state.plan).toHaveLength(28);
  expect(mocks.store.state.completions).toBe(completions);
  expect(issue()).toBeNull();
  expect(mocks.navigate).not.toHaveBeenCalled();
  expectNoTrainingWrites();
});

it.each([
  {
    name: "joint pain",
    values: ["8", "2", "2", "1"],
    location: "knee",
    expected: /wstrzymuje trening własny/,
  },
  {
    name: "low readiness",
    values: ["2", "9", "9", "0"],
    location: undefined,
    expected: /wymaga lżejszego planu/,
  },
])(
  "passes saved $name to the existing start policy without rewriting started or completed work",
  async ({ values, location, expected }) => {
    const others = ownSessions(mocks.store.state.plan).filter((day) => day.dbId !== session.dbId);
    const pinned = others.slice(0, 2).map((day, index) => ({
      session: day,
      completion: {
        status: index ? "completed" : "started",
        completed: Boolean(index),
        rpe: index ? 7 : null,
        notes: "Zapis wykonania",
        executionSnapshot: structuredClone(day),
      } as SessionCompletion,
    }));
    expect(pinned).toHaveLength(2);
    const completions = Object.fromEntries(
      pinned.map((item) => [item.session.dbId!, item.completion]),
    );
    mocks.store.state = { ...mocks.store.state, completions };
    const plan = mocks.store.state.plan;
    const before = structuredClone({ plan, completions });
    expect(issue()).toBeNull();
    await render();
    await fill(values, location);
    await click(button("Zapisz check-in"));
    await render();
    expect(mocks.store.saveReadiness).toHaveBeenCalledOnce();
    expect(mocks.store.state.readiness[session.date]).toBeDefined();
    expect(issue()).toMatch(expected);
    for (const item of pinned) expect(issue(item.completion, item.session)).toBeNull();
    expect(mocks.store.state.plan).toBe(plan);
    expect(mocks.store.state.completions).toBe(completions);
    expect({ plan: mocks.store.state.plan, completions: mocks.store.state.completions }).toEqual(
      before,
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
    expectNoTrainingWrites();
  },
);
