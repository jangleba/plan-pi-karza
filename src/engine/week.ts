import type {
  DayPlan,
  IndividualSession,
  Phase,
  SessionKind,
  SessionVariant,
  SkipMove,
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

/** Od ilu lat stażu siłowego planujemy siłę dzień po meczu (jako ostatnią opcję). Próg umowny – do przeglądu trenera. */
export const MD1_STRENGTH_MIN_YEARS = 2;

const WEEKDAY_GEN = ["poniedziałku", "wtorku", "środy", "czwartku", "piątku", "soboty", "niedzieli"];
export const weekdayGen = (iso: string): string => WEEKDAY_GEN[(new Date(Date.parse(iso)).getUTCDay() + 6) % 7]!;

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

const KIND_PL: Record<keyof typeof PREFERRED, string> = {
  strength: "siła", run: "bieganie", sprint: "sprint", technique: "technika",
};

/** Dodatkowa sesja wynikająca z celu (powrót po przerwie nie dodaje sesji – zmienia fazę cyklu). */
export function goalExtra(goal: WeekInput["goal"]): "sprint" | "strength" | "run" | null {
  return goal === "speed" ? "sprint" : goal === "strength" ? "strength" : goal === "endurance" ? "run" : null;
}

function variantFor(kind: SessionKind, phase: Phase, input: WeekInput): SessionVariant {
  if (input.season === "offseason" && (kind === "sprint" || kind === "run")) return "light";
  if (kind === "sprint" && phase === "MD-1") return "light";
  if (kind === "strength" && phase === "MD+1") {
    return input.level === "advanced" || input.limitedGymAccess ? "full" : "upper";
  }
  return "full";
}

export function planWeek(input: WeekInput): WeekPlan {
  const warnings: string[] = [];
  const season = input.season ?? "inseason";
  // mecz można zaznaczyć w każdym okresie (w przerwie np. towarzyski); przerwa różni się lżejszym sprintem i biegiem
  const matches = input.matches;
  const days: DayPlan[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(input.weekStart, i);
    return {
      date,
      phase: phaseOf(date, matches),
      isMatch: matches.includes(date),
      isClub: input.clubDays.includes(date),
      isOff: input.offDays?.includes(date) ?? false,
      session: null,
    };
  });

  const neighbourHas = (i: number, kind: SessionKind) =>
    [days[i - 1], days[i + 1]].some((d) => d?.session?.kind === kind);

  const mdPlus1Strength = input.strengthYears === undefined || input.strengthYears >= MD1_STRENGTH_MIN_YEARS;
  /** Czy w danym dniu można zaplanować siłę: dzień po meczu tylko przy odpowiednim stażu siłowym. */
  const strengthOk = (d: DayPlan): boolean => d.phase !== "MD+1" || mdPlus1Strength;

  interface PlaceOpt { upper?: boolean; minDate?: string; skip?: ReadonlySet<string>; movedFrom?: string; replaceTechnique?: boolean }
  const place = (kind: SessionKind, phases: Phase[], opt: PlaceOpt = {}): boolean => {
    for (const wantPhase of phases) {
      // dni bez klubu najpierw: klub + 1 indywidualna to limit dnia
      for (const clubPass of [false, true]) {
        for (let i = 0; i < days.length; i++) {
          const d = days[i]!;
          const freeSlot = !d.session || (opt.replaceTechnique === true && d.session.kind === "technique");
          if (!freeSlot || d.isMatch || d.isOff || d.phase !== wantPhase) continue;
          if (d.isClub !== clubPass) continue;
          if (opt.minDate && d.date < opt.minDate) continue;
          if (opt.skip?.has(d.date)) continue;
          if (!allowedKinds(d.phase).includes(kind)) continue;
          if (kind === "strength" && !opt.upper && !strengthOk(d)) continue;
          if (HARD.includes(kind) && neighbourHas(i, kind)) continue;
          const session: IndividualSession = {
            kind,
            variant: opt.upper ? "upper" : variantFor(kind, d.phase, input),
            reason: opt.movedFrom ? `Przełożona z ${weekdayGen(opt.movedFrom)}: wtedy nie możesz trenować.` : REASONS[`${kind}:${d.phase}`] ?? "",
            ...(opt.movedFrom ? { movedFrom: opt.movedFrom } : {}),
          };
          d.session = session;
          return true;
        }
      }
    }
    return false;
  };

  // Miękkie minimum (siła, sprint, bieg): układane w wolne dni, ale mecz ma pierwszeństwo. Cel dodaje jedną sesję: w okresie przygotowawczym
  // jest obowiązkowa (przed techniką), w sezonie tylko gdy zostanie wolny dzień.
  const extra = goalExtra(input.goal);
  const mustExtra = season === "preseason" && extra;
  const required: Array<keyof typeof PREFERRED> = ["strength", "sprint", "run"];
  if (mustExtra) required.push(extra);
  for (const kind of required) {
    // Miękkie minimum: mecz i dni MD-1/MD+1 mają pierwszeństwo. W tygodniu z meczem brak miejsca nie jest błędem planu.
    if (!place(kind, PREFERRED[kind]) && matches.length === 0) {
      warnings.push(`Brak miejsca na sesję: ${KIND_PL[kind]}. Zwolnij dzień w kalendarzu, jeśli chcesz ją zrobić.`);
    }
  }
  place("technique", PREFERRED.technique);
  if (extra && !mustExtra) place(extra, PREFERRED[extra]);
  const extra2 = input.goal2 !== input.goal ? goalExtra(input.goal2) : null;
  if (extra2) place(extra2, PREFERRED[extra2]);

  // Trzecia sesja siłowa: hipertroficzna góra ciała, gdy są już dwie pełne i zostaje wolny dzień. Najchętniej dzień po meczu.
  if (days.filter((d) => d.session?.kind === "strength").length >= 2) place("strength", ["MD+1", "free", "MD+2"], { upper: true });

  // Dni, w których zawodnik zgłosił „nie mogę zrobić dzisiejszych treningów” (check-in, plan): sesję indywidualną przekładamy na pierwszy
  // dozwolony dzień, nie wcześniejszy niż dzień zgłoszenia. Kolejność jak przy planowaniu (np. dla siły: MD-3, wolne, MD+2), a siła dzień po meczu
  // na końcu i tylko przy stażu siłowym od MD1_STRENGTH_MIN_YEARS lat. Trening klubowy zostaje (prowadzi go trener). Aktywacja i regeneracja są
  // związane z dniem meczu, więc nie są przekładane (regeneracji w zgłoszonym dniu po prostu nie dodajemy). Wynik zależy tylko od zgłoszeń (nie od „dzisiaj”): przełożona sesja nie zmienia miejsca z dnia na dzień.
  const since = new Map((input.skippedDays ?? []).map((b) => [b.date, b.since] as const));
  const skipped = new Set(since.keys());
  const moves: SkipMove[] = [];
  for (const d of days) {
    const from = since.get(d.date);
    const kind = d.session?.kind;
    if (from === undefined || !kind) continue;
    d.session = null;
    if (kind === "activation" || kind === "recovery") continue; // (na tym etapie takich sesji jeszcze nie ma; regenerację dodajemy niżej, z pominięciem zgłoszonych dni)
    const opt = { minDate: from, skip: skipped, movedFrom: d.date };
    if (place(kind, PREFERRED[kind], opt) || place(kind, PREFERRED[kind], { ...opt, replaceTechnique: kind === "strength" })) {
      moves.push({ from: d.date, kind, to: days.find((x) => x.session?.movedFrom === d.date)!.date });
      if (!days.some((x) => x.session?.kind === "technique")) place("technique", PREFERRED.technique, { minDate: from });
      continue;
    }
    const md1Blocked = kind === "strength" && !mdPlus1Strength && days.some((x) => x.phase === "MD+1" && x.date >= from && !x.isMatch && !x.isOff && !skipped.has(x.date));
    moves.push({ from: d.date, kind, to: null, ...(md1Blocked ? { needsYears: MD1_STRENGTH_MIN_YEARS } : {}) });
  }

  // Regeneracja w dniu po meczu, jeśli dzień pusty (z wyjątkiem dni, w których zawodnik zgłosił, że nie może trenować).
  place("recovery", ["MD+1"], { skip: skipped });

  // Ciężki tydzień z własnych jednostek: od jutra lżejsze wersje sesji, a przy bardzo ciężkim pierwszy wolny dzień na regenerację
  const wl = input.weekLoad;
  if (wl && wl.level !== "ok") {
    let lighter = 0;
    for (const d of days) {
      const s = d.session;
      if (d.date <= wl.from || !s || s.variant !== "full" || !["strength", "run", "sprint"].includes(s.kind)) continue;
      d.session = { ...s, variant: "light", reason: "Ciężki tydzień z własnych jednostek: lżejsza wersja." };
      lighter++;
    }
    let rest = false;
    if (wl.level === "veryHigh") {
      const free = days.find((d) => d.date > wl.from && !d.session && !d.isMatch && !d.isOff && !skipped.has(d.date));
      if (free) { free.session = { kind: "recovery", variant: "full", reason: "Bardzo ciężki tydzień z własnych jednostek: dzień regeneracji." }; rest = true; }
    }
    if (lighter || rest) warnings.push(`Ten tydzień jest już ciężki dzięki Twoim własnym jednostkom: ${rest ? "dodaliśmy dzień regeneracji" : "kolejne sesje są lżejsze"}.`);
  }

  return { days, warnings, moves };
}

/** Poniedziałek tygodnia, do którego należy data ISO. */
export function weekStartOf(iso: string): string {
  const dow = (new Date(Date.parse(iso)).getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}

/** Dzisiejsza data ISO w czasie lokalnym (toISOString dałoby UTC, czyli wczoraj tuż po północy). */
export function localISO(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
