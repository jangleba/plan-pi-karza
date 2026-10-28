import type {
  Profile,
  SessionDay,
  Readiness,
  ExerciseItem,
  Intensity,
  TrainingSection,
} from "./types";
import { normalizeSessionCategory, classifySession } from "./sessionClassification";
import { repairUnsafeExercisesForAthleteProfile } from "./athleteProfileRepair";
import { reduceSessionDose } from "./doseAdjustment";
import {
  generateFootballSpeedSession,
  persistedFootballSpeedFamily,
  type FootballSpeedFamily,
} from "./footballSpeedSessionEngine";

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
    adjusted = {
      ...reduceSessionDose(session, factor),
      intensity: removeHard
        ? lowerIntensity(session.intensity, 2)
        : keepIntensity
          ? session.intensity
          : factor < 1
            ? lowerIntensity(session.intensity, 1)
            : session.intensity,
      structuredSections: removeHard
        ? undefined
        : reduceSessionDose(session, factor).structuredSections,
      sections: {
        ...reduceSessionDose(session, factor).sections,
        main: removeHard
          ? painOverride
            ? reduceSessionDose(session, factor).sections.main.filter(
                (m) => !PAIN_RISKY_RE.test(m.name),
              )
            : reduceSessionDose(session, factor).sections.main.map((m) =>
                PAIN_RISKY_RE.test(m.name)
                  ? safeReplacementForCategory(session.classification?.category)
                  : m,
              )
          : reduceSessionDose(session, factor).sections.main,
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
