import type {
  Profile,
  Intensity,
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
  /** Ogólna gotowość 1–10 (jeśli znana). */
  readiness?: number;
  /** Historia ćwiczeń — anty-powtórzenia w tygodniu i między tygodniami. */
  history: GymHistory;
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
  "Trap bar martwy ciąg",
  "Przysiad ze sztangą do skrzyni",
  "Przysiad ze sztangą (low bar)",
];
const SQUAT_YOUTH = [
  "Goblet squat",
  "Przysiad z hantlami (tempo)",
  "Przysiad do skrzyni",
  "Przysiad z masą ciała + pauza",
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
  "Wspięcia na łydki (nordic calf)",
];

const ADDUCTOR = [
  "Copenhagen plank",
  "Adductor squeeze (piłka)",
  "Suwak boczny z gumą",
  "Side-lying adduction",
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
        title: "Downregulation",
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
// ROLA 1 — LOWER STRENGTH + POWER
// ---------------------------------------------------------------------------

function lowerStrengthPower(profile: Profile, ctx: StrengthBlockContext): GymSessionPlan {
  const adult = isAdvancedEligible(profile);
  const d = dosageFor(profile, ctx);
  const avoid = [...ctx.history.usedMainThisWeek, ...ctx.history.usedMainLastWeek];
  const squat = rotatePick(adult ? SQUAT_ADULT : SQUAT_YOUTH, ctx, avoid);
  const jump = pickJumps(ctx, ctx.powerFocus ? ["horizontal", "vertical"] : ["vertical", "horizontal"], avoid);
  const acc = rotatePick(adult ? POSTERIOR_ACC : POSTERIOR_ACC, ctx, avoid);
  const core = rotatePick(CORE_ANTI, ctx, avoid);
  const useContrast = adult && (ctx.weekPhase === "development" || ctx.weekPhase === "peak");

  const sections: TrainingSection[] = [
    warmupSection(),
    section({
      title: "Przygotowanie",
      type: "prep",
      blocks: [
        block({
          title: "Ramp-up + primer nerwowy",
          blockType: "single",
          intent: "rfd",
          restAfterBlock: "60–90 s",
          exercises: [
            ex({
              label: "P1",
              name: `Serie wprowadzające — ${squat.toLowerCase()}`,
              sets: "3",
              reps: "5 → 3 → 2",
              loadTarget: "progresja do ciężaru roboczego",
              cue: "Każda seria pewniejsza technicznie i szybsza.",
            }),
          ],
        }),
      ],
    }),
    section({
      title: "Część główna",
      type: "main",
      blocks: [
        block({
          title: useContrast ? "BLOK A — SIŁA → MOC (kontrast)" : "BLOK A — SIŁA DOLNA",
          blockType: useContrast ? "contrast" : "single",
          intent: "power",
          restAfterBlock: "Przerwa po bloku: 2–3 min",
          eligibilityLevel: adult ? "advanced_only" : "youth_ok",
          safetyNotes: useContrast ? "Kontrast: ciężka siła + eksplozja. Tylko świeży." : undefined,
          exercises: useContrast
            ? [
                ex({
                  label: "A1",
                  name: squat,
                  sets: d.mainSets,
                  reps: d.mainReps,
                  rpe: d.rpe,
                  tempo: "3-1-1",
                  restAfterExercise: "30–45 s do A2",
                  cue: "Napnij tułów, kontrolowane zejście, mocne wyjście.",
                  technique: "Kolana w linii stóp, pełen zakres.",
                  regression: "Goblet squat / przysiad do skrzyni.",
                  commonMistake: "Zaokrąglone plecy, kolana do środka.",
                  ageSafetyLevel: "advanced_only",
                }),
                ex({
                  label: "A2",
                  name: jump.name,
                  sets: d.mainSets,
                  reps: "3",
                  groundContacts: contacts(jump.contacts, d),
                  restAfterPair: "2–3 min po parze",
                  cue: jump.cue,
                  ageSafetyLevel: "advanced_only",
                }),
              ]
            : [
                ex({
                  label: "A",
                  name: squat,
                  sets: d.mainSets,
                  reps: d.mainReps,
                  rpe: d.rpe,
                  tempo: "2-1-1",
                  restAfterExercise: "90–120 s",
                  cue: "Technika przede wszystkim, pełna kontrola.",
                  technique: "Pięty na ziemi, kolana w linii stóp.",
                  ageSafetyLevel: adult ? "all" : "youth_ok",
                }),
              ],
        }),
        block({
          title: "BLOK B — MOC / EKSPLOZJA",
          blockType: "rfd",
          intent: "power",
          restAfterBlock: "Przerwa po bloku: 2 min",
          exercises: [
            ex({
              label: "B1",
              name: jump.kind === "medball" ? "Skok pionowy (CMJ)" : jump.name,
              sets: "3",
              reps: "4",
              groundContacts: contacts(jump.contacts, d),
              cue: jump.cue,
              ageSafetyLevel: adult ? "all" : "youth_ok",
            }),
            ex({
              label: "B2",
              name: acc,
              sets: d.accSets,
              reps: d.accReps,
              restAfterPair: "90 s po parze",
              cue: "Kontrola tylnej taśmy, bez bólu.",
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
    title: adult ? "Siłownia: siła dolna + moc" : "Siłownia: siła dolna (technika)",
    sessionType: "Siła / moc",
    goalOfSession: "Ciężka siła dolnych partii z transferem w eksplozję i skok.",
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
  const sprintDrill = pickJumps(ctx, ["wall", "ankling"], avoid);
  const stiff = pickJumps(ctx, ["pogo"], avoid);
  const ham = rotatePick(POSTERIOR_ACC, ctx, avoid);
  const adductor = rotatePick(ADDUCTOR, ctx, avoid);

  const sections: TrainingSection[] = [
    warmupSection(),
    section({
      title: "Aktywacja sprintu",
      type: "prep",
      blocks: [
        block({
          title: "Sprint support — mechanika",
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
    section({
      title: "Część główna",
      type: "main",
      blocks: [
        block({
          title: "BLOK A — TYLNA TAŚMA (hinge)",
          blockType: "single",
          intent: "strength",
          restAfterBlock: "Przerwa po bloku: 2 min",
          exercises: [
            ex({
              label: "A",
              name: hinge,
              sets: d.mainSets,
              reps: d.mainReps,
              rpe: d.rpe,
              tempo: "3-1-1",
              restAfterExercise: "90–120 s",
              cue: "Biodra w tył, plecy proste, czuj tylne uda.",
              technique: "Neutralny kręgosłup, napięty tułów.",
              regression: "Hip thrust / hamstring bridge.",
              ageSafetyLevel: adult ? "all" : "youth_ok",
            }),
          ],
        }),
        block({
          title: "BLOK B — HAMSTRING → STIFFNESS",
          blockType: "stiffness",
          intent: "stiffness",
          restAfterBlock: "Przerwa po bloku: 90 s",
          exercises: [
            ex({ label: "B1", name: ham, sets: d.mainSets, reps: "5–6", cue: "Powolny ekscentryk, pełna kontrola.", ageSafetyLevel: "youth_ok" }),
            ex({
              label: "B2",
              name: stiff.name,
              sets: "3",
              reps: "10 kontaktów",
              groundContacts: contacts(stiff.contacts, d),
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
          title: "Tułów i przywodziciele",
          blockType: "accessory",
          intent: "stability",
          restAfterBlock: "45–60 s",
          exercises: [
            ex({ name: adductor, sets: d.accSets, reps: "8 / strona", cue: "Kontrola, bez bólu." }),
            ex({ name: rotatePick(CORE_ANTI, ctx, avoid), sets: "2", reps: d.accReps, cue: "Sztywny tułów." }),
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
            ex({ name: rotatePick(POSTERIOR_ACC, ctx, avoid), sets: "2", reps: "8", cue: "Lekko, pełna kontrola." }),
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

  const role = pickGymRole(profile, ctx);
  switch (role) {
    case "lower_strength_power":
      return lowerStrengthPower(profile, ctx);
    case "posterior_sprint":
      return posteriorSprint(profile, ctx);
    case "unilateral_decel":
      return unilateralDecel(profile, ctx);
    case "upper_core":
      return upperCore(profile, ctx);
    case "primer":
      return powerPrimer(profile, ctx);
    case "recovery_prehab":
    default:
      return recoveryPrehab(profile, ctx);
  }
}

/** Spłaszcza strukturalne sekcje do płaskich list (persist + fallback UI). */
export function structuredToFlat(sections: TrainingSection[]): {
  warmup: { name: string; prescription?: string; rest?: string; cue?: string; easier?: string; harder?: string }[];
  main: { name: string; prescription?: string; rest?: string; cue?: string; easier?: string; harder?: string }[];
  accessory: { name: string; prescription?: string; rest?: string; cue?: string; easier?: string; harder?: string }[];
  footballTransfer: { name: string; prescription?: string; rest?: string; cue?: string; easier?: string; harder?: string }[];
  cooldown: { name: string; prescription?: string; rest?: string; cue?: string; easier?: string; harder?: string }[];
} {
  const toItem = (e: TrainingExercise) => {
    const parts = [e.sets && e.reps ? `${e.sets} × ${e.reps}` : e.reps || e.sets, e.duration, e.rpe, e.loadTarget]
      .filter(Boolean)
      .join(", ");
    return {
      name: e.label ? `${e.label} — ${e.name}` : e.name,
      prescription: parts || undefined,
      rest: e.restAfterExercise || e.restAfterPair || undefined,
      cue: e.cue,
      easier: e.regression,
      harder: e.progression,
    };
  };
  const out = {
    warmup: [] as ReturnType<typeof toItem>[],
    main: [] as ReturnType<typeof toItem>[],
    accessory: [] as ReturnType<typeof toItem>[],
    footballTransfer: [] as ReturnType<typeof toItem>[],
    cooldown: [] as ReturnType<typeof toItem>[],
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
        blocks: g.items.map((it) =>
          block({
            title: it.name,
            blockType: "single",
            intent: "strength",
            exercises: [
              ex({
                name: it.name,
                reps: it.prescription,
                restAfterExercise: it.rest,
                cue: it.cue,
                regression: it.easier,
                progression: it.harder,
              }),
            ],
          }),
        ),
      }),
    );
}
