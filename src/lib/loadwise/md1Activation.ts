import type { ExerciseItem, Profile } from "./types";

/**
 * Day before a match (MD-1): the engine picks one short activation. The athlete
 * does not choose it. These are product rules, not a validated physiological
 * model: no hard lower-body work, no maximal sprint, no intense plyometrics,
 * and a short session that leaves the athlete fresh for the match.
 */

export type Md1Variant = "pitch" | "gym" | "home";

export interface Md1Content {
  variant: Md1Variant;
  title: string;
  sessionType: string;
  main: ExerciseItem[];
  accessory: ExerciseItem[];
  footballTransfer: ExerciseItem[];
  durationMin: number;
  goalOfSession: string;
  riskManaged: string;
  avoidToday: string;
}

/** Strength-training history in months: explicit value, else an inferred floor from declared experience. */
function strengthMonths(profile: Profile): number | null {
  if (typeof profile.strengthTrainingMonths === "number" && profile.strengthTrainingMonths >= 0)
    return profile.strengthTrainingMonths;
  if (profile.gymExperienceLevel === "none") return 0;
  if (profile.gymExperienceLevel === "beginner") return 3;
  if (profile.gymExperienceLevel === "intermediate") return 12;
  if (profile.gymExperienceLevel === "advanced") return 24;
  return null;
}

/**
 * Gym activation only for a strength or power goal, with access to a gym and
 * enough recorded strength history to handle light, controlled work. Everything
 * else with a pitch uses the pitch primer; without a pitch the athlete gets a
 * bodyweight activation.
 */
export function chooseMd1Variant(profile: Profile): Md1Variant {
  const months = strengthMonths(profile);
  const gymEligible =
    profile.hasGym === true &&
    (profile.goal === "strength" || profile.goal === "power") &&
    !profile.painInjury &&
    months !== null &&
    months >= 12;
  if (gymEligible) return "gym";
  if (profile.hasPitch !== false) return "pitch";
  return "home";
}

const pitchContent: Omit<Md1Content, "variant"> = {
  title: "Aktywacja przedmeczowa (MD-1)",
  sessionType: "Aktywacja (primer)",
  durationMin: 30,
  goalOfSession: "Odświeżenie układu nerwowego, czucie piłki i pewność przed meczem.",
  riskManaged:
    "Tylko submaksymalne zrywy (ok. 80%) i lekka praca — kończysz świeży, bez zmęczenia.",
  avoidToday: "Bez ciężkich nóg, twardych sprintów i kondycyjnego.",
  main: [
    {
      name: "Mobilność i aktywacja",
      prescription: "8 min: biodra, kostki, pośladki",
      cue: "Płynnie, pełen zakres.",
    },
    {
      name: "Czucie piłki",
      prescription: "8 min podań i przyjęć w spokojnym tempie",
      cue: "Miękki kontakt, głowa do góry.",
    },
    {
      name: "Krótkie zrywy submaksymalne",
      prescription: "3–5 × 10–15 m na ok. 80%",
      rest: "pełna przerwa",
      cue: "Płynne, kontrolowane przyspieszenie — nie maksymalne.",
    },
    {
      name: "Akcje pewności siebie",
      prescription: "5 min ulubionych zagrań / wykończeń",
      cue: "Pewnie i swobodnie, kończysz świeży.",
    },
  ],
  accessory: [],
  footballTransfer: [],
};

const gymContent: Omit<Md1Content, "variant"> = {
  title: "Aktywacja przed meczem (siłownia)",
  sessionType: "Aktywacja (primer)",
  durationMin: 25,
  goalOfSession: "Rozgrzać wzorce ruchu siłowego bez obciążania nóg przed meczem.",
  riskManaged: "Bez ciężaru lub z lekką gumą, bez serii do zmęczenia. Przerwy pełne.",
  avoidToday: "Bez ciężkiej siły, skoków i sprintów.",
  main: [
    { name: "Rozciąganie zginacza biodra w półklęku", prescription: "2 × 30 s / strona", cue: "Płynnie, bez bólu." },
    {
      name: "Most biodrowy",
      prescription: "2 × 8 bez obciążenia",
      rest: "60 s",
      cue: "Pauza w górze, napięte pośladki.",
    },
    {
      name: "Przysiad z masą ciała",
      prescription: "2 × 6, RPE 4",
      rest: "60 s",
      cue: "Tempo kontrolowane, bez ciężaru.",
    },
    {
      name: "Wiosłowanie gumą",
      prescription: "2 × 10",
      rest: "60 s",
      cue: "Łopatki w dół i do tyłu.",
    },
    {
      name: "Deska z napięciem",
      prescription: "2 × 20 s",
      rest: "45 s",
      cue: "Prosta linia ciała.",
    },
  ],
  accessory: [],
  footballTransfer: [],
};

const homeContent: Omit<Md1Content, "variant"> = {
  title: "Aktywacja przed meczem (bez sprzętu)",
  sessionType: "Aktywacja (primer)",
  durationMin: 20,
  goalOfSession: "Lekko rozruszać ciało i przygotować się do meczu bez obciążenia nóg.",
  riskManaged: "Wyłącznie masa ciała i spokojne tempo. Przerwy pełne.",
  avoidToday: "Bez skoków, sprintów i ciężkiej pracy nóg.",
  main: [
    { name: "Rozciąganie zginacza biodra w półklęku", prescription: "2 × 30 s / strona", cue: "Płynnie, bez bólu." },
    { name: "Most biodrowy", prescription: "2 × 8", rest: "45 s", cue: "Pauza w górze." },
    {
      name: "Przysiad z masą ciała",
      prescription: "2 × 6, RPE 4",
      rest: "45 s",
      cue: "Tempo kontrolowane.",
    },
    {
      name: "Deska z napięciem",
      prescription: "2 × 20 s",
      rest: "45 s",
      cue: "Prosta linia ciała.",
    },
  ],
  accessory: [],
  footballTransfer: [],
};

export function md1Content(profile: Profile): Md1Content {
  const variant = chooseMd1Variant(profile);
  const base = variant === "pitch" ? pitchContent : variant === "gym" ? gymContent : homeContent;
  return { variant, ...base };
}
