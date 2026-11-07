/** QA-only adapters. No production route imports this file or contacts an account. */
import { useSyncExternalStore } from "react";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { SessionDay } from "@/lib/loadwise/types";
import { initialState, buildProfile, applyExerciseReplacements } from "@/lib/loadwise/store/model";
import type { LoadwiseContextValue } from "@/lib/loadwise/store/model";
import { generatePlan } from "@/lib/loadwise/planEngine";
import { isStrengthSession } from "@/lib/loadwise/sessionClassification";
import { legacyStrengthSession } from "./LegacyStrengthSession";
export { applyExerciseReplacements };
const today = "2026-11-02";
const profile = buildProfile(
  { full_name: "Jan Kowalski", onboarding_completed: true },
  {
    age: 20,
    position: "forward",
    level: "intermediate",
    main_goal: "speed",
    season_phase: "inseason",
    club_training_days: [1, 3],
    match_date: "2026-11-08",
    has_gym: true,
    has_pitch: true,
    has_sprint_space: true,
  },
  null,
)!;
const journeyQA = new URLSearchParams(location.search).get("screen") === "journey";
if (journeyQA) {
  profile.goal = "strength";
  profile.seasonPhase = "offseason";
  profile.individualTrainingDays = [1, 2, 3, 4, 5, 6, 7];
  profile.unavailableDays = [];
  profile.clubTrainingDays = [];
  profile.matchDate = null;
  profile.matchDates = [];
  profile.weeklyMatches = false;
  profile.gymExperienceLevel = "intermediate";
  profile.strengthTrainingMonths = 12;
  profile.movementCompetence = "high";
  profile.supervisionLevel = "some";
}
if (new URLSearchParams(location.search).get("screen") === "strength-engine") {
  const q = new URLSearchParams(location.search);
  const experience = q.get("experience");
  profile.goal = q.get("goal") === "power" ? "power" : "strength";
  if (q.get("slot") === "B")
    Object.assign(profile, {
      age: 24,
      position: "midfielder",
      level: "advanced",
      createdAt: "2026-11-02",
      seasonPhase: "inseason",
      seasonPhaseOverride: true,
      seasonStage: "match_week",
      usualMatchDay: 7,
      matchDate: "2026-11-08",
      weeklyMatches: true,
      clubTrainingDays: [1, 3],
      individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
      unavailableDays: [],
      doubleSessionsAllowed: "no",
      competitionLevel: "iv_liga",
    });
  if (experience === "advanced" || experience === "intermediate" || experience === "beginner") {
    profile.gymExperienceLevel = experience;
    profile.strengthTrainingMonths =
      experience === "advanced" ? 36 : experience === "intermediate" ? 12 : 3;
    profile.movementCompetence = experience === "beginner" ? "low" : "high";
    profile.supervisionLevel = "some";
    if (q.get("tenure") === "blank") {
      profile.strengthTrainingMonths = undefined;
      profile.supervisionLevel = "none";
    }
  }
}
if (new URLSearchParams(location.search).get("screen") === "methods")
  Object.assign(profile, {
    age: 25,
    gymExperienceLevel: "advanced",
    strengthTrainingMonths: 36,
    movementCompetence: "high",
    supervisionLevel: "full",
  });
let plan = generatePlan(profile, new Date(2026, 10, 2), 14);
if (journeyQA) {
  // Stable generated exercises, with a known session to exercise the actual route gates.
  const strength = plan.find(isStrengthSession);
  if (!strength) throw new Error("Navigation fixture requires a generated strength session");
  plan = plan.map((day, index) => ({
    ...(index === 0
      ? { ...strength, date: day.date, dayName: day.dayName, secondSession: null }
      : day),
    dbId: `qa-journey-${index}`,
  }));
  if (new URLSearchParams(location.search).get("legacy") === "1")
    plan = [legacyStrengthSession(), ...plan];
}
const startQA = new URLSearchParams(location.search).get("screen") === "start";
if (startQA) {
  profile.healthPersonalizationEnabled = true;
  profile.individualTrainingDays = [1, 2, 3, 4, 5, 6, 7];
  profile.unavailableDays = [];
  profile.clubTrainingDays = [];
  profile.matchDate = null;
  profile.matchDates = [];
  profile.weeklyMatches = false;
  const sample = sessionFixture({
    dbId: "qa-start",
    date: today,
    dayName: "Poniedziałek",
    type: "strength_power",
    sessionType: "Siła",
    title: "Siła",
    intensity: "wysoka",
    durationMin: 60,
    sections: {
      warmup: [{ name: "Przygotowanie", prescription: "8 min" }],
      main: [{ name: "Przysiad", prescription: "4 × 8" }],
      accessory: [],
      footballTransfer: [],
      cooldown: [{ name: "Wyciszenie", prescription: "5 min" }],
    },
  });
  plan = [
    sample,
    ...plan.slice(1).map((day) => ({
      ...day,
      executionProtected: false,
      externalCommitment: false,
      isUnavailable: false,
      dayType: "rest" as const,
      durationMin: 0,
      classification: undefined,
      isClubSession: false,
      isOwnSession: false,
      isRecoveryOrPrehab: false,
      type: "rest" as const,
      title: "Wolne",
      sessionType: "Wolne",
      intensity: "niska" as const,
      mdLabel: null,
      secondSession: null,
      sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
      structuredSections: undefined,
      exercises: [],
    })),
  ];
  if (new URLSearchParams(location.search).get("second") === "1") {
    profile.doubleSessionsAllowed = "light_only";
    plan[0].slotLabel = "Sesja 1";
    plan[0].secondSession = sessionFixture({
      dbId: "qa-second",
      date: today,
      dayName: "Poniedziałek",
      type: "endurance_running",
      sessionType: "Lekki bieg",
      title: "Lekki bieg",
      intensity: "niska",
      durationMin: 20,
      slotLabel: "Sesja 2",
      sections: {
        warmup: [],
        main: [{ name: "Bieg", prescription: "20 min" }],
        accessory: [],
        footballTransfer: [],
        cooldown: [],
      },
    });
  }
  if (new URLSearchParams(location.search).get("locked") === "1") plan[0].executionProtected = true;
}
export let designState = { ...initialState, profile, plan };
const listeners = new Set<() => void>();
const changes: string[] = [];
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const snapshot = () => designState;
if (startQA)
  Object.assign(window, { __startQA: { plan: () => designState.plan, changes, healthWrites: 0 } });
if (journeyQA)
  Object.assign(window, { __journeyQA: { state: () => designState, starts: [] as string[] } });
export const useLoadwise = () => {
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  return {
    state,
    hydrated: true,
    syncing: false,
    planGenerating: false,
    hydrationError: null,
    loading: false,
    todayIso: today,
    todaySession: state.plan[0],
    saveStrengthExperience: async (
      value: import("@/lib/loadwise/strengthExperience").StrengthExperience,
    ) => {
      designState = { ...designState, profile: { ...designState.profile!, ...value } };
      for (const fn of listeners) fn();
    },
    updateProfile: async () => {},
    markEquipmentUnavailable: async () => {},
    completeOnboarding: async () => {},
    startSession: async (session: SessionDay) => {
      if (!journeyQA || !session.dbId) return;
      (window as unknown as { __journeyQA: { starts: string[] } }).__journeyQA.starts.push(
        session.dbId,
      );
      designState = {
        ...designState,
        completions: {
          ...designState.completions,
          [session.dbId]: {
            completed: false,
            status: "started",
            rpe: null,
            notes: "",
            writeVersion: 1,
            startedAt: new Date().toISOString(),
            executionSnapshot: session,
          },
        },
      };
      for (const fn of listeners) fn();
    },
    completeSession: async () => {},
    refreshPlanIfNeeded: async () => {},
    applyModification: async (date: string, _kind: string, replacement: SessionDay) => {
      changes.push(date);
      designState = {
        ...designState,
        plan: designState.plan.map((day) =>
          day.date === date ? { ...replacement, dbId: day.dbId } : day,
        ),
      };
      for (const fn of listeners) fn();
    },
    saveReadiness: async () => {
      throw new Error("Start must not collect health answers");
    },
  } as unknown as LoadwiseContextValue;
};
