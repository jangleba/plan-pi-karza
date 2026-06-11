// ============================================================
// Loadwise — silnik treści sesji wg kategorii (category engine)
// "Zbalansowany" = kompletny W OBRĘBIE swojej kategorii, NIE mieszanie
// kategorii. Każda sesja jest budowana z puli ćwiczeń przypisanej do
// kategorii i WALIDOWANA zanim zostanie pokazana. Niepoprawne ćwiczenia
// są zamieniane na poprawne odpowiedniki tej samej kategorii.
// ============================================================

import type { ExerciseItem, Position, Profile, SessionDay } from "./types";

// ---------- Taksonomia kategorii ----------

export type SessionContentCategory =
  | "gym"
  | "sport_performance"
  | "football"
  | "running_conditioning"
  | "recovery_prehab"
  | "primer"
  | "pool_recovery"
  | "club"
  | "match"
  | "rest";

export type PositionTag = "GK" | "DEF" | "MID" | "WINGER" | "FWD" | "ALL";
export type AgeSafetyTag = "youth_safe" | "adult_only" | "advanced_only";

// ---------- Metadane ćwiczenia ----------

export interface CatExerciseMeta {
  allowedSessionTypes: SessionContentCategory[];
  forbiddenSessionTypes: SessionContentCategory[];
  requiresBall: boolean;
  isGymStrength: boolean;
  isFootballSpecific: boolean;
  isSprintSpecific: boolean;
  isRunningBased: boolean;
  isPlyometric: boolean;
  isStrengthAccessory: boolean;
  positionTags: PositionTag[];
  ageSafety: AgeSafetyTag;
  equipmentRequired: string[];
  primaryQuality: string;
  tissueLoadTags: string[];
}

export interface CatExercise extends ExerciseItem {
  meta: CatExerciseMeta;
}

const DEFAULT_META: CatExerciseMeta = {
  allowedSessionTypes: [],
  forbiddenSessionTypes: [],
  requiresBall: false,
  isGymStrength: false,
  isFootballSpecific: false,
  isSprintSpecific: false,
  isRunningBased: false,
  isPlyometric: false,
  isStrengthAccessory: false,
  positionTags: ["ALL"],
  ageSafety: "youth_safe",
  equipmentRequired: [],
  primaryQuality: "ogólna",
  tissueLoadTags: [],
};

function mk(
  e: Omit<ExerciseItem, "name"> & { name: string },
  meta: Partial<CatExerciseMeta>,
): CatExercise {
  return { ...e, meta: { ...DEFAULT_META, ...meta } };
}

function toItem(e: CatExercise): ExerciseItem {
  const { meta: _meta, ...item } = e;
  return item;
}

// ---------- Klasyfikatory słownikowe (dla treści legacy / obcej) ----------

function txt(e: ExerciseItem): string {
  return `${e.name} ${e.prescription ?? ""} ${e.cue ?? ""}`.toLowerCase();
}

const BALL_RE =
  /piłk|podani|podań|przyjęci|prowadzeni|prowadź|żonglerk|strzał|wykończ|dryblin|crossy|crossing|dośrodk|finish|odbojnik|ścian[aęy]|wall pass|jednokontakt|jedno-?dwa|pierwszy kontakt|skanowani|sole roll|kontakty obiema|narożnik|do bramki/i;
const GYM_RE =
  /przysiad|martwy ciąg|\brdl\b|hip thrust|mostek biodrow|wyciskan|wiosłow|podciąg|bułgarski|hantl|sztang|ciężar|goblet|nordic|copenhagen|pallof|trap.?bar|deadlift|squat|split squat|przywodziciel|wspięcia na łydki/i;
const SPRINT_RE =
  /sprint|przyspiesz|akceler|wall drive|napęd|falling start|start z padania|flying|lotny|lotne|build.?up|narastając|wicket|płotk|ankling|\bskip\b|a-?skip|b-?skip|drive|prędko[śs]ć maks|max velocity|reakcja|hamowani|zmiana kierunku|cod|deceler/i;
const RUN_RE =
  /\bbieg|trucht|tempo|interwa|aerob|rower|wytrzymał|kondyc|conversational|tlenow|rytmiczn/i;
const PLYO_RE = /skok|plyo|pogo|bound|wieloskok|lądowani|snap.?down|zeskok/i;
const STRENGTH_ACC_RE =
  /core|plank|dead bug|stabiliz|przywodziciel|łydk|prehab|mobil|nordic|copenhagen|pallof/i;

export function exerciseRequiresBall(e: ExerciseItem): boolean {
  return BALL_RE.test(txt(e));
}
export function exerciseIsGymStrength(e: ExerciseItem): boolean {
  return GYM_RE.test(txt(e));
}
export function exerciseIsSprintSpecific(e: ExerciseItem): boolean {
  return SPRINT_RE.test(txt(e));
}
export function exerciseIsRunningBased(e: ExerciseItem): boolean {
  return RUN_RE.test(txt(e));
}
export function exerciseIsPlyometric(e: ExerciseItem): boolean {
  return PLYO_RE.test(txt(e));
}
export function exerciseIsStrengthAccessory(e: ExerciseItem): boolean {
  return STRENGTH_ACC_RE.test(txt(e));
}

// ---------- Wspólne klocki ----------

function isYoung(age: number): boolean {
  return age >= 13 && age <= 15;
}

function pick<T>(arr: T[], idx: number): T {
  return arr[((idx % arr.length) + arr.length) % arr.length];
}

interface BuiltContent {
  title: string;
  sessionType: string;
  goalOfSession: string;
  riskManaged: string;
  avoidToday: string;
  sections: {
    warmup: ExerciseItem[];
    main: ExerciseItem[];
    accessory: ExerciseItem[];
    footballTransfer: ExerciseItem[];
    cooldown: ExerciseItem[];
  };
}

function sprintWarmup(): CatExercise[] {
  return [
    mk(
      {
        name: "Dynamiczna rozgrzewka biegowa",
        prescription: "8 min: krążenia, wymachy, otwieranie bioder, mobilizacja kostek",
        cue: "Pełen zakres ruchu, stopniowo podnoś tętno.",
      },
      { isRunningBased: true, primaryQuality: "rozgrzewka", allowedSessionTypes: ["sport_performance"] },
    ),
    mk(
      {
        name: "Ankling + A-skip + B-skip",
        prescription: "3 × 20 m każdego ćwiczenia",
        cue: "Aktywna stopa pod biodrem, wysokie kolano, luźne barki.",
      },
      { isSprintSpecific: true, primaryQuality: "mechanika biegu", allowedSessionTypes: ["sport_performance"], tissueLoadTags: ["łydka", "biodro"] },
    ),
    mk(
      {
        name: "Narastające przebieżki (build-up)",
        prescription: "3 × 30 m progresywnie do ~80%",
        rest: "trucht powrót",
        cue: "Płynne narastanie prędkości, bez spinania.",
      },
      { isSprintSpecific: true, isRunningBased: true, primaryQuality: "przygotowanie do sprintu", allowedSessionTypes: ["sport_performance"] },
    ),
  ];
}

function sprintCooldown(): CatExercise[] {
  return [
    mk(
      { name: "Trucht wyciszający", prescription: "5 min bardzo lekko" },
      { isRunningBased: true, primaryQuality: "wyciszenie" },
    ),
    mk(
      { name: "Rozciąganie i mobilność tylnej taśmy", prescription: "6 min: tylne uda, łydki, biodra" },
      { primaryQuality: "mobilność", tissueLoadTags: ["tylne uda", "łydka"] },
    ),
  ];
}

// ============================================================
// SPORT PERFORMANCE / MOTORYKA — sprint/bieg, BEZ piłki i BEZ siłowni
// ============================================================

type SprintTheme = "acceleration" | "max_velocity" | "cod_decel" | "rhythm";
const SPRINT_THEMES: SprintTheme[] = ["acceleration", "max_velocity", "cod_decel", "rhythm"];

export function buildSportPerformance(
  profile: Profile,
  opts: { seed: number; intensity?: string; durationMin?: number; light?: boolean },
): BuiltContent {
  const young = isYoung(profile.age);
  const cap = young ? 160 : 240;
  const light = Boolean(opts.light);
  const theme = pick(SPRINT_THEMES, opts.seed);

  const mechanics: CatExercise[] = [
    mk(
      {
        name: "Wall drive (napęd o ścianę)",
        prescription: "3 × 6 na nogę",
        rest: "45 s",
        cue: "Linia tułowia, mocny napęd kolana, aktywna stopa.",
      },
      { isSprintSpecific: true, primaryQuality: "mechanika startu", allowedSessionTypes: ["sport_performance"], tissueLoadTags: ["biodro"] },
    ),
    mk(
      {
        name: theme === "cod_decel" ? "Mechanika hamowania (bez piłki)" : "Falling start (start z padania)",
        prescription: theme === "cod_decel" ? "4 × wejście 5 m + stabilny stop" : "4 × 10 m z padania",
        rest: "60 s",
        cue: theme === "cod_decel" ? "Nisko biodra, kolano stabilne, cichy kontakt." : "Pozwól ciału opaść, eksploduj w pierwszym kroku.",
      },
      { isSprintSpecific: true, isPlyometric: theme === "cod_decel", primaryQuality: theme === "cod_decel" ? "hamowanie" : "akceleracja", allowedSessionTypes: ["sport_performance"] },
    ),
  ];

  let main: CatExercise[];
  let title: string;
  let goal: string;
  switch (theme) {
    case "max_velocity":
      title = "Sprint — prędkość maksymalna";
      goal = "Rozwój prędkości maksymalnej przy pełnej świeżości i jakości każdego biegu.";
      main = [
        mk(
          {
            name: "Sprinty lotne (flying)",
            prescription: `${young ? 3 : 4} × 20 m z najazdem 20 m — łącznie ≤ ${Math.min(cap, (young ? 3 : 4) * 20)} m`,
            rest: "pełna przerwa 2–4 min",
            cue: "Najazd płynny, na odcinku lotnym wysoka częstość i luz.",
            easier: "Skróć odcinek lotny do 15 m.",
          },
          { isSprintSpecific: true, isRunningBased: true, primaryQuality: "prędkość maksymalna", allowedSessionTypes: ["sport_performance"], tissueLoadTags: ["tylne uda"] },
        ),
        mk(
          {
            name: "Wicket runs (płotki rytmiczne)",
            prescription: "4 × 20 m nad niskimi znacznikami",
            rest: "90 s",
            cue: "Stały rytm, lądowanie pod biodrem, wysokie kolano.",
          },
          { isSprintSpecific: true, primaryQuality: "rytm biegu", allowedSessionTypes: ["sport_performance"] },
        ),
      ];
      break;
    case "cod_decel":
      title = "Zmiana kierunku i hamowanie (bez piłki)";
      goal = "Hamowanie, reakcja i zmiana kierunku bez piłki — jakość ruchu, nie zmęczenie.";
      main = [
        mk(
          {
            name: "Zmiana kierunku 45°/90° (bez piłki)",
            prescription: `${young ? 5 : 6} powtórzeń na stronę`,
            rest: "75–90 s",
            cue: "Najpierw wyhamuj, potem przyspiesz — nie ślizgaj kroku.",
          },
          { isSprintSpecific: true, primaryQuality: "zmiana kierunku", allowedSessionTypes: ["sport_performance"], tissueLoadTags: ["kolano"] },
        ),
        mk(
          {
            name: "Sprint z reakcją na sygnał (bez piłki)",
            prescription: "6 × 10–15 m start na sygnał wzrokowy",
            rest: "60–90 s",
            cue: "Reaguj natychmiast, mocny pierwszy krok.",
          },
          { isSprintSpecific: true, primaryQuality: "reakcja / akceleracja", allowedSessionTypes: ["sport_performance"] },
        ),
      ];
      break;
    case "rhythm":
      title = "Rytm i technika biegu";
      goal = "Technika biegu, rytm i ekspozycja szybkościowa przy kontrolowanej objętości.";
      main = [
        mk(
          {
            name: "Rytmiczne przebieżki",
            prescription: `${young ? 4 : 6} × 60 m na ~85%`,
            rest: "trucht powrót",
            cue: "Płynny, rytmiczny bieg, kontroluj postawę.",
          },
          { isSprintSpecific: true, isRunningBased: true, primaryQuality: "rytm biegu", allowedSessionTypes: ["sport_performance"] },
        ),
        mk(
          {
            name: "Przyspieszenia z technicznym akcentem",
            prescription: `${young ? 3 : 4} × 20 m — łącznie ≤ ${Math.min(cap, 80)} m`,
            rest: "90 s",
            cue: "Stopniowa rozbudowa, mechanika ponad maksymalny wysiłek.",
          },
          { isSprintSpecific: true, primaryQuality: "technika sprintu", allowedSessionTypes: ["sport_performance"] },
        ),
      ];
      break;
    case "acceleration":
    default:
      title = "Sprint — akceleracja";
      goal = "Rozwój przyspieszenia i pierwszego kroku przy wysokiej jakości każdego startu.";
      main = [
        mk(
          {
            name: "Sprinty z akceleracją",
            prescription: `${young ? 4 : 6} × 20 m, pełna przerwa — łącznie ≤ ${Math.min(cap, (young ? 4 : 6) * 20)} m`,
            rest: "90–120 s",
            cue: "Niski tułów na starcie, mocny pierwszy krok, stopniowy wzrost.",
            easier: "Skróć do 15 m lub zmniejsz liczbę powtórzeń.",
          },
          { isSprintSpecific: true, isRunningBased: true, primaryQuality: "akceleracja", allowedSessionTypes: ["sport_performance"], tissueLoadTags: ["tylne uda"] },
        ),
        mk(
          {
            name: "Starty z różnych pozycji",
            prescription: "4 × 10 m (z klęku, z siadu, z biegu w miejscu)",
            rest: "90 s",
            cue: "Eksplozja od pierwszego kontaktu, różne wzorce startu.",
          },
          { isSprintSpecific: true, primaryQuality: "pierwszy krok", allowedSessionTypes: ["sport_performance"] },
        ),
      ];
      break;
  }

  // Opcjonalna, NISKOOBJĘTOŚCIOWA plyometria specyficzna dla sprintu.
  const accessory: CatExercise[] =
    young || light
      ? []
      : [
          mk(
            {
              name: theme === "max_velocity" ? "Wieloskoki (bounds) — niska objętość" : "Niskie pogo + snap-down (mechanika)",
              prescription: theme === "max_velocity" ? "3 × 4 wieloskoki" : "3 × 5 niskich pogo + 3 snap-down",
              rest: "60 s",
              cue: "Krótki kontakt z podłożem, sztywna kostka, jakość ponad ilość.",
            },
            { isPlyometric: true, isSprintSpecific: true, ageSafety: "advanced_only", primaryQuality: "moc reaktywna", allowedSessionTypes: ["sport_performance"], tissueLoadTags: ["łydka", "ścięgno Achillesa"] },
          ),
        ];

  return {
    title,
    sessionType: "Szybkość / sprint (motoryka)",
    goalOfSession: goal,
    riskManaged: `Sesja sprinterska bez piłki i bez siłowni. Limit objętości zrywów ≤ ${cap} m i pełne przerwy chronią mechanikę i tylną taśmę.`,
    avoidToday:
      "Bez ćwiczeń z piłką, bez ciężkiego treningu siłowego i bez twardego kondycyjnego tego samego dnia. Przerwij przy spadku jakości biegu.",
    sections: {
      warmup: sprintWarmup().map(toItem),
      main: [...mechanics, ...main].map(toItem),
      accessory: accessory.map(toItem),
      footballTransfer: [],
      cooldown: sprintCooldown().map(toItem),
    },
  };
}

// ============================================================
// FOOTBALL / PIŁKARSKI — tylko z piłką, solo-compatible, wg pozycji
// ============================================================

function posTag(position: Position): Exclude<PositionTag, "ALL"> {
  switch (position) {
    case "goalkeeper":
      return "GK";
    case "defender":
      return "DEF";
    case "midfielder":
      return "MID";
    case "forward":
    default:
      return "FWD";
  }
}

function ballWarmup(): CatExercise[] {
  return [
    mk(
      {
        name: "Rozgrzewka z piłką",
        prescription: "6 min: prowadzenie, sole rolls, lekkie podania o ścianę",
        cue: "Miękkie kontakty obiema nogami, głowa do góry.",
      },
      { requiresBall: true, isFootballSpecific: true, equipmentRequired: ["piłka"], primaryQuality: "rozgrzewka z piłką", allowedSessionTypes: ["football"] },
    ),
    mk(
      {
        name: "Żonglerka i czucie piłki",
        prescription: "4 min, obie nogi + udo",
        cue: "Spokojny rytm, kontrola, słabsza noga co drugie powtórzenie.",
      },
      { requiresBall: true, isFootballSpecific: true, equipmentRequired: ["piłka"], primaryQuality: "czucie piłki", allowedSessionTypes: ["football"] },
    ),
  ];
}

function ballCooldown(): CatExercise[] {
  return [
    mk(
      { name: "Lekkie podania o ścianę", prescription: "5 min, spokojnie, obie nogi" },
      { requiresBall: true, isFootballSpecific: true, primaryQuality: "wyciszenie z piłką", allowedSessionTypes: ["football"] },
    ),
    mk(
      { name: "Rozciąganie i oddech", prescription: "4 min: biodra, uda, łydki + spokojny oddech" },
      { primaryQuality: "wyciszenie" },
    ),
  ];
}

/** Solo-compatible, pozycyjne bloki techniczne z transferem meczowym. */
function footballThemes(position: Position, seed: number): {
  technical: CatExercise;
  matchAction: CatExercise;
  finishing: CatExercise;
  title: string;
} {
  const tag = posTag(position);
  const ball = { requiresBall: true, isFootballSpecific: true, equipmentRequired: ["piłka", "ściana/odbojnik"], allowedSessionTypes: ["football"] as SessionContentCategory[], positionTags: [tag] as PositionTag[] };

  if (tag === "GK") {
    const technicals: CatExercise[] = [
      mk({ name: "Przyjęcie cofniętej piłki pod presją", prescription: "12 min: przyjęcie kierunkowe + podanie o ścianę", cue: "Otwarta sylwetka, pierwszy kontakt od presji. Transfer: jak przy back-passie w meczu." }, { ...ball, primaryQuality: "gra nogami" }),
      mk({ name: "Praca nóg z piłką", prescription: "10 min: kontakty w różne strefy + podanie", cue: "Szybka praca stóp, stabilna pozycja. Transfer: dystrybucja po obronie." }, { ...ball, primaryQuality: "footwork z piłką" }),
    ];
    return {
      title: "Trening bramkarski z piłką (gra nogami)",
      technical: pick(technicals, seed),
      matchAction: mk({ name: "Reakcja i ustawienie + wznowienie", prescription: "8 min: sygnał, krok w bok, przyjęcie i wznowienie gry", cue: "Reaguj wzrokowo, kontroluj pierwszy kontakt. Transfer: szybkie wznowienie po interwencji." }, { ...ball, primaryQuality: "reakcja / dystrybucja" }),
      finishing: mk({ name: "Zasięg podania / wybicie z ręki i nogi", prescription: "10 min na różne dystanse", cue: "Celność przed siłą, obie nogi. Transfer: otwieranie gry długim podaniem." }, { ...ball, primaryQuality: "zasięg podania" }),
    };
  }
  if (tag === "DEF") {
    const technicals: CatExercise[] = [
      mk({ name: "Przyjęcie od presji + podanie diagonalne", prescription: "12 min o ścianę, przyjęcie w otwartą sylwetkę", cue: "Sylwetka przed przyjęciem, pierwszy kontakt od presji. Transfer: wyprowadzenie spod pressingu." }, { ...ball, primaryQuality: "wyprowadzenie piłki" }),
      mk({ name: "Długie podanie i celność", prescription: "12 min: zmiana strony / podanie za linię", cue: "Stabilna noga postawna, czysty kontakt. Transfer: zmiana strony gry." }, { ...ball, primaryQuality: "długie podanie" }),
    ];
    return {
      title: "Trening obrońcy z piłką (wyprowadzenie)",
      technical: pick(technicals, seed),
      matchAction: mk({ name: "Wall pass + prowadzenie w wolną przestrzeń", prescription: "10 min: podanie o ścianę, przyjęcie, prowadzenie 5 m", cue: "Decyzja przed kontaktem, prowadzenie w przestrzeń. Transfer: wyjście z piłką po odbiorze." }, { ...ball, primaryQuality: "prowadzenie w przestrzeń" }),
      finishing: mk({ name: "Sylwetka ciała przed przyjęciem", prescription: "8 min: skan, otwarcie bioder, przyjęcie", cue: "Skanuj przed przyjęciem, otwórz się na grę. Transfer: orientacja w defensywie." }, { ...ball, primaryQuality: "skanowanie / sylwetka" }),
    };
  }
  if (tag === "MID") {
    const technicals: CatExercise[] = [
      mk({ name: "Przyjęcie na półobrocie", prescription: "12 min: skan, przyjęcie kierunkowe na pół-obrocie o ścianę", cue: "Skan przed przyjęciem, pierwszy kontakt w kierunku gry. Transfer: gra przez linie." }, { ...ball, primaryQuality: "przyjęcie kierunkowe" }),
      mk({ name: "Kombinacje wall pass", prescription: "12 min: podanie o ścianę, dwa kontakty, zmiana tempa", cue: "Szybka decyzja, zmiana tempa po przyjęciu. Transfer: jednokontaktowa gra w środku pola." }, { ...ball, primaryQuality: "kombinacje" }),
    ];
    return {
      title: "Trening pomocnika z piłką (gra w środku)",
      technical: pick(technicals, seed),
      matchAction: mk({ name: "Skanowanie + gra przez linie", prescription: "10 min: symulacja podania pod presją, zmiana kierunku gry", cue: "Głowa do góry przed przyjęciem, otwórz się na podanie do przodu. Transfer: rozegranie przez linie." }, { ...ball, primaryQuality: "rozegranie przez linie" }),
      finishing: mk({ name: "Zmiana tempa po przyjęciu", prescription: "8 min: przyjęcie i przyspieszenie z piłką", cue: "Pierwszy kontakt w przestrzeń, przyspiesz po przyjęciu. Transfer: progresja gry po przyjęciu." }, { ...ball, primaryQuality: "zmiana tempa z piłką" }),
    };
  }
  // FWD (oraz skrzydłowy)
  const technicals: CatExercise[] = [
    mk({ name: "Przyjęcie tyłem do bramki + obrót", prescription: "12 min: przyjęcie, obrót, kontakt do strzału", cue: "Osłona piłki, szybki obrót w przestrzeń. Transfer: gra tyłem do bramki." }, { ...ball, primaryQuality: "obrót i przyjęcie" }),
    mk({ name: "Ruch przed przyjęciem + pierwszy kontakt", prescription: "12 min: zwód, oderwanie, przyjęcie w bieg", cue: "Oderwij się przed podaniem, pierwszy kontakt w przestrzeń. Transfer: timing wejścia." }, { ...ball, primaryQuality: "ruch bez piłki + przyjęcie" }),
  ];
  return {
    title: "Trening napastnika z piłką (wykończenie)",
    technical: pick(technicals, seed),
    matchAction: mk({ name: "Wall pass + strzał", prescription: "10 min: podanie o ścianę, przyjęcie, wykończenie", cue: "Szybkie wejście po odbiciu, kontrola przed strzałem. Transfer: gra w jeden-dwa i finalizacja." }, { ...ball, primaryQuality: "kombinacja + strzał" }),
    finishing: mk({ name: "Wykończenia: pierwszy kontakt / obrót i strzał", prescription: "10 min: bliski/daleki słupek, jeden kontakt, obie nogi", cue: "Spokój przy wykończeniu, celność. Transfer: różne wzorce strzału w polu karnym." }, { ...ball, primaryQuality: "wykończenie" }),
  };
}

export function buildFootball(
  profile: Profile,
  opts: { seed: number; light?: boolean },
): BuiltContent {
  const t = footballThemes(profile.position, opts.seed);
  const main = opts.light ? [t.technical, t.matchAction] : [t.technical, t.matchAction];
  const transfer = opts.light ? [] : [t.finishing];
  return {
    title: t.title,
    sessionType: "Piłka / technika (pozycyjna)",
    goalOfSession:
      "Kompletna praca z piłką w obrębie kategorii piłkarskiej: technika pozycyjna, akcja meczowa i transfer — wszystko z piłką i możliwe solo.",
    riskManaged:
      "Praca techniczna o umiarkowanej objętości, każde ćwiczenie z piłką i dopasowane do pozycji — bez fatygujących obwodów.",
    avoidToday:
      "Bez bloków siłowni i bez czystych sprintów bez piłki w tej sesji. To trening piłkarski.",
    sections: {
      warmup: ballWarmup().map(toItem),
      main: main.map(toItem),
      accessory: [],
      footballTransfer: transfer.map(toItem),
      cooldown: ballCooldown().map(toItem),
    },
  };
}

// ============================================================
// RUNNING / CONDITIONING — bieg/tempo/interwał, BEZ piłki i siłowni
// ============================================================

type RunTheme = "aerobic" | "tempo" | "interval" | "rsa";
const RUN_THEMES: RunTheme[] = ["aerobic", "tempo", "interval", "rsa"];

export function buildRunningConditioning(
  profile: Profile,
  opts: { seed: number; intensity?: string; light?: boolean },
): BuiltContent {
  const young = isYoung(profile.age);
  const theme = opts.light ? "aerobic" : pick(RUN_THEMES, opts.seed);

  const warmup: CatExercise[] = [
    mk(
      { name: "Trucht rozgrzewkowy + mobilność", prescription: "6 min trucht + krążenia, wymachy", cue: "Spokojnie podnoś tętno, pełen zakres ruchu." },
      { isRunningBased: true, primaryQuality: "rozgrzewka", allowedSessionTypes: ["running_conditioning"] },
    ),
    mk(
      { name: "Przebieżki aktywujące", prescription: "4 × 60 m narastająco", rest: "trucht powrót", cue: "Płynne narastanie, rozluźnione barki." },
      { isRunningBased: true, primaryQuality: "aktywacja biegowa", allowedSessionTypes: ["running_conditioning"] },
    ),
  ];

  let main: CatExercise[];
  let title: string;
  let goal: string;
  switch (theme) {
    case "tempo":
      title = "Tempo ekstensywne";
      goal = "Ekonomia biegu i baza tempowa — kontrolowane, równe tempo bez piłki.";
      main = [
        mk({ name: "Tempo ekstensywne", prescription: `${young ? 6 : 8} × 100 m luźnego tempa`, rest: "trucht 100 m", cue: "Relaks w barkach, równe tempo, nie na czas." }, { isRunningBased: true, primaryQuality: "tempo", allowedSessionTypes: ["running_conditioning"] }),
        mk({ name: "Bieg ciągły", prescription: `${young ? 12 : 16} min tętno tlenowe`, cue: "Tempo konwersacyjne, kontroluj oddech." }, { isRunningBased: true, primaryQuality: "baza tlenowa", allowedSessionTypes: ["running_conditioning"] }),
      ];
      break;
    case "interval":
      title = "Interwały biegowe";
      goal = "Wytrzymałość specjalna — kontrolowane interwały biegowe bez piłki.";
      main = [
        mk({ name: "Interwały biegowe", prescription: `${young ? 6 : 8} × 1 min bieg / 1 min trucht`, rest: "1 min trucht", cue: "Równe tempo, kontrola oddechu na każdym powtórzeniu.", easier: "Skróć do 4–5 powtórzeń." }, { isRunningBased: true, primaryQuality: "wytrzymałość specjalna", allowedSessionTypes: ["running_conditioning"] }),
        mk({ name: "Bieg ciągły wyrównujący", prescription: "8 min spokojnie", cue: "Rozluźnij tempo, kontroluj oddech." }, { isRunningBased: true, primaryQuality: "baza tlenowa", allowedSessionTypes: ["running_conditioning"] }),
      ];
      break;
    case "rsa":
      title = "Powtarzalne sprinty (RSA) — bieg";
      goal = "Zdolność do powtarzanego wysiłku biegowego — wysoka specyfika, bez piłki.";
      main = [
        mk({ name: "Powtarzalne sprinty", prescription: `${young ? 6 : 10} × 20–25 m, przerwa 30–40 s`, rest: "30–40 s aktywnej przerwy", cue: "Utrzymaj mechanikę i tempo do końca serii." }, { isRunningBased: true, isSprintSpecific: true, primaryQuality: "RSA", ageSafety: "advanced_only", allowedSessionTypes: ["running_conditioning"] }),
        mk({ name: "Bieg regeneracyjny", prescription: "6 min bardzo lekko", cue: "Rozluźnienie po seriach." }, { isRunningBased: true, primaryQuality: "regeneracja biegowa", allowedSessionTypes: ["running_conditioning"] }),
      ];
      break;
    case "aerobic":
    default:
      title = "Baza tlenowa";
      goal = "Budowa bazy tlenowej i ekonomii biegu — spokojny, ciągły wysiłek bez piłki.";
      main = [
        mk({ name: "Ciągły bieg tlenowy", prescription: `${young ? 18 : 24} min tętno komfortowe`, cue: "Równe, konwersacyjne tempo.", easier: "Marszobieg w blokach." }, { isRunningBased: true, primaryQuality: "baza tlenowa", allowedSessionTypes: ["running_conditioning"] }),
      ];
      break;
  }

  return {
    title,
    sessionType: "Wydolność / bieganie",
    goalOfSession: goal,
    riskManaged: "Praca wyłącznie biegowa, kontrolowane tempo — bez twardych interwałów na 48 h przed meczem.",
    avoidToday: "Bez piłki i bez bloków siłowych w tej sesji. To trening biegowy/kondycyjny.",
    sections: {
      warmup: warmup.map(toItem),
      main: main.map(toItem),
      accessory: [],
      footballTransfer: [],
      cooldown: sprintCooldown().map(toItem),
    },
  };
}

// ============================================================
// RECOVERY / PREHAB — niskie obciążenie, mobilność, oddech, tkanki
// ============================================================

export function buildRecoveryPrehab(profile: Profile): BuiltContent {
  return {
    title: "Regeneracja i prehab",
    sessionType: "Regeneracja / prehab",
    goalOfSession: "Niskie obciążenie: mobilność, oddech, lekka praca tlenowa i odporność tkanek bez generowania zmęczenia.",
    riskManaged: "Brak intensywności i bez ukrytego kondycyjnego — sesja wspiera regenerację.",
    avoidToday: "Bez sprintów, twardych interwałów i ciężkich obciążeń.",
    sections: {
      warmup: [],
      main: [
        { name: "Mobilność całego ciała", prescription: "10 min: biodra, kostki, kręgosłup", cue: "Powoli, kontroluj końcowy zakres." },
        { name: "Lekka praca tlenowa (opcjonalnie)", prescription: "10–15 min spacer / rower bardzo lekko", cue: "Tylko rozruszanie, zero forsowania." },
      ],
      accessory: [
        { name: "Prehab tkanek: przywodziciele, łydki, tylne uda", prescription: "8 min, kontrola, bez bólu", cue: "Lekko i kontrolowanie — reset tkanek, nie trening siłowy." },
        { name: "Oddech i wyciszenie", prescription: "5 min wydłużony wydech", cue: "Nos–wdech, długi wydech, rozluźnij barki." },
      ],
      footballTransfer: [],
      cooldown: [],
    },
  };
}

// ============================================================
// Klasyfikacja istniejącej sesji do kategorii treści
// ============================================================

export function classifyContentCategory(session: SessionDay): SessionContentCategory {
  if (session.dayType === "club") return "club";
  if (session.dayType === "match") return "match";
  if (session.dayType === "rest") return "rest";
  if (session.dayType === "md-1") return "primer";
  if (session.dayType === "recovery") return "recovery_prehab";

  const header = `${session.title} ${session.sessionType} ${session.goalOfSession}`.toLowerCase();
  // Kolejność ma znaczenie: prehab/regeneracja przed bieganiem (mają "tlenowa"),
  // a "\bsił" unika fałszywych trafień typu "wysiłek".
  if (/prehab|mobiln|regener|stabiliz|kompensac/.test(header)) return "recovery_prehab";
  if (/\bsił|siłow|\bmoc|power|\bgym\b/.test(header)) return "gym";
  if (/sprint|szybko|przyspiesz|akceler|prędko|motory|\bcod\b|zmiana kierunku|hamowan/.test(header)) return "sport_performance";
  if (/wydol|tlen|tempo|interwa|\brsa\b|kondyc|\bbieg/.test(header)) return "running_conditioning";
  if (/piłk|technik|gotowo|ostrość/.test(header)) return "football";

  // fallback na podstawie treści
  const items = [
    ...session.sections.warmup,
    ...session.sections.main,
    ...session.sections.accessory,
    ...session.sections.footballTransfer,
  ];
  if (items.some(exerciseRequiresBall)) return "football";
  if (items.some(exerciseIsSprintSpecific)) return "sport_performance";
  if (items.some(exerciseIsRunningBased)) return "running_conditioning";
  if (items.some(exerciseIsGymStrength)) return "gym";
  return "football";
}

// ============================================================
// Twarda walidacja sesji PRZED renderem
// ============================================================

export interface ValidationResult {
  category: SessionContentCategory;
  valid: boolean;
  violations: string[];
}

export function validateGeneratedSession(
  session: SessionDay,
  forcedCategory?: SessionContentCategory,
): ValidationResult {
  const category = forcedCategory ?? classifyContentCategory(session);
  const violations: string[] = [];
  const main = [...session.sections.main, ...session.sections.footballTransfer];
  const all = [
    ...session.sections.warmup,
    ...main,
    ...session.sections.accessory,
  ];

  switch (category) {
    case "sport_performance": {
      for (const e of all) {
        if (exerciseRequiresBall(e)) violations.push(`Sport-performance nie może zawierać ćwiczenia z piłką: "${e.name}".`);
        if (exerciseIsGymStrength(e)) violations.push(`Sport-performance nie może zawierać wzmacniania siłowego: "${e.name}".`);
      }
      const hasSprint = all.some(exerciseIsSprintSpecific) || all.some(exerciseIsRunningBased);
      if (!hasSprint) violations.push("Sport-performance musi zawierać pracę sprint/bieg.");
      break;
    }
    case "football": {
      for (const e of all) {
        if (exerciseIsGymStrength(e)) violations.push(`Sesja piłkarska nie może zawierać bloku siłowni: "${e.name}".`);
      }
      for (const e of main) {
        if (!exerciseRequiresBall(e)) violations.push(`Główne ćwiczenie piłkarskie musi wymagać piłki: "${e.name}".`);
      }
      if (main.length === 0) violations.push("Sesja piłkarska musi mieć główne akcje z piłką.");
      break;
    }
    case "gym": {
      for (const e of main) {
        if (exerciseRequiresBall(e)) violations.push(`Sesja siłowni nie może zawierać dryblingu/piłki: "${e.name}".`);
      }
      break;
    }
    case "running_conditioning": {
      for (const e of all) {
        if (exerciseRequiresBall(e)) violations.push(`Sesja biegowa nie może zawierać piłki: "${e.name}".`);
        if (exerciseIsGymStrength(e)) violations.push(`Sesja biegowa nie może zawierać siły z siłowni: "${e.name}".`);
      }
      if (!all.some(exerciseIsRunningBased)) violations.push("Sesja biegowa musi zawierać pracę biegową.");
      if (session.sections.warmup.length === 0) violations.push("Sesja biegowa musi mieć rozgrzewkę.");
      if (session.sections.cooldown.length === 0) violations.push("Sesja biegowa musi mieć wyciszenie.");
      break;
    }
    default:
      break;
  }

  return { category, valid: violations.length === 0, violations };
}

// ============================================================
// Wymuszenie kategorii: przebuduj treść z puli właściwej kategorii
// i zwaliduj. Mutuje sesję w miejscu.
// ============================================================

export interface ContentCounters {
  sport: number;
  football: number;
  running: number;
}

export function newContentCounters(): ContentCounters {
  return { sport: 0, football: 0, running: 0 };
}

export interface EnforceContext {
  weekIndex: number;
  counters: ContentCounters;
  light?: boolean;
  readiness?: number;
}

/** Nadpisuje treść sesji zgodnie z jej kategorią (poza gym/klub/mecz/rest). */
export function enforceSessionCategory(
  session: SessionDay,
  profile: Profile,
  ctx: EnforceContext,
): SessionContentCategory {
  const category = classifyContentCategory(session);
  let built: BuiltContent | null = null;

  switch (category) {
    case "sport_performance": {
      const seed = ctx.counters.sport + ctx.weekIndex;
      built = buildSportPerformance(profile, { seed, light: ctx.light, durationMin: session.durationMin });
      ctx.counters.sport++;
      break;
    }
    case "football": {
      const seed = ctx.counters.football + ctx.weekIndex;
      built = buildFootball(profile, { seed, light: ctx.light });
      ctx.counters.football++;
      break;
    }
    case "running_conditioning": {
      const seed = ctx.counters.running + ctx.weekIndex;
      built = buildRunningConditioning(profile, { seed, light: ctx.light });
      ctx.counters.running++;
      break;
    }
    case "recovery_prehab": {
      built = buildRecoveryPrehab(profile);
      break;
    }
    default:
      // gym / club / match / rest / primer — bez nadpisywania treści.
      return category;
  }

  if (built) {
    session.title = built.title;
    session.sessionType = built.sessionType;
    session.goalOfSession = built.goalOfSession;
    session.riskManaged = built.riskManaged;
    session.avoidToday = built.avoidToday;
    session.sections = built.sections;
    // sesje strukturalne należą tylko do siłowni — wyczyść ewentualne stare.
    session.structuredSections = undefined;
  }

  // Walidacja końcowa (sieć bezpieczeństwa). Treść z puli jest poprawna,
  // ale jeśli kiedyś przejdzie tu treść niepoprawna — usuń złe ćwiczenia.
  const result = validateGeneratedSession(session, category);
  if (!result.valid) {
    repairInPlace(session, category);
  }
  return category;
}

/** Awaryjna naprawa: usuwa ćwiczenia łamiące reguły kategorii. */
function repairInPlace(session: SessionDay, category: SessionContentCategory): void {
  const filterList = (list: ExerciseItem[]): ExerciseItem[] =>
    list.filter((e) => {
      if (category === "sport_performance" || category === "running_conditioning") {
        return !exerciseRequiresBall(e) && !exerciseIsGymStrength(e);
      }
      if (category === "football") {
        return !exerciseIsGymStrength(e);
      }
      if (category === "gym") {
        return !exerciseRequiresBall(e);
      }
      return true;
    });
  session.sections = {
    warmup: filterList(session.sections.warmup),
    main: filterList(session.sections.main),
    accessory: filterList(session.sections.accessory),
    footballTransfer: filterList(session.sections.footballTransfer),
    cooldown: filterList(session.sections.cooldown),
  };
}
