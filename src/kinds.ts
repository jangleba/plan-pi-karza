import type { SessionKind } from "./engine";

/** Nazwy rodzajów sesji w interfejsie (Plan, Start). */
export const KIND_LABEL: Record<SessionKind, string> = {
  strength: "Siła",
  run: "Bieganie",
  sprint: "Sprint",
  technique: "Technika z piłką",
  activation: "Aktywacja",
  recovery: "Regeneracja",
};
