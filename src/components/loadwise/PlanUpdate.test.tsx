// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanScreen } from "./TrainingPlanScreen";
import { PlanLimitations } from "./PlanLimitations";
import { SessionStartPanel } from "./session/SessionStartPanel";
import { initialState } from "@/lib/loadwise/store/model";
import { gymAthlete } from "@/lib/loadwise/engineV2/testFixtures";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import { groupPlanIssues } from "@/lib/loadwise/planIssues";
import type { Issue } from "@/lib/loadwise/engineV2/model";
import type { LoadwiseState, Profile, SessionCompletion, SessionDay } from "@/lib/loadwise/types";
import type { PlanGymEvidence } from "@/lib/loadwise/planEvidence";

const mock = vi.hoisted(() => ({
  store: null as unknown as Record<string, unknown>,
  activate: vi.fn(),
  start: vi.fn(),
  gym: { loading: false, available: true, records: [] } as PlanGymEvidence,
}));
vi.mock("@/lib/loadwise/useGymEvidence", () => ({ useGymEvidence: () => mock.gym }));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: () => mock.store }));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "plan-test" } }) }));
vi.mock("@/components/loadwise/ui", () => ({
  AppHeader: ({ right }: { right?: ReactNode }) => right ?? null,
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    to,
    search,
    className,
  }: {
    children: ReactNode;
    to: string;
    search?: Record<string, string>;
    className?: string;
  }) => (
    <a href={`${to}${search ? `?${new URLSearchParams(search)}` : ""}`} className={className}>
      {children}
    </a>
  ),
}));

let root: Root, host: HTMLDivElement;
const profile: Profile = {
  ...gymAthlete,
  goal: "strength",
  doubleSessionsAllowed: "no",
} as Profile;
const TODAY = "2026-11-10";
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mock.activate.mockReset();
  mock.start.mockReset();
  mock.store = {
    state: { ...initialState, profile },
    todayIso: TODAY,
    hydrated: true,
    syncing: false,
    activatePlanV2: mock.activate,
    startSession: mock.start,
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function oldPlan(): SessionDay[] {
  const plan = generateTrainingPlan(profile, { startDate: "2026-11-09", weeks: 2 }).plan;
  return plan.map((day, i) => ({
    ...day,
    dbId: `s${i}`,
    dayDbId: `d${i}`,
    planDbId: "plan-1",
    generatorVersion: "ballwise-v2.17",
    secondSession: day.secondSession
      ? { ...day.secondSession, dbId: `s${i}b`, generatorVersion: "ballwise-v2.17" }
      : null,
  })) as SessionDay[];
}
const own = (plan: SessionDay[]) =>
  plan.flatMap((d) => [d, d.secondSession]).filter((s): s is SessionDay => !!s?.engineV2);

describe("an older unstarted session offers the plan update instead of Start", () => {
  it("shows “Zaktualizuj plan” linked to the preview and no Start", async () => {
    const plan = oldPlan();
    const session = own(plan).find((s) => s.date >= TODAY)!;
    mock.store.state = { ...initialState, profile, plan, completions: {}, readiness: {} };
    await act(async () => root.render(<SessionStartPanel session={session} canStart />));
    const link = host.querySelector("a")!;
    expect(link.textContent).toBe("Zaktualizuj plan");
    expect(link.getAttribute("href")).toBe("/plan?aktualizuj=1");
    expect(host.textContent).toContain("starszej wersji silnika");
    expect(host.textContent).toContain("historia zostają bez zmian");
    expect(host.querySelector("button")).toBeNull();
    expect(mock.start).not.toHaveBeenCalled();
  });

  it("a started older session keeps its way to continue (no update gate)", async () => {
    const plan = oldPlan();
    const session = own(plan).find((s) => s.date >= TODAY)!;
    const completions = {
      [session.dbId!]: { status: "started", completed: false } as SessionCompletion,
    };
    mock.store.state = { ...initialState, profile, plan, completions, readiness: {} };
    await act(async () => root.render(<SessionStartPanel session={session} canStart />));
    // Nothing to start again and no update demand: the runner continues the pinned session.
    expect(host.querySelector("a")).toBeNull();
    expect(host.querySelector("button")).toBeNull();
  });

  it("a current session still starts normally", async () => {
    const current = generateTrainingPlan(profile, { startDate: TODAY, weeks: 1 }).plan;
    const session = own(current).find((s) => s.date === TODAY) ?? own(current)[0];
    const withIds = { ...session, dbId: "now-1" } as SessionDay;
    mock.store.state = {
      ...initialState,
      profile,
      plan: [withIds],
      completions: {},
      readiness: {},
    };
    await act(async () => root.render(<SessionStartPanel session={withIds} canStart />));
    expect(host.querySelector("a")).toBeNull();
    expect(host.querySelector("button")).not.toBeNull();
  });

  it("the plan screen opened from the session shows the preview and activates it, keeping started work", async () => {
    const plan = oldPlan();
    const [first, second] = own(plan).filter((s) => s.date >= "2026-11-09");
    const completions: Record<string, SessionCompletion> = {
      [first.dbId!]: {
        status: "completed",
        completed: true,
        rpe: 6,
        notes: "",
        executionSnapshot: structuredClone(first),
      } as SessionCompletion,
      [second.dbId!]: {
        status: "started",
        completed: false,
        notes: "",
        executionSnapshot: structuredClone(second),
      } as SessionCompletion,
    };
    mock.store.state = {
      ...initialState,
      profile,
      plan,
      completions,
      activePlanId: "plan-1",
      readiness: {},
    } as LoadwiseState;
    mock.store.todayIso = second.date;
    await act(async () => root.render(<PlanScreen autoUpdate />));
    const save = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Zapisz plan"),
    )!;
    expect(save).toBeDefined();
    expect(mock.activate).not.toHaveBeenCalled();
    await act(async () => save.click());
    expect(mock.activate).toHaveBeenCalledOnce();
    const result = mock.activate.mock.calls[0][0];
    const kept = result.plan.find((d: SessionDay) => d.date === second.date);
    expect(kept.executionProtected).toBe(true);
    expect(kept.engineV2).toEqual(second.engineV2);
    expect(kept.generatorVersion).toBe("ballwise-v2.17");
    // Everything not started is current work.
    const fresh = result.plan.filter((d: SessionDay) => !d.executionProtected);
    expect(fresh.length).toBeGreaterThan(0);
    for (const d of fresh) if (d.engineV2) expect(d.generatorVersion).not.toBe("ballwise-v2.17");
  });
});

describe("plan limitations grouped by cause", () => {
  const issues: Issue[] = [
    {
      code: "UNMET_WEEKLY_TARGET",
      cause: "calendar",
      target: "strengthB",
      date: "2026-11-10",
      message: "Tydzień 1: nie znaleziono terminu na siłę B.",
    },
    {
      code: "UNMET_WEEKLY_TARGET",
      cause: "calendar",
      target: "speed",
      date: "2026-11-10",
      message: "Tydzień 1: nie znaleziono terminu na sprint.",
    },
    {
      code: "UNMET_WEEKLY_TARGET",
      cause: "calendar",
      target: "speed",
      date: "2026-11-17",
      message: "Tydzień 2: nie znaleziono terminu na sprint.",
    },
    {
      code: "UNMET_STIMULUS",
      cause: "equipment",
      date: "2026-11-09",
      message: "Brak sprzętu dla wykroku.",
    },
    {
      code: "UNMET_STIMULUS",
      cause: "equipment",
      date: "2026-11-09",
      message: "Brak sprzętu dla wykroku.",
    },
    {
      code: "UNMET_STIMULUS",
      cause: "preparation",
      date: "2026-11-09",
      message: "Wymaga przygotowania.",
    },
    { code: "METHOD_UNSUPPORTED", message: "Metoda nieobsługiwana." },
  ];

  it("groups by cause in a stable order, with days, targets and distinct messages", () => {
    const groups = groupPlanIssues(issues);
    expect(groups.map((g) => g.key)).toEqual(["calendar", "equipment", "preparation", "other"]);
    const calendar = groups[0];
    expect(calendar.count).toBe(3);
    expect(calendar.dates).toEqual(["2026-11-10", "2026-11-17"]);
    expect(calendar.targets).toEqual(["Siła B", "Sprint"]);
    expect(groups[1].count).toBe(1); // the repeated sentence is shown once
  });

  it("explains the cause and the right action; never advises raising the declared level", async () => {
    await act(async () => root.render(<PlanLimitations issues={issues} />));
    const text = host.textContent ?? "";
    expect(text).toContain("Brak miejsca w kalendarzu");
    expect(text).toContain("Dotyczy:");
    expect(text).toContain("Co zrobić:");
    expect(text).toContain("Przygotowanie niepotwierdzone");
    expect(text).not.toMatch(/uzupełnij staż|zawyż|podnieś (poziom|staż)/i);
    // The repeated technical sentences live behind a disclosure, not in the main text.
    expect(host.querySelectorAll("details")).toHaveLength(4);
  });

  it("renders nothing without limitations", async () => {
    await act(async () => root.render(<PlanLimitations issues={[]} />));
    expect(host.textContent).toBe("");
  });
});
