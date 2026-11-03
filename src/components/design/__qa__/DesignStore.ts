/** QA-only adapters. No production route imports this file or contacts an account. */
import { initialState, buildProfile, applyExerciseReplacements } from "@/lib/loadwise/store/model";
import type { LoadwiseContextValue } from "@/lib/loadwise/store/model";
import { generatePlan } from "@/lib/loadwise/planEngine";
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
const plan = generatePlan(profile, new Date(2026, 10, 2), 14);
export const designState = { ...initialState, profile, plan };
export const useLoadwise = () =>
  ({
    state: designState,
    hydrated: true,
    hydrationError: null,
    loading: false,
    todayIso: today,
    todaySession: plan[0],
    updateProfile: async () => {},
    markEquipmentUnavailable: async () => {},
    completeOnboarding: async () => {},
    startSession: async () => {},
    completeSession: async () => {},
  }) as unknown as LoadwiseContextValue;
