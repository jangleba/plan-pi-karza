import { useSyncExternalStore } from "react";
import { initialState, buildProfile, type LoadwiseContextValue } from "@/lib/loadwise/store/model";
import { createProfileActions } from "@/lib/loadwise/store/profileActions";
import type { ProfileSaveRefs, ProfileSaveStage } from "@/lib/loadwise/profileSave";
const profile = buildProfile(
  { full_name: "Jan", onboarding_completed: false },
  {
    age: 22,
    position: "forward",
    level: "intermediate",
    main_goal: "endurance",
    secondary_limiter: "endurance",
    has_gym: true,
    has_pitch: true,
    has_sprint_space: true,
    club_training_days: [1, 3],
  },
  null,
)!;
Object.assign(profile, {
  birthDate: "2004-05-15",
  accountOwnerType: "athlete",
  secondaryLimiter: "endurance",
  individualTrainingDays: [1, 2, 3, 4, 5, 6],
  seasonPhaseOverride: true,
  seasonPhase: "inseason",
  seasonStage: "no_match_week",
  competitionLevel: "iv_liga",
  guardianConsent: true,
  weeklyMatches: false,
  matchDate: null,
  usualMatchDay: null,
  currentPitchFeelings: ["fading_late_in_match"],
  desiredPitchFeelings: ["ready_full_match"],
});
// ?fresh=1 starts like a new account (no saved answers).
const fresh =
  typeof location !== "undefined" && new URLSearchParams(location.search).get("fresh") === "1";
let state = { ...initialState, profile: fresh ? null : profile },
  stage: ProfileSaveStage | null = null;
let snapshot: { state: typeof state; stage: ProfileSaveStage | null } = { state, stage };
const listeners = new Set<() => void>();
const emit = () => {
  snapshot = { state, stage };
  for (const fn of listeners) fn();
};
const refs = { current: { attempt: null, flight: null, key: null } as ProfileSaveRefs },
  user = { id: "design37" };
export function useLoadwise() {
  const current = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => snapshot,
    () => snapshot,
  );
  const actions = createProfileActions({
    user,
    state,
    getState: () => state,
    setState: (update) => {
      state = (typeof update === "function" ? update(state) : update) as typeof state;
      emit();
    },
    todayIso: "2026-11-04",
    profileSaveRefs: refs,
    onProfileSaveStage: (value) => {
      stage = value;
      emit();
    },
  });
  return {
    state: current.state,
    hydrated: true,
    profileSaveStage: current.stage,
    ...actions,
  } as LoadwiseContextValue;
}
