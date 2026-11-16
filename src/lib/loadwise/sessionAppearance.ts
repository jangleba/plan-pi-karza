import type { SessionDay } from "./types";
import { classifySession } from "./sessionClassification";

export type SessionTone = "motion" | "strength" | "recovery" | "warning" | "carry" | "neutral";
export interface SessionAppearance {
  tone: SessionTone;
  label: string;
}

/** Presentation follows the same session classification as the training engine. */
export function sessionAppearance(session: SessionDay): SessionAppearance {
  if (session.isUnavailable) return { tone: "neutral", label: "Niedostępność" };
  const c = session.engineV2
    ? classifySession(session)
    : (session.classification ?? classifySession(session));
  if (c.subcategory === "ball_technical") return { tone: "carry", label: "Piłka" };
  switch (c.category) {
    case "gym_strength":
      return { tone: "strength", label: "Siła" };
    case "speed_sprint":
      return { tone: "motion", label: "Sprint" };
    case "endurance_conditioning":
      return { tone: "motion", label: "Bieganie" };
    case "recovery_prehab":
    case "mobility":
      return { tone: "recovery", label: "Regeneracja" };
    case "rest":
      return { tone: "neutral", label: "Odpoczynek" };
    case "match":
      return { tone: "warning", label: "Mecz" };
    case "club":
      return { tone: "carry", label: "Klub" };
    default:
      return { tone: "neutral", label: "Trening" };
  }
}
