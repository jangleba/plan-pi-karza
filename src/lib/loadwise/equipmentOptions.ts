/**
 * Equipment the athlete can tick in onboarding. Strength labels resolve to
 * equipment ids through the exercise library aliases; the goal is read by the
 * solo football engine. Football ownership is explicit, not inferred from a goal
 * or pitch access. Stored as these labels in athlete_profiles.equipment.
 */
export const OWN_EQUIPMENT_OPTIONS = [
  "Piłka nożna",
  "Bramka lub mini-bramka",
  "Hantle",
  "Kettlebell",
  "Guma oporowa",
  "Ławka",
  "Skrzynia plyometryczna",
  "Piłka lekarska",
] as const;
