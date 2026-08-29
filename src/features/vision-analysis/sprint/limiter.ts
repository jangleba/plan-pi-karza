/**
 * Deterministyczny rules engine wyboru JEDNEGO głównego limitera sprintu.
 *
 * Zasady twarde:
 *  - brak LLM, brak losowości, brak generowanych opisów,
 *  - reguła może zadziałać tylko przy spełnionych progach jakości,
 *  - wymagane są co najmniej DWA wspierające dowody (metryki o wystarczającej
 *    pewności) — pojedyncza metryka nigdy nie wskazuje limitera,
 *  - przy braku pewności zwracamy null i uczciwy komunikat.
 */

import type {
  MechanicMetric,
  MechanicMetricKey,
  SprintLimiter,
  SprintLimiterId,
  SprintMechanics,
  LimiterEvidence,
} from "./types";

/** Minimalna pewność metryki, by mogła być dowodem. */
export const MIN_EVIDENCE_CONFIDENCE = 0.6;
/** Minimalna liczba dowodów wymagana do wskazania limitera. */
export const MIN_EVIDENCE_COUNT = 2;

export const NO_LIMITER_MESSAGE = "Za mało danych do wskazania limitera.";

interface Rule {
  id: SprintLimiterId;
  label: string;
  summary: string;
  /** Warunki: każdy zwraca true/false na podstawie realnej metryki. */
  conditions: { key: MechanicMetricKey; test: (value: number) => boolean }[];
  /** Priorytet przy remisie liczby dowodów (niższy = ważniejszy). */
  priority: number;
}

/**
 * Progi wynikają z powszechnie stosowanych zakresów obserwacyjnych mechaniki
 * biegu i są celowo konserwatywne — reguła ma nie odpalać przy danych granicznych.
 */
export const RULES: Rule[] = [
  {
    id: "acceleration_position",
    label: "Pozycja w akceleracji",
    summary: "Zbyt wczesne wyprostowanie sylwetki ogranicza rozpędzanie.",
    priority: 1,
    conditions: [
      { key: "trunk_lean_deg", test: (v) => v < 15 },
      { key: "shank_angle_deg", test: (v) => v < 15 },
      { key: "hip_extension_deg", test: (v) => v < 150 },
    ],
  },
  {
    id: "braking_contact",
    label: "Hamujący kontakt z podłożem",
    summary: "Stopa ląduje wyraźnie przed miednicą, co wygasza prędkość.",
    priority: 2,
    conditions: [
      { key: "foot_strike_offset_pct", test: (v) => v > 8 },
      { key: "knee_flexion_deg", test: (v) => v < 90 },
      { key: "step_rate_hz", test: (v) => v < 3.8 },
    ],
  },
  {
    id: "step_rhythm",
    label: "Rytm kroków",
    summary: "Niski rytm kroków przy ograniczonym wymachu kolana.",
    priority: 3,
    conditions: [
      { key: "step_rate_hz", test: (v) => v < 3.6 },
      { key: "knee_flexion_deg", test: (v) => v < 100 },
    ],
  },
  {
    id: "side_asymmetry",
    label: "Asymetria lewa–prawa",
    summary: "Różnica czasu kroku między stronami przekracza próg obserwacyjny.",
    priority: 4,
    conditions: [
      { key: "step_asymmetry_pct", test: (v) => v > 12 },
      { key: "foot_strike_offset_pct", test: (v) => v > 5 },
      { key: "shank_angle_deg", test: (v) => v > 25 },
    ],
  },
];

function toEvidence(m: MechanicMetric): LimiterEvidence {
  return {
    metricKey: m.key,
    label: m.label,
    value: m.value,
    unit: m.unit,
    phase: m.phase,
    frameIndex: m.evidenceFrameIndex,
  };
}

/**
 * Wybiera maksymalnie jeden limiter. Zwraca null, gdy mechanika jest
 * niedostępna lub żadna reguła nie zebrała wymaganych dowodów.
 */
export function selectSprintLimiter(mechanics: SprintMechanics): {
  limiter: SprintLimiter | null;
  reason: string;
} {
  if (mechanics.availability !== "AVAILABLE") {
    return { limiter: null, reason: NO_LIMITER_MESSAGE };
  }
  const byKey = new Map<MechanicMetricKey, MechanicMetric>();
  for (const m of mechanics.metrics) {
    if (m.confidence >= MIN_EVIDENCE_CONFIDENCE) byKey.set(m.key, m);
  }
  if (byKey.size < MIN_EVIDENCE_COUNT) {
    return { limiter: null, reason: NO_LIMITER_MESSAGE };
  }

  let best: SprintLimiter | null = null;
  let bestPriority = Number.POSITIVE_INFINITY;
  for (const rule of RULES) {
    const evidence: LimiterEvidence[] = [];
    let confidenceSum = 0;
    for (const cond of rule.conditions) {
      const metric = byKey.get(cond.key);
      if (!metric) continue;
      if (!cond.test(metric.value)) continue;
      evidence.push(toEvidence(metric));
      confidenceSum += metric.confidence;
    }
    if (evidence.length < MIN_EVIDENCE_COUNT) continue;
    const candidate: SprintLimiter = {
      id: rule.id,
      label: rule.label,
      summary: rule.summary,
      evidence,
      confidence: Number((confidenceSum / evidence.length).toFixed(2)),
    };
    const better =
      best == null ||
      candidate.evidence.length > best.evidence.length ||
      (candidate.evidence.length === best.evidence.length && rule.priority < bestPriority);
    if (better) {
      best = candidate;
      bestPriority = rule.priority;
    }
  }

  if (!best) return { limiter: null, reason: NO_LIMITER_MESSAGE };
  return { limiter: best, reason: "" };
}
