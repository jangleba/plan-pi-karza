import type {
  ReactiveColor,
  ReactiveCue,
  ReactiveCustomSet,
  ReactiveDirection,
  ReactiveLevel,
  ReactiveSessionStats,
  ReactiveSettings,
} from "./types";

export const DIRECTIONS: ReactiveDirection[] = ["left", "right", "forward", "back"];
export const COLORS: ReactiveColor[] = ["blue", "green", "yellow", "red"];

export const DEFAULT_REACTIVE_SETTINGS: ReactiveSettings = {
  mode: "directions",
  level: "basic",
  intervalSec: 5,
  randomTiming: false,
  durationMin: 10,
  vibration: true,
  flashDurationMs: 1_000,
  activeDirections: ["left", "right"],
  activeColors: ["blue", "green"],
  sequenceLength: 2,
  customSetId: null,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function normalizeReactiveSettings(settings: ReactiveSettings): ReactiveSettings {
  const directions = [...new Set(settings.activeDirections)].filter((value) =>
    DIRECTIONS.includes(value),
  );
  const colors = [...new Set(settings.activeColors)].filter((value) => COLORS.includes(value));
  return {
    ...settings,
    intervalSec: clamp(Math.round(settings.intervalSec), 2, 15),
    durationMin:
      settings.durationMin == null
        ? null
        : clamp(Math.round(settings.durationMin), 1, 180),
    flashDurationMs: clamp(Math.round(settings.flashDurationMs), 500, 2_000),
    sequenceLength: clamp(Math.round(settings.sequenceLength), 2, 8),
    activeDirections: directions.length >= 2 ? directions : ["left", "right"],
    activeColors: colors.length >= 2 ? colors : ["blue", "green"],
  };
}

export function decisionChangeRate(level: ReactiveLevel): number {
  if (level === "advanced") return 0.2;
  if (level === "intermediate") return 0.1;
  return 0.05;
}

export function nextCueDelayMs(
  settings: Pick<ReactiveSettings, "intervalSec" | "randomTiming">,
  random = Math.random,
): number {
  const base = clamp(settings.intervalSec, 2, 15);
  if (!settings.randomTiming) return Math.round(base * 1_000);
  const min = Math.max(2, base - 2);
  const max = Math.min(15, base + 2);
  return Math.round((min + (max - min) * clamp(random(), 0, 1)) * 1_000);
}

export function shouldChangeDecision(level: ReactiveLevel, random = Math.random): boolean {
  return random() < decisionChangeRate(level);
}

function leastUsed<T extends string>(
  values: T[],
  counts: Record<T, number>,
  random: () => number,
  exclude?: T | null,
): T {
  const available = values.filter((value) => value !== exclude);
  const pool = available.length > 0 ? available : values;
  const minimum = Math.min(...pool.map((value) => counts[value] ?? 0));
  const balanced = pool.filter((value) => (counts[value] ?? 0) === minimum);
  return balanced[Math.min(balanced.length - 1, Math.floor(random() * balanced.length))];
}

function pickSequence(
  settings: ReactiveSettings,
  stats: ReactiveSessionStats,
  random: () => number,
): ReactiveDirection[] {
  const sequence: ReactiveDirection[] = [];
  const localCounts = { ...stats.directionCounts };
  for (let index = 0; index < settings.sequenceLength; index += 1) {
    const direction = leastUsed(
      settings.activeDirections,
      localCounts,
      random,
      sequence[index - 1] ?? null,
    );
    sequence.push(direction);
    localCounts[direction] += 1;
  }
  return sequence;
}

export function initialReactiveStats(settings: ReactiveSettings, startedAt = new Date().toISOString()): ReactiveSessionStats {
  return {
    startedAt,
    endedAt: null,
    elapsedSec: 0,
    cueCount: 0,
    decisionChanges: 0,
    directionCounts: { left: 0, right: 0, forward: 0, back: 0 },
    colorCounts: { blue: 0, green: 0, yellow: 0, red: 0 },
    mode: settings.mode,
    intervalSec: settings.intervalSec,
    randomTiming: settings.randomTiming,
  };
}

export function createReactiveCue(input: {
  settings: ReactiveSettings;
  stats: ReactiveSessionStats;
  customSet?: ReactiveCustomSet | null;
  previous?: ReactiveCue | null;
  decisionChange?: boolean;
  random?: () => number;
}): ReactiveCue {
  const settings = normalizeReactiveSettings(input.settings);
  const random = input.random ?? Math.random;
  const decisionChange = Boolean(input.decisionChange);
  const previousDirection = decisionChange ? input.previous?.direction ?? input.previous?.blockedDirection : null;
  const previousColor = decisionChange ? input.previous?.color : null;
  const direction = leastUsed(
    settings.activeDirections,
    input.stats.directionCounts,
    random,
    previousDirection,
  );
  const color = leastUsed(settings.activeColors, input.stats.colorCounts, random, previousColor);
  const actions = input.customSet?.actions.filter((action) => action.label.trim()) ?? [];
  const customAction = actions.length
    ? actions[Math.min(actions.length - 1, Math.floor(random() * actions.length))]
    : null;

  return {
    id: `${Date.now()}-${Math.round(random() * 1_000_000)}`,
    mode: settings.mode,
    direction:
      settings.mode === "directions" ||
      settings.mode === "combo" ||
      settings.mode === "flash"
        ? direction
        : settings.mode === "custom"
          ? customAction?.direction ?? null
          : null,
    color:
      settings.mode === "colors" || settings.mode === "combo"
        ? color
        : settings.mode === "custom"
          ? customAction?.color ?? null
          : null,
    blockedDirection: settings.mode === "opponent" ? direction : null,
    sequence:
      settings.mode === "sequence" ? pickSequence(settings, input.stats, random) : [],
    customAction: settings.mode === "custom" ? customAction : null,
    isDecisionChange: decisionChange,
  };
}

export function recordReactiveCue(
  stats: ReactiveSessionStats,
  cue: ReactiveCue,
): ReactiveSessionStats {
  const directions = [
    ...(cue.direction ? [cue.direction] : []),
    ...(cue.blockedDirection ? [cue.blockedDirection] : []),
    ...cue.sequence,
  ];
  const directionCounts = { ...stats.directionCounts };
  for (const direction of directions) directionCounts[direction] += 1;
  const colorCounts = { ...stats.colorCounts };
  if (cue.color) colorCounts[cue.color] += 1;
  return {
    ...stats,
    cueCount: stats.cueCount + 1,
    decisionChanges: stats.decisionChanges + (cue.isDecisionChange ? 1 : 0),
    directionCounts,
    colorCounts,
  };
}

export function finishReactiveStats(
  stats: ReactiveSessionStats,
  elapsedSec: number,
  endedAt = new Date().toISOString(),
): ReactiveSessionStats {
  return { ...stats, elapsedSec: Math.max(0, Math.round(elapsedSec)), endedAt };
}

