// @vitest-environment jsdom
import { act, Suspense, type ComponentProps, type ComponentType, type ReactNode } from "react";
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
  todayIso: "2026-09-29",
  realSprint: false,
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
    todayIso: mocks.todayIso,
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
vi.mock("@/components/loadwise/session/FocusedSessionRunner", async (importOriginal) => {
  const { FocusedSessionRunner } =
    await importOriginal<typeof import("@/components/loadwise/session/FocusedSessionRunner")>();
  return {
    FocusedSessionRunner: (props: ComponentProps<typeof FocusedSessionRunner>) =>
      mocks.realSprint ? (
        <FocusedSessionRunner {...props} />
      ) : (
        <>
          <button data-strength-preview data-generic-preview data-preview-control>
            Instrukcja ćwiczenia
          </button>
          <button
            data-runner={props.kind === "general" ? "generic" : props.kind}
            disabled={!props.canRecord}
            onClick={props.onFinish}
          >
            Finish
          </button>
        </>
      ),
  };
});
vi.mock("@/lib/loadwise/setLogs", () => ({
  useExerciseSetLogs: () => ({ sets: [], saveSet: vi.fn().mockResolvedValue(true) }),
  plannedSets: () => 2,
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
  return document.querySelector<HTMLElement>("[data-completion]")?.dataset.completion;
}
async function openSummary() {
  const b = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    ["Zakończ trening", "Edytuj podsumowanie"].includes(b.textContent?.trim() ?? ""),
  );
  expect(b).toBeDefined();
  await act(async () => b!.click());
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
  mocks.todayIso = "2026-09-29";
  mocks.realSprint = false;
  window.localStorage.clear();
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
  it.each(["2026-09-28", "2026-09-29", "2026-09-30"])(
    "keeps strength instructions usable without enabling recording on %s",
    async (today) => {
      mocks.todayIso = today;
      mocks.state.plan = [
        sessionFixture({
          type: "strength_power",
          title: "Siła",
          sessionType: "strength_power",
          structuredSections: [
            sectionFixture("main", [
              { id: "squat", exerciseId: "goblet_squat", name: "Przysiad", sets: "2", reps: "8" },
            ]),
          ],
        }),
      ];
      await render();
      expect(
        host.querySelector<HTMLButtonElement>("[data-strength-preview]")?.matches(":disabled"),
      ).toBe(false);
      expect(
        host.querySelector<HTMLButtonElement>('[data-runner="strength"]')?.matches(":disabled"),
      ).toBe(true);
      expect(mocks.startSession).not.toHaveBeenCalled();
    },
  );
  it("keeps generic exercise instructions usable without allowing preview completion", async () => {
    mocks.state.plan = [
      sessionFixture({
        structuredSections: [sectionFixture("main", [{ id: "ball", name: "Technika z piłką" }])],
      }),
    ];
    await render();
    expect(
      host.querySelector<HTMLButtonElement>("[data-generic-preview]")?.matches(":disabled"),
    ).toBe(false);
    expect(
      host.querySelector<HTMLButtonElement>('[data-runner="generic"]')?.matches(":disabled"),
    ).toBe(true);
  });
  it("opens the completed sprint feedback from Progress without replaying the runner", async () => {
    const session = sessionFixture({
      title: "Zapisany sprint",
      speedGeneratorVersion: "test",
      structuredSections: [
        sectionFixture("main", [{ id: "sprint", name: "Sprint", speedRole: "primary" }]),
      ],
    });
    mocks.state.plan = [session];
    mocks.todayIso = "2026-09-30";
    mocks.state.completions["session-1"] = {
      completed: true,
      status: "completed",
      rpe: null,
      notes: "",
      durationMin: 30,
      executionSnapshot: session,
    };
    await render();
    expect(host.querySelector('[data-runner="sprint"]')).not.toBeNull();
    await openSummary();
    expect(completionId()).toBe("session-1");
    expect(mocks.startSession).not.toHaveBeenCalled();
  });
  it("opens the real drill instructions and animation through yesterday's complete session route", async () => {
    mocks.todayIso = "2026-09-30";
    mocks.realSprint = true;
    mocks.state.plan = [
      sessionFixture({
        speedGeneratorVersion: "test",
        structuredSections: [
          sectionFixture("main", [
            { id: "drill", exerciseId: "ankling", name: "Ankling", speedRole: "technical" },
          ]),
        ],
      }),
    ];
    await render();
    expect(host.querySelector(".bw-focused-runner")).not.toBeNull();
    const technique = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      b.textContent?.includes("Technika i animacja"),
    )!;
    await act(async () => technique.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Ankling");
    expect(document.querySelector("iframe")?.getAttribute("src")).toContain("id=ankling&embed=1");
    expect(host.textContent).toContain("Zapis wykonania będzie dostępny po rozpoczęciu");
    expect(
      [...host.querySelectorAll("button")].some((b) => b.textContent?.includes("Wykonane ·")),
    ).toBe(false);
    expect(mocks.startSession).not.toHaveBeenCalled();
    expect(mocks.state.completions).toEqual({});
    expect(window.localStorage.getItem("loadwise:sprint-progress:user-1:session-1")).toBeNull();
  });
  it.each(["2026-09-29", "2026-09-30"])(
    "keeps sprint teaching controls usable before recording on %s",
    async (today) => {
      mocks.todayIso = today;
      mocks.state.plan = [
        sessionFixture({
          speedGeneratorVersion: "test",
          structuredSections: [
            sectionFixture("main", [
              { id: "drill", exerciseId: "ankling", name: "Ankling", speedRole: "technical" },
            ]),
          ],
        }),
      ];
      await render();
      expect(
        host.querySelector<HTMLButtonElement>("[data-preview-control]")?.matches(":disabled"),
      ).toBe(false);
      expect(
        host.querySelector<HTMLButtonElement>('[data-runner="sprint"]')?.matches(":disabled"),
      ).toBe(true);
      expect(mocks.startSession).not.toHaveBeenCalled();
      expect(completionId()).toBeUndefined();
      if (today !== "2026-09-29")
        expect(host.textContent).toContain("Podgląd jednostki z innego dnia");
    },
  );
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
    await act(async () => host.querySelector<HTMLButtonElement>('[data-runner="sprint"]')!.click());
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
    await openSummary();
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
    await openSummary();
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
    await openSummary();
    expect(completionId()).toBe("session-1");
  });
});
