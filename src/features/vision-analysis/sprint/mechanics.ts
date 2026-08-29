/**
 * Izolowany analizator mechaniki sprintu.
 *
 * Liczy WYŁĄCZNIE metryki, dla których dane pozy mają wystarczającą
 * widoczność i stabilność. Każda metryka ma: fazę, przedział obserwacji
 * (percentyl 10-90), liczbę próbek, confidence i klatkę dowodową.
 * Pojedynczy kąt nigdy nie jest prezentowany jako pomiar laboratoryjny.
 *
 * Analizator nie zna czasu ani wyniku sprintu — jest całkowicie niezależny
 * od warstwy pomiaru czasu i nie może jej unieważnić.
 */

import type { FramePose, Landmark } from "../types";
import { POSE } from "../types";
import { round, jointAngleDeg } from "../physics";
import type {
  MechanicMetric,
  MechanicMetricKey,
  SprintMechanics,
  SprintPhase,
} from "./types";
import { phaseForFrame } from "./phases";

/** Minimalna widoczność landmarka, by w ogóle użyć go w metryce. */
export const MIN_LANDMARK_VISIBILITY = 0.5;
/** Minimalny udział wysokości sylwetki w kadrze dla analizy mechaniki. */
export const MIN_MECHANICS_SILHOUETTE_FRACTION = 0.3;
/** Minimalna liczba klatek z pełnym zestawem punktów. */
export const MIN_MECHANICS_FRAMES = 8;
/** Minimalna liczba próbek jednej metryki, by ją opublikować. */
export const MIN_METRIC_SAMPLES = 5;

const LABELS: Record<MechanicMetricKey, { label: string; unit: string }> = {
  trunk_lean_deg: { label: "Pochylenie tułowia", unit: "°" },
  shank_angle_deg: { label: "Kąt piszczeli przy kontakcie", unit: "°" },
  hip_extension_deg: { label: "Wyprost biodra", unit: "°" },
  knee_flexion_deg: { label: "Zgięcie kolana w fazie wymachu", unit: "°" },
  foot_strike_offset_pct: { label: "Stopa względem miednicy", unit: "%" },
  step_rate_hz: { label: "Rytm kroków", unit: "kroków/s" },
  step_asymmetry_pct: { label: "Asymetria lewa–prawa", unit: "%" },
};

interface Sample {
  frameIndex: number;
  timeS: number;
  value: number;
}

function ts(p: FramePose): number | null {
  if (typeof p.sourceTimestampUs === "number") return p.sourceTimestampUs / 1_000_000;
  if (typeof p.sourceTimestampMs === "number") return p.sourceTimestampMs / 1000;
  return Number.isFinite(p.mediaTime) ? p.mediaTime : null;
}

function vis(l: Landmark | undefined): number {
  return typeof l?.visibility === "number" ? l.visibility : 0;
}

function ok(...pts: (Landmark | undefined)[]): boolean {
  return pts.every((p) => p && vis(p) >= MIN_LANDMARK_VISIBILITY);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)));
  return s[idx];
}

/** Kąt odcinka a→b od pionu (0° = pion, dodatni = odchylenie). */
function angleFromVertical(a: Landmark, b: Landmark): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return round((Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI, 1);
}

function silhouetteFraction(p: FramePose): number | null {
  const lm = p.landmarks;
  if (!lm) return null;
  const top = lm[POSE.NOSE];
  const la = lm[POSE.LEFT_ANKLE];
  const ra = lm[POSE.RIGHT_ANKLE];
  if (!top || (!la && !ra)) return null;
  const bottom = Math.max(la?.y ?? 0, ra?.y ?? 0);
  const h = bottom - top.y;
  return Number.isFinite(h) && h > 0 ? h : null;
}

function torsoVisibility(p: FramePose): number {
  const lm = p.landmarks;
  if (!lm) return 0;
  const ids = [POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER, POSE.LEFT_HIP, POSE.RIGHT_HIP];
  return ids.reduce((a, i) => a + vis(lm[i]), 0) / ids.length;
}

/** Buduje metrykę z próbek — lub null, gdy próbek jest za mało. */
function buildMetric(
  key: MechanicMetricKey,
  samples: Sample[],
  phases: SprintPhase[],
  visibilityScore: number,
): MechanicMetric | null {
  if (samples.length < MIN_METRIC_SAMPLES) return null;
  const values = samples.map((s) => s.value);
  const value = round(median(values), 1);
  let evidence = samples[0];
  for (const s of samples) {
    if (Math.abs(s.value - value) < Math.abs(evidence.value - value)) evidence = s;
  }
  const spread = percentile(values, 0.9) - percentile(values, 0.1);
  const stability = spread <= 0 ? 1 : Math.max(0, 1 - spread / Math.max(1, Math.abs(value) * 2));
  const sampleScore = Math.min(1, samples.length / 20);
  return {
    key,
    label: LABELS[key].label,
    unit: LABELS[key].unit,
    value,
    rangeMin: round(percentile(values, 0.1), 1),
    rangeMax: round(percentile(values, 0.9), 1),
    samples: samples.length,
    confidence: round(Math.min(1, visibilityScore * 0.4 + sampleScore * 0.35 + stability * 0.25), 2),
    phase: phaseForFrame(phases, evidence.frameIndex),
    evidenceFrameIndex: evidence.frameIndex,
  };
}

/** Wykrywa kontakty stopy z podłożem po lokalnych maksimach y kostki. */
function footContacts(
  poses: FramePose[],
  side: "left" | "right",
): { frameIndex: number; timeS: number }[] {
  const ankleId = side === "left" ? POSE.LEFT_ANKLE : POSE.RIGHT_ANKLE;
  const series: { frameIndex: number; timeS: number; y: number }[] = [];
  for (const p of poses) {
    const lm = p.landmarks;
    const t = ts(p);
    if (!lm || t == null) continue;
    const a = lm[ankleId];
    if (!ok(a)) continue;
    series.push({ frameIndex: p.frameIndex, timeS: t, y: a!.y });
  }
  const contacts: { frameIndex: number; timeS: number }[] = [];
  for (let i = 1; i < series.length - 1; i++) {
    if (series[i].y > series[i - 1].y && series[i].y >= series[i + 1].y) {
      const prev = contacts[contacts.length - 1];
      if (!prev || series[i].timeS - prev.timeS > 0.08) {
        contacts.push({ frameIndex: series[i].frameIndex, timeS: series[i].timeS });
      }
    }
  }
  return contacts;
}

/**
 * Główne wejście analizatora mechaniki. Zwraca dostępność i listę metryk,
 * które faktycznie dało się policzyć na tym nagraniu.
 */
export function analyzeSprintMechanics(
  poses: FramePose[],
  phases: SprintPhase[],
): SprintMechanics {
  const fractions: number[] = [];
  const visibilities: number[] = [];
  for (const p of poses) {
    const f = silhouetteFraction(p);
    if (f != null) fractions.push(f);
    if (p.landmarks) visibilities.push(torsoVisibility(p));
  }
  const medianSilhouetteFraction = fractions.length ? round(median(fractions), 3) : 0;
  const medianVisibility = visibilities.length ? round(median(visibilities), 2) : 0;

  const usable = poses.filter((p) => {
    const f = silhouetteFraction(p);
    return p.landmarks != null && f != null && f >= MIN_MECHANICS_SILHOUETTE_FRACTION;
  });

  const base: SprintMechanics = {
    availability: "AVAILABLE",
    metrics: [],
    framesUsed: usable.length,
    medianSilhouetteFraction,
    medianVisibility,
  };

  if (medianSilhouetteFraction < MIN_MECHANICS_SILHOUETTE_FRACTION) {
    return { ...base, availability: "ATHLETE_TOO_SMALL_FOR_MECHANICS" };
  }
  if (medianVisibility < MIN_LANDMARK_VISIBILITY) {
    return { ...base, availability: "LOW_VISIBILITY" };
  }
  if (usable.length < MIN_MECHANICS_FRAMES) {
    return { ...base, availability: "NOT_ENOUGH_FRAMES" };
  }

  const trunk: Sample[] = [];
  const shank: Sample[] = [];
  const hipExt: Sample[] = [];
  const kneeFlex: Sample[] = [];
  const footOffset: Sample[] = [];

  for (const p of usable) {
    const lm = p.landmarks!;
    const t = ts(p);
    if (t == null) continue;
    const frameIndex = p.frameIndex;
    const height = silhouetteFraction(p) ?? 0;

    const ls = lm[POSE.LEFT_SHOULDER];
    const rs = lm[POSE.RIGHT_SHOULDER];
    const lh = lm[POSE.LEFT_HIP];
    const rh = lm[POSE.RIGHT_HIP];
    if (ok(ls, rs, lh, rh)) {
      const shoulder: Landmark = { ...ls!, x: (ls!.x + rs!.x) / 2, y: (ls!.y + rs!.y) / 2 };
      const hip: Landmark = { ...lh!, x: (lh!.x + rh!.x) / 2, y: (lh!.y + rh!.y) / 2 };
      trunk.push({ frameIndex, timeS: t, value: angleFromVertical(shoulder, hip) });

      for (const side of ["left", "right"] as const) {
        const knee = lm[side === "left" ? POSE.LEFT_KNEE : POSE.RIGHT_KNEE];
        const ankle = lm[side === "left" ? POSE.LEFT_ANKLE : POSE.RIGHT_ANKLE];
        const sideHip = side === "left" ? lh : rh;
        if (ok(knee, ankle)) {
          shank.push({ frameIndex, timeS: t, value: angleFromVertical(knee!, ankle!) });
        }
        if (ok(sideHip, knee, ankle)) {
          kneeFlex.push({
            frameIndex,
            timeS: t,
            value: round(180 - jointAngleDeg(sideHip!, knee!, ankle!), 1),
          });
        }
        if (ok(shoulder, sideHip, knee)) {
          hipExt.push({ frameIndex, timeS: t, value: jointAngleDeg(shoulder, sideHip!, knee!) });
        }
        const foot = lm[side === "left" ? POSE.LEFT_FOOT_INDEX : POSE.RIGHT_FOOT_INDEX];
        if (ok(foot, sideHip) && height > 0) {
          footOffset.push({
            frameIndex,
            timeS: t,
            value: round(((foot!.x - sideHip!.x) / height) * 100, 1),
          });
        }
      }
    }
  }

  const visibilityScore = Math.min(1, medianVisibility);
  const metrics: MechanicMetric[] = [];
  const push = (key: MechanicMetricKey, samples: Sample[]) => {
    const m = buildMetric(key, samples, phases, visibilityScore);
    if (m) metrics.push(m);
  };
  push("trunk_lean_deg", trunk);
  push("shank_angle_deg", shank);
  push("hip_extension_deg", hipExt);
  push("knee_flexion_deg", kneeFlex);
  push("foot_strike_offset_pct", footOffset);

  // Rytm kroków i asymetria — z wykrytych kontaktów obu stóp.
  const left = footContacts(usable, "left");
  const right = footContacts(usable, "right");
  const allContacts = [...left, ...right].sort((a, b) => a.timeS - b.timeS);
  if (allContacts.length >= 4) {
    const gaps: number[] = [];
    for (let i = 1; i < allContacts.length; i++) {
      const d = allContacts[i].timeS - allContacts[i - 1].timeS;
      if (d > 0) gaps.push(d);
    }
    if (gaps.length >= MIN_METRIC_SAMPLES - 1) {
      const rate = round(1 / median(gaps), 2);
      const spread = percentile(gaps, 0.9) - percentile(gaps, 0.1);
      metrics.push({
        key: "step_rate_hz",
        label: LABELS.step_rate_hz.label,
        unit: LABELS.step_rate_hz.unit,
        value: rate,
        rangeMin: round(1 / Math.max(1e-6, percentile(gaps, 0.9)), 2),
        rangeMax: round(1 / Math.max(1e-6, percentile(gaps, 0.1)), 2),
        samples: gaps.length,
        confidence: round(
          Math.min(1, visibilityScore * 0.5 + Math.min(1, gaps.length / 10) * 0.3 + (spread < 0.08 ? 0.2 : 0.05)),
          2,
        ),
        phase: phaseForFrame(phases, allContacts[Math.floor(allContacts.length / 2)].frameIndex),
        evidenceFrameIndex: allContacts[Math.floor(allContacts.length / 2)].frameIndex,
      });
    }
  }
  if (left.length >= 2 && right.length >= 2) {
    const stepTime = (c: { timeS: number }[]) => {
      const gaps: number[] = [];
      for (let i = 1; i < c.length; i++) {
        const d = c[i].timeS - c[i - 1].timeS;
        if (d > 0) gaps.push(d);
      }
      return gaps.length ? median(gaps) : null;
    };
    const lt = stepTime(left);
    const rt = stepTime(right);
    if (lt != null && rt != null && lt > 0 && rt > 0) {
      const asym = round((Math.abs(lt - rt) / ((lt + rt) / 2)) * 100, 1);
      metrics.push({
        key: "step_asymmetry_pct",
        label: LABELS.step_asymmetry_pct.label,
        unit: LABELS.step_asymmetry_pct.unit,
        value: asym,
        rangeMin: asym,
        rangeMax: asym,
        samples: Math.min(left.length, right.length),
        confidence: round(
          Math.min(1, visibilityScore * 0.5 + Math.min(1, Math.min(left.length, right.length) / 5) * 0.5),
          2,
        ),
        phase: phaseForFrame(phases, left[0].frameIndex),
        evidenceFrameIndex: left[0].frameIndex,
      });
    }
  }

  return { ...base, metrics };
}
