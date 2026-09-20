import type { DoubleSessions, Intensity } from "./types";

export type ReadinessBand = "full" | "maintain" | "reduced" | "recovery";

export interface ReadinessPolicy {
  band: ReadinessBand;
  volumeFactor: number;
  keepIntensity: boolean;
  removeHighRiskWork: boolean;
  label: string;
}

export function readinessPolicy(score: number): ReadinessPolicy {
  const safe = Math.max(1, Math.min(10, Math.round(score)));
  if (safe >= 8) {
    return {
      band: "full",
      volumeFactor: 1,
      keepIntensity: true,
      removeHighRiskWork: false,
      label: "Pełny plan",
    };
  }
  if (safe >= 6) {
    return {
      band: "maintain",
      volumeFactor: 0.9,
      keepIntensity: true,
      removeHighRiskWork: false,
      label: "Ten sam bodziec, trochę mniej objętości",
    };
  }
  if (safe >= 4) {
    return {
      band: "reduced",
      volumeFactor: 0.6,
      keepIntensity: false,
      removeHighRiskWork: true,
      label: "Wersja skrócona bez maksymalnych bodźców",
    };
  }
  return {
    band: "recovery",
    volumeFactor: 0,
    keepIntensity: false,
    removeHighRiskWork: true,
    label: "Regeneracja zamiast treningu",
  };
}

export type AutomationSessionCategory =
  "gym" | "speed" | "endurance" | "ball" | "recovery" | "club" | "match" | "other";

export interface SecondSessionContext {
  permission: DoubleSessions;
  readiness: number | null;
  hasPain: boolean;
  hoursToMatch: number | null;
  gapHours: number | null;
  primaryCategory: AutomationSessionCategory;
  secondCategory: AutomationSessionCategory;
  secondIntensity: Intensity;
}

export interface AutomationDecision {
  allowed: boolean;
  code: string;
  reason: string;
}

const COMPLEMENTARY_PAIRS = new Set([
  "gym:ball",
  "ball:gym",
  "gym:recovery",
  "speed:ball",
  "ball:speed",
  "endurance:ball",
  "club:recovery",
  "club:gym",
]);

export function evaluateSecondSession(context: SecondSessionContext): AutomationDecision {
  if (context.permission === "no") {
    return {
      allowed: false,
      code: "permission_off",
      reason: "Zawodnik nie zgodził się na dwa treningi jednego dnia.",
    };
  }
  if (context.hasPain) {
    return {
      allowed: false,
      code: "pain",
      reason: "Zgłoszony ból blokuje dodatkową jednostkę.",
    };
  }
  if (context.readiness == null || context.readiness < 7) {
    return {
      allowed: false,
      code: "readiness",
      reason: "Druga sesja wymaga gotowości co najmniej 7/10.",
    };
  }
  if (context.hoursToMatch != null && context.hoursToMatch <= 48) {
    return {
      allowed: false,
      code: "match_window",
      reason: "Do meczu zostało 48 godzin lub mniej.",
    };
  }
  if (context.gapHours == null || context.gapHours < 5) {
    return {
      allowed: false,
      code: "gap",
      reason: "Między jednostkami potrzeba co najmniej 5 godzin.",
    };
  }
  if (context.permission === "light_only" && context.secondIntensity !== "niska") {
    return {
      allowed: false,
      code: "light_only",
      reason: "Profil pozwala wyłącznie na lekką drugą jednostkę.",
    };
  }
  const pair = `${context.primaryCategory}:${context.secondCategory}`;
  if (!COMPLEMENTARY_PAIRS.has(pair)) {
    return {
      allowed: false,
      code: "not_complementary",
      reason: "Jednostki nie są wystarczająco komplementarne.",
    };
  }
  return {
    allowed: true,
    code: "safe",
    reason: "Warunki podwójnego dnia są spełnione.",
  };
}

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

export function sessionLoad(durationMin: number | null, rpe: number | null): number | null {
  if (durationMin == null || rpe == null) return null;
  return Math.max(0, durationMin) * Math.max(0, Math.min(10, rpe));
}
