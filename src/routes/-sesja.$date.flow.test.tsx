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
  useLoadwise: () => ({ state: mocks.state, hydrated: true, todayIso: "2026-09-29" }),
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
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("session route gates", () => {
  it("waits for authentication and requires today's daily check-in before showing a runner", async () => {
    mocks.auth.loading = true;
    mocks.checkin.mockReturnValue(null);
    await render();
    expect(host.textContent).toBe("Uruchamianie");
    mocks.auth.loading = false;
    await render();
    expect(host.textContent).toContain("Najpierw check-in");
    expect(host.querySelector("[data-runner]")).toBeNull();
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((item) => item.textContent === "Przejdź do check-inu")!
        .click(),
    );
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/start" });
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
    expect(completionId()).toBe("session-2");
    mocks.search.slot = 1;
    await render();
    expect(host.querySelector("h1")?.textContent).toBe("Pierwszy sprint");
    expect(completionId()).toBeUndefined();
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
    mocks.state.runningActivities["session-1"] = {} as LoadwiseState["runningActivities"][string];
    await render();
    expect(completionId()).toBe("session-1");
  });
});
