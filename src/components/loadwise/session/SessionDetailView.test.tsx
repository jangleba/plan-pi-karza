// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadwiseState, Profile, SessionDay, TrainingSection } from "@/lib/loadwise/types";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import { deriveRunningIntervalProtocol } from "@/lib/running/intervals";
import { recipeToProtocol } from "@/lib/running/recipeSession";
import { SessionDetailView } from "./SessionDetailView";

const mocks = vi.hoisted(() => ({
  state: null as unknown as LoadwiseState,
  today: "2026-11-02",
  navigate: vi.fn(),
  start: vi.fn(),
  runner: vi.fn(),
  recovery: vi.fn(),
  clock: vi.fn(),
  gps: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/lib/loadwise/auth", () => ({
  useAuth: () => ({ user: { id: "athlete" }, loading: false }),
}));
vi.mock("@/lib/loadwise/store", () => ({
  applyExerciseReplacements: (session: SessionDay) => session,
  useLoadwise: () => ({
    state: mocks.state,
    hydrated: true,
    todayIso: mocks.today,
    startSession: mocks.start,
    undoModification: vi.fn(),
    undoExerciseReplacement: vi.fn(),
    saveRunningActivity: vi.fn(),
    deleteRunningActivity: vi.fn(),
  }),
}));
vi.mock("@/lib/loadwise/uiHooks", () => ({ useDelayedFlag: () => false }));
vi.mock("./FocusedSessionRunner", () => ({
  FocusedSessionRunner: (props: {
    sections: TrainingSection[];
    start?: { onStart: () => void } | null;
  }) => {
    mocks.runner(props);
    return (
      <div data-saved-runner>
        {JSON.stringify(props.sections)}
        {props.start && <button onClick={props.start.onStart}>Start zapisanej sesji</button>}
      </div>
    );
  },
}));
vi.mock("@/components/running/RunClock", () => ({
  RunClock: (props: { session: SessionDay }) => {
    mocks.clock(props);
    return <div data-run-clock>{JSON.stringify(deriveRunningIntervalProtocol(props.session))}</div>;
  },
}));
vi.mock("@/components/running/EnduranceRunTracker", () => ({
  EnduranceRunTracker: (props: { session: SessionDay }) => {
    mocks.gps(props);
    return <div data-gps-counter />;
  },
}));
vi.mock("@/components/loadwise/preparation/PreparationGuide", () => ({
  RecoveryCoach: (props: unknown) => {
    mocks.recovery(props);
    return <div data-legacy-recovery />;
  },
  WarmupCoach: () => null,
}));
vi.mock("./MethodExecutionCoach", () => ({ MethodExecutionCoach: () => null }));
vi.mock("./StrengthExperienceSetup", () => ({ StrengthExperienceSetup: () => null }));
vi.mock("./ClubTacticsCard", () => ({ ClubTacticsCard: () => null }));
vi.mock("./SessionCompletion", () => ({
  ClubMonitoring: () => null,
  CompletionPanel: () => null,
  MatchStartPanel: () => null,
}));
vi.mock("./SessionChrome", () => ({
  SessionHeader: ({ session }: { session: SessionDay }) => <h1>{session.title}</h1>,
  SessionScreenShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SessionSkeleton: () => null,
  SessionSlotSwitcher: () => null,
}));
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DrawerContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

const profile: Profile = {
  name: "Athlete",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "mobility",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: [],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "full",
  trainingMethodPreferences: { mobilityFocus: "ankle" },
};

function generated(
  p: Profile,
  role: string,
  accepts: (session: SessionDay) => boolean = () => true,
): SessionDay {
  const plan = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 1 }).plan;
  const found = plan
    .flatMap((day) => [day, ...(day.secondSession ? [day.secondSession] : [])])
    .find((session) => session.engineV2?.roles.some((item) => item === role) && accepts(session));
  if (!found) throw new Error(`Missing generated ${role}`);
  return { ...found, dbId: `saved-${role}`, dayDbId: `day-${role}`, secondSession: null };
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.start.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function setSession(session: SessionDay, p = profile) {
  mocks.today = session.date;
  mocks.state = {
    profile: p,
    plan: [session],
    modifications: {},
    readiness: {},
    completions: {},
    exerciseReplacements: {},
    runningActivities: {},
  } as LoadwiseState;
}
async function render(session: SessionDay) {
  await act(async () =>
    root.render(
      <SessionDetailView
        date={session.date}
        slot={1}
        onBack={() => undefined}
        onSelect={() => undefined}
      />,
    ),
  );
}

describe("saved engine session execution", () => {
  it("offers explicit equipment replanning and hides an obsolete notice after a saved update", async () => {
    const p: Profile = {
      ...profile,
      goal: "strength",
      hasGym: true,
      equipment: ["barbell", "rack", "dumbbell"],
      gymExperienceLevel: "advanced",
      strengthTrainingMonths: 36,
      movementCompetence: "high",
      supervisionLevel: "full",
    };
    const session = generated(p, "strengthA");
    const original = session
      .structuredSections!.flatMap((section) => section.blocks.flatMap((block) => block.exercises))
      .find((e) => e.exerciseId === "heavy_back_squat")!;
    const unavailable = { ...p, unavailableEquipmentIds: ["barbell"] };
    setSession(session, unavailable);
    mocks.state.equipmentNotice =
      "Sprzęt zapisany. Zaktualizuj plan, aby dobrać ćwiczenia i dawki.";
    mocks.state.exerciseReplacements = {
      [session.date]: [
        {
          id: "request",
          date: session.date,
          exerciseId: original.id,
          original,
          replacement: original,
          equipmentIds: ["barbell"],
          createdAt: session.date,
        },
      ],
    };
    await render(session);
    expect(host.textContent).toContain("Sprzęt zapisany. Zaktualizuj plan");
    expect(host.querySelector('a[href="/plan"]')?.textContent).toBe("Zaktualizuj plan");
    expect(host.textContent).not.toContain("Ćwiczenie zostało zamienione");
    const next = generated(unavailable, "strengthA");
    mocks.state = { ...mocks.state, plan: [next] };
    await render(next);
    expect(host.querySelector('a[href="/plan"]')).toBeNull();
    expect(host.textContent).not.toContain("Sprzęt zapisany. Zaktualizuj plan");
  });
  it.each(["mobility", "recovery"])(
    "executes actual generated %s sections unchanged after a profile-focus edit",
    async (role) => {
      const p =
        role === "recovery"
          ? { ...profile, matchDate: "2026-11-04", matchDates: ["2026-11-04"] }
          : profile;
      const session = generated(p, role);
      const saved = structuredClone(session);
      setSession(session, p);
      await render(session);
      expect(mocks.runner.mock.lastCall?.[0].sections).toEqual(saved.structuredSections);
      expect(mocks.recovery).not.toHaveBeenCalled();

      mocks.state = {
        ...mocks.state,
        profile: { ...p, trainingMethodPreferences: { mobilityFocus: "hip" } },
      };
      await render(session);
      expect(mocks.runner.mock.lastCall?.[0].sections).toEqual(saved.structuredSections);
      expect(mocks.recovery).not.toHaveBeenCalled();
      const start = host.querySelector<HTMLButtonElement>("[data-saved-runner] button")!;
      expect(start).not.toBeNull();
      await act(async () => start.click());
      expect(mocks.start).toHaveBeenCalledWith(
        expect.objectContaining({
          engineV2: saved.engineV2,
          structuredSections: saved.structuredSections,
          sections: saved.sections,
        }),
      );
      expect(session).toEqual(saved);
    },
  );

  it("retains the legacy recovery coach only for sessions without the versioned prescription", async () => {
    const current = generated(profile, "mobility");
    const legacy = { ...current, engineV2: undefined, generatorVersion: undefined };
    setSession(legacy);
    await render(legacy);
    expect(mocks.recovery).toHaveBeenCalled();
    expect(host.querySelector("[data-legacy-recovery]")).not.toBeNull();
    expect(mocks.runner).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "passes one stored running recipe to preview, GPS and clock despite later profile changes (MAS=%s)",
    async (mas) => {
      const p: Profile = {
        ...profile,
        goal: "endurance",
        ...(mas
          ? { fieldMasKmh: 16, fieldMasTestedAt: "2026-11-01", fieldMasSourceSessionId: "test-1" }
          : {}),
      };
      const session = generated(
        p,
        "endurance",
        (candidate) => !mas || candidate.runningRecipe?.paceSource === "field_mas",
      );
      const saved = structuredClone(session);
      expect(saved.runningRecipe?.paceSource).toBe(mas ? "field_mas" : "effort");
      const protocol = recipeToProtocol(saved.runningRecipe!);
      setSession(session, p);
      await render(session);
      expect(host.querySelector('[aria-label="Plan biegu"]')).not.toBeNull();
      expect(deriveRunningIntervalProtocol(session)).toEqual(protocol);
      const previewText = host.querySelector('[aria-label="Plan biegu"]')!.textContent;

      mocks.state = {
        ...mocks.state,
        profile: { ...p, level: "beginner", fieldMasKmh: 9, runningProgressionLevel: 3 },
      };
      await render(session);
      expect(host.querySelector('[aria-label="Plan biegu"]')!.textContent).toBe(previewText);
      mocks.state = {
        ...mocks.state,
        completions: {
          [session.dbId!]: {
            status: "started",
            completed: false,
            rpe: null,
            notes: "",
            executionSnapshot: saved,
          },
        },
      };
      await render(session);
      const gpsSession = mocks.gps.mock.lastCall?.[0].session;
      expect(gpsSession.runningRecipe).toEqual(saved.runningRecipe);
      expect(deriveRunningIntervalProtocol(gpsSession)).toEqual(protocol);
      const clock = [...host.querySelectorAll("button")].find((b) => b.textContent === "Bez GPS")!;
      await act(async () => clock.click());
      const clockSession = mocks.clock.mock.lastCall?.[0].session;
      expect(clockSession.runningRecipe).toEqual(saved.runningRecipe);
      expect(deriveRunningIntervalProtocol(clockSession)).toEqual(protocol);
      expect(clockSession.structuredSections).toEqual(saved.structuredSections);
      expect(session).toEqual(saved);
      expect(mocks.recovery).not.toHaveBeenCalled();
    },
  );
});
