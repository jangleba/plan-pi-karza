/** Tempo is E – pause after E – C – pause after C. X is intent, never measured seconds. */
export type TempoValue = number | "X";
export interface TempoSpec {
  values: [TempoValue, number, TempoValue, number];
  label: string;
}
export interface TempoProfile {
  kind: "rep" | "eccentric-only" | "hold";
  startWith?: "eccentric" | "concentric";
  eccentric?: [number, number];
  concentric?: [number, number];
  bottom?: number;
  top?: number;
  eccentricLabel?: string;
  concentricLabel?: string;
  setup?: [number, number];
  finish?: [number, number];
}
export interface TempoModel {
  tempoProfile?: TempoProfile;
  variant?: string;
}
export interface TempoSegment {
  key: string;
  label: string;
  durationMs: number;
  numericSeconds: number | null;
  from: number;
  to: number;
  illustrative: boolean;
}
export interface TempoFrame {
  modelPhase: number;
  key: string;
  label: string;
  remainingMs: number;
  count: number | null;
  dynamic: boolean;
  complete: boolean;
  progress: number;
}
export interface TempoPlan {
  kind: "rep" | "hold";
  source: "session" | "preview";
  totalMs: number;
  spec: TempoSpec | null;
  segments: TempoSegment[];
  phases: Array<{ key: string; label: string; value: TempoValue }>;
}
const finite = (n: number) => Number.isFinite(n);
export function parseExerciseTempo(raw?: string | null): TempoSpec | null {
  if (typeof raw !== "string" || raw.length > 48) return null;
  const parts = raw
    .trim()
    .replace(/^tempo\s*:?\s*/i, "")
    .split(/\s*[-–—−]\s*/);
  if (parts.length === 3) parts.push("0");
  if (parts.length !== 4 || parts.some((p) => !/^(?:\d{1,2}(?:[.,]\d{1,2})?|X)$/i.test(p)))
    return null;
  const values = parts.map((p) => (p.toUpperCase() === "X" ? "X" : Number(p.replace(",", "."))));
  if (
    values.some((v) => v !== "X" && (!finite(v) || v < 0 || v > 30)) ||
    values[1] === "X" ||
    values[3] === "X"
  )
    return null;
  if (values[0] === 0 || values[2] === 0) return null;
  const duration = values.reduce<number>((n, v) => n + (v === "X" ? 0.6 : v), 0);
  if (duration < 0.25 || duration > 120) return null;
  return { values: values as TempoSpec["values"], label: values.join("–") };
}
export function parseHoldSeconds(raw?: string | null): number | null {
  if (typeof raw !== "string" || raw.length > 60) return null;
  const value = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  const match =
    /^(\d+(?:[.,]\d+)?)\s*(s|sek\.?|sekund[ay]?|min\.?|minut[ay]?)(?:\s*(?:\/|na)\s*(?:stron[ae]?|side))?$/.exec(
      value,
    );
  if (!match) return null;
  const seconds = Number(match[1].replace(",", ".")) * (match[2].startsWith("min") ? 60 : 1);
  return finite(seconds) && seconds >= 0.5 && seconds <= 300 ? seconds : null;
}
export function boxTouchVariant(name?: string, explicit?: string): "box_touch" | null {
  if (explicit === "box_touch") return "box_touch";
  const value = (name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l");
  return !/(?:\/|\blub\b|\balbo\b)/.test(value) &&
    /\b(?:do skrzyni|do lawki|box squat)\b/.test(value)
    ? "box_touch"
    : null;
}
export function createTempoPlan(
  model: TempoModel,
  raw?: string | null,
  options: { source?: "session" | "preview"; holdSeconds?: number | null } = {},
): TempoPlan | null {
  const profile = model.tempoProfile;
  if (!profile) return null;
  const source = options.source ?? "session";
  if (profile.kind === "hold") {
    const seconds = options.holdSeconds;
    if (typeof seconds !== "number" || !finite(seconds) || seconds < 0.5 || seconds > 300)
      return null;
    return {
      kind: "hold",
      source,
      totalMs: seconds * 1000,
      spec: null,
      segments: [
        {
          key: "hold",
          label: "Utrzymaj pozycję · oddychaj swobodnie",
          durationMs: seconds * 1000,
          numericSeconds: seconds,
          from: 0.5,
          to: 0.5,
          illustrative: false,
        },
      ],
      phases: [{ key: "hold", label: "Utrzymanie", value: seconds }],
    };
  }
  const spec = parseExerciseTempo(raw);
  if (!spec || !profile.eccentric) return null;
  const [e, b, c, t] = spec.values,
    segments: TempoSegment[] = [],
    phases: TempoPlan["phases"] = [];
  const add = (
    key: string,
    label: string,
    value: TempoValue,
    range: [number, number],
    illustrative = false,
  ) => {
    phases.push({ key, label, value });
    if (value === 0) return;
    segments.push({
      key,
      label,
      durationMs: (value === "X" ? 0.6 : value) * 1000,
      numericSeconds: value === "X" || illustrative ? null : value,
      from: range[0],
      to: range[1],
      illustrative,
    });
  };
  if (profile.setup) add("setup", "Ustawienie · krok w tył", 0.8, profile.setup, true);
  const lower = () => {
    add("eccentric", profile.eccentricLabel ?? "Opuszczanie", e, profile.eccentric!);
    add("bottom", model.variant === "box_touch" ? "Dotknięcie skrzyni" : "Po opuszczeniu", b, [
      profile.bottom ?? 0.5,
      profile.bottom ?? 0.5,
    ]);
  };
  const lift = () => {
    add("concentric", profile.concentricLabel ?? "Podnoszenie", c, profile.concentric!);
    add("top", "Po podniesieniu", t, [profile.top ?? 0, profile.top ?? 0]);
  };
  if (profile.kind === "eccentric-only") {
    lower();
    add("assisted-return", "Powrót z pomocą rąk", 1, [0.75, 0.999], true);
  } else {
    if (!profile.concentric) return null;
    if (profile.startWith === "concentric") {
      lift();
      lower();
    } else {
      lower();
      lift();
    }
  }
  if (profile.finish) add("finish", "Dostaw nogę pod kontrolą", 0.8, profile.finish, true);
  return {
    kind: "rep",
    source,
    spec,
    segments,
    phases,
    totalMs: segments.reduce((n, s) => n + s.durationMs, 0),
  };
}
export function tempoFrameAt(plan: TempoPlan, normalized: number): TempoFrame {
  const p =
    plan.kind === "hold" ? Math.max(0, Math.min(1, normalized)) : ((normalized % 1) + 1) % 1;
  let time = p * plan.totalMs,
    segment = plan.segments[plan.segments.length - 1];
  for (const candidate of plan.segments) {
    segment = candidate;
    if (time < candidate.durationMs - 1e-7) break;
    time = Math.max(0, time - candidate.durationMs);
  }
  if (plan.kind === "hold" && p === 1) time = segment.durationMs;
  const progress = Math.max(0, Math.min(1, time / segment.durationMs)),
    remainingMs = Math.max(0, segment.durationMs - time);
  return {
    modelPhase: segment.from + (segment.to - segment.from) * progress,
    key: segment.key,
    label: segment.label,
    remainingMs,
    count:
      segment.numericSeconds === null
        ? null
        : Number.isInteger(segment.numericSeconds)
          ? Math.max(0, Math.ceil(remainingMs / 1000 - 1e-8))
          : Math.max(0, Math.ceil(remainingMs / 100 - 1e-8) / 10),
    dynamic: segment.numericSeconds === null && !segment.illustrative,
    complete: plan.kind === "hold" && p === 1,
    progress,
  };
}
