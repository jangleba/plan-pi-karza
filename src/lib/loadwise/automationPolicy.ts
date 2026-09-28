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
  if (matchMinutes == null) {
    return {
      mode: "mixed",
      durationMin: 25,
      title: "MD+1 — lekka sesja do potwierdzenia",
      reason: "Brakuje minut meczowych, więc aplikacja wybiera ostrożny wariant pośredni.",
    };
  }
  if (matchMinutes >= 60 || (readiness != null && readiness <= 5)) {
    return {
      mode: "recovery",
      durationMin: 20,
      title: "Regeneracja pomeczowa",
      reason:
        matchMinutes >= 60
          ? "Wysoki udział w meczu: tylko spokojne rozruszanie i mobilność."
          : "Niższa gotowość: kompensacja została zastąpiona regeneracją.",
    };
  }
  if (matchMinutes < 30 && (readiness == null || readiness >= 6)) {
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
