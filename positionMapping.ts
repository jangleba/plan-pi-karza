// Mapowanie pozycji z profilu zawodnika (onboarding) na grupy pozycyjne IQ.
// Profil jest jedynym źródłem prawdy — IQ nigdy nie zapisuje własnej pozycji.

import type { Position } from "@/lib/loadwise/types";
import type { IQPositionGroup } from "./types";

const MAP: Record<Position, IQPositionGroup | null> = {
  goalkeeper: null, // brak scenariuszy bramkarskich w MVP
  defender: "defender",
  midfielder: "midfielder",
  forward: "forward",
};

export function toIQPositionGroup(
  position: Position | null | undefined,
): IQPositionGroup | null {
  if (!position) return null;
  return MAP[position] ?? null;
}

export const IQ_GROUP_LABELS: Record<IQPositionGroup, string> = {
  defender: "Obrońca",
  midfielder: "Pomocnik",
  forward: "Napastnik",
};
