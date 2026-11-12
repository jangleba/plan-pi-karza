import type { Profile } from "./types";

type ReadinessInputs = Pick<
  Profile,
  | "age"
  | "gymExperienceLevel"
  | "strengthTrainingMonths"
  | "movementCompetence"
  | "supervisionLevel"
  | "painInjury"
  | "seasonPhase"
>;

/**
 * Młodszy zawodnik (13–15 lat) przygotowany do strukturalnej pracy siłowej.
 *
 * Wiek sam nie mówi o dojrzałości ani przygotowaniu, więc nie ma progu „od 16
 * lat”. Decyduje to, co zawodnik jawnie zadeklarował w ustawieniach siły: staż
 * (co najmniej 6 miesięcy regularnej pracy), poziom na siłowni (co najmniej
 * średni), technika (nie niska) i nadzór dorosłego (choćby częściowy). Bez
 * tych odpowiedzi zostaje ostrożny wariant techniczny. Dzieci (do 12 lat) i
 * zawodnicy z bólem lub po urazie zawsze dostają wariant techniczny.
 */
export function isPreparedYouthLifter(
  profile: Partial<ReadinessInputs> | null | undefined,
): boolean {
  if (!profile) return false;
  const age = profile.age;
  if (typeof age !== "number" || !Number.isFinite(age) || age < 13 || age > 15) return false;
  if (profile.painInjury || profile.seasonPhase === "return_injury") return false;
  return (
    (profile.gymExperienceLevel === "intermediate" || profile.gymExperienceLevel === "advanced") &&
    (profile.strengthTrainingMonths ?? 0) >= 6 &&
    (profile.movementCompetence === "medium" || profile.movementCompetence === "high") &&
    (profile.supervisionLevel === "some" || profile.supervisionLevel === "full")
  );
}
