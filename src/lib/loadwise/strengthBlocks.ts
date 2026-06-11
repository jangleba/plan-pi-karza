import type {
  Profile,
  TrainingSection,
  TrainingBlock,
  TrainingExercise,
  AgeSafetyLevel,
} from "./types";

/**
 * Generator strukturalnych sesji siła→moc dla Loadwise.
 *
 * Tworzy realne bloki treningowe (superset / contrast / RFD / stiffness /
 * deceleration), a nie płaskie listy ćwiczeń. Eligibility decyduje, czy
 * zawodnik dostaje wersję zaawansowaną (kontrast, plyo, depth) czy bezpieczną
 * wersję techniczną (goblet, low pogo, lądowania).
 */

let __uid = 0;
function uid(prefix: string): string {
  __uid += 1;
  return `${prefix}-${__uid}`;
}

export interface StrengthBlockContext {
  /** Etykieta dnia meczowego (MD, MD-1, MD-2, MD+1...) lub null. */
  mdLabel: string | null;
  /** Czy nacisk na moc (cel power) vs siła. */
  powerFocus: boolean;
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
  // MD-1 / MD-2: bez ciężkiej siły i intensywnej plyometrii.
  if (mdLabel === "MD-1" || mdLabel === "MD-2") return false;
  if (mdLabel === "MD") return false;
  if (mdLabel === "MD+1") return false;
  return true;
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

// ---------- WERSJA ZAAWANSOWANA (16+/18+, siłownia, brak urazu) ----------

function advancedSections(profile: Profile, ctx: StrengthBlockContext): TrainingSection[] {
  const elite: AgeSafetyLevel = "advanced_only";

  const mainLift =
    profile.position === "goalkeeper"
      ? "Trap bar martwy ciąg"
      : "Przysiad ze sztangą";

  const warmup = section({
    title: "Rozgrzewka",
    type: "warmup",
    blocks: [
      block({
        title: "Aktywacja ogólna",
        blockType: "single",
        intent: "mobility",
        restAfterBlock: "przejdź płynnie dalej",
        exercises: [
          ex({
            name: "Rower / trucht",
            duration: "5–7 min",
            rpe: "RPE 3",
            cue: "Spokojny oddech, stopniowo podnoś tętno.",
          }),
          ex({
            name: "Mobilność: biodra, kostki, T-spine",
            duration: "6 min",
            cue: "Pełen zakres, kontrola tułowia.",
          }),
          ex({
            name: "Aktywacja pośladków i core",
            prescription: undefined,
            sets: "2",
            reps: "10–12",
            cue: "Napięcie pośladka, neutralny kręgosłup.",
          }),
        ],
      }),
    ],
  });

  const prep = section({
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
            name: `Serie wprowadzające — ${mainLift.toLowerCase()}`,
            sets: "3",
            reps: "5 → 3 → 2",
            loadTarget: "progresja do ciężaru roboczego",
            cue: "Każda seria szybciej i pewniej technicznie.",
          }),
          ex({
            label: "P2",
            name: "Snap-down do zatrzymania (stick) / low pogo",
            sets: "2",
            reps: "4",
            groundContacts: 8,
            cue: "Sztywna kostka, ciche lądowanie, krótki kontakt.",
            ageSafetyLevel: "youth_ok",
          }),
        ],
      }),
    ],
  });

  const blockA = block({
    title: "BLOK A — SIŁA → MOC",
    blockType: "contrast",
    intent: "power",
    restAfterBlock: "Przerwa po bloku: 2–3 min",
    eligibilityLevel: "advanced_only",
    safetyNotes: "Kontrast: ciężka siła + eksplozywny transfer. Tylko świeży.",
    exercises: [
      ex({
        label: "A1",
        name: mainLift,
        sets: "4",
        reps: "4–5",
        rpe: "RPE 7–8",
        rir: "RIR 2–3",
        tempo: "3-1-1",
        restAfterExercise: "30–45 s do A2",
        cue: "Napnij tułów, kontrolowane zejście, mocne wyjście.",
        technique: "Stopy stabilne, kolana w linii stóp, pełen zakres.",
        progression: "+5% ciężaru lub tempo 4-1-1.",
        regression: "Goblet squat / przysiad do skrzyni.",
        commonMistake: "Zaokrąglone plecy i kolana uciekające do środka.",
        contraindications: "Ból kolana/pleców — zmień na wariant lekki.",
        ageSafetyLevel: elite,
      }),
      ex({
        label: "A2",
        name: ctx.powerFocus ? "Skok w dal z miejsca" : "Skok pionowy (CMJ)",
        sets: "4",
        reps: "3",
        groundContacts: 12,
        restAfterPair: "2–3 min po parze",
        loadTarget: "maksymalna intencja",
        cue: "Maksymalna intencja, pełne, miękkie lądowanie.",
        technique: "Lądowanie na całej stopie, biodra w tył, stabilne kolano.",
        progression: "Med ball throw + skok.",
        regression: "Skok na niską skrzynię (redukcja lądowania).",
        commonMistake: "Twarde lądowanie na prostych nogach.",
        ageSafetyLevel: elite,
      }),
    ],
  });

  const blockB = block({
    title: "BLOK B — JEDNONÓŻ → HAMOWANIE",
    blockType: "deceleration",
    intent: "braking",
    restAfterBlock: "Przerwa po bloku: 2 min",
    eligibilityLevel: "advanced_only",
    exercises: [
      ex({
        label: "B1",
        name: "Przysiad bułgarski",
        sets: "3",
        reps: "6 / noga",
        rpe: "RPE 7",
        tempo: "2-1-1",
        restAfterExercise: "30 s do B2",
        cue: "Pion tułowia, stabilne kolano, kontrola.",
        progression: "Hantle + 2 kg.",
        regression: "Wykrok w miejscu / step-up.",
        ageSafetyLevel: "youth_ok",
      }),
      ex({
        label: "B2",
        name: "Deceleration stick (lądowanie boczne / snap-down)",
        sets: "3",
        reps: "3 / strona",
        groundContacts: 9,
        restAfterPair: "2 min po parze",
        cue: "Zatrzymaj się sztywno, niskie biodra, zamrożona pozycja.",
        technique: "Amortyzuj biodrem i kolanem, nie zawalaj kolana do środka.",
        commonMistake: "Brak kontroli przy zatrzymaniu.",
        ageSafetyLevel: "youth_ok",
      }),
    ],
  });

  const blockC = block({
    title: "BLOK C — POSTERIOR CHAIN → STIFFNESS",
    blockType: "stiffness",
    intent: "stiffness",
    restAfterBlock: "Przerwa po bloku: 90 s",
    exercises: [
      ex({
        label: "C1",
        name: "Martwy ciąg rumuński (RDL)",
        sets: "3",
        reps: "6–8",
        rpe: "RPE 7",
        tempo: "3-1-1",
        restAfterExercise: "30 s do C2",
        cue: "Biodra w tył, plecy proste, czuj tylne uda.",
        progression: "RDL na jednej nodze.",
        regression: "Hip thrust / hamstring bridge.",
        ageSafetyLevel: "youth_ok",
      }),
      ex({
        label: "C2",
        name: "Pogo hops / ankling (stiffness)",
        sets: "3",
        reps: "10 kontaktów",
        groundContacts: 30,
        restAfterPair: "60–90 s po parze",
        cue: "Krótki kontakt z podłożem, sztywna kostka, sprężyna.",
        commonMistake: "Zbyt głębokie ugięcie kolan.",
        ageSafetyLevel: "youth_ok",
      }),
    ],
  });

  const blockD = block({
    title: "BLOK D — RFD / CORE",
    blockType: "rfd",
    intent: "rfd",
    restAfterBlock: "Przerwa po bloku: 90 s",
    exercises: [
      ex({
        label: "D1",
        name: "Izometria — split squat iso / wall drive iso",
        sets: "3",
        reps: "3 × 5 s",
        cue: "Maksymalne napięcie w pozycji, pełna kontrola.",
        ageSafetyLevel: "youth_ok",
      }),
      ex({
        label: "D2",
        name: "Med ball throw / eksplozywny wall drive",
        sets: "3",
        reps: "4",
        restAfterPair: "60 s po parze",
        cue: "Maksymalna prędkość, transfer siły w moc.",
        ageSafetyLevel: "youth_ok",
      }),
    ],
  });

  const main = section({
    title: "Część główna",
    type: "main",
    blocks: ctx.powerFocus ? [blockA, blockB, blockC, blockD] : [blockA, blockB, blockC, blockD],
  });

  const accessory = section({
    title: "Akcesoria",
    type: "accessory",
    blocks: [
      block({
        title: "Robustność i tułów",
        blockType: "accessory",
        intent: "stability",
        restAfterBlock: "45–60 s między ćwiczeniami",
        exercises: [
          ex({
            name: "Copenhagen (przywodziciele) — regresja",
            sets: "2",
            reps: "6 / strona",
            cue: "Kontrola, bez bólu.",
            regression: "Wersja z kolan.",
            ageSafetyLevel: "youth_ok",
          }),
          ex({
            name: "Anty-rotacja (Pallof press)",
            sets: "2",
            reps: "8 / strona",
            cue: "Sztywny tułów, nie obracaj się za oporem.",
            ageSafetyLevel: "all",
          }),
          ex({
            name: "Nordic curl ekscentryczny — lekko",
            sets: "2",
            reps: "4",
            cue: "Powolne opuszczanie, pełna kontrola.",
            regression: "Mniejszy zakres / podpora.",
            ageSafetyLevel: "youth_ok",
          }),
        ],
      }),
    ],
  });

  const cooldown = section({
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

  return [warmup, prep, main, accessory, cooldown];
}

// ---------- WERSJA BEZPIECZNA (U13–U15, początkujący, zmęczeni) ----------

function youthSafeSections(_profile: Profile): TrainingSection[] {
  const warmup = section({
    title: "Rozgrzewka",
    type: "warmup",
    blocks: [
      block({
        title: "Przygotowanie ciała",
        blockType: "single",
        intent: "mobility",
        exercises: [
          ex({ name: "Trucht / pajacyki", duration: "5 min", rpe: "RPE 3" }),
          ex({ name: "Mobilność bioder i kostek", duration: "5 min" }),
          ex({ name: "Aktywacja pośladków i core", sets: "2", reps: "10" }),
        ],
      }),
    ],
  });

  const main = section({
    title: "Część główna",
    type: "main",
    blocks: [
      block({
        title: "BLOK A — TECHNIKA SIŁY → LEKKA MOC",
        blockType: "contrast",
        intent: "power",
        restAfterBlock: "Przerwa po bloku: 90 s",
        eligibilityLevel: "youth_ok",
        safetyNotes: "Bez maksymalnych obciążeń i głębokich skoków — priorytet to technika.",
        exercises: [
          ex({
            label: "A1",
            name: "Goblet squat",
            sets: "3",
            reps: "8",
            rpe: "RPE 5–6",
            tempo: "2-1-1",
            restAfterExercise: "30 s do A2",
            cue: "Pełna kontrola, pięty na ziemi.",
            technique: "Tułów stabilny, kolana w linii stóp.",
            ageSafetyLevel: "youth_ok",
          }),
          ex({
            label: "A2",
            name: "Low pogo",
            sets: "3",
            reps: "10 kontaktów",
            groundContacts: 30,
            restAfterPair: "90 s po parze",
            cue: "Krótki kontakt z podłożem, sprężyna w kostce.",
            ageSafetyLevel: "youth_ok",
          }),
        ],
      }),
      block({
        title: "BLOK B — JEDNONÓŻ → LĄDOWANIE",
        blockType: "deceleration",
        intent: "braking",
        restAfterBlock: "Przerwa po bloku: 90 s",
        eligibilityLevel: "youth_ok",
        exercises: [
          ex({
            label: "B1",
            name: "Split squat",
            sets: "3",
            reps: "6 / noga",
            rpe: "RPE 5",
            cue: "Pion tułowia, stabilne kolano.",
            ageSafetyLevel: "youth_ok",
          }),
          ex({
            label: "B2",
            name: "Snap-down to stick",
            sets: "3",
            reps: "3",
            groundContacts: 9,
            restAfterPair: "90 s po parze",
            cue: "Miękkie, kontrolowane lądowanie, zatrzymaj się i zamroź.",
            ageSafetyLevel: "youth_ok",
          }),
        ],
      }),
      block({
        title: "BLOK C — TYŁ NÓG → STABILIZACJA",
        blockType: "stiffness",
        intent: "stiffness",
        restAfterBlock: "Przerwa po bloku: 60 s",
        exercises: [
          ex({
            label: "C1",
            name: "Hip hinge (nauka wzorca) / hamstring bridge",
            sets: "3",
            reps: "8",
            cue: "Biodra w tył, plecy proste.",
            ageSafetyLevel: "youth_ok",
          }),
          ex({
            label: "C2",
            name: "Med ball chest pass",
            sets: "3",
            reps: "6",
            restAfterPair: "60 s po parze",
            cue: "Dynamiczny wyrzut, stabilny tułów.",
            ageSafetyLevel: "all",
          }),
        ],
      }),
    ],
  });

  const accessory = section({
    title: "Akcesoria",
    type: "accessory",
    blocks: [
      block({
        title: "Stabilizacja i koordynacja",
        blockType: "accessory",
        intent: "stability",
        restAfterBlock: "45 s między ćwiczeniami",
        exercises: [
          ex({ name: "Plank", sets: "3", reps: "30 s", cue: "Napięty brzuch, biodra w linii." }),
          ex({ name: "Dead bug", sets: "2", reps: "8 / strona", cue: "Wolno, kontrola lędźwi." }),
          ex({ name: "Koordynacja w drabince", duration: "5 min", cue: "Szybkie, lekkie stopy." }),
        ],
      }),
    ],
  });

  const cooldown = section({
    title: "Wyciszenie",
    type: "cooldown",
    blocks: [
      block({
        title: "Mobilność i oddech",
        blockType: "single",
        intent: "mobility",
        exercises: [
          ex({ name: "Lekka mobilność całego ciała", duration: "5 min" }),
          ex({ name: "Oddech przeponowy", duration: "2 min", cue: "Spokojny rytm." }),
        ],
      }),
    ],
  });

  return [warmup, main, accessory, cooldown];
}

/**
 * Główny punkt wejścia: zwraca strukturalne sekcje siła→moc lub null,
 * jeśli kontekst (MD lub bezpieczeństwo) na to nie pozwala.
 */
export function buildStrengthPowerStructured(
  profile: Profile,
  ctx: StrengthBlockContext,
): TrainingSection[] | null {
  __uid = 0;
  if (!structuredStrengthAllowed(ctx.mdLabel)) return null;
  if (profile.painInjury || profile.seasonPhase === "return_injury") return null;
  if (isAdvancedEligible(profile)) return advancedSections(profile, ctx);
  return youthSafeSections(profile);
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
