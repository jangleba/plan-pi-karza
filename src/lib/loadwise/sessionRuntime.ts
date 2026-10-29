// Shared day adaptation and week presentation. Kept independent of full plan generation.
import type {
  Profile,
  SessionDay,
  ExerciseItem,
  Intensity,
  Readiness,
  PlanWeek,
  PlanDay,
  PlanSession,
  PlanSessionType,
  WeekStats,
  TrainingSection,
} from "./types";
import { isoDate, addDays, isoDayOfWeek, dayName, parseIso, formatDate } from "./labels";
import { normalizeSessionCategory, classifySession } from "./sessionClassification";
import { repairUnsafeExercisesForAthleteProfile } from "./athleteProfileRepair";
import { reduceSessionDose } from "./doseAdjustment";
import {
  generateFootballSpeedSession,
  persistedFootballSpeedFamily,
  type FootballSpeedFamily,
} from "./footballSpeedSessionEngine";
import { PLAN_ENGINE_VERSION } from "./planVersion";
import type { WeekPhase } from "./types";

export function cooldown(): ExerciseItem[] {
  return [
    { name: "Trucht wyciszający", prescription: "3–5 min, bardzo lekko" },
    {
      name: "Rozciąganie statyczne",
      prescription: "łydki, uda, biodra — 5 min",
    },
    { name: "Oddech przeponowy", prescription: "2 min, spokojny rytm" },
  ];
}

export interface Built {
  title: string;
  sessionType: string;
  main: ExerciseItem[];
  accessory: ExerciseItem[];
  footballTransfer: ExerciseItem[];
  intensity: Intensity;
  durationMin: number;
  goalOfSession: string;
  riskManaged: string;
  avoidToday: string;
  /** Structured sections preserved when built via buildStrengthPowerStructured. */
  structuredSections?: TrainingSection[];
}

export function recoverySession(): Built {
  return {
    title: "Regeneracja i mobilność",
    sessionType: "Regeneracja",
    intensity: "niska",
    durationMin: 30,
    goalOfSession:
      "Przyspieszenie regeneracji i zmniejszenie sztywności bez dokładania obciążenia.",
    riskManaged: "Brak intensywności — żadnego ukrytego kondycyjnego.",
    avoidToday: "Bez interwałów, sprintów i ciężkich obciążeń.",
    main: [
      {
        name: "Spacer / bardzo lekki trucht lub rower",
        prescription: "10–20 min, opcjonalnie",
        cue: "Bardzo lekko, tylko rozruszanie.",
      },
      {
        name: "Mobilność całego ciała",
        prescription: "10 min",
        cue: "Spokojnie, kontroluj zakres.",
      },
      {
        name: "Oddech i wyciszenie",
        prescription: "5 min wydłużony wydech",
        cue: "Nos–wdech, długi wydech, rozluźnij barki.",
      },
    ],
    accessory: [],
    footballTransfer: [],
  };
}

export const INTENSITY_ORDER: Intensity[] = ["niska", "umiarkowana", "wysoka"];

export function lowerIntensity(i: Intensity, steps: number): Intensity {
  const idx = Math.max(0, INTENSITY_ORDER.indexOf(i) - steps);
  return INTENSITY_ORDER[idx];
}

/**
 * Matches exercise names that are forbidden when the athlete has an active
 * pain/injury flag.  Used by both the plan-building pipeline (applyPainSafety)
 * and the live readiness adapter (applyReadiness) so the definition is kept
 * in one place.
 */
export const PAIN_RISKY_RE = /sprint|zryw|przyspiesz|maksym|przysiad|martwy|wykrok|skok|plyo/i;

export const LOWER_LIMB_DISCOMFORT = new Set(["knee", "ankle", "hamstring", "groin", "hip"]);

/**
 * Returns a category-safe replacement exercise for blocked/hard exercises.
 * Never introduces ball work into sprint, endurance or strength sessions.
 */
export function safeReplacementForCategory(
  category: import("./types").SessionCategory | undefined,
): ExerciseItem {
  switch (category) {
    case "speed_sprint":
      return {
        name: "Akceleracja submaksymalna — technika biegu",
        prescription: "6 × 20 m w 80–85% intensywności, pełna przerwa — skupienie na mechanice",
      };
    case "endurance_conditioning":
      return {
        name: "Lekki bieg aerobowy",
        prescription: "trucht / easy run w strefie 2 — swobodny oddech przez cały czas",
      };
    case "gym_strength":
      return {
        name: "Regresja z ciężarem ciała",
        prescription: "ćwiczenia bez obciążenia zewnętrznego — squat, hip bridge, bird-dog",
      };
    default:
      // club / football / other — ball work is safe here
      return {
        name: "Lekka technika piłkarska (zamiast pracy intensywnej)",
        prescription: "spokojne podania i prowadzenie",
      };
  }
}

/** Rola tygodnia w periodyzacji 4-tygodniowej. */
export function phaseOf(weekIndex: number, totalWeeks: number): WeekPhase {
  if (totalWeeks <= 1) return "development";
  if (weekIndex === totalWeeks - 1) return "deload";
  if (weekIndex === 0) return "adaptation";
  if (weekIndex === 1) return "development";
  return "peak";
}

// ============================================================
// Walidacja i naprawa kategorii tygodnia (category-based engine)
// Każdy bodziec należy do kategorii wydolnościowej. Dla zdrowego
// zawodnika tydzień MUSI być zbalansowany: siła/moc, szybkość,
// wydolność i motoryka mają priorytet nad pracą stricte piłkarską,
// bo klub i mecz już zapewniają ekspozycję piłkarską. Piłka jako
// trening własny jest limitowana, a brakujące kategorie są dodawane
// w kolejności priorytetu, zanim tydzień zostanie pokazany.
// ============================================================

export type PerfCategory = "strength_power" | "speed" | "conditioning" | "athletic" | "ball";

export type PlanSessionCategory =
  PerfCategory | "club" | "match" | "activation" | "recovery_prehab" | "rest";

export function textOfSession(session: SessionDay): string {
  const exerciseText = [
    ...session.sections.warmup,
    ...session.sections.main,
    ...session.sections.accessory,
    ...session.sections.footballTransfer,
    ...session.sections.cooldown,
  ]
    .map((e) => `${e.name} ${e.prescription} ${e.cue ?? ""}`)
    .join(" ");
  return `${session.title} ${session.sessionType} ${session.goalOfSession} ${exerciseText}`.toLowerCase();
}

export function headerTextOfSession(session: SessionDay): string {
  return `${session.title} ${session.sessionType} ${session.goalOfSession}`.toLowerCase();
}

export function sessionCategory(session: SessionDay): PlanSessionCategory {
  if (session.dayType === "club") return "club";
  if (session.dayType === "match") return "match";
  if (session.dayType === "md-1") return "activation";
  if (session.dayType === "recovery") return "recovery_prehab";
  if (session.dayType === "rest") return "rest";

  // Najpierw ufamy kanonicznemu typowi sesji (sessionType) — buildStimulus
  // ustawia go spójnie z kategorią. To pewniejsze niż skan słów kluczowych.
  const stype = session.sessionType.toLowerCase();
  if (/piłka|technik/.test(stype)) return "ball";
  if (/regener|prehab/.test(stype)) return "athletic";
  if (/wytrzym|wydol|tlen|kondyc/.test(stype)) return "conditioning";
  if (/sprint|szybko/.test(stype)) return "speed";
  if (/sił|\bmoc(?:y|ą|owy|owa|owe)?\b|power/.test(stype)) return "strength_power";
  if (/cod|zwin|motory|hamowan/.test(stype)) return "athletic";

  // Nie używamy goalLabel do klasyfikacji — etykieta celu (np. "Siła i
  // stabilność") fałszywie kierowałaby każdą sesję do kategorii celu.
  const header = `${session.title} ${session.sessionType} ${session.goalOfSession}`.toLowerCase();
  if (/sił|\bmoc(?:y|ą|owy|owa|owe)?\b|power/.test(header)) {
    return "strength_power";
  }
  if (/wydol|tlen|tempo|interwa|rsa|kondyc/.test(header)) {
    return "conditioning";
  }
  if (/sprint|szybko|przyspiesz|akceler|prędko/.test(header)) {
    return "speed";
  }
  if (/cod|motory|zwin|zmian|hamowan|lądowa|prehab|mobil|stabil/.test(header)) {
    return "athletic";
  }
  const text = textOfSession(session);
  if (/wydol|tlen|tempo|interwa|rsa|kondyc|ciągły bieg|biegowy|bieg /.test(text))
    return "conditioning";
  if (/sprint|szybko|przyspiesz|akceler|prędko|reakcja|flying/.test(text)) return "speed";
  if (
    /sił|\bmoc(?:y|ą|owy|owa|owe)?\b|power|przysiad|martwy|split squat|rdl|trap-bar|goblet/.test(
      text,
    )
  )
    return "strength_power";
  if (
    /cod|zwin|zmian|hamowan|lądowa|prehab|mobil|stabil|core|przywodziciel|copenhagen|nordic/.test(
      text,
    )
  )
    return "athletic";
  return "ball";
}

export function sessionContainsPrehab(session: SessionDay): boolean {
  if (session.dayType === "recovery") return true;
  const exerciseText = [
    ...session.sections.main,
    ...session.sections.accessory,
    ...session.sections.footballTransfer,
  ]
    .map((e) => `${e.name} ${e.prescription} ${e.cue ?? ""}`)
    .join(" ");
  const text = `${headerTextOfSession(session)} ${exerciseText}`.toLowerCase();
  return /prehab|mobil|regener|przywodziciel|copenhagen|nordic|oddech|łydk|hamstring/.test(text);
}

export const OWN_TRAINING_TYPES: PlanSessionType[] = [
  "strength_power",
  "sprint_acceleration",
  "endurance_running",
  "football_technical",
  "cod_agility",
];

export const RECOVERY_PREHAB_TYPES: PlanSessionType[] = [
  "recovery",
  "prehab_mobility",
  "activation",
];

export function allExercises(session: SessionDay): ExerciseItem[] {
  if (session.isUnavailable) return [];
  const listed = [
    ...session.sections.warmup,
    ...session.sections.main,
    ...session.sections.accessory,
    ...session.sections.footballTransfer,
    ...session.sections.cooldown,
  ];
  if (listed.length) return listed;
  if (session.dayType === "club") {
    return [
      {
        name: "Trening klubowy wg planu trenera",
        prescription: `${session.durationMin} min — zapisz realny czas i RPE po zakończeniu`,
        cue: "Traktuj klub jako główne obciążenie dnia, nie dokładaj ciężkich nóg.",
      },
      {
        name: "Monitoring po treningu",
        prescription: "RPE 0–10, ból 0–10, zmęczenie nóg 0–10, krótka notatka",
        cue: "Dane po klubie sterują kolejnymi decyzjami BallWise.",
      },
    ];
  }
  if (session.dayType === "rest") {
    return [
      {
        name: "Wolne / lekki ruch opcjonalnie",
        prescription: "10–20 min spaceru lub bardzo lekka mobilność, tylko jeśli chcesz",
        cue: "Nie zamieniaj dnia wolnego w ukryty trening.",
      },
    ];
  }
  return [];
}

export function planSessionType(session: SessionDay): PlanSessionType {
  if (session.dayType === "club") return "club_training";
  if (session.dayType === "match") return "match";
  if (session.dayType === "md-1") return "activation";
  if (session.dayType === "recovery") return "recovery";
  if (session.dayType === "rest") return "rest";
  const category = sessionCategory(session);
  if (category === "strength_power") return "strength_power";
  if (category === "speed") return "sprint_acceleration";
  if (category === "conditioning") return "endurance_running";
  if (category === "athletic") {
    return sessionContainsPrehab(session) ? "prehab_mobility" : "cod_agility";
  }
  return "football_technical";
}

export function sessionToPlanSession(session: SessionDay): PlanSession {
  const type = session.type ?? planSessionType(session);
  const exercises = session.exercises ?? allExercises(session);
  return {
    id: session.sessionId ?? `${session.date}-${session.isSupplemental ? 2 : 1}`,
    type,
    title: session.title,
    intensity: session.intensity,
    durationMin: session.durationMin,
    isClubSession: Boolean(session.isClubSession ?? type === "club_training"),
    isOwnSession: Boolean(session.isOwnSession ?? OWN_TRAINING_TYPES.includes(type)),
    isRecoveryOrPrehab: Boolean(session.isRecoveryOrPrehab ?? RECOVERY_PREHAB_TYPES.includes(type)),
    isSupplemental: Boolean(session.isSupplemental),
    exercises,
    source: session,
  };
}

export function weekStartIso(date: Date): string {
  return isoDate(addDays(date, 1 - isoDayOfWeek(date)));
}

export function weekEndIso(date: Date): string {
  return isoDate(addDays(date, 7 - isoDayOfWeek(date)));
}

export function weekFocusFromSessions(sessions: PlanSession[]): string {
  const labels: Partial<Record<PlanSessionType, string>> = {
    strength_power: "siła",
    sprint_acceleration: "sprint",
    endurance_running: "wydolność",
    football_technical: "piłka",
    cod_agility: "motoryka",
    club_training: "klub",
    match: "mecz",
    recovery: "regeneracja",
    prehab_mobility: "prehab",
    activation: "aktywacja",
  };
  const seen = sessions
    .map((s) => labels[s.type])
    .filter((v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i)
    .slice(0, 3);
  return seen.length ? seen.join(" + ") : "mikrocykl";
}

/**
 * Czy zawodnik jest w kontekście kontuzji/rehabilitacji/powrotu — jedyny
 * powód, dla którego cały tydzień może mieć niskie obciążenie.
 */
export function isRecoveryContext(profile?: Profile | null): boolean {
  if (!profile) return false;
  return (
    !!profile.painInjury || profile.seasonPhase === "return_injury" || profile.goal === "return"
  );
}

/**
 * Zaplanowane obciążenie tygodnia (bez korekty daily readiness).
 * Domyślne minimum to "umiarkowana" — plan bazowy zawsze daje bodziec rozwojowy.
 * "Niska" jest dozwolona TYLKO w kontekście kontuzji/rehabilitacji/powrotu.
 */
export function plannedWeeklyLoadOf(sessions: PlanSession[], profile?: Profile | null): Intensity {
  const hasHigh = sessions.some((s) => s.intensity === "wysoka");
  const hasMod = sessions.some((s) => s.intensity === "umiarkowana");
  if (hasHigh) return "wysoka";
  if (hasMod) return "umiarkowana";
  // Brak jakiegokolwiek bodźca wysokiego/umiarkowanego = lekki tydzień.
  // Dozwolony wyłącznie z realnego powodu (kontuzja/rehab/powrót).
  return isRecoveryContext(profile) ? "niska" : "umiarkowana";
}

export function buildPlanWeeks(plan: SessionDay[], profile?: Profile | null): PlanWeek[] {
  const buckets = new Map<string, SessionDay[]>();
  for (const day of plan) {
    const key = weekStartIso(parseIso(day.date));
    const list = buckets.get(key) ?? [];
    list.push(day);
    buckets.set(key, list);
  }

  const totalWeeks = buckets.size;
  return [...buckets.entries()].map(([startDate, days], index) => {
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const endDate = weekEndIso(parseIso(startDate));
    const byDate = new Map(sorted.map((day) => [day.date, day]));
    const planDays: PlanDay[] = Array.from({ length: 7 }, (_, offset) => {
      const date = isoDate(addDays(parseIso(startDate), offset));
      const day = byDate.get(date);
      if (!day) {
        return {
          date,
          dayOfWeek: isoDayOfWeek(parseIso(date)),
          mdRelation: null,
          sessions: [],
          outsideActivePlan: true,
          source: {
            generatorVersion: PLAN_ENGINE_VERSION,
            date,
            dayName: dayName(parseIso(date)),
            dayType: "rest",
            title: "Poza aktywnym planem",
            goalLabel: "Poza planem",
            intensity: "niska",
            durationMin: 0,
            reason: "Plan zaczyna się w trakcie tygodnia — ten dzień nie wchodzi do obciążenia.",
            safetyNote: null,
            whyToday: "Dzień wcześniejszy niż start planu.",
            sessionType: "Poza planem",
            goalOfSession: "Brak zaplanowanej sesji.",
            riskManaged: "Nie liczony do tygodniowego obciążenia.",
            avoidToday: "Brak zaleceń treningowych w tym planie.",
            mdLabel: null,
            slotLabel: null,
            sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
            secondSession: null,
          },
        };
      }
      const sessions = [day, day.secondSession]
        .filter(Boolean)
        .map((s) => sessionToPlanSession(s as SessionDay));
      return {
        date: day.date,
        dayOfWeek: day.dayOfWeek ?? isoDayOfWeek(parseIso(day.date)),
        mdRelation: day.mdRelation ?? day.mdLabel,
        sessions,
        outsideActivePlan: false,
        source: day,
      };
    });
    const sessions = planDays.flatMap((d) => d.sessions);
    const matchDates = planDays.filter((d) => d.source.dayType === "match").map((d) => d.date);
    const reasons: string[] = [];
    if (planDays.length < 7) reasons.push("plan startuje w trakcie tygodnia");
    const plannedLoad = plannedWeeklyLoadOf(sessions, profile);
    const weekPhase = phaseOf(index, totalWeeks);
    return {
      weekId: `${startDate}_${endDate}`,
      weekNumber: index + 1,
      startDate,
      endDate,
      days: planDays,
      matchDate: matchDates[0] ?? null,
      matchDates,
      focus: weekFocusFromSessions(sessions),
      loadLevel: plannedLoad,
      weekPhase,
      plannedWeeklyLoad: plannedLoad,
      reasons,
    };
  });
}

/** Problem walidacyjny planu wykryty przed zapisem/wyświetleniem. */
export interface PlanValidationIssue {
  weekIndex: number;
  code: "unjustified-light-week";
  message: string;
}

/**
 * Walidator planu — uruchamiany przed zapisaniem i wyświetleniem.
 * Zabrania automatycznego generowania lekkich tygodni bez przyczyny.
 * Daily readiness NIE wpływa na te wartości (obciążenie tygodnia jest
 * liczone z zaplanowanych sesji, nie z gotowości), więc pojedynczy słaby
 * dzień nie może obniżyć całego planu.
 */
export function validatePlanWeeks(
  weeks: PlanWeek[],
  profile?: Profile | null,
): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  weeks.forEach((w, i) => {
    if (w.plannedWeeklyLoad === "niska" && !isRecoveryContext(profile)) {
      issues.push({
        weekIndex: i,
        code: "unjustified-light-week",
        message:
          "Lekki tydzień bez przyczyny — dozwolony tylko przy kontuzji, rehabilitacji lub powrocie do gry.",
      });
    }
  });
  return issues;
}

export function isRealSession(session: PlanSession): boolean {
  return session.type !== "rest" && session.durationMin >= 20 && session.exercises.length > 0;
}

export function computeWeekStats(week: PlanWeek): WeekStats {
  const sessions = week.days.flatMap((d) => d.sessions);
  const ownTrainingCount = sessions.filter(
    (s) => OWN_TRAINING_TYPES.includes(s.type) && isRealSession(s),
  ).length;
  const clubTrainingCount = sessions.filter(
    (s) => s.type === "club_training" && isRealSession(s),
  ).length;
  const recoveryPrehabCount = sessions.filter(
    (s) => RECOVERY_PREHAB_TYPES.includes(s.type) && isRealSession(s),
  ).length;
  const doubleDayCount = week.days.filter(
    (day) => day.sessions.filter(isRealSession).length >= 2,
  ).length;
  return {
    ownTrainingCount,
    clubTrainingCount,
    recoveryPrehabCount,
    doubleDayCount,
    hasMatch: week.matchDates.length > 0,
    matchDateLabel: week.matchDate ? formatDate(week.matchDate) : "brak",
    weeklyLoadLabel: week.loadLevel,
  };
}

/**
 * Dzieli okres planu na tygodnie kalendarzowe (poniedziałek–niedziela).
 * Pierwszy tydzień może być niepełny, jeśli plan startuje w środku tygodnia.
 * Zwraca przedziały indeksów dni [start, end) względem startDate.
 */
export function weekRanges(startDate: Date, days: number): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let i = 0;
  while (i < days) {
    let j = i + 1;
    while (j < days && isoDayOfWeek(addDays(startDate, j)) !== 1) j++;
    ranges.push({ start: i, end: j });
    i = j;
  }
  return ranges;
}

export interface DecisionResult {
  headline: string;
  detail: string;
  adjustment: string | null;
}

/** Czy druga sesja może zostać dziś (na podstawie gotowości/bólu). */
export function secondSessionAllowedToday(
  readiness: Readiness | undefined,
  profile: Profile,
): boolean {
  if (profile.painInjury) return false;
  if (readiness && readiness.jointPain >= 7) return false;
  return true;
}

export function speedFamilyFromSession(session: SessionDay): FootballSpeedFamily {
  const persisted = persistedFootballSpeedFamily(session);
  if (persisted) return persisted;
  const subcategory = session.classification?.subcategory ?? classifySession(session).subcategory;
  if (
    subcategory === "change_of_direction" ||
    subcategory === "deceleration" ||
    subcategory === "braking" ||
    subcategory === "acceleration_deceleration"
  ) {
    return "deceleration_cod";
  }
  if (
    subcategory === "max_velocity" ||
    subcategory === "max_velocity_cod" ||
    subcategory === "flying_sprints"
  ) {
    return "maximum_velocity";
  }
  if (/łuk|curved/i.test(`${session.title} ${session.sessionType}`)) {
    return "curved_sprinting";
  }
  if (subcategory === "agility_speed" || /reakcj/i.test(session.title)) {
    return "reactive_agility_reacceleration";
  }
  return "acceleration";
}

/** Nakłada logikę readiness/bólu na dzisiejszą sesję i zwraca decyzję. */
export function applyReadiness(
  session: SessionDay,
  readiness: Readiness | undefined,
  profile: Profile,
): { session: SessionDay; decision: DecisionResult } {
  if (session.isUnavailable) {
    return {
      session,
      decision: {
        headline: "Dzień wolny",
        detail: "Dziś nie masz zaplanowanego treningu.",
        adjustment: null,
      },
    };
  }
  if (!readiness) {
    return {
      session,
      decision: {
        headline: "Uzupełnij check-in gotowości",
        detail: "Zaznacz, jak się dziś czujesz, a dopasujemy intensywność sesji.",
        adjustment: null,
      },
    };
  }

  const r = readiness.overall;
  if (readiness.redFlags?.length || readiness.altersMovement) {
    const external =
      session.dayType === "club" || session.dayType === "match" || session.externalCommitment;
    return {
      session: normalizeSessionCategory({
        ...session,
        dayType: external ? session.dayType : "recovery",
        title: external ? session.title : "Sesja wstrzymana po check-inie",
        durationMin: 0,
        intensity: "niska",
        loadLabelOverride: "Wstrzymaj trening",
        sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
        structuredSections: undefined,
        exercises: undefined,
        secondSession: null,
        slotLabel: null,
        classification: undefined,
        safetyNote: "Wstrzymaj wysiłek i ustal dalsze postępowanie z lekarzem lub fizjoterapeutą.",
      }),
      decision: {
        headline: "Wstrzymaj trening",
        detail: "Nie rozpoczynaj wysiłku przy zgłoszonych objawach.",
        adjustment: "Plan nie zastępuje oceny medycznej.",
      },
    };
  }
  // Sygnały bardzo złego dnia (skala 1–10): zły sen, silne zmęczenie,
  // mocna bolesność lub istotny ból stawów — mogą zadziałać jak readiness 1–3.
  const localizedPain = readiness.jointPain >= 4 && Boolean(readiness.painLocation);
  const dailyPain = readiness.jointPain >= 7;
  const severeSignals =
    readiness.sleep <= 2 ||
    readiness.fatigue >= 9 ||
    readiness.soreness >= 9 ||
    readiness.jointPain >= 8;
  const painOverride = profile.painInjury || dailyPain;

  let factor = 1;
  let adjustment: string | null = null;
  let removeHard = false;
  let keepIntensity = false;
  let recoveryOnly = false;
  let wellnessSafetyHold = false;

  if (r >= 8) {
    // 8–10: pełny plan.
    factor = 1;
    adjustment = null;
  } else if (r >= 6) {
    // 6–7: zachowaj bodziec, zmniejsz TYLKO objętość o 10–20% (bez spadku intensywności).
    factor = 0.85;
    keepIntensity = true;
    adjustment = "Gotowość 6–7: zachowujemy bodziec, zmniejszamy objętość o ok. 10–20%.";
  } else if (r >= 4 && !severeSignals) {
    // 4–5: redukcja ~40%, usunięcie ciężkiej siły, maks. sprintów i wysokiej intensywności.
    factor = 0.6;
    removeHard = true;
    adjustment =
      "Gotowość 4–5: redukcja objętości o ok. 40% i usunięcie ciężkiej siły, maksymalnych sprintów oraz pracy o wysokiej intensywności.";
  } else if (r === 3 && !severeSignals) {
    factor = 0.75;
    removeHard = true;
    adjustment =
      "Gotowość 3/10: zmniejszamy objętość o 25% i usuwamy maksymalne sprinty oraz ciężką pracę.";
  } else {
    // 1–2 lub bardzo zły sen/zmęczenie/ból: zamiana jednostki na regenerację.
    recoveryOnly = true;
    adjustment = severeSignals
      ? "Bardzo słabe samopoczucie (sen/zmęczenie/ból): zamieniamy jednostkę na regenerację."
      : "Gotowość 1–2: tylko regeneracja, mobilność i oddech.";
  }

  // Aktywny ból/uraz zawsze nadpisuje cel treningowy — obowiązuje dla każdej
  // wartości gotowości 1–10 (centralizacja przez PAIN_RISKY_RE).
  if (painOverride) {
    if (severeSignals || r < 4) {
      recoveryOnly = true;
    } else {
      removeHard = true;
      keepIntensity = false;
      // If filtering risky exercises would leave nothing, switch to recovery-only.
      const remaining = session.sections.main.filter((m) => !PAIN_RISKY_RE.test(m.name));
      if (remaining.length === 0) {
        recoveryOnly = true;
      }
    }
  }

  let adjusted: SessionDay = { ...session };

  const cls = session.classification ?? classifySession(session);
  // Trening klubowy i mecz są zobowiązaniami zewnętrznymi — aplikacja ich nie
  // zamienia na regenerację. Może wyłącznie ograniczyć obciążenie lub
  // zalecić wstrzymanie treningu.
  const externalCommitment =
    session.externalCommitment === true || cls.countsAsClub || cls.countsAsMatch;
  const externalKind: "club" | "match" = cls.countsAsMatch ? "match" : "club";
  const externalTitle = externalKind === "match" ? "Mecz" : "Trening klubowy";
  const externalType = externalKind === "match" ? "Mecz" : "Klub";

  // Zakres fitness/wellness: aplikacja nie diagnozuje urazu ani nie układa
  // rehabilitacji. Umiarkowany dyskomfort kończyny dolnej w dniu sprintu
  // wstrzymuje tę sesję zamiast podmieniać ją na pozornie "leczniczy" wariant.
  if (
    localizedPain &&
    !externalCommitment &&
    session.speedGeneratorVersion &&
    readiness.painLocation &&
    LOWER_LIMB_DISCOMFORT.has(readiness.painLocation)
  ) {
    wellnessSafetyHold = true;
    adjusted = {
      ...session,
      dayType: "recovery",
      title: "Sesja wstrzymana po check-inie",
      sessionType: "Przerwa ostrożnościowa",
      goalLabel: "Bezpieczeństwo",
      goalOfSession: "Nie rozpoczynaj dziś zaplanowanej sesji szybkościowej.",
      intensity: "niska",
      durationMin: 0,
      reason:
        "Zgłoszony dyskomfort kończyny dolnej nie pozwala aplikacji fitness dobrać wiarygodnej zamiany sprintu.",
      whyToday: "Decyzja ostrożnościowa na podstawie dzisiejszego check-inu.",
      riskManaged:
        "BallWise nie diagnozuje urazu i nie generuje rehabilitacji ani terminu powrotu.",
      avoidToday: "Bez sprintów, skoków i szybkich zmian kierunku.",
      safetyNote:
        "Jeśli ból utrzymuje się, nasila lub ogranicza normalny ruch, skonsultuj dalszy trening z lekarzem albo fizjoterapeutą.",
      sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
      structuredSections: undefined,
      exercises: undefined,
      secondSession: null,
      slotLabel: null,
      speedGeneratorVersion: undefined,
      speedFamily: undefined,
      speedProgressionWeek: undefined,
      speedRecentPostSkipExerciseIds: undefined,
      classification: undefined,
    };
    adjustment =
      "Dyskomfort 4–6/10 w kończynie dolnej: sesja szybkościowa została wstrzymana; aplikacja nie dobiera rehabilitacji.";
  } else if (recoveryOnly && externalCommitment) {
    const painStop = painOverride || severeSignals;
    adjusted = {
      ...session,
      dayType: externalKind,
      title: externalTitle,
      sessionType: externalType,
      externalCommitment: true,
      loadLabelOverride: painStop ? "Wstrzymaj trening" : "Ogranicz obciążenie",
      secondSession: null,
      slotLabel: null,
      safetyNote: painStop
        ? "Wstrzymaj trening. Skonsultuj się z lekarzem lub fizjoterapeutą. Dziś bez dodatkowego treningu i bez biegania, sprintów, skoków, plyometrii oraz ćwiczeń siłowych z obciążeniem."
        : "Niska gotowość — zgłoś ją trenerowi przed treningiem i ogranicz obciążenie zgodnie z jego decyzją. Przerwij wysiłek, jeśli pojawi się lub nasili ból.",
      sections: painStop
        ? {
            warmup: [],
            main: [],
            accessory: [],
            footballTransfer: [],
            cooldown: [],
          }
        : session.sections,
      structuredSections: painStop ? undefined : session.structuredSections,
      exercises: painStop ? undefined : session.exercises,
    };
    adjustment = painStop
      ? "Wstrzymaj trening i skonsultuj się z lekarzem lub fizjoterapeutą."
      : "Niska gotowość: zgłoś ją trenerowi i ogranicz obciążenie.";
  } else if (externalCommitment && (painOverride || severeSignals)) {
    adjusted = {
      ...session,
      dayType: externalKind,
      title: externalTitle,
      sessionType: externalType,
      externalCommitment: true,
      loadLabelOverride: "Wstrzymaj trening",
      secondSession: null,
      slotLabel: null,
      safetyNote:
        "Wstrzymaj trening. Skonsultuj się z lekarzem lub fizjoterapeutą. Dziś bez dodatkowego treningu i bez biegania, sprintów, skoków, plyometrii oraz ćwiczeń siłowych z obciążeniem.",
      sections: {
        warmup: [],
        main: [],
        accessory: [],
        footballTransfer: [],
        cooldown: [],
      },
      structuredSections: undefined,
      exercises: undefined,
    };
    adjustment = "Wstrzymaj trening i skonsultuj się z lekarzem lub fizjoterapeutą.";
  } else if (externalCommitment && localizedPain) {
    adjusted = {
      ...session,
      dayType: externalKind,
      title: externalTitle,
      sessionType: externalType,
      externalCommitment: true,
      loadLabelOverride: "Ogranicz obciążenie",
      secondSession: null,
      slotLabel: null,
      safetyNote:
        "Zgłoś dyskomfort trenerowi przed rozpoczęciem. BallWise nie diagnozuje urazu ani nie wyznacza powrotu do gry. Przerwij wysiłek, jeśli ból się nasila lub ogranicza ruch; dalszy trening ustal z lekarzem albo fizjoterapeutą.",
    };
    adjustment =
      "Zgłoszony dyskomfort: zachowujemy informację o treningu klubowym, usuwamy dodatkową sesję i oznaczamy konieczność ograniczenia obciążenia z trenerem.";
  } else if (recoveryOnly) {
    const built = recoverySession();
    adjusted = {
      ...session,
      title: "Regeneracja (na podstawie gotowości)",
      intensity: "niska",
      loadLabelOverride: null,
      externalCommitment: false,
      durationMin: built.durationMin,
      sessionType: "Regeneracja",
      sections: {
        warmup: [],
        main: built.main,
        accessory: built.accessory,
        footballTransfer: [],
        cooldown: cooldown(),
      },
      structuredSections: undefined,
      exercises: undefined,
    };
  } else if (session.speedGeneratorVersion && cls.isSpeed && !painOverride && r >= 4 && r < 8) {
    const regenerated = generateFootballSpeedSession({
      profile,
      date: session.date,
      family: speedFamilyFromSession(session),
      readiness: r,
      fatigue: readiness.fatigue,
      progressionWeek:
        session.speedProgressionWeek ?? session.blockWeekNumber ?? session.weekMeta?.blockWeek,
      recentPostSkipExerciseIds: session.speedRecentPostSkipExerciseIds,
    }).session;
    if (regenerated) {
      adjusted = {
        ...session,
        ...regenerated,
        dayName: session.dayName,
        dayOfWeek: session.dayOfWeek,
        mdRelation: session.mdRelation,
        mdLabel: session.mdLabel,
        slotLabel: session.slotLabel,
        weekMeta: session.weekMeta,
        loadTags: session.loadTags,
        dbId: session.dbId,
        dayDbId: session.dayDbId,
        sessionId: session.sessionId,
        secondSession: session.secondSession,
      };
    }
  } else {
    const reduced = reduceSessionDose(session, factor);
    adjusted = {
      ...reduced,
      intensity: removeHard
        ? lowerIntensity(session.intensity, 2)
        : keepIntensity
          ? session.intensity
          : factor < 1
            ? lowerIntensity(session.intensity, 1)
            : session.intensity,
      structuredSections: removeHard ? undefined : reduced.structuredSections,
      sections: {
        ...reduced.sections,
        main: removeHard
          ? painOverride
            ? reduced.sections.main.filter((m) => !PAIN_RISKY_RE.test(m.name))
            : reduced.sections.main.map((m) =>
                PAIN_RISKY_RE.test(m.name)
                  ? safeReplacementForCategory(session.classification?.category)
                  : m,
              )
          : reduced.sections.main,
      },
    };
  }

  // Druga sesja: twardo usuwana tylko przy istotnym bólu. Sama niższa
  // gotowość zmniejsza obciążenie, ale nie tworzy fałszywej blokady.
  if (
    adjusted.secondSession &&
    (readiness.overall <= 3 || !secondSessionAllowedToday(readiness, profile))
  ) {
    adjusted = { ...adjusted, secondSession: null, slotLabel: null };
  } else if (adjusted.secondSession && readiness.overall >= 4 && readiness.overall < 7) {
    adjusted = {
      ...adjusted,
      secondSession: {
        ...reduceSessionDose(adjusted.secondSession, 0.8),
        intensity: lowerIntensity(adjusted.secondSession.intensity, 1),
        reason: `${adjusted.secondSession.reason} Obciążenie drugiej sesji zmniejszono po check-inie.`,
        safetyNote:
          "Niższa gotowość: zmniejszono objętość drugiej sesji; przerwij przy nasileniu bólu.",
      },
    };
  }

  if (painOverride && !externalCommitment) {
    adjustment =
      (adjustment ? adjustment + " " : "") +
      "Zgłoszony ból/uraz: blokujemy intensywne sprinty, ciężkie nogi i ryzykowne plyometrie.";
    adjusted = {
      ...adjusted,
      safetyNote:
        adjusted.safetyNote ??
        "Zatrzymaj się, jeśli ból nasila się lub pojawia się nowy ból. Skonsultuj się z lekarzem lub fizjoterapeutą.",
    };
  }

  // Przy umiarkowanym dyskomforcie nie kasujemy całej jednostki. Przepuszczamy
  // ją przez istniejący walidator ćwiczeń z dokładnie wskazanym obszarem, aby
  // zamienić tylko ruchy, które ten obszar obciążają.
  if (
    localizedPain &&
    !externalCommitment &&
    !recoveryOnly &&
    !wellnessSafetyHold &&
    readiness.painLocation
  ) {
    const painProfile: Profile = {
      ...profile,
      painInjury: true,
      painLocations: Array.from(
        new Set([...(profile.painLocations ?? []), readiness.painLocation]),
      ),
    };
    adjusted = repairUnsafeExercisesForAthleteProfile([adjusted], painProfile).plan[0];
    adjustment =
      (adjustment ? adjustment + " " : "") +
      "Dyskomfort 4–6/10: usunięto ruchy niezgodne z ostrożnościowym filtrem obciążenia.";
    adjusted = {
      ...adjusted,
      safetyNote:
        adjusted.safetyNote ??
        "Plan nie diagnozuje urazu. Przerwij ćwiczenie, jeśli dyskomfort się nasila.",
    };
  }

  return {
    session: normalizeSessionCategory(adjusted),
    decision: {
      headline: externalCommitment
        ? adjusted.loadLabelOverride === "Wstrzymaj trening"
          ? "Wstrzymaj trening"
          : adjusted.loadLabelOverride === "Ogranicz obciążenie"
            ? "Ogranicz obciążenie"
            : externalKind === "match"
              ? "Dziś mecz"
              : "Dziś trening klubowy"
        : `Gotowość ${r}/10 — ${
            r >= 8
              ? "działamy normalnie"
              : r >= 6
                ? "lekka redukcja"
                : r >= 4
                  ? "mocna redukcja"
                  : r === 3
                    ? "redukcja objętości"
                    : "tylko regeneracja"
          }`,
      detail:
        r >= 8
          ? "Czujesz się dobrze — możesz zrealizować zaplanowaną sesję lub lekko progresować."
          : "Dopasowaliśmy dzisiejszą sesję do Twojego samopoczucia.",
      adjustment,
    },
  };
}
