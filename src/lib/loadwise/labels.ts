import type {
  Goal,
  Position,
  Level,
  Intensity,
  DoubleSessions,
  SeasonPhase,
  SeasonStage,
  CompetitionLevel,
  SecondaryLimiter,
} from "./types";

export const SEASON_PHASE_LABELS: Record<SeasonPhase, string> = {
  offseason: "Poza sezonem",
  preseason: "Przedsezon",
  inseason: "W sezonie",
  transition: "Okres przejściowy / roztrenowanie",
  return_injury: "Powrót po kontuzji",
};

export const SEASON_STAGE_LABELS: Record<SeasonStage, string> = {
  season_start: "Początek sezonu",
  season_mid: "Środek sezonu",
  season_end: "Końcówka sezonu",
  winter_break: "Przerwa zimowa",
  between_rounds: "Przerwa między rundami",
  no_match_week: "Tydzień bez meczu",
  match_week: "Tydzień meczowy",
};

export const COMPETITION_LEVEL_LABELS: Record<CompetitionLevel, string> = {
  academy: "Akademia / junior",
  b_klasa: "B klasa",
  a_klasa: "A klasa",
  okregowka: "Okręgówka",
  iv_liga: "IV liga",
  iii_liga: "III liga",
  ii_liga_plus: "II liga lub wyżej",
  semi_pro: "Półprofesjonalny",
  pro: "Profesjonalny",
};

export const DOUBLE_SESSION_LABELS: Record<DoubleSessions, string> = {
  no: "Nie",
  light_only: "Tak, ale tylko lekko",
  yes_if_safe: "Tak, jeśli plan ma sens",
};

const PL_DAYS = [
  "Niedziela",
  "Poniedziałek",
  "Wtorek",
  "Środa",
  "Czwartek",
  "Piątek",
  "Sobota",
];

const PL_MONTHS = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
];

/** Aktualna data w strefie Europe/Warsaw jako lokalny obiekt Date o północy. */
export function warsawToday(): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const s = fmt.format(new Date());
  return new Date(`${s}T00:00:00`);
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function parseIso(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

/** ISO numer dnia tygodnia: 1=poniedziałek ... 7=niedziela */
export function isoDayOfWeek(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

export function dayName(d: Date): string {
  return PL_DAYS[d.getDay()];
}

export function shortDayName(d: Date): string {
  return PL_DAYS[d.getDay()].slice(0, 3);
}

export function formatDate(s: string): string {
  const d = parseIso(s);
  return `${d.getDate()} ${PL_MONTHS[d.getMonth()]}`;
}

export function formatDateFull(s: string): string {
  const d = parseIso(s);
  return `${PL_DAYS[d.getDay()]}, ${d.getDate()} ${PL_MONTHS[d.getMonth()]}`;
}

export const GOAL_LABELS: Record<Goal, string> = {
  speed: "Szybkość i przyspieszenie",
  strength: "Siła i stabilność",
  endurance: "Wytrzymałość piłkarska",
  power: "Moc i eksplozywność",
  agility: "Zwrotność i hamowanie",
  general: "Rozwój z piłką",
  mobility: "Mobilność / prehab",
  return: "Powrót po przerwie lub kontuzji",
  matchready: "Gotowość meczowa",
};

export const SECONDARY_LIMITER_LABELS: Record<SecondaryLimiter, string> = {
  speed: "Szybkość",
  strength: "Siła",
  endurance: "Wytrzymałość",
  cod: "Zwrotność / hamowanie",
  power: "Moc",
  ball: "Gra z piłką",
  fatigue: "Zmęczenie / przeciążenie",
  return: "Powrót po przerwie",
};

export const POSITION_LABELS: Record<Position, string> = {
  goalkeeper: "Bramkarz",
  defender: "Obrońca",
  midfielder: "Pomocnik",
  forward: "Napastnik",
};

export const LEVEL_LABELS: Record<Level, string> = {
  beginner: "Początkujący",
  intermediate: "Średniozaawansowany",
  advanced: "Zaawansowany",
  elite: "Wysoki poziom / elite youth",
};

export const ISO_DAY_LABELS: { value: number; label: string; short: string }[] =
  [
    { value: 1, label: "Poniedziałek", short: "Pn" },
    { value: 2, label: "Wtorek", short: "Wt" },
    { value: 3, label: "Środa", short: "Śr" },
    { value: 4, label: "Czwartek", short: "Cz" },
    { value: 5, label: "Piątek", short: "Pt" },
    { value: 6, label: "Sobota", short: "So" },
    { value: 7, label: "Niedziela", short: "Nd" },
  ];

export const EQUIPMENT_OPTIONS: string[] = [
  "Piłka",
  "Pachołki",
  "Drabinka koordynacyjna",
  "Gumy oporowe",
  "Hantle",
  "Dostęp do siłowni",
  "Bramka",
  "Ściana / odbojnik",
  "Płotki",
];

export function intensityColor(i: Intensity): string {
  if (i === "wysoka") return "text-destructive";
  if (i === "umiarkowana") return "text-accent-foreground";
  return "text-primary";
}
