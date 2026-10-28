// @vitest-environment jsdom
import { act, Suspense, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadwiseState, Profile, SessionDay } from "@/lib/loadwise/types";
import { classifySession } from "@/lib/loadwise/sessionClassification";
import { sectionFixture, sessionFixture } from "@/components/loadwise/session/testFixtures";
import { Route } from "./sesja.$date";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  checkin: vi.fn(),
  startSession: vi.fn<(session: SessionDay) => Promise<void>>(),
  auth: { user: { id: "user-1" }, loading: false },
  search: { slot: 1, mod: undefined as string | undefined },
  state: {
    plan: [],
    profile: null,
    modifications: {},
    exerciseReplacements: {},
    completions: {},
    runningActivities: {},
    equipmentNotice: null,
  } as Pick<
    LoadwiseState,
    | "plan"
    | "profile"
    | "modifications"
    | "exerciseReplacements"
    | "completions"
    | "runningActivities"
    | "equipmentNotice"
  >,
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
    useParams: () => ({ date: "2026-09-29" }),
    useSearch: () => mocks.search,
  }),
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ navigate: mocks.navigate }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/loadwise/store", () => ({
  applyExerciseReplacements: (session: SessionDay) => session,
  useLoadwise: () => ({
    state: mocks.state,
    hydrated: true,
    todayIso: "2026-09-29",
    startSession: mocks.startSession,
  }),
}));
vi.mock("@/lib/loadwise/uiHooks", () => ({
  useInstantBack: () => mocks.navigate,
  useDelayedFlag: () => true,
}));
vi.mock("@/lib/loadwise/dailyPlanCheckin", () => ({ readDailyPlanCheckin: mocks.checkin }));
vi.mock("@/lib/loadwise/dailyCheckin", () => ({
  resolveEffectiveDay: (session: SessionDay) => session,
}));
vi.mock("@/lib/loadwise/runtimeSpeedRepair", () => ({
  repairRuntimeSpeedDay: (session: SessionDay) => session,
}));
vi.mock("@/components/loadwise/AppLaunchScreen", () => ({
  AppLaunchScreen: () => <div>Uruchamianie</div>,
}));
vi.mock("@/components/loadwise/ModifySheet", () => ({ ModifySheet: () => null }));
vi.mock("@/components/running/EnduranceRunTracker", () => ({ EnduranceRunTracker: () => null }));
vi.mock("@/components/loadwise/session/GenericRunner", () => ({
  StructuredSections: () => <div data-runner="generic" />,
}));
vi.mock("@/components/loadwise/session/SprintRunner", () => ({
  SprintStructuredSections: ({ onFinish }: { onFinish: () => void }) => (
    <button data-runner="sprint" onClick={onFinish}>
      Finish sprint
    </button>
  ),
}));
vi.mock("@/components/loadwise/session/StrengthRunner", () => ({
  StrengthStructuredSections: ({ onFinish }: { onFinish: () => void }) => (
    <button data-runner="strength" onClick={onFinish}>
      Finish strength
    </button>
  ),
}));
vi.mock("@/components/loadwise/session/SessionCompletion", () => ({
  CompletionPanel: ({ session }: { session: SessionDay }) => <div data-completion={session.dbId} />,
  ClubMonitoring: () => null,
  MatchStartPanel: () => null,
}));

const SessionDetail = Route.options.component as ComponentType & {
  preload?: () => Promise<unknown>;
};
let host: HTMLDivElement;
let root: Root;
async function render() {
  await act(async () =>
    root.render(
      <Suspense fallback="Ładowanie">
        <SessionDetail />
      </Suspense>,
    ),
  );
}
function completionId() {
  return host.querySelector<HTMLElement>("[data-completion]")?.dataset.completion;
}
async function startSelectedSession() {
  const button = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    (item) => item.textContent === "Rozpocznij trening",
  );
  expect(button).toBeDefined();
  await act(async () => {
    button!.click();
  });
  await render();
}

beforeAll(async () => {
  await SessionDetail.preload?.();
});

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mocks.navigate.mockReset();
  mocks.checkin.mockReset().mockReturnValue({});
  mocks.auth.loading = false;
  mocks.search.slot = 1;
  mocks.search.mod = undefined;
  mocks.state.plan = [sessionFixture()];
  mocks.state.profile = {} as Profile;
  mocks.state.modifications = {};
  mocks.state.exerciseReplacements = {};
  mocks.state.completions = {};
  mocks.state.runningActivities = {};
  mocks.startSession.mockReset().mockImplementation(async (session) => {
    // The store publishes the canonical started receipt after save_training_log.
    // Routing can enable this slot only after that state transition.
    mocks.state.completions = {
      ...mocks.state.completions,
      [session.dbId!]: {
        completed: false,
        status: "started",
        rpe: null,
        notes: "",
        writeVersion: 1,
        startedAt: "2026-09-29T10:00:00Z",
        executionSnapshot: { ...session, executionSlot: mocks.search.slot === 2 ? 2 : 1 },
      },
    };
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("session route gates", () => {
  it("allows reading sprint instructions before starting without mounting execution controls", async () => {
    mocks.state.plan = [
      sessionFixture({
        structuredSections: [
          sectionFixture("main", [{ id: "preview-sprint", name: "Sprint", speedRole: "primary" }]),
        ],
      }),
    ];
    await render();
    const details = host.querySelector<HTMLButtonElement>('[aria-label="Podgląd ćwiczeń"] button');
    expect(details).not.toBeNull();
    expect(details?.closest("fieldset[disabled]")).toBeNull();
    expect(details?.disabled).toBe(false);
    expect(host.querySelector("[data-runner]")).toBeNull();
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it("waits for authentication and opens today's runner without forcing a check-in", async () => {
    mocks.auth.loading = true;
    mocks.checkin.mockReturnValue(null);
    await render();
    expect(host.textContent).toBe("Uruchamianie");
    mocks.auth.loading = false;
    await render();
    expect(host.textContent).not.toContain("Najpierw check-in");
    expect(host.querySelector("h1")?.textContent).toBe(mocks.state.plan[0].title);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it("uses the selected sprint slot and resets completion visibility when the slot changes", async () => {
    const sections = [
      sectionFixture("main", [{ id: "sprint", name: "Sprint", speedRole: "primary" }]),
    ];
    const second = sessionFixture({
      dbId: "session-2",
      title: "Drugi sprint",
      speedGeneratorVersion: "test",
      structuredSections: sections,
    });
    mocks.state.plan = [
      sessionFixture({
        title: "Pierwszy sprint",
        speedGeneratorVersion: "test",
        structuredSections: sections,
        secondSession: second,
      }),
    ];
    mocks.search.slot = 2;
    await render();
    expect(host.querySelector("h1")?.textContent).toBe("Drugi sprint");
    expect(completionId()).toBeUndefined();
    expect(host.querySelector('[data-runner="sprint"]')).toBeNull();
    expect(completionId()).toBeUndefined();
    expect(mocks.startSession).not.toHaveBeenCalled();
    await startSelectedSession();
    expect(mocks.startSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ dbId: "session-2" }),
    );
    expect(mocks.state.completions["session-2"]).toMatchObject({
      status: "started",
      writeVersion: 1,
    });
    expect(completionId()).toBeUndefined();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-runner="sprint"]')!.click());
    expect(completionId()).toBe("session-2");
    mocks.search.slot = 1;
    await render();
    expect(host.querySelector("h1")?.textContent).toBe("Pierwszy sprint");
    expect(completionId()).toBeUndefined();
    await startSelectedSession();
    expect(mocks.startSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ dbId: "session-1" }),
    );
    await act(async () => host.querySelector<HTMLButtonElement>('[data-runner="sprint"]')!.click());
    expect(completionId()).toBe("session-1");
  });

  it("shows a removed second-slot message, while a selected added session takes precedence", async () => {
    mocks.search.slot = 2;
    await render();
    expect(host.textContent).toContain("Ten drugi slot nie występuje już w aktualnym planie");
    expect(completionId()).toBeUndefined();
    const added = sessionFixture({ dbId: "added-session", title: "Dodana jednostka" });
    mocks.state.modifications[added.date] = [
      {
        id: "mod-1",
        date: added.date,
        type: "add",
        reason: "",
        safetyStatus: "added_by_user",
        session: added,
        originalSession: null,
        createdAt: added.date,
      },
    ];
    mocks.search.mod = "mod-1";
    await render();
    expect(host.querySelector("h1")?.textContent).toBe("Dodana jednostka");
    expect(completionId()).toBeUndefined();
    await startSelectedSession();
    expect(mocks.startSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ dbId: "added-session" }),
    );
    expect(completionId()).toBe("added-session");
  });

  it("gates match completion until started and withholds it for paused training", async () => {
    mocks.state.plan = [sessionFixture({ dayType: "match" })];
    await render();
    expect(completionId()).toBeUndefined();
    mocks.state.completions["session-1"] = {
      completed: false,
      status: "started",
      rpe: null,
      notes: "",
    };
    await render();
    expect(completionId()).toBe("session-1");
    mocks.state.plan = [sessionFixture({ loadLabelOverride: "Wstrzymaj trening" })];
    await render();
    expect(completionId()).toBeUndefined();
  });

  it("requires a recorded activity before completing a field MAS test", async () => {
    const session = sessionFixture({ type: "endurance_running", title: "Test MAS" });
    session.classification = { ...classifySession(session), subcategory: "field_mas_test" };
    mocks.state.plan = [session];
    await render();
    expect(completionId()).toBeUndefined();
    await startSelectedSession();
    expect(mocks.state.completions["session-1"]).toMatchObject({
      status: "started",
      writeVersion: 1,
    });
    expect(completionId()).toBeUndefined();
    mocks.state.runningActivities["session-1"] = {
      id: "mas-result",
      sessionId: "session-1",
      date: session.date,
      durationSec: 300,
      distanceM: 1200,
      avgPaceSecPerKm: 250,
      source: "gps",
      isFieldMasTest: true,
      startedAt: "2026-09-29T10:00:00Z",
      endedAt: "2026-09-29T10:05:00Z",
      createdAt: "2026-09-29T10:05:00Z",
      updatedAt: "2026-09-29T10:05:00Z",
      writeVersion: 1,
      route: [],
      splits: [],
      intervalResults: [
        {
          stepId: "test",
          kind: "work",
          label: "Test 5 min",
          repeatIndex: 1,
          repeatTotal: 1,
          targetMode: "time",
          targetValue: 300,
          targetLabel: "5 min",
          durationSec: 300,
          distanceM: 1200,
          paceSecPerKm: 250,
          completed: true,
        },
      ],
    };
    await render();
    expect(completionId()).toBe("session-1");
  });
});
