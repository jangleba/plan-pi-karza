import type { Profile } from "./types";

/**
 * In the engine the only gym sessions are the coach's notes (for now). A saved layout, hand-picked
 * gym exercises, an upper-body contrast or a strength method used to push a gym player back to the
 * generic A/B week, so none of them is carried by a profile with a gym any more. Other equipment
 * and supervision answers stay. Without a gym nothing changes (home strength keeps its choices).
 */
export function withCoachNotesOnly<T extends Pick<Profile, "hasGym" | "trainingMethodPreferences">>(
  profile: T,
): T {
  const prefs = profile.trainingMethodPreferences;
  if (!profile.hasGym || !prefs) return profile;
  const {
    gymTemplate: _layout,
    gymExercises: _exercises,
    upperBodyContrast: _contrast,
    strength: _method,
    coachedIsometricPrimer: _primer,
    ...kept
  } = prefs;
  return { ...profile, trainingMethodPreferences: kept };
}
