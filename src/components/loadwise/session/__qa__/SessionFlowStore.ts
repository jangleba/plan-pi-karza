/* eslint-disable @typescript-eslint/no-explicit-any */
/** Authored visual audit state. No account access or backend writes. */
import { useSyncExternalStore } from "react";
import cases from "./session-flow-cases.json";
import { initialState, applyExerciseReplacements } from "@/lib/loadwise/store/model";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import { INDIVIDUAL_FOOTBALL_DRILLS } from "@/lib/loadwise/individualFootballDrills";
export { applyExerciseReplacements };
const q = new URLSearchParams(location.search),
  kind = q.get("kind") || "strength";
const auditTodayIso = kind === "planning" ? "2026-11-16" : "2026-11-02";
/** "advanced": a real 16+ note session (A1/A2(/A3) groups) straight from the engine. */
function advancedCase() {
  const profile: any = {
    ...(cases as Record<string, any>).strength.profile,
    age: 20,
    level: "advanced",
    goal: "power",
    clubTrainingDays: [2, 4],
    individualTrainingDays: [1, 3, 5, 6, 7],
    seasonPhase: "preseason",
    hasGym: true,
    gymExperienceLevel: "advanced",
    strengthTrainingMonths: 24,
    movementCompetence: "high",
    supervisionLevel: "full",
    trainingMethodPreferences: { gymTemplate: "paired_power" },
    equipment: [
      "barbell",
      "rack",
      "dumbbell",
      "machine",
      "band",
      "bench",
      "box",
      "platform",
      "med_ball",
      "kettlebell",
      "gym_jump_lane",
      "trap_bar",
      "nordic_setup",
      "swiss_ball",
      "sliders",
    ],
  };
  const plan = generateTrainingPlan(profile, {
    startDate: "2026-11-02",
    weeks: 2,
    minutesPerSession: 75,
  }).plan;
  // `note=N_trapbar` (etc.) selects one of the four notes; otherwise the first note session.
  const note = new URLSearchParams(globalThis.location?.search ?? "").get("note");
  const day = plan
    .flatMap((d: any) => [d, ...(d.secondSession ? [d.secondSession] : [])])
    .find(
      (d: any) =>
        d.engineV2?.organization === "complex" && (!note || d.engineV2.advancedTemplate === note),
    );
  return {
    profile,
    session: {
      sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
      ...day,
      date: "2026-11-02",
      dbId: "qa-advanced",
    },
  };
}
/**
 * Two separate sport days from the real generator. Age, goal and gym tenure
 * match the reported example; high competence, full supervision and this
 * equipment are explicit QA assumptions, never inferred from those facts.
 * `day=B` selects the other day. The route date is fixed by this audit harness.
 */
function athleticCase() {
  const profile: any = {
    ...(cases as Record<string, any>).strength.profile,
    age: 21,
    goal: "endurance",
    level: "advanced",
    gymExperienceLevel: "advanced",
    strengthTrainingMonths: 48,
    movementCompetence: "high",
    supervisionLevel: "full",
    hasGym: true,
    clubTrainingDays: [],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    usualMatchDay: null,
    weeklyMatches: false,
    matchDate: null,
    matchDates: [],
    seasonPhase: "preseason",
    trainingMethodPreferences: { gymTemplate: "athletic_ab" },
    equipment: [
      "barbell",
      "rack",
      "trap_bar",
      "dumbbell",
      "bench",
      "machine",
      "band",
      "nordic_setup",
      "gym_jump_lane",
      "overhead_band_station",
      "low_band_station",
    ],
  };
  const plan = generateTrainingPlan(profile, {
    startDate: "2026-11-02",
    weeks: 1,
    minutesPerSession: 90,
  }).plan;
  const variant = q.get("day") === "B" ? "strengthB" : "strengthA";
  const day = plan
    .flatMap((entry) => [entry, ...(entry.secondSession ? [entry.secondSession] : [])])
    .find((entry) => entry.engineV2?.roles.includes(variant));
  if (!day) throw new Error(`QA sport day not generated: ${variant}`);
  return {
    profile,
    session: { ...day, date: "2026-11-02", dbId: `qa-athletic-${variant}` },
  };
}
/** The actual plan screen and generator, with an isolated save adapter below. */
function planningCase() {
  const profile: any = {
    ...(cases as Record<string, any>).strength.profile,
    healthPersonalizationEnabled: q.get("health") === "1",
    age: 21,
    goal: "endurance",
    level: "advanced",
    strengthTrainingMonths: 48,
    gymExperienceLevel: "advanced",
    movementCompetence: "high",
    supervisionLevel: "full",
    clubTrainingDays: [3, 5],
    usualMatchDay: null,
    weeklyMatches: false,
    matchDate: "2026-11-22",
    matchDates: ["2026-11-22"],
    doubleSessionsAllowed: "yes_if_safe",
    seasonPhase: "inseason",
    equipment: ["barbell", "rack", "dumbbell", "trap_bar", "band", "bench", "ball"],
  };
  const generated = generateTrainingPlan(profile, {
    startDate: auditTodayIso,
    minutesPerSession: 75,
  });
  const plan = generated.plan.map((day, index) => ({
    ...day,
    sections: day.sections ?? {
      warmup: [],
      main: [],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    dbId: `qa-planning-base-${index}`,
  }));
  return { profile, session: plan[0], plan };
}
const fixture =
  kind === "advanced"
    ? advancedCase()
    : kind === "athletic"
      ? athleticCase()
      : kind === "planning"
        ? planningCase()
        : (cases as Record<string, any>)[kind];
const selectedDrill =
  kind === "football"
    ? INDIVIDUAL_FOOTBALL_DRILLS.find((drill) => drill.id === q.get("drill"))
    : undefined;
// The field UI audit can open a canonical drill directly, without changing a
// production plan or inventing another set of technical instructions.
const session = selectedDrill
    ? {
        ...fixture.session,
        title: selectedDrill.name,
        structuredSections: undefined,
        sections: {
          warmup: [],
          main: [
            {
              ...fixture.session.sections.main[0],
              name: selectedDrill.name,
              exerciseId: selectedDrill.id,
              description: selectedDrill.steps.join(" "),
              instructionSteps: selectedDrill.steps.map((description, index) => ({
                title: ["Przygotuj", "Wykonaj", "Kontroluj"][index],
                description,
              })),
              cue: selectedDrill.quality,
            },
          ],
          accessory: [],
          footballTransfer: [],
          cooldown: [],
        },
      }
    : fixture.session,
  sid = session.dbId;
const listeners = new Set<() => void>(),
  receipts: any[] = [];
const planningStorageKey = "session66:qa-planning-saved";
function restoredPlanning() {
  if (kind !== "planning") return null;
  try {
    const value = JSON.parse(localStorage.getItem(planningStorageKey) || "null");
    return Array.isArray(value?.plan) && value.activePlanId === "qa-planning-saved" ? value : null;
  } catch {
    return null;
  }
}
const savedPlanning = restoredPlanning();
let state: any = {
  ...initialState,
  profile: { ...fixture.profile, healthPersonalizationEnabled: q.get("health") === "1" },
  plan: savedPlanning?.plan ?? fixture.plan ?? [session],
  activePlanId:
    savedPlanning?.activePlanId ??
    (kind === "planning" ? "qa-planning-base" : initialState.activePlanId),
};
const completion = (done = false) => ({
  completed: done,
  status: done ? "completed" : "started",
  rpe: done ? 7 : null,
  notes: "",
  durationMin: done ? session.durationMin : null,
  startedAt: new Date(Date.now() - 12 * 60000).toISOString(),
  endedAt: done ? new Date().toISOString() : null,
  executionSnapshot: session,
  writeVersion: 1,
});
if (q.get("phase") === "active" || q.get("phase") === "done")
  state.completions = { [sid]: completion(q.get("phase") === "done") };
function update(next: any) {
  state = next;
  listeners.forEach((fn) => fn());
}
Object.assign(window, { __sessionAudit: { state: () => state, receipts, session, kind } });
export function useLoadwise() {
  const current = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => state,
    () => state,
  );
  return {
    state: current,
    hydrated: true,
    todayIso: auditTodayIso,
    syncing: false,
    loading: false,
    todaySession: session,
    startSession: async (s: any) => {
      receipts.push({ kind: "start", session: s });
      update({ ...state, completions: { ...state.completions, [s.dbId]: completion() } });
    },
    completeSession: async (s: any, rpe: any, notes: any, details: any) => {
      receipts.push({ kind: "complete", session: s, rpe, notes, details });
      update({
        ...state,
        completions: {
          ...state.completions,
          [s.dbId]: {
            ...completion(true),
            rpe,
            notes,
            durationMin: details?.durationMin ?? s.durationMin,
          },
        },
      });
    },
    saveRunningActivity: async (draft: any) => {
      receipts.push({ kind: "run", draft });
      update({
        ...state,
        runningActivities: {
          ...state.runningActivities,
          [draft.sessionId]: { ...draft, id: "qa-run", createdAt: new Date().toISOString() },
        },
      });
    },
    deleteRunningActivity: async () => {},
    saveStrengthExperience: async (values: any) =>
      update({ ...state, profile: { ...state.profile, ...values } }),
    ...(kind === "planning"
      ? {
          activatePlanV2: async (result: any, isEvidenceCurrent?: () => boolean) => {
            if (isEvidenceCurrent && !isEvidenceCurrent())
              throw new Error("Audit plan evidence changed before the explicit save");
            receipts.push({ kind: "activate-plan", result });
            const plan = result.plan.map((day: any, index: number) => ({
              ...day,
              dbId: `qa-planning-saved-${index}-1`,
              ...(day.secondSession
                ? {
                    secondSession: {
                      ...day.secondSession,
                      dbId: `qa-planning-saved-${index}-2`,
                    },
                  }
                : {}),
            }));
            const persisted = { plan, activePlanId: "qa-planning-saved" };
            localStorage.setItem(planningStorageKey, JSON.stringify(persisted));
            update({ ...state, ...persisted });
          },
          saveReadiness: async (value: any) => {
            if (!state.profile?.healthPersonalizationEnabled)
              throw new Error("Readiness requires health consent");
            if (q.get("readinessError") === "1")
              throw new Error("Brak połączenia — check-in nie został zapisany");
            receipts.push({ kind: "readiness", value });
            update({ ...state, readiness: { ...state.readiness, [value.date]: value } });
          },
        }
      : {}),
    markEquipmentUnavailable: async () => {},
    undoModification: async () => {},
    undoExerciseReplacement: async () => {},
    applyModification: async () => {},
    updateProfile: async () => {},
    refreshPlanIfNeeded: async () => {},
  };
}
