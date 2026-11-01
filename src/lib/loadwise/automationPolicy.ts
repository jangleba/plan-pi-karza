export type AutomationSessionCategory =
  "gym" | "speed" | "endurance" | "ball" | "recovery" | "club" | "match" | "other";

export type MdPlusOneMode = "recovery" | "mixed" | "compensation";

export interface MdPlusOneDecision {
  mode: MdPlusOneMode;
  durationMin: number;
  title: string;
  reason: string;
}

export function resolveMdPlusOne(
  matchMinutes: number | null,
  readiness: number | null,
): MdPlusOneDecision {
  const hasMinutes = matchMinutes != null && Number.isFinite(matchMinutes) && matchMinutes >= 0;
  const hasReadiness = readiness != null && Number.isFinite(readiness) && readiness >= 1 && readiness <= 10;
  if ((hasMinutes && matchMinutes >= 60) || (hasReadiness && readiness <= 5)) {
    return {
      mode: "recovery",
      durationMin: 20,
      title: "Regeneracja pomeczowa",
      reason:
        hasMinutes && matchMinutes >= 60
          ? "Wysoki udział w meczu: tylko spokojne rozruszanie i mobilność."
          : "Niższa gotowość: kompensacja została zastąpiona regeneracją.",
    };
  }
  if (!hasMinutes) {
    return {
      mode: "mixed",
      durationMin: 25,
      title: "MD+1 — lekka sesja do potwierdzenia",
      reason: "Brakuje minut meczowych, więc aplikacja wybiera ostrożny wariant pośredni.",
    };
  }
  if (!hasReadiness) {
    return {
      mode: "mixed",
      durationMin: 25,
      title: "MD+1 — lekka sesja do potwierdzenia",
      reason:
        "Brak oceny gotowości: krótki występ nie potwierdza, że można zwiększyć obciążenie.",
    };
  }
  if (matchMinutes < 30 && readiness >= 6) {
    return {
      mode: "compensation",
      durationMin: 35,
      title: "Kompensacja po krótkim występie",
      reason: "Krótki udział w meczu i wystarczająca gotowość pozwalają na kontrolowany bodziec.",
    };
  }
  return {
    mode: "mixed",
    durationMin: 25,
    title: "MD+1 — wariant mieszany",
    reason: "Średni udział w meczu: krótka mobilność, technika i spokojne rozruszanie.",
  };
}
