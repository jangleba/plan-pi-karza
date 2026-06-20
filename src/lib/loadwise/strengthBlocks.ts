import type {
  Profile,
  Intensity,
  ExerciseItem,
  TrainingSection,
  TrainingBlock,
  TrainingExercise,
  AgeSafetyLevel,
} from "./types";

/**
 * Wariantowy generator sesji siłowni dla Loadwise.
 *
 * Zamiast jednego sztywnego szablonu (przysiad → skok, bułgar → stick,
 * RDL → pogo...) tworzy realnie różne sesje na podstawie ROLI sesji w tygodniu,
 * fazy periodyzacji, numeru tygodnia, dnia, relacji do meczu, celu, wieku,
 * poziomu, gotowości i historii ćwiczeń (anty-powtórzenia).
 */

export type GymWeekPhase = "adaptation" | "development" | "peak" | "deload";

export type GymRole =
  | "lower_strength_power"
  | "posterior_sprint"
  | "unilateral_decel"
  | "upper_core"
  | "full_body_athletic"
  | "primer"
  | "recovery_prehab";

export interface GymHistory {
  usedRolesThisWeek: GymRole[];
  usedMainThisWeek: string[];
  usedMainLastWeek: string[];
}

export interface StrengthBlockContext {
  /** Etykieta dnia meczowego (MD, MD-1, MD-2, MD+1...) lub null. */
  mdLabel: string | null;
  /** Czy nacisk na moc (cel power) vs siła. */
  powerFocus: boolean;
  /** Faza periodyzacji tygodnia. */
  weekPhase: GymWeekPhase;
  /** Indeks tygodnia w planie (0-based) — różnicuje tygodnie. */
  weekIndex: number;
  /** Która to sesja siłowni w tym tygodniu (0-based). */
  gymSessionIndexInWeek: number;
  /** Łączna liczba sesji siłowni zaplanowanych w tym tygodniu. */
  gymSessionsThisWeekTotal?: number;
  /** Ogólna gotowość 1–10 (jeśli znana). */
  readiness?: number;
  /** Historia ćwiczeń — anty-powtórzenia w tygodniu i między tygodniami. */
  history: GymHistory;
  /**
   * Wymuszona rodzina głównego liftu dla sesji dolnej.
   * Używane przy 2 sesjach gym w tygodniu:
   * - "squat"    → sesja 1: dzień przysiadu (knee-dominant max strength)
   * - "trap_bar" → sesja 2: dzień trap bar / hinge total-body
   */
  forcedMainFamily?: "squat" | "trap_bar";
}

export interface GymSessionPlan {
  role: GymRole;
  title: string;
  sessionType: string;
  goalOfSession: string;
  intensity: Intensity;
  durationMin: number;
  sections: TrainingSection[];
  /** Główne wzorce użyte w tej sesji (do historii anty-powtórzeń). */
  mainPatterns: string[];
}

let __uid = 0;
function uid(prefix: string): string {
  __uid += 1;
  return `${prefix}-${__uid}`;
}

function ex(e: Omit<TrainingExercise, "id">): TrainingExercise {
  return { id: uid("ex"), completed: false, ...e };
}
function block(b: Omit<TrainingBlock, "id">): TrainingBlock {
  return { id: uid("blk"), ...b };
}
function section(s: Omit<TrainingSection, "id">): TrainingSection {
  return { id: uid("sec"), ...s };
}

function isYoung(age: number): boolean {
  return age >= 13 && age <= 15;
}

/** Czy zawodnik jest uprawniony do zaawansowanej pracy siła→moc + plyo. */
export function isAdvancedEligible(profile: Profile): boolean {
  if (profile.painInjury) return false;
  if (profile.seasonPhase === "return_injury") return false;
  if (isYoung(profile.age)) return false;
  if (profile.level === "beginner") return false;
  return true;
}

/** Czy w ogóle generować strukturalne bloki dla tej sesji (MD-restrictions). */
export function structuredStrengthAllowed(mdLabel: string | null): boolean {
  if (mdLabel === "MD-1" || mdLabel === "MD-2") return false;
  if (mdLabel === "MD") return false;
  if (mdLabel === "MD+1") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Pule ćwiczeń (rotowane) — osobno warianty dorosłe i młodzieżowe/bezpieczne
// ---------------------------------------------------------------------------

interface JumpVariant {
  name: string;
  contacts: number;
  cue: string;
  kind: PlyoKind;
}

type PlyoKind =
  | "horizontal"
  | "vertical"
  | "pogo"
  | "snap"
  | "lateral"
  | "hurdle"
  | "medball"
  | "wall"
  | "ankling";

const SQUAT_ADULT = [
  "Przysiad ze sztangą (high bar)",
  "Przysiad czołowy (front squat)",
  "Safety bar squat (przysiad)",
  "Przysiad ze sztangą do skrzyni",
  "Przysiad ze sztangą (low bar)",
];
const SQUAT_YOUTH = [
  "Goblet squat",
  "Przysiad z hantlami (tempo)",
  "Przysiad do skrzyni",
  "Przysiad z masą ciała + pauza",
];

/** Sesja 2 przy 2 sesjach gym w tygodniu: trap bar / hinge total-body. */
const TRAP_BAR_HINGE_ADULT = [
  "Trap bar martwy ciąg",
  "Trap bar jump (skok z trap bar)",
  "Martwy ciąg klasyczny",
  "Trap bar martwy ciąg (z wysokich pinów)",
];
const TRAP_BAR_HINGE_YOUTH = [
  "Trap bar martwy ciąg (lekko, technika)",
  "Hip hinge z hantlami",
  "Kettlebell deadlift",
  "Hip thrust z hantlami",
];

const HINGE_ADULT = [
  "Martwy ciąg rumuński (RDL)",
  "Hip thrust ze sztangą",
  "Martwy ciąg klasyczny",
  "RDL jednonóż (kettlebell)",
  "Good morning",
];
const HINGE_YOUTH = [
  "Hip hinge z kijem (nauka wzorca)",
  "Hamstring bridge",
  "Hip thrust z masą ciała",
  "RDL z hantlami (lekko)",
];

const UNILATERAL_ADULT = [
  "Przysiad bułgarski",
  "Step-down z podwyższenia",
  "Wykrok odwrotny (reverse lunge)",
  "Wykrok boczny (lateral lunge)",
  "Split squat iso",
];
const UNILATERAL_YOUTH = [
  "Split squat",
  "Step-up na skrzynię",
  "Wykrok w miejscu",
  "Przysiad na jednej nodze do skrzyni",
];

const PUSH_ADULT = [
  "Wyciskanie hantli na ławce",
  "Wyciskanie sztangi nad głowę (OHP)",
  "Pompki z obciążeniem",
  "Wyciskanie hantli skos",
];
const PUSH_YOUTH = ["Pompki", "Pompki na podwyższeniu", "Wyciskanie hantli lekko", "Pike push-up"];

const PULL_ADULT = [
  "Wiosłowanie sztangą",
  "Podciąganie / pull-up",
  "Wiosłowanie hantlą jednorącz",
  "Wiosłowanie TRX",
];
const PULL_YOUTH = ["Wiosłowanie TRX", "Wiosłowanie hantlą lekko", "Australijskie podciąganie", "Band row"];

const CARRY = [
  "Farmer's carry",
  "Suitcase carry (jednostronnie)",
  "Front rack carry",
  "Spacer kelnera (overhead carry)",
];

const CORE_ANTI = [
  "Pallof press (anty-rotacja)",
  "Dead bug",
  "Plank boczny",
  "Bird dog",
  "Anty-rotacja z gumą w półklęku",
];

const POSTERIOR_ACC = [
  "Nordic curl ekscentryczny",
  "Hamstring slider curl",
  "Glute bridge march",
  "Wspięcia na łydki (ekscentryczne)",
];

/** Kontrolowane prace tylnej taśmy — bez wysokich stresorów (bez Nordic). */
const CONTROLLED_HAM = [
  "Hamstring slider curl",
  "Glute bridge march",
  "Hamstring bridge (kontrola)",
];

const ADDUCTOR = [
  "Copenhagen plank",
  "Adductor squeeze (piłka)",
  "Suwak boczny z gumą",
  "Side-lying adduction",
];

/** Wsparcie atletyczne — góra, łopatka, pull/press (BLOK D). */
const UPPER_SUPPORT = [
  "Face pull (guma / wyciąg)",
  "Podciąganie / pull-up",
  "Wiosłowanie hantlą jednorącz",
  "Wyciskanie hantli nad głowę (OHP)",
  "Praca rotatorów barku (guma)",
];

/** Opcjonalny finisher hipertroficzny (BLOK E) — tylko izolacja na końcu. */
const HYPERTROPHY_FINISHER = [
  "Uginanie ramion ze sztangielkami (biceps)",
  "Prostowanie ramion na wyciągu (triceps)",
  "Wznosy bokiem (lateral raise)",
  "Młotki (biceps)",
  "Triceps francuski (sztangielka)",
];

const JUMPS: JumpVariant[] = [
  { name: "Skok w dal z miejsca", contacts: 5, cue: "Maksymalna intencja, miękkie lądowanie na całej stopie.", kind: "horizontal" },
  { name: "Potrójny skok w dal", contacts: 6, cue: "Rytm, sprężyna, kontrola lądowania.", kind: "horizontal" },
  { name: "Skok pionowy (CMJ)", contacts: 5, cue: "Szybkie zejście, eksplozja w górę.", kind: "vertical" },
  { name: "Box jump (niska skrzynia)", contacts: 5, cue: "Wejdź na skrzynię, ciche, stabilne lądowanie.", kind: "vertical" },
  { name: "Pogo hops", contacts: 30, cue: "Krótki kontakt, sztywna kostka, sprężyna.", kind: "pogo" },
  { name: "Ankling", contacts: 30, cue: "Praca kostek, lekkie, szybkie stopy.", kind: "ankling" },
  { name: "Snap-down do stick", contacts: 9, cue: "Zatrzymaj się sztywno, niskie biodra, zamroź.", kind: "snap" },
  { name: "Drop to stick (niska skrzynia)", contacts: 8, cue: "Miękkie lądowanie, natychmiastowe zatrzymanie.", kind: "snap" },
  { name: "Lateral bound to stick", contacts: 8, cue: "Odbij w bok, wyląduj i zatrzymaj na jednej nodze.", kind: "lateral" },
  { name: "Przeskok przez niski płotek do stick", contacts: 8, cue: "Kontrola w lądowaniu, kolano stabilne.", kind: "hurdle" },
  { name: "Med ball slam", contacts: 8, cue: "Pełen wyrzut w dół, napięty tułów.", kind: "medball" },
  { name: "Med ball rotacyjny rzut", contacts: 8, cue: "Obrót przez biodro, transfer w piłkę.", kind: "medball" },
  { name: "Med ball chest pass", contacts: 8, cue: "Dynamiczny wyrzut, stabilny tułów.", kind: "medball" },
  { name: "Wall drive (acceleration)", contacts: 0, cue: "Mocny napęd kolana, pochylenie tułowia.", kind: "wall" },
  { name: "A-skip", contacts: 0, cue: "Wysokie kolano, aktywne lądowanie pod biodrem.", kind: "ankling" },
];

// ---------------------------------------------------------------------------
// Rotacja z anty-powtórzeniami
// ---------------------------------------------------------------------------

function rotatePick(pool: string[], ctx: StrengthBlockContext, avoid: string[]): string {
  const seed = ctx.weekIndex * 5 + ctx.gymSessionIndexInWeek * 2;
  const ordered = pool.map((_, i) => pool[(seed + i) % pool.length]);
  const fresh = ordered.find((name) => !avoid.includes(name));
  return fresh ?? ordered[0];
}

function pickJumps(
  ctx: StrengthBlockContext,
  kinds: PlyoKind[],
  avoid: string[],
): JumpVariant {
  const pool = JUMPS.filter((j) => kinds.includes(j.kind));
  const seed = ctx.weekIndex * 3 + ctx.gymSessionIndexInWeek + 1;
  const ordered = pool.map((_, i) => pool[(seed + i) % pool.length]);
  const fresh = ordered.find((j) => !avoid.includes(j.name));
  return fresh ?? ordered[0];
}

// ---------------------------------------------------------------------------
// Dawkowanie wg fazy + wieku/poziomu
// ---------------------------------------------------------------------------

interface Dosage {
  mainSets: string;
  mainReps: string;
  rpe: string;
  accSets: string;
  accReps: string;
  contactScale: number; // skala kontaktów plyo
}

function dosageFor(profile: Profile, ctx: StrengthBlockContext): Dosage {
  const gentle = isYoung(profile.age) || profile.level === "beginner";
  let d: Dosage;
  switch (ctx.weekPhase) {
    case "adaptation":
      d = { mainSets: "3", mainReps: "6–8", rpe: "RPE 6–7", accSets: "3", accReps: "10–12", contactScale: 0.8 };
      break;
    case "development":
      d = { mainSets: "4", mainReps: "4–6", rpe: "RPE 7–8", accSets: "3", accReps: "8–10", contactScale: 1 };
      break;
    case "peak":
      d = { mainSets: "4", mainReps: "3–4", rpe: "RPE 8", accSets: "2", accReps: "6–8", contactScale: 0.9 };
      break;
    case "deload":
    default:
      d = { mainSets: "2", mainReps: "4–5", rpe: "RPE 6", accSets: "2", accReps: "8–10", contactScale: 0.55 };
      break;
  }
  if (gentle) {
    d = {
      ...d,
      mainReps: ctx.weekPhase === "peak" ? "5–6" : "8–10",
      rpe: "RPE 5–6 (technika)",
      contactScale: d.contactScale * 0.6,
    };
  }
  return d;
}

function contacts(base: number, d: Dosage): number {
  return Math.max(4, Math.round(base * d.contactScale));
}

// ---------------------------------------------------------------------------
// Wspólne sekcje
// ---------------------------------------------------------------------------

function warmupSection(withBall = false): TrainingSection {
  return section({
    title: "Rozgrzewka",
    type: "warmup",
    blocks: [
      block({
        title: "Aktywacja ogólna",
        blockType: "single",
        intent: "mobility",
        restAfterBlock: "przejdź płynnie dalej",
        exercises: [
          ex({ name: "Rower / trucht", duration: "5–7 min", rpe: "RPE 3", cue: "Spokojny oddech, podnoś tętno." }),
          ex({ name: "Mobilność: biodra, kostki, T-spine", duration: "6 min", cue: "Pełen zakres, kontrola tułowia." }),
          ex({
            name: withBall ? "Aktywacja pośladków, core + czucie piłki" : "Aktywacja pośladków i core",
            sets: "2",
            reps: "10–12",
            cue: "Napięcie pośladka, neutralny kręgosłup.",
          }),
        ],
      }),
    ],
  });
}

function cooldownSection(): TrainingSection {
  return section({
    title: "Wyciszenie",
    type: "cooldown",
    blocks: [
      block({
        title: "Wyciszenie",
        blockType: "single",
        intent: "mobility",
        exercises: [
          ex({ name: "Lekki rower / spacer", duration: "5 min", cue: "Bardzo lekko." }),
          ex({ name: "Mobilność bioder i tylnych ud", duration: "4 min" }),
          ex({ name: "Oddech przeponowy", duration: "2 min", cue: "Długi wydech." }),
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Przezwyciężająca izometria (overcoming iso) — przed głównym blokiem kontrastu
// ---------------------------------------------------------------------------

/** Dobiera ćwiczenie izometryczne pasujące do głównego liftu. */
function isoForMain(mainName: string): { name: string; cue: string } {
  const n = mainName.toLowerCase();
  if (n.includes("trap bar") || n.includes("martwy ciąg") || n.includes("rdl") || n.includes("hip thrust") || n.includes("good morning") || n.includes("hinge")) {
    return {
      name: "Izometria przezwyciężająca: trap bar pull / mid-thigh pull przy pinach",
      cue: "Napieraj maksymalnie w pin przez 3–5 s, plecy proste, napięty tułów.",
    };
  }
  if (n.includes("split") || n.includes("wykrok") || n.includes("step")) {
    return {
      name: "Izometria przezwyciężająca: split squat iso przy pinach",
      cue: "Maksymalne napięcie w dół przez 3–5 s, pion tułowia, stabilne kolano.",
    };
  }
  return {
    name: "Izometria przezwyciężająca: przysiad przy pinach (overcoming iso)",
    cue: "Napieraj maksymalnie w pin przez 3–5 s, napnij tułów, pchaj podłogę.",
  };
}

/** Sekcja przygotowawcza z przezwyciężającą izometrią (przed kontrastem). */
function overcomingIsoSection(mainName: string): TrainingSection {
  const iso = isoForMain(mainName);
  return section({
    title: "Izometria przezwyciężająca",
    type: "prep",
    blocks: [
      block({
        title: "BLOK ISO — napęd nerwowy",
        blockType: "single",
        intent: "rfd",
        restAfterBlock: "Przerwa po bloku: 90 s",
        safetyNotes: "Krótkie, maksymalne napięcia. Bez bólu, pełna kontrola pozycji.",
        exercises: [
          ex({
            label: "ISO",
            name: iso.name,
            sets: "3",
            reps: "3 × 5 s",
            restAfterExercise: "60–90 s",
            cue: iso.cue,
            ageSafetyLevel: "all",
          }),
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// ROLA 1 — LOWER STRENGTH + POWER
// ---------------------------------------------------------------------------

function lowerStrengthPower(profile: Profile, ctx: StrengthBlockContext): GymSessionPlan {
  const adult = isAdvancedEligible(profile);
  const d = dosageFor(profile, ctx);
  const avoid = [...ctx.history.usedMainThisWeek, ...ctx.history.usedMainLastWeek];
  const trapBar = ctx.forcedMainFamily === "trap_bar";
  // Sesja 1 = przysiad (knee-dominant). Sesja 2 = trap bar / hinge total-body.
  const mainPool = trapBar
    ? adult
      ? TRAP_BAR_HINGE_ADULT
      : TRAP_BAR_HINGE_YOUTH
    : adult
      ? SQUAT_ADULT
      : SQUAT_YOUTH;
  const squat = rotatePick(mainPool, ctx, avoid);
  const jump = trapBar
    ? pickJumps(ctx, ["horizontal", "vertical"], avoid)
    : pickJumps(ctx, ctx.powerFocus ? ["horizontal", "vertical"] : ["vertical", "horizontal"], avoid);
  // Trap bar to dominanta hinge → akcesoria tylnej taśmy MUSZĄ być kontrolowane
  // (bez ciężkiego RDL / Nordic), żeby nie dublować obciążenia hinge.
  const acc = trapBar ? rotatePick(CONTROLLED_HAM, ctx, avoid) : rotatePick(POSTERIOR_ACC, ctx, avoid);
  const core = rotatePick(CORE_ANTI, ctx, avoid);
  const useContrast = adult && (ctx.weekPhase === "development" || ctx.weekPhase === "peak");

  const sections: TrainingSection[] = [
    warmupSection(),
    overcomingIsoSection(squat),
    section({
      title: "Część główna",
      type: "main",
      blocks: [
        block({
          title: useContrast ? "BLOK A — KONTRAST (moc + siła)" : "BLOK A — SIŁA DOLNA + MOC",
          blockType: useContrast ? "contrast" : "complex",
          intent: "power",
          restAfterBlock: "Przerwa po bloku: 2–3 min",
          eligibilityLevel: adult ? "advanced_only" : "youth_ok",
          safetyNotes: "Para mocy + główny lift. Wykonuj tylko świeży, bez bólu.",
          exercises: [
            ex({
              label: "A1",
              name: jump.kind === "medball" ? "Skok pionowy (CMJ)" : jump.name,
              sets: d.mainSets,
              reps: "3",
              groundContacts: contacts(jump.contacts, d),
              restAfterExercise: "30–45 s do A2",
              cue: jump.cue,
              ageSafetyLevel: adult ? "all" : "youth_ok",
            }),
            ex({
              label: "A2",
              name: squat,
              sets: d.mainSets,
              reps: d.mainReps,
              rpe: d.rpe,
              tempo: adult ? "3-1-1" : "2-1-1",
              restAfterPair: "2–3 min po parze",
              cue: trapBar
                ? "Klatka wysoko, biodra napięte, pchaj podłogę i wyprostuj biodra."
                : "Napnij tułów, kontrolowane zejście, mocne wyjście.",
              technique: trapBar
                ? "Plecy proste, drążek blisko ciała, pełny wyprost bioder."
                : "Kolana w linii stóp, pełen zakres.",
              regression: trapBar
                ? "Trap bar z wysokich pinów / kettlebell deadlift."
                : "Goblet squat / przysiad do skrzyni.",
              commonMistake: "Zaokrąglone plecy, kolana do środka.",
              ageSafetyLevel: adult ? "all" : "youth_ok",
            }),
          ],
        }),
      ],
    }),
    section({
      title: "Akcesoria",
      type: "accessory",
      blocks: [
        block({
          title: "Akcesoria atletyczne",
          blockType: "accessory",
          intent: "strength",
          restAfterBlock: "Przerwa po bloku: 60–90 s",
          exercises: [
            ex({ name: acc, sets: d.accSets, reps: d.accReps, cue: "Kontrola tylnej taśmy, bez bólu.", ageSafetyLevel: "youth_ok" }),
          ],
        }),
        block({
          title: "Tułów i robustność",
          blockType: "accessory",
          intent: "stability",
          restAfterBlock: "45–60 s",
          exercises: [
            ex({ name: core, sets: d.accSets, reps: d.accReps, cue: "Sztywny tułów, kontrola." }),
            ex({ name: rotatePick(ADDUCTOR, ctx, avoid), sets: "2", reps: "8 / strona", cue: "Bez bólu, kontrola." }),
          ],
        }),
      ],
    }),
    cooldownSection(),
  ];


  return {
    role: "lower_strength_power",
    title: trapBar
      ? adult
        ? "Siłownia: trap bar / hinge total-body"
        : "Siłownia: hinge total-body (technika)"
      : adult
        ? "Siłownia: przysiad — siła dolna + moc"
        : "Siłownia: przysiad (technika)",
    sessionType: "Siła / moc",
    goalOfSession: trapBar
      ? "Trap bar / hinge total-body: maksymalna siła i moc wyprostu bioder."
      : "Dzień przysiadu: maksymalna siła dolnych partii z transferem w skok.",
    intensity: adult && ctx.weekPhase !== "deload" ? "wysoka" : "umiarkowana",
    durationMin: adult ? 60 : 50,
    sections,
    mainPatterns: [squat, jump.name],
  };
}

// ---------------------------------------------------------------------------
// ROLA 2 — POSTERIOR CHAIN + SPRINT SUPPORT
// ---------------------------------------------------------------------------

function posteriorSprint(profile: Profile, ctx: StrengthBlockContext): GymSessionPlan {
  const adult = isAdvancedEligible(profile);
  const d = dosageFor(profile, ctx);
  const avoid = [...ctx.history.usedMainThisWeek, ...ctx.history.usedMainLastWeek];
  const hinge = rotatePick(adult ? HINGE_ADULT : HINGE_YOUTH, ctx, avoid);
  const uni = rotatePick(adult ? UNILATERAL_ADULT : UNILATERAL_YOUTH, ctx, avoid);
  const hingeJump = pickJumps(ctx, ["horizontal", "vertical"], avoid);
  const sprintDrill = pickJumps(ctx, ["wall", "ankling"], avoid);
  const stiff = pickJumps(ctx, ["pogo", "snap"], avoid);
  const ham = rotatePick(CONTROLLED_HAM, ctx, avoid);
  const adductor = rotatePick(ADDUCTOR, ctx, avoid);
  const core = rotatePick(CORE_ANTI, ctx, avoid);
  const useContrast = adult && (ctx.weekPhase === "development" || ctx.weekPhase === "peak");

  const sections: TrainingSection[] = [
    warmupSection(),
    section({
      title: "Aktywacja sprintu",
      type: "prep",
      blocks: [
        block({
          title: "Wsparcie sprintu — mechanika",
          blockType: "single",
          intent: "rfd",
          restAfterBlock: "60 s",
          exercises: [
            ex({ label: "P1", name: sprintDrill.name, sets: "3", reps: "10–15 m / 20 s", cue: sprintDrill.cue, ageSafetyLevel: "youth_ok" }),
            ex({ label: "P2", name: "A-skip + dribble bounding", sets: "2", reps: "20 m", cue: "Wysokie kolano, aktywne lądowanie pod biodrem.", ageSafetyLevel: "all" }),
          ],
        }),
      ],
    }),
    overcomingIsoSection(hinge),
    section({
      title: "Część główna",
      type: "main",
      blocks: [
        block({
          title: useContrast ? "BLOK A — KONTRAST (moc + hinge)" : "BLOK A — TYLNA TAŚMA + MOC",
          blockType: useContrast ? "contrast" : "complex",
          intent: "power",
          restAfterBlock: "Przerwa po bloku: 2–3 min",
          safetyNotes: "Para mocy + główny hinge. Wykonuj tylko świeży, bez bólu.",
          exercises: [
            ex({
              label: "A1",
              name: hingeJump.name,
              sets: d.mainSets,
              reps: "3",
              groundContacts: contacts(hingeJump.contacts, d),
              restAfterExercise: "30–45 s do A2",
              cue: hingeJump.cue,
              ageSafetyLevel: adult ? "all" : "youth_ok",
            }),
            ex({
              label: "A2",
              name: hinge,
              sets: d.mainSets,
              reps: d.mainReps,
              rpe: d.rpe,
              tempo: "3-1-1",
              restAfterPair: "2–3 min po parze",
              cue: "Biodra w tył, plecy proste, czuj tylne uda.",
              technique: "Neutralny kręgosłup, napięty tułów.",
              regression: "Hip thrust / hamstring bridge.",
              ageSafetyLevel: adult ? "all" : "youth_ok",
            }),
          ],
        }),

        block({
          title: "BLOK B — JEDNONÓŻ + STIFFNESS",
          blockType: "superset",
          intent: "braking",
          restAfterBlock: "Przerwa po bloku: 90–120 s",
          exercises: [
            ex({
              label: "B1",
              name: uni,
              sets: "3",
              reps: "5–8 / noga",
              rpe: d.rpe,
              restAfterExercise: "30–45 s do B2",
              cue: "Pion tułowia, stabilne kolano, kontrola.",
              regression: "Wykrok w miejscu / step-up.",
              ageSafetyLevel: adult ? "all" : "youth_ok",
            }),
            ex({
              label: "B2",
              name: stiff.name,
              sets: "3",
              reps: `${contacts(stiff.contacts, d)} kontaktów`,
              restAfterPair: "90 s po parze",
              cue: stiff.cue,
              ageSafetyLevel: "youth_ok",
            }),
          ],
        }),
      ],
    }),
    section({
      title: "Akcesoria",
      type: "accessory",
      blocks: [
        block({
          title: "Kontrolowana dawka tylnej taśmy",
          blockType: "accessory",
          intent: "strength",
          restAfterBlock: "Przerwa po bloku: 60–90 s",
          safetyNotes: "Tylko jedno ćwiczenie hamstring — bez przeciążenia tylnej taśmy.",
          exercises: [
            ex({ name: ham, sets: "2–3", reps: "5–6", cue: "Powolny ekscentryk, pełna kontrola, bez bólu.", ageSafetyLevel: "youth_ok" }),
          ],
        }),
        block({
          title: "Tułów, przywodziciele i kostka",
          blockType: "accessory",
          intent: "stability",
          restAfterBlock: "45–60 s",
          exercises: [
            ex({ name: adductor, sets: d.accSets, reps: "8 / strona", cue: "Kontrola, bez bólu." }),
            ex({ name: core, sets: "2", reps: d.accReps, cue: "Sztywny tułów, anty-rotacja." }),
            ex({ name: "Izometria łydki / soleus", sets: "2", reps: "20–30 s", cue: "Wsparcie sprintu i kostki." }),
          ],
        }),
      ],
    }),

    cooldownSection(),
  ];

  return {
    role: "posterior_sprint",
    title: "Siłownia: tylna taśma + wsparcie sprintu",
    sessionType: "Siła / moc",
    goalOfSession: "Ścięgna udowe, pośladki, wyprost biodra i mechanika sprintu — bez kopiowania bloku przysiadu.",
    intensity: adult && ctx.weekPhase !== "deload" ? "wysoka" : "umiarkowana",
    durationMin: 55,
    sections,
    mainPatterns: [hinge, stiff.name],
  };
}

// ---------------------------------------------------------------------------
// ROLA 3 — UNILATERAL + DECELERATION
// ---------------------------------------------------------------------------

function unilateralDecel(profile: Profile, ctx: StrengthBlockContext): GymSessionPlan {
  const adult = isAdvancedEligible(profile);
  const d = dosageFor(profile, ctx);
  const avoid = [...ctx.history.usedMainThisWeek, ...ctx.history.usedMainLastWeek];
  const uni = rotatePick(adult ? UNILATERAL_ADULT : UNILATERAL_YOUTH, ctx, avoid);
  const decel = pickJumps(ctx, ["snap", "lateral", "hurdle"], avoid);
  const core = rotatePick(CORE_ANTI, ctx, avoid);

  const sections: TrainingSection[] = [
    warmupSection(),
    section({
      title: "Przygotowanie",
      type: "prep",
      blocks: [
        block({
          title: "Kontrola jednonóż + lądowanie",
          blockType: "single",
          intent: "braking",
          restAfterBlock: "60 s",
          exercises: [
            ex({ label: "P1", name: "Lądowanie jednonóż (low pogo / stick)", sets: "2", reps: "4 / noga", groundContacts: contacts(8, d), cue: "Ciche, stabilne lądowanie, kolano w linii stopy.", ageSafetyLevel: "youth_ok" }),
          ],
        }),
      ],
    }),
    section({
      title: "Część główna",
      type: "main",
      blocks: [
        block({
          title: "BLOK A — SIŁA JEDNONÓŻ",
          blockType: "single",
          intent: "strength",
          restAfterBlock: "Przerwa po bloku: 2 min",
          exercises: [
            ex({
              label: "A",
              name: uni,
              sets: d.mainSets,
              reps: `${d.mainReps} / noga`,
              rpe: d.rpe,
              tempo: "2-1-1",
              restAfterExercise: "75–90 s",
              cue: "Pion tułowia, stabilne kolano, kontrola.",
              regression: "Wykrok w miejscu / step-up.",
              ageSafetyLevel: adult ? "all" : "youth_ok",
            }),
          ],
        }),
        block({
          title: "BLOK B — HAMOWANIE / ZMIANA KIERUNKU",
          blockType: "deceleration",
          intent: "braking",
          restAfterBlock: "Przerwa po bloku: 2 min",
          exercises: [
            ex({
              label: "B1",
              name: decel.name,
              sets: "3",
              reps: "3 / strona",
              groundContacts: contacts(decel.contacts, d),
              cue: decel.cue,
              technique: "Amortyzuj biodrem i kolanem, nie zawalaj kolana do środka.",
              ageSafetyLevel: "youth_ok",
            }),
            ex({ label: "B2", name: "Decel step (kontrolowane zatrzymanie po biegu)", sets: "3", reps: "4", restAfterPair: "90 s po parze", cue: "Niskie biodra, krótkie kroki w zatrzymaniu.", ageSafetyLevel: "youth_ok" }),
          ],
        }),
      ],
    }),
    section({
      title: "Akcesoria",
      type: "accessory",
      blocks: [
        block({
          title: "Tułów i stabilizacja",
          blockType: "accessory",
          intent: "stability",
          restAfterBlock: "45 s",
          exercises: [
            ex({ name: core, sets: d.accSets, reps: d.accReps, cue: "Anty-rotacja, sztywny tułów." }),
            ex({ name: rotatePick(POSTERIOR_ACC, ctx, avoid), sets: "2", reps: "6–8", cue: "Kontrola tylnej taśmy." }),
          ],
        }),
      ],
    }),
    cooldownSection(),
  ];

  return {
    role: "unilateral_decel",
    title: "Siłownia: jednonóż + hamowanie",
    sessionType: "Siła / moc",
    goalOfSession: "Siła jednonóż, hamowanie i tolerancja zmiany kierunku — inna struktura niż dzień siły dolnej.",
    intensity: ctx.weekPhase === "deload" ? "umiarkowana" : adult ? "wysoka" : "umiarkowana",
    durationMin: 50,
    sections,
    mainPatterns: [uni, decel.name],
  };
}

// ---------------------------------------------------------------------------
// ROLA 4 — UPPER + CORE + ROBUSTNESS (niższy koszt CNS)
// ---------------------------------------------------------------------------

function upperCore(profile: Profile, ctx: StrengthBlockContext): GymSessionPlan {
  const adult = isAdvancedEligible(profile);
  const d = dosageFor(profile, ctx);
  const avoid = [...ctx.history.usedMainThisWeek, ...ctx.history.usedMainLastWeek];
  const push = rotatePick(adult ? PUSH_ADULT : PUSH_YOUTH, ctx, avoid);
  const pull = rotatePick(adult ? PULL_ADULT : PULL_YOUTH, ctx, avoid);
  const carry = rotatePick(CARRY, ctx, avoid);
  const core = rotatePick(CORE_ANTI, ctx, avoid);
  const adductor = rotatePick(ADDUCTOR, ctx, avoid);

  const sections: TrainingSection[] = [
    warmupSection(),
    section({
      title: "Część główna",
      type: "main",
      blocks: [
        block({
          title: "BLOK A — PUSH / PULL",
          blockType: "superset",
          intent: "strength",
          restAfterBlock: "Przerwa po bloku: 90 s",
          exercises: [
            ex({ label: "A1", name: push, sets: d.mainSets, reps: d.mainReps, rpe: d.rpe, restAfterExercise: "30 s do A2", cue: "Pełen zakres, łopatki ustawione.", ageSafetyLevel: adult ? "all" : "youth_ok" }),
            ex({ label: "A2", name: pull, sets: d.mainSets, reps: d.mainReps, rpe: d.rpe, restAfterPair: "90 s po parze", cue: "Ściągnij łopatki, kontrola.", ageSafetyLevel: adult ? "all" : "youth_ok" }),
          ],
        }),
        block({
          title: "BLOK B — CARRY / CORE",
          blockType: "superset",
          intent: "stability",
          restAfterBlock: "Przerwa po bloku: 75 s",
          exercises: [
            ex({ label: "B1", name: carry, sets: "3", reps: "20–30 m", cue: "Tułów sztywny, oddech kontrolowany.", ageSafetyLevel: "all" }),
            ex({ label: "B2", name: core, sets: d.accSets, reps: d.accReps, restAfterPair: "60 s po parze", cue: "Anty-rotacja, nie obracaj się za oporem.", ageSafetyLevel: "all" }),
          ],
        }),
      ],
    }),
    section({
      title: "Akcesoria",
      type: "accessory",
      blocks: [
        block({
          title: "Robustność bioder i barków",
          blockType: "accessory",
          intent: "stability",
          restAfterBlock: "45 s",
          exercises: [
            ex({ name: adductor, sets: "2", reps: "8 / strona", cue: "Kontrola, bez bólu." }),
            ex({ name: "Praca rotatorów barku (guma)", sets: "2", reps: "12", cue: "Wolno, pełen zakres." }),
          ],
        }),
      ],
    }),
    cooldownSection(),
  ];

  return {
    role: "upper_core",
    title: "Siłownia: góra + tułów + robustność",
    sessionType: "Siła / moc",
    goalOfSession: "Góra ciała, tułów i odporność na kontakt — niższy koszt nerwowy, dobra jako druga/lżejsza sesja.",
    intensity: "umiarkowana",
    durationMin: 45,
    sections,
    mainPatterns: [push, pull],
  };
}

// ---------------------------------------------------------------------------
// ROLA — PEŁNE CIAŁO ATLETYCZNE (jedyna sesja gym w tygodniu)
// Power primer + główny lift + akcent kolanowy + akcent tylnej taśmy +
// góra push/pull + core/robustność. Bez podwójnego ciężkiego obciążenia nóg
// (nie łączymy ciężkiego RDL + Nordic ani przysiadu + ciężkiego Bułgara).
// ---------------------------------------------------------------------------

function fullBodyAthletic(profile: Profile, ctx: StrengthBlockContext): GymSessionPlan {
  const adult = isAdvancedEligible(profile);
  const d = dosageFor(profile, ctx);
  const avoid = [...ctx.history.usedMainThisWeek, ...ctx.history.usedMainLastWeek];
  const squat = rotatePick(adult ? SQUAT_ADULT : SQUAT_YOUTH, ctx, avoid);
  const jump = pickJumps(ctx, ["horizontal", "vertical"], avoid);
  // Tylna taśma kontrolowana (lekko) — bez Nordic, by nie dublować ciężkich nóg.
  const ham = rotatePick(CONTROLLED_HAM, ctx, avoid);
  const push = rotatePick(adult ? PUSH_ADULT : PUSH_YOUTH, ctx, avoid);
  const pull = rotatePick(adult ? PULL_ADULT : PULL_YOUTH, ctx, avoid);
  const core = rotatePick(CORE_ANTI, ctx, avoid);
  const adductor = rotatePick(ADDUCTOR, ctx, avoid);

  const sections: TrainingSection[] = [
    warmupSection(),
    overcomingIsoSection(squat),
    section({
      title: "Część główna",
      type: "main",
      blocks: [
        block({
          title: "BLOK A — KONTRAST (moc + główny lift)",
          blockType: "contrast",
          intent: "power",
          restAfterBlock: "Przerwa po bloku: 2–3 min",
          eligibilityLevel: adult ? "advanced_only" : "youth_ok",
          safetyNotes: "Para mocy + główny lift. Wykonuj tylko świeży, bez bólu.",
          exercises: [
            ex({
              label: "A1",
              name: jump.name,
              sets: d.mainSets,
              reps: "3",
              groundContacts: contacts(jump.contacts, d),
              restAfterExercise: "30–45 s do A2",
              cue: jump.cue,
              ageSafetyLevel: adult ? "all" : "youth_ok",
            }),
            ex({
              label: "A2",
              name: squat,
              sets: d.mainSets,
              reps: d.mainReps,
              rpe: d.rpe,
              tempo: "2-1-1",
              restAfterPair: "2–3 min po parze",
              cue: "Napnij tułów, kontrolowane zejście, mocne wyjście.",
              technique: "Kolana w linii stóp, pełen zakres.",
              regression: "Goblet squat / przysiad do skrzyni.",
              ageSafetyLevel: adult ? "all" : "youth_ok",
            }),
          ],
        }),

        block({
          title: "BLOK B — TYLNA TAŚMA + GÓRA (superset)",
          blockType: "superset",
          intent: "strength",
          restAfterBlock: "Przerwa po bloku: 90 s",
          safetyNotes: "Hamstring kontrolowany, lekko — bez dublowania ciężkich nóg.",
          exercises: [
            ex({
              label: "B1",
              name: ham,
              sets: d.accSets,
              reps: d.accReps,
              restAfterExercise: "30 s do B2",
              cue: "Kontrola tylnej taśmy, bez bólu.",
              ageSafetyLevel: "youth_ok",
            }),
            ex({
              label: "B2",
              name: pull,
              sets: d.accSets,
              reps: d.mainReps,
              restAfterPair: "90 s po parze",
              cue: "Ściągnij łopatki, kontrola.",
              ageSafetyLevel: adult ? "all" : "youth_ok",
            }),
          ],
        }),
        block({
          title: "BLOK C — PUSH / CORE (superset)",
          blockType: "superset",
          intent: "stability",
          restAfterBlock: "Przerwa po bloku: 75 s",
          exercises: [
            ex({
              label: "C1",
              name: push,
              sets: d.accSets,
              reps: d.mainReps,
              restAfterExercise: "30 s do C2",
              cue: "Pełen zakres, łopatki ustawione.",
              ageSafetyLevel: adult ? "all" : "youth_ok",
            }),
            ex({
              label: "C2",
              name: core,
              sets: d.accSets,
              reps: d.accReps,
              restAfterPair: "60 s po parze",
              cue: "Sztywny tułów, anty-rotacja.",
              ageSafetyLevel: "all",
            }),
          ],
        }),
      ],
    }),
    section({
      title: "Akcesoria",
      type: "accessory",
      blocks: [
        block({
          title: "Robustność i prewencja",
          blockType: "accessory",
          intent: "stability",
          restAfterBlock: "45 s",
          exercises: [
            ex({ name: adductor, sets: "2", reps: "8 / strona", cue: "Kontrola, bez bólu." }),
            ex({ name: "Wspięcia na palce (łydka)", sets: "2", reps: "12–15", cue: "Pełen zakres, kontrola." }),
          ],
        }),
      ],
    }),
    cooldownSection(),
  ];

  return {
    role: "full_body_athletic",
    title: "Siłownia: pełne ciało atletyczne",
    sessionType: "Siła / moc",
    goalOfSession:
      "Jedna kompletna sesja atletyczna: moc, główny lift, tylna taśma, góra i odporność — wsparcie sprintu, hamowania i prewencji.",
    intensity: adult && ctx.weekPhase !== "deload" ? "wysoka" : "umiarkowana",
    durationMin: adult ? 60 : 50,
    sections,
    mainPatterns: [squat, jump.name],
  };
}

// ---------------------------------------------------------------------------
// ROLA 5 — SPEED-STRENGTH / POWER PRIMER (niska objętość)
// ---------------------------------------------------------------------------

function powerPrimer(profile: Profile, ctx: StrengthBlockContext): GymSessionPlan {
  const d = dosageFor(profile, ctx);
  const avoid = [...ctx.history.usedMainThisWeek, ...ctx.history.usedMainLastWeek];
  const jump = pickJumps(ctx, ["vertical", "horizontal", "medball"], avoid);
  const sections: TrainingSection[] = [
    warmupSection(),
    section({
      title: "Część główna",
      type: "main",
      blocks: [
        block({
          title: "BLOK A — JAKOŚĆ EKSPLOZYWNA",
          blockType: "rfd",
          intent: "power",
          restAfterBlock: "pełna przerwa, świeżość > objętość",
          exercises: [
            ex({ label: "A1", name: "Izometria napędowa (split squat iso / wall drive)", sets: "3", reps: "3 × 5 s", cue: "Maksymalne napięcie, krótko." }),
            ex({ label: "A2", name: jump.name, sets: "3", reps: "3", groundContacts: contacts(Math.min(jump.contacts, 8), d), restAfterPair: "90 s po parze", cue: jump.cue }),
          ],
        }),
        block({
          title: "BLOK B — PRZYSPIESZENIE Z OPOREM",
          blockType: "single",
          intent: "rfd",
          restAfterBlock: "pełna przerwa",
          exercises: [
            ex({ name: "Band acceleration (3–5 kroków z oporem)", sets: "4", reps: "10 m", cue: "Mocny pierwszy krok, niski tułów." }),
          ],
        }),
      ],
    }),
    cooldownSection(),
  ];
  return {
    role: "primer",
    title: "Siłownia: primer mocy (lekko)",
    sessionType: "Aktywacja (primer)",
    goalOfSession: "Świeżość nerwowa i jakość eksplozywna przy niskim zmęczeniu — bez ciężkiej siły.",
    intensity: "niska",
    durationMin: 30,
    sections,
    mainPatterns: [jump.name],
  };
}

// ---------------------------------------------------------------------------
// ROLA 6 — RECOVERY / PREHAB GYM
// ---------------------------------------------------------------------------

function recoveryPrehab(profile: Profile, ctx: StrengthBlockContext): GymSessionPlan {
  const avoid = [...ctx.history.usedMainThisWeek];
  const sections: TrainingSection[] = [
    section({
      title: "Lekki rozruch",
      type: "warmup",
      blocks: [
        block({
          title: "Aerobik regeneracyjny",
          blockType: "single",
          intent: "mobility",
          exercises: [ex({ name: "Rower / spacer", duration: "10–15 min", rpe: "RPE 2–3", cue: "Bardzo lekko, tylko krążenie." })],
        }),
      ],
    }),
    section({
      title: "Prehab i aktywacja",
      type: "main",
      blocks: [
        block({
          title: "Tkanki i stabilizacja",
          blockType: "accessory",
          intent: "stability",
          restAfterBlock: "45 s",
          exercises: [
            ex({ name: rotatePick(ADDUCTOR, ctx, avoid), sets: "2", reps: "8 / strona", cue: "Kontrola, bez bólu." }),
            ex({ name: rotatePick(CONTROLLED_HAM, ctx, avoid), sets: "2", reps: "8", cue: "Lekko, pełna kontrola." }),
            ex({ name: rotatePick(CORE_ANTI, ctx, avoid), sets: "2", reps: "10", cue: "Spokojnie, sztywny tułów." }),
            ex({ name: "Aktywacja pośladków i łydek", sets: "2", reps: "12", cue: "Czuj mięsień, bez pośpiechu." }),
          ],
        }),
      ],
    }),
    section({
      title: "Mobilność i oddech",
      type: "cooldown",
      blocks: [
        block({
          title: "Wyciszenie",
          blockType: "single",
          intent: "mobility",
          exercises: [
            ex({ name: "Mobilność całego ciała", duration: "8 min" }),
            ex({ name: "Oddech przeponowy", duration: "3 min", cue: "Długi wydech, rozluźnij barki." }),
          ],
        }),
      ],
    }),
  ];
  return {
    role: "recovery_prehab",
    title: "Siłownia: regeneracja i prehab",
    sessionType: "Regeneracja / prehab",
    goalOfSession: "Mobilność, aktywacja i redukcja sztywności przy niskiej gotowości — bez ciężkich bloków.",
    intensity: "niska",
    durationMin: 30,
    sections,
    mainPatterns: [],
  };
}

// ---------------------------------------------------------------------------
// KANONICZNA SESJA SIŁOWNI — jedna, stała struktura dla każdej sesji siły:
//   Rozgrzewka → Izometria przezwyciężająca →
//   BLOK A: główny ciężki lift → ruch mocy
//   BLOK B: uzupełniająca siła/hipertrofia dolna → ruch mocy
//   BLOK C: wyłącznie core / stabilizacja
//   BLOK D: wsparcie atletyczne (łydki, przywodziciele, hamstring, góra/łopatka)
//   BLOK E: opcjonalny finisher hipertroficzny (biceps/triceps/lateral raise)
// Brak osobnego bloku „primer mocy”. Biceps/triceps tylko w bloku E na końcu.
// ---------------------------------------------------------------------------

function canonicalGymSession(
  profile: Profile,
  ctx: StrengthBlockContext,
  role: GymRole,
): GymSessionPlan {
  const adult = isAdvancedEligible(profile);
  const d = dosageFor(profile, ctx);
  const avoid = [...ctx.history.usedMainThisWeek, ...ctx.history.usedMainLastWeek];

  const trapBar = ctx.forcedMainFamily === "trap_bar";
  // Główny lift: przysiad (knee) lub trap bar / hinge total-body.
  const mainPool = trapBar
    ? adult
      ? TRAP_BAR_HINGE_ADULT
      : TRAP_BAR_HINGE_YOUTH
    : adult
      ? SQUAT_ADULT
      : SQUAT_YOUTH;
  const main = rotatePick(mainPool, ctx, avoid);

  // Uzupełnienie dolne: jeśli główny = przysiad → hinge; jeśli trap bar → jednonóż.
  const compIsHinge = !trapBar;
  const comp = compIsHinge
    ? rotatePick(adult ? HINGE_ADULT : HINGE_YOUTH, ctx, [...avoid, main])
    : rotatePick(adult ? UNILATERAL_ADULT : UNILATERAL_YOUTH, ctx, [...avoid, main]);

  // Ruchy mocy zależne od rodziny głównego liftu:
  //  - dzień przysiadu (knee)  → A2 pionowo (box jump / CMJ), B2 poziomo / biodrowo
  //  - dzień trap bar (hinge)  → A2 poziomo (broad jump / bounds), B2 lateral / stiffness
  const powerA = trapBar
    ? pickJumps(ctx, ["horizontal"], avoid)
    : pickJumps(ctx, ["vertical"], avoid);
  const powerB = trapBar
    ? pickJumps(ctx, ["lateral", "snap", "pogo"], [...avoid, powerA.name])
    : pickJumps(ctx, ["horizontal", "pogo"], [...avoid, powerA.name]);

  const calf = "Wspięcia na palce (łydka)";
  const adductor = rotatePick(ADDUCTOR, ctx, avoid);
  const ham = rotatePick(CONTROLLED_HAM, ctx, avoid);
  const upper = rotatePick(UPPER_SUPPORT, ctx, avoid);
  const core1 = rotatePick(CORE_ANTI, ctx, avoid);
  const core2 = rotatePick(CORE_ANTI, ctx, [...avoid, core1]);
  const finisher = rotatePick(HYPERTROPHY_FINISHER, ctx, avoid);

  // BLOK E (opcjonalny finisher) tylko dla dorosłych poza deloadem.
  const includeFinisher = adult && ctx.weekPhase !== "deload";

  const accessoryBlocks: TrainingBlock[] = [
    // BLOK C — wyłącznie core / stabilizacja.
    block({
      title: "BLOK C — CORE / STABILIZACJA",
      blockType: "accessory",
      intent: "stability",
      restAfterBlock: "Przerwa po bloku: 45–60 s",
      safetyNotes: "Tylko praca tułowia / anty-rotacja — bez ćwiczeń na nogi czy ramiona.",
      exercises: [
        ex({ label: "C1", name: core1, sets: d.accSets, reps: d.accReps, cue: "Sztywny tułów, kontrola." }),
        ex({ label: "C2", name: core2, sets: "2", reps: d.accReps, cue: "Anty-rotacja, nie obracaj się za oporem." }),
      ],
    }),
    // BLOK D — wsparcie atletyczne (łydki, przywodziciele, hamstring, góra/łopatka).
    block({
      title: "BLOK D — WSPARCIE ATLETYCZNE",
      blockType: "accessory",
      intent: "stability",
      restAfterBlock: "Przerwa po bloku: 45–60 s",
      safetyNotes: "Robustność i prewencja: łydki, przywodziciele, tylna taśma (kontrola), góra / łopatka.",
      exercises: [
        ex({ label: "D1", name: calf, sets: "2–3", reps: "12–15", cue: "Pełen zakres, kontrola.", ageSafetyLevel: "all" }),
        ex({ label: "D2", name: adductor, sets: "2", reps: "8 / strona", cue: "Kontrola przywodzicieli, bez bólu." }),
        ex({ label: "D3", name: ham, sets: "2", reps: "6–8", cue: "Powolny ekscentryk, kontrola tylnej taśmy.", ageSafetyLevel: "youth_ok" }),
        ex({ label: "D4", name: upper, sets: "2–3", reps: "10–12", cue: "Łopatki ustawione, pełen zakres." }),
      ],
    }),
  ];

  if (includeFinisher) {
    // BLOK E — opcjonalny finisher hipertroficzny. Biceps/triceps WYŁĄCZNIE tutaj.
    accessoryBlocks.push(
      block({
        title: "BLOK E — FINISHER (opcjonalny)",
        blockType: "accessory",
        intent: "strength",
        restAfterBlock: "45–60 s",
        safetyNotes: "Lekka izolacja na koniec (biceps / triceps / barki). Można pominąć przy zmęczeniu.",
        exercises: [
          ex({ label: "E1", name: finisher, sets: "2–3", reps: "12–15", rpe: "RPE 6–7", cue: "Czuj mięsień, kontrola, bez zarzucania." }),
        ],
      }),
    );
  }

  const sections: TrainingSection[] = [
    warmupSection(),
    overcomingIsoSection(main),
    section({
      title: "Część główna",
      type: "main",
      blocks: [
        // BLOK A — główny ciężki lift (A1) → ruch mocy (A2).
        block({
          title: "BLOK A — GŁÓWNY LIFT + MOC",
          blockType: "contrast",
          intent: "power",
          restAfterBlock: "Przerwa po bloku: 2–4 min",
          eligibilityLevel: adult ? "advanced_only" : "youth_ok",
          safetyNotes: "Najpierw główny lift, potem ruch mocy. Wykonuj tylko świeży, bez bólu.",
          exercises: [
            ex({
              label: "A1",
              name: main,
              sets: d.mainSets,
              reps: d.mainReps,
              rpe: d.rpe,
              tempo: adult ? "3-1-1" : "2-1-1",
              restAfterExercise: "60–180 s do A2",
              cue: trapBar
                ? "Klatka wysoko, biodra napięte, pchaj podłogę i wyprostuj biodra."
                : "Napnij tułów, kontrolowane zejście, mocne wyjście.",
              technique: trapBar ? "Plecy proste, drążek blisko ciała, pełny wyprost bioder." : "Kolana w linii stóp, pełen zakres.",
              regression: trapBar ? "Trap bar z wysokich pinów / kettlebell deadlift." : "Goblet squat / przysiad do skrzyni.",
              commonMistake: "Zaokrąglone plecy, kolana do środka.",
              ageSafetyLevel: adult ? "all" : "youth_ok",
            }),
            ex({
              label: "A2",
              name: powerA.kind === "medball" ? "Skok pionowy (CMJ)" : powerA.name,
              sets: d.mainSets,
              reps: "3",
              groundContacts: contacts(powerA.contacts, d),
              restAfterPair: "2–3 min po parze",
              cue: powerA.cue,
              ageSafetyLevel: adult ? "all" : "youth_ok",
            }),
          ],
        }),
        // BLOK B — uzupełniająca siła/hipertrofia dolna (B1) → ruch mocy (B2).
        block({
          title: "BLOK B — UZUPEŁNIENIE DOLNE + MOC",
          blockType: "contrast",
          intent: "power",
          restAfterBlock: "Przerwa po bloku: 90–120 s",
          safetyNotes: "Uzupełniająca praca dolna (umiarkowana, hipertrofia) + ruch mocy. Bez drugiego maksymalnego liftu.",
          exercises: [
            ex({
              label: "B1",
              name: comp,
              sets: "3",
              reps: compIsHinge ? "8–10" : "6–8 / noga",
              rpe: "RPE 6–7",
              restAfterExercise: "30–45 s do B2",
              cue: compIsHinge ? "Biodra w tył, plecy proste, czuj tylne uda." : "Pion tułowia, stabilne kolano, kontrola.",
              technique: compIsHinge ? "Neutralny kręgosłup, napięty tułów." : "Kolano w linii stopy, kontrola.",
              regression: compIsHinge ? "Hip thrust / hamstring bridge." : "Wykrok w miejscu / step-up.",
              ageSafetyLevel: adult ? "all" : "youth_ok",
            }),
            ex({
              label: "B2",
              name: powerB.name,
              sets: "3",
              reps: `${contacts(powerB.contacts, d)} kontaktów`,
              restAfterPair: "90 s po parze",
              cue: powerB.cue,
              ageSafetyLevel: "youth_ok",
            }),
          ],
        }),
      ],
    }),
    section({
      title: "Akcesoria",
      type: "accessory",
      blocks: accessoryBlocks,
    }),
    cooldownSection(),
  ];

  return {
    role,
    title: trapBar
      ? adult
        ? "Siłownia: trap bar / hinge total-body"
        : "Siłownia: hinge total-body (technika)"
      : adult
        ? "Siłownia: siła dolna + moc"
        : "Siłownia: siła dolna (technika)",
    sessionType: "Siła / moc",
    goalOfSession: trapBar
      ? "Trap bar / hinge total-body: maksymalna siła i moc wyprostu bioder + wsparcie atletyczne."
      : "Dzień przysiadu: maksymalna siła dolnych partii z transferem w skok + wsparcie atletyczne.",
    intensity: adult && ctx.weekPhase !== "deload" ? "wysoka" : "umiarkowana",
    durationMin: adult ? 60 : 50,
    sections,
    mainPatterns: [main, comp, powerA.name, powerB.name],
  };
}

// ---------------------------------------------------------------------------
// Wybór roli
// ---------------------------------------------------------------------------

function roleOrderFor(goal: Profile["goal"]): GymRole[] {
  switch (goal) {
    case "power":
      return ["lower_strength_power", "unilateral_decel", "posterior_sprint", "upper_core"];
    case "speed":
      return ["posterior_sprint", "lower_strength_power", "unilateral_decel", "upper_core"];
    case "agility":
      return ["unilateral_decel", "posterior_sprint", "lower_strength_power", "upper_core"];
    case "endurance":
      return ["posterior_sprint", "upper_core", "lower_strength_power", "unilateral_decel"];
    case "strength":
    default:
      return ["lower_strength_power", "posterior_sprint", "unilateral_decel", "upper_core"];
  }
}

export function pickGymRole(profile: Profile, ctx: StrengthBlockContext): GymRole {
  const r = ctx.readiness;
  if (r !== undefined) {
    if (r <= 4) return "recovery_prehab";
    if (r === 5) return "primer";
  }
  // MD-2 (gdyby tu trafiło) → primer; w praktyce MD-1/MD-2 są blokowane wyżej.
  if (ctx.mdLabel === "MD-2") return "primer";

  const order = roleOrderFor(profile.goal);
  // Rotacja: różne role w obrębie tygodnia i między tygodniami.
  let idx = (ctx.weekIndex + ctx.gymSessionIndexInWeek) % order.length;
  for (let step = 0; step < order.length; step++) {
    const role = order[(idx + step) % order.length];
    if (!ctx.history.usedRolesThisWeek.includes(role)) return role;
  }
  return order[idx];
}

// ---------------------------------------------------------------------------
// Punkt wejścia
// ---------------------------------------------------------------------------

export function buildStrengthPowerStructured(
  profile: Profile,
  ctx: StrengthBlockContext,
): GymSessionPlan | null {
  __uid = ctx.weekIndex * 1000 + ctx.gymSessionIndexInWeek * 100;
  // Niska gotowość / ból / powrót po kontuzji → tylko regeneracja/prehab.
  if (profile.painInjury || profile.seasonPhase === "return_injury") {
    return recoveryPrehab(profile, ctx);
  }
  if (ctx.readiness !== undefined && ctx.readiness <= 3) {
    return recoveryPrehab(profile, ctx);
  }
  if (!structuredStrengthAllowed(ctx.mdLabel)) {
    // MD-1/MD-2/MD/MD+1: tylko primer/regeneracja, bez ciężkiej siły.
    return ctx.mdLabel === "MD+1" || ctx.mdLabel === "MD"
      ? recoveryPrehab(profile, ctx)
      : powerPrimer(profile, ctx);
  }

  // Jedyna sesja gym w tygodniu → kompletna sesja pełnego ciała atletycznego.
  const onlyGymSession =
    ctx.gymSessionsThisWeekTotal === 1 &&
    ctx.gymSessionIndexInWeek === 0 &&
    !(ctx.readiness !== undefined && ctx.readiness <= 5) &&
    ctx.mdLabel !== "MD-2";

  // Dwie sesje gym w tygodniu → wymuszony, niepowtarzalny podział:
  //   sesja 1 = dzień przysiadu (knee-dominant max strength)
  //   sesja 2 = dzień trap bar / hinge total-body (strength-power)
  const readyForHeavy = ctx.readiness === undefined || ctx.readiness >= 6;
  const twoGymSplit =
    ctx.gymSessionsThisWeekTotal === 2 &&
    readyForHeavy &&
    ctx.mdLabel !== "MD-2" &&
    (ctx.gymSessionIndexInWeek === 0 || ctx.gymSessionIndexInWeek === 1);

  if (twoGymSplit) {
    ctx = {
      ...ctx,
      forcedMainFamily: ctx.gymSessionIndexInWeek === 0 ? "squat" : "trap_bar",
    };
  }

  const role = onlyGymSession
    ? "full_body_athletic"
    : twoGymSplit
      ? "lower_strength_power"
      : pickGymRole(profile, ctx);
  let plan: GymSessionPlan;
  switch (role) {
    // Wszystkie sesje siły idą przez jedną kanoniczną strukturę
    // (Rozgrzewka → Iso → A → B → C → D → opcjonalne E).
    case "full_body_athletic":
    case "lower_strength_power":
    case "posterior_sprint":
    case "unilateral_decel":
    case "upper_core":
      plan = canonicalGymSession(profile, ctx, role);
      break;
    case "primer":
      plan = powerPrimer(profile, ctx);
      break;
    case "recovery_prehab":
    default:
      plan = recoveryPrehab(profile, ctx);
      break;
  }

  // Walidacja programowania siłowni + naprawa przed renderem.
  // Jeśli zasady bezpieczeństwa dnia meczowego są złamane, schodzimy do primera.
  let issues = validateGymSession(plan, ctx);
  if (issues.some((i) => i.code === "matchday_unsafe" || i.code === "matchday_heavy_hamstring")) {
    return powerPrimer(profile, ctx);
  }
  for (let pass = 0; pass < 4 && issues.length > 0; pass++) {
    repairGymSession(plan, ctx, issues);
    issues = validateGymSession(plan, ctx);
  }
  // Aktualizujemy mainPatterns po ewentualnych podmianach.
  plan.mainPatterns = collectMainPatterns(plan);
  return plan;
}

// ===========================================================================
// WALIDATOR PROGRAMOWANIA SIŁOWNI (reużywalne reguły dla każdej sesji)
// ===========================================================================

export type MovementPattern =
  | "squat"
  | "hinge"
  | "unilateral"
  | "hamstring"
  | "calf"
  | "adductor"
  | "core"
  | "power"
  | "other";

export type GymValidationCode =
  | "heavy_duplicate_pattern"
  | "unilateral_not_light"
  | "missing_power"
  | "missing_hamstring"
  | "missing_support"
  | "repeated_power"
  | "matchday_unsafe"
  | "rdl_and_nordic"
  | "too_many_hamstring_stressors"
  | "heavy_unilateral_after_compound"
  | "missing_quad_glute"
  | "matchday_heavy_hamstring"
  | "prescription_inconsistent";

export interface GymValidationIssue {
  code: GymValidationCode;
  message: string;
  exerciseId?: string;
}

const LOWER_BODY_ROLES: GymRole[] = ["lower_strength_power", "posterior_sprint", "unilateral_decel"];

function hasAny(name: string, keywords: string[]): boolean {
  const n = name.toLowerCase();
  return keywords.some((k) => n.includes(k));
}

/** Klasyfikacja ćwiczenia po nazwie do dominującego wzorca ruchowego. */
export function classifyExercise(ex: TrainingExercise): MovementPattern {
  const n = ex.name.toLowerCase();
  if (
    (ex.groundContacts !== undefined && ex.groundContacts > 0) ||
    hasAny(n, [
      "skok",
      "jump",
      "pogo",
      "bound",
      "slam",
      "throw",
      "rzut",
      "ankling",
      "a-skip",
      "wall drive",
      "wall-drive",
      "band acceleration",
      "drop ",
      "snap-down",
      "snap down",
      "przeskok",
      "hop",
      "cmj",
    ])
  ) {
    return "power";
  }
  // CORE RULE 3: trap bar / hex bar deadlift = hybrydowa siła kolanowo-dominująca
  // (quady + pośladki + total force). NIE liczy się jako ekspozycja hamstring.
  if (hasAny(n, ["trap bar", "trap-bar", "hex bar", "hex-bar", "trapbar"])) return "squat";
  if (hasAny(n, ["nordic", "leg curl", "slider", "hamstring", "glute bridge", "bridge march", "good morning", "ścięgn"]))
    return "hamstring";
  if (hasAny(n, ["rdl", "martwy ciąg", "hip thrust", "hip hinge", "hinge", "deadlift"])) return "hinge";
  if (
    hasAny(n, [
      "bułgar",
      "wykrok",
      "lunge",
      "split squat",
      "step-up",
      "step up",
      "step-down",
      "step down",
      "jednonóż",
      "jednej nodze",
      "reverse lunge",
      "lateral lunge",
    ])
  )
    return "unilateral";
  if (hasAny(n, ["przysiad", "squat", "goblet", "leg press"])) return "squat";
  if (hasAny(n, ["łydk", "soleus", "calf", "kostk"])) return "calf";
  if (hasAny(n, ["copenhagen", "przywodzic", "adduct", "suwak"])) return "adductor";
  if (hasAny(n, ["pallof", "plank", "dead bug", "bird dog", "core", "tułów", "anty-rotacj", "carry", "farmer"]))
    return "core";
  return "other";
}

function rpeMax(s?: string): number | null {
  if (!s) return null;
  const nums = s.match(/\d+/g);
  if (!nums) return null;
  return Math.max(...nums.map((x) => parseInt(x, 10)));
}

function setsMax(s?: string): number | null {
  if (!s) return null;
  const nums = s.match(/\d+/g);
  if (!nums) return null;
  return Math.max(...nums.map((x) => parseInt(x, 10)));
}

interface ExerciseRef {
  ex: TrainingExercise;
  block: TrainingBlock;
  section: TrainingSection;
  pattern: MovementPattern;
}

function flattenExercises(plan: GymSessionPlan): ExerciseRef[] {
  const out: ExerciseRef[] = [];
  for (const sec of plan.sections) {
    for (const blk of sec.blocks) {
      for (const e of blk.exercises) {
        out.push({ ex: e, block: blk, section: sec, pattern: classifyExercise(e) });
      }
    }
  }
  return out;
}

const COMPOUND_PATTERNS: MovementPattern[] = ["squat", "hinge", "unilateral", "hamstring"];

/** Ciężka ekspozycja siłowa = compound w części głównej z RPE ≥ 7 (nie plyo). */
function isHeavyStrength(ref: ExerciseRef): boolean {
  if (ref.pattern === "power") return false;
  if (!COMPOUND_PATTERNS.includes(ref.pattern)) return false;
  if (ref.section.type !== "main" && ref.section.type !== "prep") return false;
  const rpe = rpeMax(ref.ex.rpe);
  return rpe !== null && rpe >= 7;
}

/** Grupa tkanki/wzorca: przysiad+jednonóż = kolano/quad; hinge+hamstring = tylna taśma. */
function patternGroup(p: MovementPattern): "knee" | "hip" | null {
  if (p === "squat" || p === "unilateral") return "knee";
  if (p === "hinge" || p === "hamstring") return "hip";
  return null;
}

function isPowerExercise(ref: ExerciseRef): boolean {
  return ref.pattern === "power";
}

// --- Indywidualne reguły (zgodne z wymaganą strukturą walidatora) ---

function checkMainHeavyPatternLimit(refs: ExerciseRef[]): GymValidationIssue[] {
  // Maks. jedna ciężka ekspozycja na grupę (knee/hip).
  const issues: GymValidationIssue[] = [];
  const seenGroup: Record<string, boolean> = {};
  for (const ref of refs) {
    if (!isHeavyStrength(ref)) continue;
    const g = patternGroup(ref.pattern);
    if (!g) continue;
    if (seenGroup[g]) {
      issues.push({
        code: "heavy_duplicate_pattern",
        message: `Druga ciężka ekspozycja w grupie ${g} (${ref.ex.name}) — dozwolona tylko jedna.`,
        exerciseId: ref.ex.id,
      });
    } else {
      seenGroup[g] = true;
    }
  }
  return issues;
}

function checkNoHeavyDuplicatePattern(refs: ExerciseRef[]): GymValidationIssue[] {
  // Po ciężkim bilateralnym lifcie, jednonóż dozwolony tylko jako lekka praca (RPE ≤ 6).
  const issues: GymValidationIssue[] = [];
  const hasHeavyBilateral = refs.some(
    (r) => isHeavyStrength(r) && (r.pattern === "squat" || r.pattern === "hinge"),
  );
  if (!hasHeavyBilateral) return issues;
  for (const ref of refs) {
    if (ref.pattern !== "unilateral") continue;
    const rpe = rpeMax(ref.ex.rpe);
    if (rpe !== null && rpe >= 7) {
      issues.push({
        code: "unilateral_not_light",
        message: `Jednonóż po ciężkim lifcie musi być lekki (RPE 5–6): ${ref.ex.name}.`,
        exerciseId: ref.ex.id,
      });
    }
  }
  return issues;
}

function checkComplementaryQualities(plan: GymSessionPlan, refs: ExerciseRef[]): GymValidationIssue[] {
  if (!LOWER_BODY_ROLES.includes(plan.role)) return [];
  const hasPower = refs.some(isPowerExercise);
  return hasPower
    ? []
    : [{ code: "missing_power", message: "Sesja dolna bez ćwiczenia mocy/RFD." }];
}

function checkHamstringExposure(plan: GymSessionPlan, refs: ExerciseRef[]): GymValidationIssue[] {
  if (!LOWER_BODY_ROLES.includes(plan.role)) return [];
  const hasHam = refs.some((r) => r.pattern === "hamstring" || r.pattern === "hinge");
  return hasHam
    ? []
    : [{ code: "missing_hamstring", message: "Sesja dolna bez ekspozycji tylnej taśmy / hamstring." }];
}

function checkCalfAdductorCoreSupport(plan: GymSessionPlan, refs: ExerciseRef[]): GymValidationIssue[] {
  if (!LOWER_BODY_ROLES.includes(plan.role)) return [];
  const hasSupport = refs.some(
    (r) => r.pattern === "calf" || r.pattern === "adductor" || r.pattern === "core",
  );
  return hasSupport
    ? []
    : [{ code: "missing_support", message: "Sesja dolna bez wsparcia tułów/przywodziciele/łydka." }];
}

function checkNoRepeatedPowerExercise(refs: ExerciseRef[]): GymValidationIssue[] {
  const issues: GymValidationIssue[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (!isPowerExercise(ref)) continue;
    const key = ref.ex.name.toLowerCase();
    if (seen.has(key)) {
      issues.push({
        code: "repeated_power",
        message: `Powtórzone ćwiczenie mocy: ${ref.ex.name}.`,
        exerciseId: ref.ex.id,
      });
    } else {
      seen.add(key);
    }
  }
  return issues;
}

function checkMatchDaySafety(plan: GymSessionPlan, ctx: StrengthBlockContext, refs: ExerciseRef[]): GymValidationIssue[] {
  const md = ctx.mdLabel;
  const restricted = md === "MD-2" || md === "MD-1" || md === "MD" || md === "MD+1";
  if (!restricted) return [];
  const heavyLower = refs.some(isHeavyStrength);
  return heavyLower
    ? [{ code: "matchday_unsafe", message: `Ciężka praca dolna niedozwolona w ${md}.` }]
    : [];
}

// ---------------------------------------------------------------------------
// REGUŁY HAMSTRING + CIĘŻKICH LIFTÓW (twarde, reużywalne)
// ---------------------------------------------------------------------------

/** Czy ćwiczenie to RDL / ciężki hinge tylnej taśmy. */
function isRDLName(name: string): boolean {
  return hasAny(name.toLowerCase(), ["rdl", "rumuński", "rumunski", "romanian"]);
}
/** Czy ćwiczenie to Nordic curl. */
function isNordicName(name: string): boolean {
  return hasAny(name.toLowerCase(), ["nordic"]);
}
/** Czy ćwiczenie to klasyczny ciężki martwy ciąg (nie trap bar — ten jest squat). */
function isConventionalDeadliftName(name: string): boolean {
  const n = name.toLowerCase();
  if (hasAny(n, ["trap bar", "trap-bar", "hex bar", "hex-bar", "trapbar"])) return false;
  return hasAny(n, ["martwy ciąg klasyczny", "deadlift", "martwy ciąg"]);
}
/** Maksymalna prędkość / sprint jako stresor tylnej taśmy. */
function isMaxVelocityName(name: string): boolean {
  return hasAny(name.toLowerCase(), ["max velocity", "maksymalna prędkość", "flying", "sprint maks"]);
}

export type HamstringStressorKind = "rdl" | "nordic" | "heavy_hinge" | "deadlift" | "sprint";

/**
 * Zwraca rodzaj WYSOKIEGO stresora tylnej taśmy dla ćwiczenia lub null.
 * Kontrolowane prace (slider curl, glute bridge march, hamstring bridge, lekki
 * leg curl) NIE są wysokimi stresorami i zwracają null.
 */
function highHamstringStressor(ref: ExerciseRef): HamstringStressorKind | null {
  const name = ref.ex.name;
  if (isNordicName(name)) return "nordic";
  if (isRDLName(name)) return "rdl";
  if (isConventionalDeadliftName(name)) return "deadlift";
  if (isMaxVelocityName(name)) return "sprint";
  // Ciężki hinge (RPE ≥ 7) w części głównej/przygotowaniu = stresor.
  if (ref.pattern === "hinge" && (ref.section.type === "main" || ref.section.type === "prep")) {
    const rpe = rpeMax(ref.ex.rpe);
    if (rpe !== null && rpe >= 7) return "heavy_hinge";
  }
  return null;
}

/** Ciężki jednonóż = bułgar/wykrok/step-up w głównej części z RPE ≥ 7. */
function isHeavyUnilateral(ref: ExerciseRef): boolean {
  if (ref.pattern !== "unilateral") return false;
  if (ref.section.type !== "main" && ref.section.type !== "prep") return false;
  const rpe = rpeMax(ref.ex.rpe);
  return rpe !== null && rpe >= 7;
}

/** Ciężki bilateralny compound (przysiad, trap bar, martwy ciąg, RDL) z RPE ≥ 7. */
function isHeavyBilateralCompound(ref: ExerciseRef): boolean {
  if (ref.pattern !== "squat" && ref.pattern !== "hinge") return false;
  if (ref.section.type !== "main" && ref.section.type !== "prep") return false;
  const rpe = rpeMax(ref.ex.rpe);
  return rpe !== null && rpe >= 7;
}

/** Spójność prescription: skok ma kontakty, lift główny ma serie i powtórzenia. */
function hasInconsistentPrescription(ref: ExerciseRef): boolean {
  const e = ref.ex;
  if (ref.pattern === "power") {
    const hasContacts = e.groundContacts !== undefined && e.groundContacts > 0;
    const hasReps = !!(e.reps && e.reps.trim());
    return !hasContacts && !hasReps;
  }
  if (
    (ref.section.type === "main" || ref.section.type === "prep") &&
    COMPOUND_PATTERNS.includes(ref.pattern)
  ) {
    return !(e.sets && e.sets.trim()) || !(e.reps && e.reps.trim());
  }
  return false;
}

/**
 * Twarde reguły hamstring + ciężkich liftów. Reużywalna walidacja każdej sesji.
 * Zwraca listę naruszeń (pusta = OK).
 */
export function validateHamstringAndHeavyLiftRules(
  plan: GymSessionPlan,
  ctx: StrengthBlockContext,
): GymValidationIssue[] {
  const refs = flattenExercises(plan);
  const issues: GymValidationIssue[] = [];

  const hasRDL = refs.some((r) => isRDLName(r.ex.name));
  const hasNordic = refs.some((r) => isNordicName(r.ex.name));

  // 1) RDL + Nordic nigdy w tej samej sesji.
  if (hasRDL && hasNordic) {
    const nordicRef = refs.find((r) => isNordicName(r.ex.name));
    issues.push({
      code: "rdl_and_nordic",
      message: "RDL i Nordic curl nie mogą wystąpić w tej samej sesji.",
      exerciseId: nordicRef?.ex.id,
    });
  }

  // 2) Tylko JEDEN wysoki stresor tylnej taśmy na sesję.
  const stressors = refs
    .map((r) => ({ ref: r, kind: highHamstringStressor(r) }))
    .filter((x) => x.kind !== null);
  if (stressors.length > 1) {
    // Pierwszy (główny) zostaje; pozostałe oznacz jako nadmiarowe.
    for (let i = 1; i < stressors.length; i++) {
      const s = stressors[i];
      // Unikaj podwójnego zgłoszenia tej samej pary RDL+Nordic.
      if (s.kind === "nordic" && hasRDL && hasNordic) continue;
      issues.push({
        code: "too_many_hamstring_stressors",
        message: `Drugi wysoki stresor tylnej taśmy (${s.ref.ex.name}) — dozwolony tylko jeden.`,
        exerciseId: s.ref.ex.id,
      });
    }
  }

  // 4) Ciężki bułgar/wykrok/step-up po ciężkim bilateralnym compound (squat/trap/deadlift/RDL).
  const hasHeavyBilateral = refs.some(isHeavyBilateralCompound);
  if (hasHeavyBilateral) {
    for (const r of refs) {
      if (isHeavyUnilateral(r)) {
        issues.push({
          code: "heavy_unilateral_after_compound",
          message: `Ciężki jednonóż (${r.ex.name}) po ciężkim lifcie bilateralnym — zredukuj do lekkiej pracy technicznej.`,
          exerciseId: r.ex.id,
        });
      }
    }
  }

  if (LOWER_BODY_ROLES.includes(plan.role)) {
    // 5) Sesja dolna musi mieć ekspozycję quad/glute (squat lub jednonóż).
    const hasQuadGlute = refs.some((r) => r.pattern === "squat" || r.pattern === "unilateral");
    if (!hasQuadGlute) {
      issues.push({
        code: "missing_quad_glute",
        message: "Sesja dolna bez ekspozycji quad/glute (przysiad lub jednonóż).",
      });
    }
  }

  // 7) MD-2/MD-1/MD+1 nie może zawierać ciężkich hamstringów.
  const md = ctx.mdLabel;
  if (md === "MD-2" || md === "MD-1" || md === "MD+1") {
    const heavyHam = stressors.some(
      (s) => s.kind === "rdl" || s.kind === "heavy_hinge" || s.kind === "deadlift" || s.kind === "nordic",
    );
    if (heavyHam) {
      issues.push({
        code: "matchday_heavy_hamstring",
        message: `Ciężkie hamstringi niedozwolone w ${md}.`,
      });
    }
  }

  // 8) Spójność prescription (reps / kontakty).
  for (const r of refs) {
    if (hasInconsistentPrescription(r)) {
      issues.push({
        code: "prescription_inconsistent",
        message: `Niespójna prescription dla ${r.ex.name} (brak serii/powtórzeń lub kontaktów).`,
        exerciseId: r.ex.id,
      });
    }
  }

  return issues;
}

/** Pełna walidacja sesji siłowni. Zwraca listę naruszeń (pusta = OK). */
export function validateGymSession(plan: GymSessionPlan, ctx: StrengthBlockContext): GymValidationIssue[] {
  const refs = flattenExercises(plan);
  return [
    ...checkMainHeavyPatternLimit(refs),
    ...checkNoHeavyDuplicatePattern(refs),
    ...checkComplementaryQualities(plan, refs),
    ...checkHamstringExposure(plan, refs),
    ...checkCalfAdductorCoreSupport(plan, refs),
    ...checkNoRepeatedPowerExercise(refs),
    ...checkMatchDaySafety(plan, ctx, refs),
    ...validateHamstringAndHeavyLiftRules(plan, ctx),
  ];
}


// --- Naprawa sesji (regeneracja problematycznych elementów) ---

function altJumpByName(usedNames: string[]): JumpVariant {
  const used = usedNames.map((n) => n.toLowerCase());
  const pool = JUMPS.filter((j) => ["vertical", "horizontal", "lateral", "snap"].includes(j.kind));
  const fresh = pool.find((j) => !used.includes(j.name.toLowerCase()));
  return fresh ?? pool[0];
}

function demoteToLight(ex: TrainingExercise): void {
  ex.rpe = "RPE 5–6 (kontrola)";
  ex.sets = "2";
  ex.reps = ex.reps && ex.reps.includes("noga") ? "6–8 / noga" : "6–8";
  ex.tempo = undefined;
  ex.cue = "Jakość ruchu, lekko — to nie kolejna ciężka ekspozycja.";
  ex.label = undefined;
}

export function repairGymSession(
  plan: GymSessionPlan,
  ctx: StrengthBlockContext,
  issues: GymValidationIssue[],
): void {
  const refs = flattenExercises(plan);

  // 1) Powtórzone ćwiczenia mocy → podmień drugie na inny wariant skoku.
  const usedPower: string[] = [];
  for (const ref of refs) {
    if (!isPowerExercise(ref)) continue;
    const key = ref.ex.name.toLowerCase();
    if (usedPower.includes(key)) {
      const alt = altJumpByName([...usedPower, ref.ex.name]);
      ref.ex.name = alt.name;
      ref.ex.cue = alt.cue;
      ref.ex.groundContacts = contacts(alt.contacts, dosageFor({ age: 18, level: "advanced" } as Profile, ctx));
      usedPower.push(alt.name.toLowerCase());
    } else {
      usedPower.push(key);
    }
  }

  // 2) Druga ciężka ekspozycja w tej samej grupie + ciężki jednonóż po bilateralnym → demote do lekkiej.
  for (const issue of issues) {
    if (
      (issue.code === "heavy_duplicate_pattern" || issue.code === "unilateral_not_light") &&
      issue.exerciseId
    ) {
      const target = refs.find((r) => r.ex.id === issue.exerciseId);
      if (target) {
        demoteToLight(target.ex);
        if (target.block.intent === "strength" || target.block.intent === "power") {
          target.block.intent = "braking";
          target.block.blockType = "accessory";
        }
      }
    }
  }

  // 3) Brakujące jakości w sesji dolnej → dołóż blok wsparcia.
  const needsHam = issues.some((i) => i.code === "missing_hamstring");
  const needsSupport = issues.some((i) => i.code === "missing_support");
  const needsPower = issues.some((i) => i.code === "missing_power");

  if (needsHam || needsSupport) {
    let accSec = plan.sections.find((s) => s.type === "accessory");
    if (!accSec) {
      accSec = section({ title: "Akcesoria", type: "accessory", blocks: [] });
      const cdIdx = plan.sections.findIndex((s) => s.type === "cooldown");
      if (cdIdx >= 0) plan.sections.splice(cdIdx, 0, accSec);
      else plan.sections.push(accSec);
    }
    const exs: TrainingExercise[] = [];
    if (needsHam) {
      exs.push(
        ex({
          name: "Hamstring slider curl",
          sets: "2",
          reps: "6–8",
          cue: "Kontrola tylnej taśmy, bez bólu.",
          ageSafetyLevel: "youth_ok",
        }),
      );
    }
    if (needsSupport) {
      exs.push(ex({ name: "Izometria łydki / soleus", sets: "2", reps: "20–30 s", cue: "Wsparcie kostki i sprintu." }));
      exs.push(ex({ name: "Copenhagen plank", sets: "2", reps: "8 / strona", cue: "Kontrola przywodzicieli, bez bólu." }));
      exs.push(ex({ name: "Pallof press (anty-rotacja)", sets: "2", reps: "10 / strona", cue: "Sztywny tułów." }));
    }
    accSec.blocks.push(
      block({ title: "Wsparcie i robustność", blockType: "accessory", intent: "stability", restAfterBlock: "45–60 s", exercises: exs }),
    );
  }

  if (needsPower) {
    const mainSec = plan.sections.find((s) => s.type === "main");
    if (mainSec) {
      const alt = altJumpByName(usedPower);
      mainSec.blocks.push(
        block({
          title: "BLOK MOCY — RFD",
          blockType: "rfd",
          intent: "power",
          restAfterBlock: "Przerwa po bloku: 2 min",
          exercises: [
            ex({
              name: alt.name,
              sets: "3",
              reps: "3",
              groundContacts: contacts(alt.contacts, dosageFor({ age: 18, level: "advanced" } as Profile, ctx)),
              cue: alt.cue,
              ageSafetyLevel: "all",
            }),
          ],
        }),
      );
    }
  }

  // 4) Nadmiarowe stresory tylnej taśmy (RDL+Nordic / >1 stresor) →
  //    podmień zgłoszone na kontrolowany, niestresorowy slider leg curl.
  for (const issue of issues) {
    if (
      (issue.code === "rdl_and_nordic" || issue.code === "too_many_hamstring_stressors") &&
      issue.exerciseId
    ) {
      const target = refs.find((r) => r.ex.id === issue.exerciseId);
      if (target) {
        target.ex.name = "Hamstring slider curl";
        target.ex.sets = "2";
        target.ex.reps = "6–8";
        target.ex.rpe = "RPE 5–6 (kontrola)";
        target.ex.tempo = undefined;
        target.ex.groundContacts = undefined;
        target.ex.cue = "Powolny ekscentryk, kontrola tylnej taśmy, bez bólu.";
      }
    }
  }

  // 5) Ciężki jednonóż po ciężkim bilateralnym lifcie → lekka praca techniczna.
  for (const issue of issues) {
    if (issue.code === "heavy_unilateral_after_compound" && issue.exerciseId) {
      const target = refs.find((r) => r.ex.id === issue.exerciseId);
      if (target) {
        demoteToLight(target.ex);
        target.ex.reps = "6 / strona";
        if (target.block.intent === "strength" || target.block.intent === "power") {
          target.block.intent = "braking";
          target.block.blockType = "accessory";
        }
      }
    }
  }

  // 6) Brak ekspozycji quad/glute w sesji dolnej → dołóż kontrolowany goblet squat.
  if (issues.some((i) => i.code === "missing_quad_glute")) {
    const mainSec = plan.sections.find((s) => s.type === "main") ?? plan.sections.find((s) => s.type === "accessory");
    if (mainSec) {
      mainSec.blocks.push(
        block({
          title: "BLOK QUAD/GLUTE",
          blockType: "single",
          intent: "strength",
          restAfterBlock: "90 s",
          exercises: [
            ex({ name: "Goblet squat (tempo)", sets: "3", reps: "8–10", rpe: "RPE 6–7", cue: "Pełen zakres, pięty na ziemi, kontrola." }),
          ],
        }),
      );
    }
  }

  // 7) Niespójna prescription → uzupełnij sensowne domyślne wartości.
  for (const issue of issues) {
    if (issue.code === "prescription_inconsistent" && issue.exerciseId) {
      const target = refs.find((r) => r.ex.id === issue.exerciseId);
      if (!target) continue;
      if (target.pattern === "power") {
        if (!target.ex.reps || !target.ex.reps.trim()) target.ex.reps = "3";
        if (target.ex.groundContacts === undefined || target.ex.groundContacts <= 0) {
          target.ex.groundContacts = contacts(8, dosageFor({ age: 18, level: "advanced" } as Profile, ctx));
        }
      } else {
        if (!target.ex.sets || !target.ex.sets.trim()) target.ex.sets = "3";
        if (!target.ex.reps || !target.ex.reps.trim()) target.ex.reps = "5";
      }
    }
  }
}

function collectMainPatterns(plan: GymSessionPlan): string[] {
  const out: string[] = [];
  for (const sec of plan.sections) {
    if (sec.type !== "main") continue;
    for (const blk of sec.blocks) {
      for (const e of blk.exercises) {
        const p = classifyExercise(e);
        if (COMPOUND_PATTERNS.includes(p) || p === "power") out.push(e.name);
      }
    }
  }
  return Array.from(new Set(out));
}

/** Spłaszcza strukturalne sekcje do płaskich list (persist + fallback UI). */
export function structuredToFlat(sections: TrainingSection[]): {
  warmup: ExerciseItem[];
  main: ExerciseItem[];
  accessory: ExerciseItem[];
  footballTransfer: ExerciseItem[];
  cooldown: ExerciseItem[];
} {
  const toItem = (e: TrainingExercise) => {
    const parts = [e.sets && e.reps ? `${e.sets} × ${e.reps}` : e.reps || e.sets, e.duration, e.rpe, e.loadTarget]
      .filter(Boolean)
      .join(", ");
    const item: ExerciseItem = {
      name: e.label ? `${e.label} — ${e.name}` : e.name,
      prescription: parts || "wg techniki",
      rest: e.restAfterExercise || e.restAfterPair || undefined,
      cue: e.cue,
      easier: e.regression,
      harder: e.progression,
    };
    return item;
  };
  const out = {
    warmup: [] as ExerciseItem[],
    main: [] as ExerciseItem[],
    accessory: [] as ExerciseItem[],
    footballTransfer: [] as ExerciseItem[],
    cooldown: [] as ExerciseItem[],
  };
  for (const sec of sections) {
    const items = sec.blocks.flatMap((b) => b.exercises.map(toItem));
    if (sec.type === "warmup") out.warmup.push(...items);
    else if (sec.type === "cooldown") out.cooldown.push(...items);
    else if (sec.type === "accessory") out.accessory.push(...items);
    else out.main.push(...items);
  }
  return out;
}

/** Mapuje płaskie sekcje ExerciseItem na pojedyncze bloki (fallback dla starych planów). */
export function flatToStructured(sections: {
  warmup: { name: string; prescription?: string; rest?: string; cue?: string; easier?: string; harder?: string }[];
  main: { name: string; prescription?: string; rest?: string; cue?: string; easier?: string; harder?: string }[];
  accessory: { name: string; prescription?: string; rest?: string; cue?: string; easier?: string; harder?: string }[];
  footballTransfer: { name: string; prescription?: string; rest?: string; cue?: string; easier?: string; harder?: string }[];
  cooldown: { name: string; prescription?: string; rest?: string; cue?: string; easier?: string; harder?: string }[];
}): TrainingSection[] {
  __uid = 0;
  const groups: { title: string; type: TrainingSection["type"]; items: typeof sections.main }[] = [
    { title: "Rozgrzewka", type: "warmup", items: sections.warmup },
    { title: "Część główna", type: "main", items: sections.main },
    { title: "Część dodatkowa / stabilizacja", type: "accessory", items: sections.accessory },
    { title: "Transfer piłkarski", type: "main", items: sections.footballTransfer },
    { title: "Wyciszenie", type: "cooldown", items: sections.cooldown },
  ];
  return groups
    .filter((g) => g.items.length > 0)
    .map((g) =>
      section({
        title: g.title,
        type: g.type,
        blocks: [
          block({
            title: "",
            blockType: "single",
            intent: "strength",
            exercises: g.items.map((it) =>
              ex({
                name: it.name,
                reps: it.prescription,
                restAfterExercise: it.rest,
                cue: it.cue,
                regression: it.easier,
                progression: it.harder,
              }),
            ),
          }),
        ],
      }),
    );
}

