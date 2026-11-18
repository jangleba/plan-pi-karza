import type {
  DayPlan,
  IndividualSession,
  Phase,
  SessionKind,
  SessionVariant,
  WeekInput,
  WeekPlan,
} from "./types";

const DAY_MS = 86_400_000;

export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(iso) + n * DAY_MS).toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / DAY_MS);
}

/** Dwa mecze w odstępie <= 4 dni = krótki cykl: tylko lekkie sesje między nimi. */
const CONGESTED_GAP = 4;

export function phaseOf(date: string, matches: string[]): Phase {
  const sorted = [...matches].sort();
  if (sorted.includes(date)) return "MD";
  const next = sorted.find((m) => m > date);
  const prev = [...sorted].reverse().find((m) => m < date);
  const until = next ? diffDays(next, date) : Infinity;
  const since = prev ? diffDays(date, prev) : Infinity;
  if (next && prev && diffDays(next, prev) <= CONGESTED_GAP) return "congested";
  if (until === 1) return "MD-1";
  if (until === 2) return "MD-2";
  if (until === 3) return "MD-3";
  if (since === 1) return "MD+1";
  if (since === 2) return "MD+2";
  return "free";
}

const HARD: SessionKind[] = ["strength", "run", "sprint"];

function allowedKinds(phase: Phase): SessionKind[] {
  switch (phase) {
    case "MD":
      return [];
    case "MD-1":
      return ["activation", "sprint", "technique", "recovery"];
    case "MD-2":
      return ["run", "technique", "activation", "recovery"];
    case "MD+1":
      return ["recovery", "strength"];
    case "congested":
      return ["recovery", "activation", "technique"];
    default:
      return ["strength", "run", "sprint", "technique", "recovery"];
  }
}

const PREFERRED: Record<"strength" | "run" | "sprint" | "technique", Phase[]> = {
  strength: ["MD-3", "free", "MD+2", "MD+1"],
  run: ["MD-2", "free", "MD+2", "MD-3"],
  sprint: ["free", "MD+2", "MD-1", "MD-3"],
  technique: ["MD-1", "free", "MD+2", "MD-2", "MD-3"],
};

const REASONS: Record<string, string> = {
  "strength:MD-3": "Ostatnia mocna siła przed meczem.",
  "run:MD-2": "Bieganie jeszcze możliwe, dzień przed meczem już nie.",
  "sprint:MD-1": "Lekki sprint jako aktywacja przed meczem.",
  "technique:MD-1": "Technika z piłką zamiast ciężkiej pracy przed meczem.",
  "recovery:MD+1": "Dzień po meczu: regeneracja.",
  "activation:MD-1": "Aktywacja przed meczem.",
};

function variantFor(kind: SessionKind, phase: Phase, input: WeekInput): SessionVariant {
  if (kind === "sprint" && phase === "MD-1") return "light";
  if (kind === "strength" && phase === "MD+1") {
    return input.level === "advanced" || input.limitedGymAccess ? "full" : "upper";
  }
  return "full";
}

export function planWeek(input: WeekInput): WeekPlan {
  const warnings: string[] = [];
  const days: DayPlan[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(input.weekStart, i);
    return {
      date,
      phase: phaseOf(date, input.matches),
      isMatch: input.matches.includes(date),
      isClub: input.clubDays.includes(date),
      session: null,
    };
  });

  const neighbourHas = (i: number, kind: SessionKind) =>
    [days[i - 1], days[i + 1]].some((d) => d?.session?.kind === kind);

  const place = (kind: SessionKind, phases: Phase[]): boolean => {
    for (const wantPhase of phases) {
      // dni bez klubu najpierw: klub + 1 indywidualna to limit dnia
      for (const clubPass of [false, true]) {
        for (let i = 0; i < days.length; i++) {
          const d = days[i]!;
          if (d.session || d.isMatch || d.phase !== wantPhase) continue;
          if (d.isClub !== clubPass) continue;
          if (!allowedKinds(d.phase).includes(kind)) continue;
          if (HARD.includes(kind) && neighbourHas(i, kind)) continue;
          const session: IndividualSession = {
            kind,
            variant: variantFor(kind, d.phase, input),
            reason: REASONS[`${kind}:${d.phase}`] ?? "",
          };
          d.session = session;
          return true;
        }
      }
    }
    return false;
  };

  const required: Array<keyof typeof PREFERRED> = ["strength", "sprint", "run", "technique"];
  for (const kind of required) {
    const ok = place(kind, PREFERRED[kind]);
    if (!ok && kind !== "technique") {
      warnings.push(`Brak miejsca na sesję: ${kind} (minimum tygodnia niespełnione).`);
    }
  }

  // Regeneracja w dniu po meczu, jeśli dzień pusty.
  place("recovery", ["MD+1"]);

  return { days, warnings };
}

/** Poniedziałek tygodnia, do którego należy data ISO. */
export function weekStartOf(iso: string): string {
  const dow = (new Date(Date.parse(iso)).getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}
