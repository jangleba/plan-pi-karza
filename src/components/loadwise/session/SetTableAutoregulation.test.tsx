// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SetTable } from "./runner/SetTable";
import { sectionFixture, sessionFixture } from "./testFixtures";
import type { Profile, SessionCompletion, TrainingExercise } from "@/lib/loadwise/types";
import type { Readiness } from "@/lib/loadwise/types";
import { buildReadiness } from "@/lib/loadwise/readinessModel";
import type { GymRecord, GymEquipment } from "@/lib/loadwise/gymEvidence";
import { exercisePrescriptionKey } from "@/lib/loadwise/setLogHistory";
import type { ExerciseSessionLog, HistorySetLog } from "@/lib/loadwise/setLogHistory";

const m = vi.hoisted(() => ({
  current: {} as Record<number, HistorySetLog>,
  history: [] as ExerciseSessionLog[],
  completions: {} as Record<string, SessionCompletion>,
  readiness: {} as Record<string, Readiness>,
  healthEnabled: false,
  gymRecords: [] as GymRecord[],
  saveGym: vi.fn(),
  saveSet: vi.fn(async () => true),
}));
vi.mock("@/lib/loadwise/useGymEvidence", () => ({
  useGymEvidence: () => ({
    records: m.gymRecords,
    available: true,
    loading: false,
    error: null,
    save: m.saveGym,
  }),
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "athlete" } }) }));
vi.mock("@/lib/loadwise/setLogs", async (load) => ({
  ...(await load<typeof import("@/lib/loadwise/setLogs")>()),
  useExerciseSetLogs: () => ({
    current: m.current,
    previous: {},
    recentSessions: m.history,
    loading: false,
    saveSet: m.saveSet,
  }),
}));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({
    todayIso: "2026-11-15",
    state: {
      profile: { ...profile, healthPersonalizationEnabled: m.healthEnabled },
      completions: m.completions,
      readiness: m.readiness,
      plan: [],
    },
  }),
}));
const profile: Profile = {
  name: "Test",
  age: 20,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: ["dumbbell"],
  painInjury: false,
  doubleSessionsAllowed: "no",
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
};
const e: TrainingExercise = {
  id: "main",
  exerciseId: "goblet_squat",
  name: "Przysiad goblet",
  sets: "3",
  reps: "4",
  rir: "2",
  engineDose: { sets: 3, reps: 4, rir: 2, restSeconds: 180, intent: "controlled" },
};
const gear: GymEquipment = {
  kind: "equipment",
  version: 1,
  exerciseId: "goblet_squat",
  id: "10000000-0000-4000-8000-000000000001",
  label: "Sztanga",
  convention: "total",
  incrementKg: 2.5,
};
const record = (key: string, payload: GymRecord["payload"]): GymRecord => ({
  user_id: "athlete",
  record_key: key,
  payload,
  revision: 1,
  last_operation_id: "op",
  updated_at: "2026-11-14T10:00:00Z",
});
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  m.current = {};
  m.history = [];
  m.completions = {};
  m.readiness = {};
  m.healthEnabled = false;
  m.gymRecords = [record("equipment:goblet_squat", gear)];
  m.saveGym.mockReset().mockResolvedValue({});
  m.saveSet.mockClear();
  for (const [i, date] of ["2026-11-12", "2026-11-08"].entries()) {
    const sessionId = `s${i}`,
      sets = [1, 2, 3].map((setNumber) => ({ setNumber, weightKg: 80, reps: 4, rir: 3 }));
    m.history.push({ sessionKey: sessionId, performedAt: date, sets });
    m.completions[sessionId] = {
      completed: true,
      status: "completed",
      rpe: 6,
      notes: "",
      executionSnapshot: sessionFixture({
        dbId: sessionId,
        date,
        structuredSections: [sectionFixture("main", [e])],
      }),
    };
    m.gymRecords.push(
      record(`response:${sessionId}:goblet_squat`, {
        kind: "response",
        version: 1,
        sessionId,
        exerciseId: "goblet_squat",
        decision: "accept",
        chosenKg: 80,
        suggestedKg: 80,
        equipment: gear,
        prescriptionKey: exercisePrescriptionKey(e),
        suggestionKey: "past",
      }),
    );
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () =>
    root.render(
      <SetTable
        exercise={e}
        sessionId="today"
        date="2026-11-15"
        logKey="goblet_squat"
        kind="load"
        sets={{ min: 3, max: 3 }}
        withRir
        unilateral={false}
        canRecord
        onSetSaved={() => {}}
        title="Przysiad goblet"
      />,
    ),
  );
}
it("shows a real recommendation and a mobile-accessible explanation without automatically increasing the field", async () => {
  await render();
  expect(host.textContent).toContain("Propozycja: 82.5 kg");
  expect(host.querySelector("details summary")?.textContent).toBe("Dlaczego taki ciężar?");
  expect(host.querySelector<HTMLInputElement>('[aria-label="Seria 1: ciężar w kg"]')?.value).toBe(
    "80",
  );
});
it("preserves the actual set when the optional load-response write cannot be confirmed", async () => {
  m.saveGym.mockRejectedValueOnce(new Error("Version conflict"));
  await render();
  await act(async () =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Spróbuję")!.click(),
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Zatwierdź serię 1"]')!.click(),
  );
  expect(m.saveSet).toHaveBeenCalledWith(expect.objectContaining({ weightKg: 82.5, reps: 4 }));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Seria zapisana");
});
it("lets today's real check-in override the positive recommendation and re-evaluates it on state change", async () => {
  m.healthEnabled = true;
  m.readiness["2026-11-15"] = buildReadiness("2026-11-15", { sleep: 2, fatigue: 8, jointPain: 0 });
  await render();
  expect(host.textContent).not.toContain("Propozycja: 82.5 kg");
  expect(host.textContent).toContain("Lżejsza dawka; punkt odniesienia 80 kg");
  m.readiness = {
    "2026-11-15": buildReadiness("2026-11-15", { sleep: 9, fatigue: 2, jointPain: 0 }),
  };
  await render();
  expect(host.textContent).toContain("Propozycja: 82.5 kg");
});
it("uses the started session's persisted lighter preference instead of increasing from old successes", async () => {
  m.completions.today = {
    completed: false,
    status: "started",
    rpe: null,
    notes: "",
    executionSnapshot: sessionFixture({
      dbId: "today",
      date: "2026-11-15",
      engineV2: { roles: ["strengthA"] } as NonNullable<
        import("@/lib/loadwise/types").SessionDay["engineV2"]
      >,
      strengthCheckIn: {
        version: 1,
        loadPreference: "lighter",
        date: "2026-11-15",
        recordedAt: "2026-11-15T08:00:00Z",
      },
    }),
  };
  await render();
  expect(host.textContent).toContain("Propozycja zmniejszenia: 75 kg");
  expect(host.querySelector<HTMLInputElement>('[aria-label="Seria 1: ciężar w kg"]')?.value).toBe(
    "75",
  );
});
it("prefills the next set with the reduced load after failure", async () => {
  m.current = { 1: { setNumber: 1, weightKg: 80, reps: 4, rir: 0 } };
  await render();
  expect(host.textContent).toContain("Propozycja zmniejszenia: 75 kg");
  expect(host.querySelector<HTMLInputElement>('[aria-label="Seria 2: ciężar w kg"]')?.value).toBe(
    "75",
  );
});
it("does not copy last set's RIR into an unperformed set", async () => {
  m.current = { 1: { setNumber: 1, weightKg: 80, reps: 4, rir: 3 } };
  await render();
  expect(host.querySelector('[aria-label="Seria 2: zapas 3"]')?.getAttribute("aria-pressed")).toBe(
    "false",
  );
});
it("only fills the proposed higher load after explicit acceptance", async () => {
  await render();
  expect(host.querySelector<HTMLInputElement>('[aria-label="Seria 1: ciężar w kg"]')?.value).toBe(
    "80",
  );
  await act(async () =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Spróbuję")!.click(),
  );
  expect(host.querySelector<HTMLInputElement>('[aria-label="Seria 1: ciężar w kg"]')?.value).toBe(
    "82.5",
  );
  expect(m.saveGym).not.toHaveBeenCalled();
});
it("persists a voluntary refusal separately from actual performance", async () => {
  await render();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Zostaję przy swoim")!
      .click(),
  );
  await act(async () =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Zapisz serię")!.click(),
  );
  expect(m.saveGym).toHaveBeenCalledWith(
    expect.objectContaining({ decision: "hold", chosenKg: 80, suggestedKg: 82.5 }),
  );
  expect(m.saveSet).toHaveBeenCalledWith(
    expect.objectContaining({ weightKg: 80, reps: 4, rir: null }),
  );
});
it("keeps manual entry available when equipment and its kg convention are unknown", async () => {
  m.gymRecords = [];
  await render();
  expect(host.textContent).not.toContain("Propozycja: 82.5 kg");
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Seria 1: ciężar w kg"]')?.disabled,
  ).toBe(false);
  expect(host.textContent).toContain("Ustaw dostępne ciężary");
});
