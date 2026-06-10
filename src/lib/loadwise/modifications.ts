import type {
  Profile,
  SessionDay,
  ExerciseItem,
  Intensity,
  ModificationType,
} from "./types";
import { parseIso, isoDayOfWeek, dayName, addDays, isoDate } from "./labels";

export type Place = "dom" | "boisko" | "silownia";
export type Choice = "add" | "swap" | "keep";

export const PLACE_LABELS: Record<Place, string> = {
  dom: "Dom",
  boisko: "Boisko",
  silownia: "Siłownia",
};

const MAX_SPRINT_M = 240;

type Category =
  | "mobility"
  | "ball"
  | "recovery"
  | "activation"
  | "endurance"
  | "sprint"
  | "strength";

export interface Proposal {
  id: string;
  category: Category;
  reason: string; // max 1 zdanie
  type: ModificationType;
  session: SessionDay;
}

export interface BlockedProposal {
  title: string;
  reason: string;
}

export interface ProposalResult {
  canModify: boolean; // czy w ogóle można coś dodać/zamienić dziś
  message: string; // krótki komunikat decyzji
  safe: Proposal[];
  blocked: BlockedProposal[];
}

// ---------- kontekst dnia ----------

interface DayContext {
  date: string;
  mdLabel: string | null;
  isMatchToday: boolean;
  isMD1: boolean; // jutro mecz
  isMDplus1: boolean; // wczoraj mecz
  clubToday: boolean;
  hardTomorrow: boolean; // jutro mocna sesja / ciężki klub
  readiness: number | null;
  pain: boolean;
  goal: Profile["goal"];
  daysToMatch: number | null;
  weekBall: number;
  heavyWeek: boolean;
}

function dayTypeOf(plan: SessionDay[], date: string): SessionDay | undefined {
  return plan.find((p) => p.date === date);
}

function buildContext(
  plan: SessionDay[],
  profile: Profile,
  date: string,
  readiness: number | null,
): DayContext {
  const today = dayTypeOf(plan, date);
  const tomorrowIso = isoDate(addDays(parseIso(date), 1));
  const tomorrow = dayTypeOf(plan, tomorrowIso);

  const isMatchToday = today?.dayType === "match";
  const isMD1 = today?.mdLabel === "MD-1" || tomorrow?.dayType === "match";
  const isMDplus1 = today?.mdLabel === "MD+1" || today?.dayType === "recovery";
  const clubToday = today?.dayType === "club";

  const hardTomorrow =
    tomorrow?.dayType === "club" ||
    tomorrow?.intensity === "wysoka" ||
    tomorrow?.dayType === "match";

  // dni do meczu
  let daysToMatch: number | null = null;
  for (let i = 0; i <= 7; i++) {
    const d = dayTypeOf(plan, isoDate(addDays(parseIso(date), i)));
    if (d?.dayType === "match") {
      daysToMatch = i;
      break;
    }
  }

  // bieżący tydzień ISO (pon–niedz)
  const dow = isoDayOfWeek(parseIso(date));
  const weekStart = addDays(parseIso(date), -(dow - 1));
  const weekDates = new Set(
    Array.from({ length: 7 }, (_, i) => isoDate(addDays(weekStart, i))),
  );
  const week = plan.filter((p) => weekDates.has(p.date));
  const ballRe = /piłk|techn/i;
  const weekBall = week.filter(
    (d) => ballRe.test(d.sessionType) || ballRe.test(d.title),
  ).length;
  const highCount = week.filter((d) => d.intensity === "wysoka").length;
  const clubCount = week.filter((d) => d.dayType === "club").length;
  const heavyWeek = highCount + clubCount >= 4;

  return {
    date,
    mdLabel: today?.mdLabel ?? null,
    isMatchToday,
    isMD1,
    isMDplus1,
    clubToday,
    hardTomorrow,
    readiness,
    pain: profile.painInjury,
    goal: profile.goal,
    daysToMatch,
    weekBall,
    heavyWeek,
  };
}

// ---------- biblioteka bezpiecznych sesji ----------

function clampTime(base: number, timeMin: number): number {
  return Math.max(15, Math.min(base, timeMin));
}

interface Candidate {
  category: Category;
  title: string;
  sessionType: string;
  intensity: Intensity;
  intensityLabel: string;
  baseDuration: number;
  reason: string;
  build: (place: Place, timeMin: number) => SessionDay["sections"];
}

function warmupLight(): ExerciseItem[] {
  return [
    {
      name: "Rozgrzewka dynamiczna",
      prescription: "5 min, krążenia i otwieranie bioder",
      cue: "Spokojnie, pełen zakres ruchu.",
    },
  ];
}

function cooldownLight(): ExerciseItem[] {
  return [
    { name: "Wyciszenie i oddech", prescription: "3 min, długi wydech" },
  ];
}

const CANDIDATES: Candidate[] = [
  {
    category: "mobility",
    title: "Mobilność + core",
    sessionType: "Mobilność / core (lekka)",
    intensity: "niska",
    intensityLabel: "niska",
    baseDuration: 20,
    reason: "Bezpieczne uzupełnienie bez obciążenia nóg.",
    build: (_place, timeMin) => ({
      warmup: [],
      main: [
        {
          name: "Mobilność bioder, kostek i kręgosłupa",
          prescription: `${clampTime(10, timeMin)} min`,
          cue: "Powoli, kontroluj końcowy zakres.",
        },
        {
          name: "Aktywacja core",
          prescription: "3 × 40 s: plank, dead bug, ptak-pies",
          rest: "30 s",
          cue: "Napięty brzuch, biodra w linii.",
        },
      ],
      accessory: [],
      footballTransfer: [],
      cooldown: cooldownLight(),
    }),
  },
  {
    category: "ball",
    title: "Technika z piłką",
    sessionType: "Technika z piłką (lekka)",
    intensity: "niska",
    intensityLabel: "niska",
    baseDuration: 30,
    reason: "Uzupełnia plan bez dużego obciążenia nóg.",
    build: (place, timeMin) => ({
      warmup: warmupLight(),
      main: [
        {
          name: "Pierwszy kontakt i skanowanie",
          prescription: `${clampTime(10, timeMin)} min przyjęć kierunkowych`,
          cue: "Skan przed przyjęciem, kontakt w ruch.",
        },
        {
          name:
            place === "dom"
              ? "Podania o ścianę / odbojnik"
              : "Podania obunóż na dystansie",
          prescription: "10 min, różne kierunki",
          cue: "Celność przed siłą, obie nogi.",
          harder: "Słabsza noga co drugie powtórzenie.",
        },
      ],
      accessory: [],
      footballTransfer: [],
      cooldown: cooldownLight(),
    }),
  },
  {
    category: "recovery",
    title: "Regeneracja",
    sessionType: "Regeneracja",
    intensity: "niska",
    intensityLabel: "bardzo niska",
    baseDuration: 15,
    reason: "Najlepsza opcja przy zmęczeniu.",
    build: (_place, timeMin) => ({
      warmup: [],
      main: [
        {
          name: "Spacer / bardzo lekki rower",
          prescription: `${clampTime(15, timeMin)} min, opcjonalnie`,
          cue: "Bardzo lekko, tylko rozruszanie.",
        },
        {
          name: "Mobilność całego ciała",
          prescription: "8 min",
          cue: "Spokojnie, kontroluj zakres.",
        },
        {
          name: "Oddech i wyciszenie",
          prescription: "4 min wydłużony wydech",
          cue: "Nos–wdech, długi wydech, rozluźnij barki.",
        },
      ],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    }),
  },
  {
    category: "activation",
    title: "Aktywacja przedmeczowa",
    sessionType: "Aktywacja (primer)",
    intensity: "niska",
    intensityLabel: "niska",
    baseDuration: 20,
    reason: "Odświeża nogi, kończysz świeży na mecz.",
    build: (_place, timeMin) => ({
      warmup: [],
      main: [
        {
          name: "Mobilność i aktywacja",
          prescription: `${clampTime(8, timeMin)} min: biodra, kostki, pośladki`,
          cue: "Płynnie, pełen zakres.",
        },
        {
          name: "Czucie piłki",
          prescription: "6 min podań i przyjęć w spokojnym tempie",
          cue: "Miękki kontakt, głowa do góry.",
        },
        {
          name: "Krótkie zrywy submaksymalne",
          prescription: "3–5 × 10–15 m na ~80% — łącznie ≤ 75 m",
          rest: "pełna przerwa",
          cue: "Płynne przyspieszenie, nie maksymalne.",
        },
      ],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    }),
  },
  {
    category: "endurance",
    title: "Lekki trening tlenowy",
    sessionType: "Wytrzymałość (lekka)",
    intensity: "niska",
    intensityLabel: "niska",
    baseDuration: 25,
    reason: "Spokojna praca tlenowa wspiera regenerację.",
    build: (_place, timeMin) => ({
      warmup: warmupLight(),
      main: [
        {
          name: "Ciągły bieg / rower",
          prescription: `${clampTime(20, timeMin)} min, tętno komfortowe`,
          cue: "Spokojne, równe tempo, konwersacyjnie.",
          easier: "Marszobieg.",
        },
      ],
      accessory: [],
      footballTransfer: [],
      cooldown: cooldownLight(),
    }),
  },
  {
    category: "sprint",
    title: "Krótka ekspozycja przyspieszeń",
    sessionType: "Szybkość / technika biegu",
    intensity: "umiarkowana",
    intensityLabel: "umiarkowana",
    baseDuration: 25,
    reason: "Bezpieczne okno na jakość szybkości.",
    build: (_place, timeMin) => ({
      warmup: warmupLight(),
      main: [
        {
          name: "Przyspieszenia",
          prescription: "4 × 10 m — łącznie 40 m",
          rest: "90 s",
          cue: "Mocny pierwszy krok, jakość ponad ilość.",
        },
        {
          name: "Budowanie prędkości",
          prescription: `${timeMin >= 30 ? "3" : "2"} × 20 m progresywnie — łącznie ≤ 100 m`,
          rest: "90 s",
          cue: "Płynne narastanie, luźne barki.",
        },
        {
          name: "Reakcja z piłką",
          prescription: "2 × 15 m start na sygnał + przyjęcie",
          cue: "Skup się na starcie i pierwszym kontakcie.",
        },
      ],
      accessory: [],
      footballTransfer: [],
      cooldown: cooldownLight(),
    }),
  },
  {
    category: "strength",
    title: "Siła — sesja kontrolowana",
    sessionType: "Siła",
    intensity: "umiarkowana",
    intensityLabel: "umiarkowana",
    baseDuration: 40,
    reason: "Daleko do meczu — dobry moment na siłę.",
    build: (place, timeMin) => ({
      warmup: warmupLight(),
      main: [
        {
          name: place === "silownia" ? "Przysiad" : "Przysiad / split squat",
          prescription: "3 × 6, ciężar kontrolowany, 2–3 RIR",
          rest: "120 s",
          cue: "Napnij tułów, pełny zakres.",
        },
        {
          name: "Martwy ciąg rumuński",
          prescription: "3 × 8",
          rest: "90 s",
          cue: "Biodra w tył, plecy proste.",
          easier: "Mniejszy zakres / lżejszy ciężar.",
        },
        {
          name: "Core i prehab",
          prescription: `${clampTime(8, timeMin)} min: plank boczny + przywodziciele`,
          cue: "Napięcie tułowia, kontrola.",
        },
      ],
      accessory: [],
      footballTransfer: [],
      cooldown: cooldownLight(),
    }),
  },
];

function makeSession(
  c: Candidate,
  ctx: DayContext,
  place: Place,
  timeMin: number,
): SessionDay {
  return {
    date: ctx.date,
    dayName: dayName(parseIso(ctx.date)),
    dayType: c.category === "recovery" ? "recovery" : "training",
    title: c.title,
    goalLabel: c.sessionType,
    intensity: c.intensity,
    durationMin: Math.min(c.baseDuration, timeMin),
    reason: c.reason,
    safetyNote: null,
    whyToday: c.reason,
    sessionType: c.sessionType,
    goalOfSession: c.reason,
    riskManaged: "Dobrana tak, aby pasowała do meczu, klubu i obciążenia tygodnia.",
    avoidToday: "",
    mdLabel: ctx.mdLabel,
    slotLabel: null,
    sections: c.build(place, timeMin),
    secondSession: null,
  };
}

// ---------- logika bezpieczeństwa ----------

function gating(ctx: DayContext): {
  canModify: boolean;
  allowed: Category[];
  message: string;
} {
  const all: Category[] = [
    "mobility",
    "ball",
    "recovery",
    "activation",
    "endurance",
    "sprint",
    "strength",
  ];

  if (ctx.isMatchToday) {
    return {
      canModify: false,
      allowed: [],
      message: "Dziś mecz — nie dokładamy treningu.",
    };
  }

  let allowed = all;
  let message = "Bezpieczne dziś.";

  if (ctx.isMD1) {
    allowed = ["activation", "mobility", "ball", "recovery"];
    message = "Jutro mecz — proponujemy tylko lekką aktywację.";
  } else if (ctx.isMDplus1) {
    allowed = ["recovery", "mobility", "endurance", "ball"];
    message = "Dzień po meczu — priorytetem jest regeneracja.";
  } else if (ctx.clubToday) {
    allowed = ["mobility", "ball", "recovery"];
    message = "Trening klubowy jest głównym obciążeniem dnia.";
  } else if (ctx.hardTomorrow) {
    allowed = ["activation", "mobility", "recovery"];
    message = "Jutro mocna sesja — dziś lekko.";
  } else if (ctx.heavyWeek) {
    allowed = ["recovery", "mobility", "ball"];
    message = "Mocny tydzień — wybierz lekką opcję.";
  }

  // readiness
  if (ctx.readiness !== null) {
    if (ctx.readiness <= 3) {
      allowed = allowed.filter((c) => c === "recovery" || c === "mobility");
      message = "Gotowość niska — wybierz regenerację.";
    } else if (ctx.readiness <= 5) {
      allowed = allowed.filter((c) =>
        ["recovery", "mobility", "ball", "activation", "endurance"].includes(c),
      );
      if (message === "Bezpieczne dziś.")
        message = "Gotowość średnia — tylko lekka sesja.";
    }
  }

  // ból zawsze ogranicza
  if (ctx.pain) {
    allowed = allowed.filter((c) => c === "recovery" || c === "mobility");
    message = "Zgłoszony ból — tylko regeneracja i mobilność.";
  }

  return { canModify: allowed.length > 0, allowed, message };
}

function rank(ctx: DayContext, c: Candidate): number {
  let score = 0;
  const base: Record<Category, number> = {
    mobility: 5,
    ball: 4,
    recovery: 3,
    activation: 3,
    endurance: 2,
    sprint: 1,
    strength: 1,
  };
  score += base[c.category];
  if (c.category === "ball" && ctx.weekBall === 0) score += 6;
  if (c.category === "sprint" && ctx.goal === "speed") score += 5;
  if (
    c.category === "strength" &&
    ctx.goal === "strength" &&
    (ctx.daysToMatch === null || ctx.daysToMatch >= 3)
  )
    score += 5;
  if (ctx.heavyWeek && (c.category === "recovery" || c.category === "mobility"))
    score += 4;
  return score;
}

function blockReason(ctx: DayContext): string {
  if (ctx.isMatchToday) return "Dziś mecz.";
  if (ctx.isMD1) return "Za blisko meczu.";
  if (ctx.isMDplus1) return "Dzień po meczu — regeneracja.";
  if (ctx.clubToday) return "Klub był głównym obciążeniem.";
  if (ctx.pain) return "Zgłoszony ból.";
  if (ctx.readiness !== null && ctx.readiness <= 5) return "Gotowość niska.";
  if (ctx.hardTomorrow) return "Jutro mocna sesja.";
  return "Nie pasuje do tygodnia.";
}

export function buildProposals(
  plan: SessionDay[],
  profile: Profile,
  date: string,
  readiness: number | null,
  choice: ModificationType,
  place: Place,
  timeMin: number,
): ProposalResult {
  const ctx = buildContext(plan, profile, date, readiness);
  const { canModify, allowed, message } = gating(ctx);

  if (!canModify) {
    return {
      canModify: false,
      message,
      safe: [],
      blocked: [
        { title: "Dodatkowa sesja", reason: blockReason(ctx) },
      ],
    };
  }

  const safeCandidates = CANDIDATES.filter((c) => allowed.includes(c.category));
  const blockedCandidates = CANDIDATES.filter(
    (c) => !allowed.includes(c.category),
  );

  const sorted = [...safeCandidates].sort((a, b) => rank(ctx, b) - rank(ctx, a));
  const safe: Proposal[] = sorted.slice(0, 3).map((c) => ({
    id: c.category,
    category: c.category,
    reason: c.reason,
    type: choice,
    session: makeSession(c, ctx, place, timeMin),
  }));

  const reason = blockReason(ctx);
  const blocked: BlockedProposal[] = blockedCandidates
    .filter((c) => c.category === "sprint" || c.category === "strength")
    .map((c) => ({ title: c.title, reason: `Nie dziś — ${reason}` }));

  return { canModify: true, message, safe, blocked };
}
