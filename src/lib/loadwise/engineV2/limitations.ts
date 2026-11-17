import type { Profile } from "../types";
import { ROLE_NAMES, type LimitationCause, type Role } from "./model";
import { CANDIDATES, exerciseLimitation } from "./exercises";

/**
 * Structural cause of a missing role: recipe, equipment or preparation. When some candidate fails
 * only for a missing item the cause is equipment (the player can fix that by owning it);
 * otherwise a candidate blocked by verified preparation makes it preparation. The app never
 * suggests declaring a higher level to unlock an exercise.
 */
export function roleLimitation(
  p: Profile,
  role: Role,
  extra: readonly string[] = [],
): { cause: LimitationCause; blocked: string[] } {
  const ids = [...new Set([...extra, ...CANDIDATES[role]])];
  // A role with an eligible candidate has no equipment or preparation gap to explain.
  if (ids.some((id) => !exerciseLimitation(id, p, role))) return { cause: "recipe", blocked: [] };
  const blocked = ids.flatMap((id) => {
    const why = exerciseLimitation(id, p, role);
    return why ? [{ id, why }] : [];
  });
  const cause: LimitationCause = blocked.some((b) => b.why === "equipment")
    ? "equipment"
    : blocked.some((b) => b.why === "preparation")
      ? "preparation"
      : "recipe";
  return { cause, blocked: blocked.map((b) => b.id) };
}

/** Player-facing text for a missing role; never advises raising the declared experience. */
export function limitationText(cause: LimitationCause, role: Role, label?: string): string {
  const name = label ?? ROLE_NAMES[role];
  switch (cause) {
    case "equipment":
      return `Brak sprzętu lub miejsca dla zadania: ${name}. Dodaj brakujący sprzęt w ustawieniach, jeśli faktycznie go masz; zadanie nie zostanie zastąpione ćwiczeniem z masą ciała.`;
    case "preparation":
      return `Zadanie „${name}” wymaga przygotowania i nadzoru, których profil jeszcze nie potwierdza. Nie odblokuje go zmiana deklaracji bez rzeczywistego stażu; sesja zachowuje pracę wspierającą.`;
    case "time":
      return `Zadanie „${name}” nie mieści się w dostępnym czasie sesji.`;
    case "calendar":
      return `Zadanie „${name}” nie ma wolnego terminu w kalendarzu tego tygodnia.`;
    default:
      return `Brak zatwierdzonej receptury dla zadania: ${name}. Ten cel pozostaje niepokryty.`;
  }
}
