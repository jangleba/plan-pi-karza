import type {
  Profile,
  SessionDay,
  ExerciseItem,
  Intensity,
  DayType,
  Readiness,
} from "./types";
import {
  warsawToday,
  isoDate,
  addDays,
  
  isoDayOfWeek,
  dayName,
  GOAL_LABELS,
} from "./labels";

export const PLAN_ENGINE_VERSION = "loadwise-hard-category-quotas-v8";
const MAX_SPRINT_M = 240; // maksymalna objętość sprintów wysokiej intensywności na sesję

function isYoung(age: number): boolean {
  return age >= 13 && age <= 15;
}

function warmup(): ExerciseItem[] {
  return [
    {
      name: "Trucht i mobilizacja",
      prescription: "5 min, niska intensywność",
      cue: "Spokojny oddech, stopniowo podnoś tętno.",
    },
    {
      name: "Rozgrzewka dynamiczna (RAMP)",
      prescription: "wykroki, krążenia, otwieranie bioder — 6 min",
      cue: "Pełen zakres ruchu, kontroluj tułów.",
    },
    {
      name: "Aktywacja z piłką",
      prescription: "lekkie podania i prowadzenie — 4 min",
      cue: "Miękki pierwszy kontakt, głowa do góry.",
    },
  ];
}

function cooldown(): ExerciseItem[] {
  return [
    { name: "Trucht wyciszający", prescription: "3–5 min, bardzo lekko" },
    {
      name: "Rozciąganie statyczne",
      prescription: "łydki, uda, biodra — 5 min",
    },
    { name: "Oddech przeponowy", prescription: "2 min, spokojny rytm" },
  ];
}

interface Built {
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
}

function buildByGoal(profile: Profile): Built {
  const young = isYoung(profile.age);
  const sprintCap = young ? Math.min(160, MAX_SPRINT_M) : MAX_SPRINT_M;

  switch (profile.goal) {
    case "speed":
      return {
        title: "Sesja szybkości i przyspieszeń",
        sessionType: "Szybkość",
        intensity: "wysoka",
        durationMin: young ? 50 : 60,
        goalOfSession:
          "Rozwój przyspieszenia i prędkości maksymalnej przy wysokiej jakości każdego powtórzenia.",
        riskManaged: `Limit objętości sprintów ${sprintCap} m i pełne przerwy chronią mechanikę i mięśnie tylne uda.`,
        avoidToday:
          "Nie łącz dziś z ciężkim treningiem nóg ani twardym kondycyjnym. Przerwij przy spadku jakości.",
        main: [
          {
            name: "Sprinty z piłką (akceleracja)",
            prescription: `6 × 20 m, pełna przerwa — łącznie ${Math.min(120, sprintCap)} m`,
            rest: "90–120 s między powtórzeniami",
            cue: "Mocny pierwszy krok, niski tułów na starcie.",
            easier: "Skróć do 6 × 15 m lub zmniejsza intensywność.",
            harder: young ? undefined : "Dodaj start z reakcji na sygnał.",
          },
          {
            name: "Sprinty liniowe",
            prescription: `${young ? 4 : 6} × 20 m, przerwa 90 s — łącznie ${Math.min(young ? 80 : 120, sprintCap)} m`,
            rest: "90 s",
            cue: "Pełen wymach ramion, nie spinaj barków.",
            easier: "Zredukuj liczbę powtórzeń o połowę.",
            harder: young ? undefined : "Sprinty lotne 2 × 20 m z najazdem.",
          },
        ],
        accessory: [
          {
            name: "Zwody i zmiana kierunku",
            prescription: "5 × przejście slalomu z piłką",
            cue: "Niskie biodra, krótkie kroki w zwrocie.",
          },
        ],
        footballTransfer: [
          {
            name: "Przyjęcie–zwrot–przyspieszenie",
            prescription: "6 powtórzeń: przyjęcie tyłem, zwrot, 10 m sprintu",
            cue: "Pierwszy kontakt w kierunku biegu.",
          },
        ],
      };
    case "strength":
      return {
        title: young ? "Sesja siły bazowej" : "Sesja siły piłkarskiej",
        sessionType: "Siła",
        intensity: young ? "umiarkowana" : "wysoka",
        durationMin: 55,
        goalOfSession: young
          ? "Nauka wzorców ruchowych i siła bazowa z masą ciała oraz kontrola tułowia."
          : "Rozwój siły dolnych partii i stabilizacji z zapasem 1–3 powtórzeń (RIR).",
        riskManaged: young
          ? "Bez ciężkiego treningu dorosłych i bez maksymalnych prób — priorytet to technika."
          : "Kontrolowany ciężar i RIR ograniczają ryzyko przeciążenia.",
        avoidToday:
          "Nie planuj dziś dodatkowo twardych sprintów ani plyometrii. Bez ciężkich nóg na 48 h przed meczem.",
        main: young
          ? [
              {
                name: "Przysiad z masą ciała",
                prescription: "4 × 10, technika",
                rest: "60 s",
                cue: "Kolana w linii stóp, pięty na ziemi.",
                easier: "Przysiad do krzesła.",
                harder: "Przysiad z lekkim obciążeniem (gdy technika pewna).",
              },
              {
                name: "Wykroki w miejscu",
                prescription: "3 × 8 na nogę",
                rest: "45 s",
                cue: "Tułów pionowo, kolano nie ucieka do środka.",
                easier: "Mniejszy zakres / przytrzymaj się podpory.",
              },
              {
                name: "Plank",
                prescription: "3 × 30 s",
                cue: "Napięty brzuch, biodra w linii.",
                easier: "Plank z kolan.",
                harder: "Plank z unoszeniem nogi.",
              },
            ]
          : [
              {
                name: "Przysiad",
                prescription: "4 × 6, ciężar kontrolowany",
                rest: "120 s",
                cue: "Napnij tułów przed zejściem, pełny zakres.",
                easier: "Przysiad goblet z lżejszym ciężarem.",
                harder: "Tempo 3-1-1 lub +5% ciężaru.",
              },
              {
                name: "Martwy ciąg rumuński",
                prescription: "3 × 8",
                rest: "90 s",
                cue: "Biodra w tył, plecy proste, czuj tylne uda.",
                easier: "Mniejszy zakres / lżejszy ciężar.",
              },
              {
                name: "Wykrok bułgarski",
                prescription: "3 × 8 na nogę",
                rest: "75 s",
                cue: "Pion tułowia, stabilne kolano.",
                easier: "Wykrok w miejscu.",
              },
            ],
        accessory: [
          {
            name: "Stabilizacja core",
            prescription: "3 × 40 s plank boczny",
            cue: "Linia ciała prosta, biodra wysoko.",
          },
        ],
        footballTransfer: [],
      };
    case "endurance":
      return {
        title: "Interwały piłkarskie kontrolowane",
        sessionType: "Wytrzymałość",
        intensity: "umiarkowana",
        durationMin: young ? 45 : 55,
        goalOfSession:
          "Poprawa wytrzymałości specjalnej i zdolności do powtarzanego wysiłku z piłką.",
        riskManaged:
          "Kontrolowane interwały zamiast bezsensownej objętości — bez wyczerpania na ślepo.",
        avoidToday:
          "Bez twardych interwałów na 48 h przed meczem (MD-2/MD-1). Bez długich biegów na zmęczeniu przed meczem.",
        main: [
          {
            name: "Interwały biegowe z piłką",
            prescription: `${young ? 6 : 8} × 1 min bieg / 1 min trucht`,
            rest: "1 min trucht",
            cue: "Równe tempo, kontroluj oddech.",
            easier: "Skróć do 4 powtórzeń.",
            harder: young ? undefined : "Skróć przerwę do 45 s.",
          },
          {
            name: "Gra na małym polu (symulacja)",
            prescription: "4 × 3 min, przerwa 2 min",
            rest: "2 min",
            cue: "Aktywne ustawianie się, szybka decyzja.",
          },
        ],
        accessory: [
          {
            name: "Prowadzenie piłki tempem",
            prescription: "6 × 40 m luźno",
            cue: "Luźne barki, miękkie kontakty.",
          },
        ],
        footballTransfer: [
          {
            name: "Obieg pozycyjny z podaniem",
            prescription: "4 × bieg na pozycję + podanie",
            cue: "Skan przed przyjęciem.",
          },
        ],
      };
    case "power":
      return buildPower(profile);
    case "agility":
      return buildCod(profile);
    case "general":
      return buildByGoal({ ...profile, goal: profile.hasGym ? "strength" : "speed" });
    case "mobility":
      return {
        title: "Sesja mobilności i techniki",
        sessionType: "Mobilność",
        intensity: "niska",
        durationMin: 40,
        goalOfSession:
          "Poprawa zakresu ruchu i jakości pierwszego kontaktu bez generowania zmęczenia.",
        riskManaged: "Niska intensywność — bezpieczne uzupełnienie obciążenia.",
        avoidToday: "Bez zrywów maksymalnych i ciężkich obciążeń.",
        main: [
          {
            name: "Mobilność bioder i kostek",
            prescription: "6 ćwiczeń × 8 powtórzeń",
            cue: "Powoli, kontroluj końcowy zakres.",
          },
          {
            name: "Technika podań obunóż",
            prescription: "10 min przy ścianie / z partnerem",
            cue: "Równo obie nogi, celne podanie.",
            harder: "Podanie po przyjęciu kierunkowym.",
          },
        ],
        accessory: [
          {
            name: "Praca nad pierwszym kontaktem",
            prescription: "8 min",
            cue: "Przyjęcie w ruch, głowa do góry.",
          },
        ],
        footballTransfer: [],
      };
    case "return":
      return {
        title: "Powrót do rytmu — sesja kontrolowana",
        sessionType: "Powrót do rytmu",
        intensity: "niska",
        durationMin: 40,
        goalOfSession:
          "Bezbolesny powrót do ruchu i lekka praca z piłką bez zrywów.",
        riskManaged:
          "Progresja jednej zmiennej naraz, brak sprintów/COD przy bólu kończyn dolnych.",
        avoidToday:
          "Bez sprintów, skoków, gwałtownych zmian kierunku i ciężkich nóg. Aplikacja nie diagnozuje ani nie leczy.",
        main: [
          {
            name: "Lekki bieg ciągły",
            prescription: "10 min, tętno komfortowe",
            cue: "Tempo konwersacyjne, zero bólu.",
            easier: "Marszobieg.",
          },
          {
            name: "Technika i podania",
            prescription: "10 min, bez zrywów",
            cue: "Spokojne tempo, kontrola.",
          },
        ],
        accessory: [
          { name: "Lekka koordynacja w drabince", prescription: "5 min" },
        ],
        footballTransfer: [],
      };
    case "matchready":
    default:
      return {
        title: "Sesja gotowości meczowej",
        sessionType: "Gotowość meczowa",
        intensity: "umiarkowana",
        durationMin: 50,
        goalOfSession:
          "Ostrość piłkarska i akcje meczowe przy umiarkowanym obciążeniu.",
        riskManaged: `Niska objętość zrywów (limit ${sprintCap} m) utrzymuje świeżość.`,
        avoidToday: "Bez dużej objętości twardych sprintów i ciężkich nóg.",
        main: [
          {
            name: "Aktywacja szybkościowa",
            prescription: `4 × 15 m przyspieszeń — łącznie ${Math.min(60, sprintCap)} m`,
            rest: "60 s",
            cue: "Dynamiczny start, kontrola.",
          },
          {
            name: "Sytuacje meczowe 1v1 / podanie-odbiór",
            prescription: "12 min",
            cue: "Decyzja przed przyjęciem.",
          },
          {
            name: "Wykończenia akcji",
            prescription: "8 min, średnie tempo",
            cue: "Spokojne wykończenie, celność.",
          },
        ],
        accessory: [
          { name: "Koordynacja i zwinność", prescription: "6 min drabinka" },
        ],
        footballTransfer: [
          {
            name: "Akcja pozycyjna",
            prescription: "8 min wg roli na boisku",
            cue: "Realizuj zadania swojej pozycji.",
          },
        ],
      };
  }
}

function md1Session(profile: Profile): Built {
  return {
    title: "Aktywacja przedmeczowa (MD-1)",
    sessionType: "Aktywacja (primer)",
    intensity: "niska",
    durationMin: 30,
    goalOfSession:
      "Odświeżenie układu nerwowego, czucie piłki i pewność przed meczem.",
    riskManaged:
      "Tylko submaksymalne zrywy i lekka praca — kończysz świeży, bez zmęczenia.",
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
}

function recoverySession(): Built {
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
        name: "Oddech i wyciszenie (downregulation)",
        prescription: "5 min wydłużony wydech",
        cue: "Nos–wdech, długi wydech, rozluźnij barki.",
      },
    ],
    accessory: [],
    footballTransfer: [],
  };
}

// ---------- Drugie sesje (lekkie, ale konkretne i sensowne) ----------
// Druga sesja nigdy nie jest pustym wypełniaczem: ma typ, cel, czas,
// intensywność i konkretne ćwiczenia. Dobiera się ją tak, by uzupełniała
// sesję główną (np. AM siłownia → PM technika piłki), nie dokładając
// zmęczenia.

/** PM: technika piłki — uzupełnia dzień siły/mocy/wytrzymałości. */
function secondBallTechnique(): Built {
  return {
    title: "Technika: pierwszy kontakt + podania pod presją (PM)",
    sessionType: "Technika piłki (lekka)",
    intensity: "niska",
    durationMin: 25,
    goalOfSession:
      "Doskonalenie pierwszego kontaktu, skanowania i decyzji przy niskim obciążeniu fizycznym.",
    riskManaged:
      "Niska intensywność — bez zrywów maksymalnych i ciężkich nóg w drugiej sesji.",
    avoidToday: "Bez sprintów i ciężkich obciążeń jako druga sesja dnia.",
    main: [
      {
        name: "Pierwszy kontakt i skanowanie",
        prescription: "10 min przyjęć kierunkowych",
        rest: "luźno",
        cue: "Skan przed przyjęciem, kontakt w kierunku gry.",
      },
      {
        name: "Podania pod presją czasu",
        prescription: "10 min, różne dystanse",
        rest: "luźno",
        cue: "Szybka decyzja, celność przed siłą.",
        harder: "Co drugie powtórzenie słabszą nogą.",
      },
    ],
    accessory: [],
    footballTransfer: [
      {
        name: "Akcja pozycyjna w spokojnym tempie",
        prescription: "5 min wg roli na boisku",
        cue: "Realizuj zadania swojej pozycji.",
      },
    ],
  };
}

/** PM: prehab i mobilność — uzupełnia dzień szybkości/COD. */
function secondMobilityPrehab(): Built {
  return {
    title: "Prehab: biodra, przywodziciele, hamstring (PM)",
    sessionType: "Prehab / mobilność (lekka)",
    intensity: "niska",
    durationMin: 20,
    goalOfSession:
      "Wzmocnienie odporności bioder, przywodzicieli, ścięgien udowych i łydek oraz jakość ruchu.",
    riskManaged: "Lekka praca prewencyjna — bez przeciążenia po sesji głównej.",
    avoidToday: "Bez intensywnych zrywów i ciężkich obciążeń.",
    main: [
      {
        name: "Mobilność bioder i kostek",
        prescription: "8 min, kontrolowany zakres",
        cue: "Powoli, kontroluj końcowy zakres ruchu.",
      },
      {
        name: "Copenhagen (przywodziciele) — lekko",
        prescription: "2 × 6 na stronę",
        rest: "45 s",
        cue: "Kontrola, bez bólu.",
        easier: "Wersja z kolan.",
      },
      {
        name: "Nordic curl ekscentryczny — lekko",
        prescription: "2 × 4",
        rest: "60 s",
        cue: "Powolne opuszczanie, pełna kontrola.",
        easier: "Mniejszy zakres / podpora.",
      },
      {
        name: "Wspięcia na łydki",
        prescription: "2 × 12",
        rest: "45 s",
        cue: "Pełen zakres, pauza w górze.",
      },
    ],
    accessory: [],
    footballTransfer: [],
  };
}

/** PM: czucie piłki — najlżejszy wariant, do dni klubowych. */
function secondFootballTouch(): Built {
  return {
    title: "Technika: czucie piłki + podania o ścianę (PM)",
    sessionType: "Czucie piłki (lekka)",
    intensity: "niska",
    durationMin: 20,
    goalOfSession:
      "Utrzymanie czucia piłki i jakości pierwszego kontaktu bez generowania zmęczenia.",
    riskManaged:
      "Bardzo niska intensywność — bezpieczne uzupełnienie dnia klubowego.",
    avoidToday: "Bez zrywów i obciążeń. Kończysz świeży.",
    main: [
      {
        name: "Żonglerka i prowadzenie",
        prescription: "8 min, spokojnie",
        cue: "Miękkie kontakty, obie nogi.",
      },
      {
        name: "Podania o ścianę / odbojnik",
        prescription: "10 min, różne kierunki i dystanse",
        cue: "Przyjęcie kierunkowe, skan przed kontaktem.",
        harder: "Przyjęcie na słabszą nogę i podanie pierwszym kontaktem.",
      },
    ],
    accessory: [],
    footballTransfer: [],
  };
}

/** Dobiera drugą sesję uzupełniającą sesję główną wg celu (dobre pary). */
function pickSecondForTraining(profile: Profile): Built {
  switch (profile.goal) {
    case "strength":
    case "power":
    case "endurance":
    case "general":
      // AM ciężka / rozwojowa → PM lekka technika piłki
      return secondBallTechnique();
    case "speed":
    case "agility":
      // AM sprint/COD → PM mobilność i prehab (ochrona tylnej taśmy)
      return secondMobilityPrehab();
    default:
      return secondBallTechnique();
  }
}

const INTENSITY_ORDER: Intensity[] = ["niska", "umiarkowana", "wysoka"];

function lowerIntensity(i: Intensity, steps: number): Intensity {
  const idx = Math.max(0, INTENSITY_ORDER.indexOf(i) - steps);
  return INTENSITY_ORDER[idx];
}

function applyPainSafety(
  built: Built,
  profile: Profile,
): {
  built: Built;
  note: string | null;
} {
  if (!profile.painInjury) return { built, note: null };
  const safeMain = built.main.map((m) => {
    if (/sprint|zryw|przyspiesz|przysiad|martwy|wykrok|skok|plyo/i.test(m.name)) {
      return {
        name: "Lekka technika piłkarska (zastąpione)",
        prescription: "spokojne podania i prowadzenie — bez bólu",
        cue: "Zero bólu, kontroluj tempo.",
      };
    }
    return m;
  });
  return {
    built: {
      ...built,
      title: "Sesja z ograniczeniami (ból/uraz)",
      sessionType: "Sesja ograniczona (ból/uraz)",
      intensity: "niska",
      durationMin: Math.min(built.durationMin, 35),
      main: safeMain,
      footballTransfer: [],
    },
    note: "Zgłoszony ból/uraz — usunięto sprinty, ciężkie obciążenia nóg i ryzykowne plyometrie. Skonsultuj się ze specjalistą, jeśli ból się utrzymuje.",
  };
}

function youthSafety(built: Built, profile: Profile, note: string | null) {
  if (!isYoung(profile.age)) return { built, note };
  const filtered = built.main.filter(
    (m) => !/martwy ciąg|bułgarski/i.test(m.name),
  );
  const newNote =
    note ??
    "Wiek 13–15: ograniczona objętość, bez ciężkiego treningu dorosłych i ryzykownych łączeń siła/plyometria.";
  return {
    built: {
      ...built,
      main: filtered.length ? filtered : built.main,
      intensity: lowerIntensity(
        built.intensity,
        built.intensity === "wysoka" ? 1 : 0,
      ),
    },
    note: note ? note : newNote,
  };
}

/** Stały dzień meczu w tygodniu (1=pon..7=niedz) lub null. */
function matchWeekday(profile: Profile): number | null {
  return typeof profile.usualMatchDay === "number"
    ? profile.usualMatchDay
    : null;
}

/** Czy dany dzień jest dniem meczu (jednorazowa data lub stały dzień tygodnia). */
function isMatchDay(date: Date, profile: Profile): boolean {
  if (profile.matchDate && isoDate(date) === profile.matchDate) return true;
  const mw = matchWeekday(profile);
  if (mw !== null && isoDayOfWeek(date) === mw) return true;
  return false;
}

/** Liczba dni do najbliższego meczu (0=dziś, 1..7), null jeśli brak w oknie. */
function daysToMatch(date: Date, profile: Profile): number | null {
  for (let i = 0; i <= 7; i++) {
    if (isMatchDay(addDays(date, i), profile)) return i;
  }
  return null;
}

/** Liczba dni od ostatniego meczu (1..7), null jeśli brak w oknie. */
function daysSinceMatch(date: Date, profile: Profile): number | null {
  for (let i = 1; i <= 7; i++) {
    if (isMatchDay(addDays(date, -i), profile)) return i;
  }
  return null;
}

function mdLabelFor(date: Date, profile: Profile): string | null {
  const fwd = daysToMatch(date, profile);
  if (fwd === 0) return "MD";
  if (fwd !== null && fwd >= 1 && fwd <= 6) return `MD-${fwd}`;
  const back = daysSinceMatch(date, profile);
  if (back !== null && back >= 1 && back <= 6) return `MD+${back}`;
  return null;
}



function builtToSecondSession(
  built: Built,
  date: Date,
  profile: Profile,
): SessionDay {
  return {
    generatorVersion: PLAN_ENGINE_VERSION,
    date: isoDate(date),
    dayName: dayName(date),
    dayType:
      built.sessionType.toLowerCase().includes("regener") &&
      !built.sessionType.toLowerCase().includes("prehab")
        ? "recovery"
        : "training",
    title: built.title,
    goalLabel: built.sessionType,
    intensity: built.intensity,
    durationMin: built.durationMin,
    reason:
      "Druga, lekka sesja dnia — dokładana tylko wtedy, gdy jest bezpieczna i sensowna.",
    safetyNote:
      "Druga sesja jest zawsze lekka: mobilność, aktywacja, czucie piłki, prehab lub lekka technika.",
    whyToday:
      "Twój profil pozwala na dwie sesje dziennie, a dzisiejszy dzień spełnia warunki bezpieczeństwa.",
    sessionType: built.sessionType,
    goalOfSession: built.goalOfSession,
    riskManaged: built.riskManaged,
    avoidToday: built.avoidToday,
    mdLabel: mdLabelFor(date, profile),
    slotLabel: "Druga sesja (lekka)",
    sections: {
      warmup: [],
      main: built.main,
      accessory: built.accessory,
      footballTransfer: built.footballTransfer,
      cooldown: [],
    },
    secondSession: null,
  };
}

/** Zwraca lekką drugą sesję dnia lub null, zgodnie z regułami bezpieczeństwa. */
function buildSecondSession(
  primaryType: DayType,
  date: Date,
  profile: Profile,
): SessionDay | null {
  const mode = profile.doubleSessionsAllowed;
  if (mode === "no") return null;
  if (profile.painInjury) return null;
  // Nigdy w dniu meczu ani MD-1
  if (primaryType === "match" || primaryType === "md-1") return null;
  // Nie dokładaj drugiej sesji do dnia regeneracji
  if (primaryType === "recovery") return null;
  // Mecz w ciągu 48 h (dziś, jutro, pojutrze)
  const diff = daysToMatch(date, profile);
  if (diff !== null && diff >= 0 && diff <= 2) return null;

  const young = isYoung(profile.age);

  if (primaryType === "club") {
    // Dzień klubowy to już ekspozycja piłkarska — druga sesja to przede
    // wszystkim prehab/mobilność (dobra para: klub + krótki prehab), tylko
    // czasem lekki akcent techniczny. Nie dokładamy kolejnej pełnej piłki.
    const choices = [
      secondMobilityPrehab(),
      secondMobilityPrehab(),
      secondFootballTouch(),
    ];
    const pick = choices[date.getDate() % choices.length];
    return builtToSecondSession(pick, date, profile);
  }

  // Dzień własnego treningu
  if (primaryType === "training") {
    // "light_only" dokłada drugie sesje tylko w dni klubowe; tu nic.
    if (mode === "light_only") return null;
    // "yes_if_safe": druga sesja uzupełnia bodziec główny wg celu,
    // nigdy sprint + ciężkie nogi tego samego dnia.
    const built = young ? secondMobilityPrehab() : pickSecondForTraining(profile);
    return builtToSecondSession(built, date, profile);
  }

  return null;
}

// ---------- Sensowne alternatywy dla biernej regeneracji ----------

/** MD-2: ostrość piłkarska / lekka szybkość — kończysz świeży na mecz. */
function buildSharpness(profile: Profile): Built {
  const young = isYoung(profile.age);
  const sprintCap = young ? Math.min(160, MAX_SPRINT_M) : MAX_SPRINT_M;
  return {
    title: "Ostrość piłkarska (MD-2)",
    sessionType: "Ostrość / lekka szybkość",
    intensity: "umiarkowana",
    durationMin: young ? 35 : 40,
    goalOfSession:
      "Ostrość piłkarska, lekka szybkość i aktywacja — kończysz świeży na mecz.",
    riskManaged: `Niska objętość zrywów (≤ ${Math.min(60, sprintCap)} m) i krótki czas chronią świeżość na mecz.`,
    avoidToday:
      "Bez twardego kondycyjnego, dużej objętości sprintów i ciężkich nóg dwa dni przed meczem.",
    main: [
      {
        name: "Lekka szybkość / aktywacja",
        prescription: `4 × 15 m przyspieszeń na ~85% — łącznie ${Math.min(60, sprintCap)} m`,
        rest: "60–90 s",
        cue: "Dynamicznie, ale kontrolowanie — bez maksymalnych zrywów.",
      },
      {
        name: "Pierwszy kontakt i skanowanie",
        prescription: "10 min przyjęć kierunkowych w tempie",
        cue: "Skan przed przyjęciem, kontakt w ruch.",
      },
      {
        name: "Akcja pozycyjna / wykończenia",
        prescription: "10 min wg roli, średnie tempo",
        cue: "Decyzja przed przyjęciem, celność ponad siłę.",
      },
    ],
    accessory: [
      {
        name: "Aktywacja i mobilność",
        prescription: "6 min: biodra, pośladki, kostki",
        cue: "Pełen zakres, spokojny oddech.",
      },
    ],
    footballTransfer: [
      {
        name: "Akcja meczowa wg pozycji",
        prescription: "6 min, niska objętość",
        cue: "Realizuj zadania swojej pozycji.",
      },
    ],
  };
}

/** MD+1: lekka kompensacja po meczu (zamiast biernej regeneracji). */
function buildCompensation(_profile: Profile): Built {
  return {
    title: "Sesja kompensacyjna (MD+1)",
    sessionType: "Kompensacja / niska objętość",
    intensity: "niska",
    durationMin: 30,
    goalOfSession:
      "Lekka praca po meczu: rozruszanie, technika i kontrolowany bodziec dla grających mało.",
    riskManaged:
      "Niska objętość i intensywność — bez dokładania zmęczenia po meczu.",
    avoidToday:
      "Bez twardych sprintów, ciężkich nóg i kondycyjnego dzień po meczu.",
    main: [
      {
        name: "Lekki bieg / rower",
        prescription: "10 min, tempo konwersacyjne",
        cue: "Rozruszanie, zero forsowania.",
        easier: "Marszobieg.",
      },
      {
        name: "Technika i podania",
        prescription: "12 min spokojnych przyjęć i podań",
        cue: "Miękki kontakt, kontrola, obie nogi.",
      },
    ],
    accessory: [
      {
        name: "Mobilność i prehab",
        prescription: "8 min: biodra, przywodziciele, łydki",
        cue: "Kontrola, bez bólu.",
      },
    ],
    footballTransfer: [],
  };
}

/** Dzień po większym obciążeniu: lżejszy, sensowny bodziec zamiast regeneracji. */
function buildLightAlternative(profile: Profile): Built {
  const young = isYoung(profile.age);
  const sprintCap = young ? Math.min(160, MAX_SPRINT_M) : MAX_SPRINT_M;
  switch (profile.goal) {
    case "speed":
      return {
        title: "Krótka ekspozycja szybkościowa",
        sessionType: "Szybkość / technika biegu",
        intensity: "umiarkowana",
        durationMin: 25,
        goalOfSession:
          "Utrzymanie ekspozycji na szybkość bez generowania zmęczenia.",
        riskManaged: `Bardzo niska objętość zrywów (≤ ${Math.min(70, sprintCap)} m) po cięższym dniu.`,
        avoidToday:
          "Bez dużej objętości sprintów i ciężkich nóg dzień po obciążeniu.",
        main: [
          {
            name: "Przyspieszenia",
            prescription: "3 × 10 m — łącznie 30 m",
            rest: "90 s",
            cue: "Mocny pierwszy krok, jakość ponad ilość.",
          },
          {
            name: "Budowanie prędkości",
            prescription: "2 × 20 m progresywnie",
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
      };
    case "strength":
      return {
        title: "Podtrzymanie siły",
        sessionType: "Siła (podtrzymanie)",
        intensity: "umiarkowana",
        durationMin: 30,
        goalOfSession:
          "Utrzymanie siły i odporności bez gonienia za zmęczeniem.",
        riskManaged: "Mała objętość, 2–3 RIR — bez przeciążenia po cięższym dniu.",
        avoidToday: "Bez maksymalnych prób i dużej objętości.",
        main: [
          {
            name: young ? "Przysiad z masą ciała" : "Przysiad / split squat",
            prescription: "2 × 6",
            rest: "90 s",
            cue: "Kontrola, technika ponad ciężar.",
          },
          {
            name: "Martwy ciąg rumuński (lekko)",
            prescription: "2 × 8",
            rest: "90 s",
            cue: "Biodra w tył, plecy proste.",
            easier: "Mniejszy zakres / lżejszy ciężar.",
          },
          {
            name: "Core i prehab",
            prescription: "2 × 40 s plank + przywodziciele",
            cue: "Napięcie tułowia, kontrola.",
          },
        ],
        accessory: [],
        footballTransfer: [],
      };
    case "endurance":
      return {
        title: "Lekki trening tlenowy",
        sessionType: "Wytrzymałość (lekka)",
        intensity: "niska",
        durationMin: 30,
        goalOfSession: "Lekka praca tlenowa wspierająca bazę i regenerację.",
        riskManaged:
          "Tempo konwersacyjne — bez twardych interwałów po cięższym dniu.",
        avoidToday: "Bez twardych interwałów i długich biegów na zmęczeniu.",
        main: [
          {
            name: "Ciągły bieg / rower",
            prescription: "20 min, tętno komfortowe",
            cue: "Spokojne, równe tempo.",
            easier: "Marszobieg.",
          },
          {
            name: "Prowadzenie piłki tempem",
            prescription: "6 × 40 m luźno",
            cue: "Miękkie kontakty, luźne barki.",
          },
        ],
        accessory: [],
        footballTransfer: [],
      };
    default:
      return buildPrehab(profile);
  }
}

// ============================================================
// Tygodniowa dystrybucja bodźców (week stimulus planner)
// Cel główny zwiększa priorytet danego bodźca, ale plan zawsze
// zachowuje minimum: siła/moc, sprint, bieganie, piłka, prehab.
// ============================================================

type Stimulus =
  | "strength_base" // technika / baza siły
  | "strength" // główna siła (gym lub bazowa)
  | "strength_deload" // podtrzymanie siły w deloadzie
  | "power" // moc/siła eksplozywna (plyo jako element, nie osobny trening)
  | "sprint" // sprint/akceleracja
  | "speed_exposure" // krótka ekspozycja szybkościowa / technika biegu / reakcja
  | "cod" // zmiana kierunku / hamowanie / zwinność
  | "endurance_aerobic" // baza tlenowa / tempo
  | "endurance_special" // wytrzymałość specjalna / interwały ekstensywne / bieg pozycyjny
  | "endurance_rsa" // zdolność do powtarzanego sprintu (RSA) / wysoka specyfika
  | "endurance_deload" // wytrzymałość w deloadzie — ostrość, mała objętość
  | "endurance_light" // krótszy bodziec tlenowy (wspierający)
  | "ball" // piłka / technika
  | "prehab"; // mobilność / prehab / stabilizacja

const HARD_STIMULI: Stimulus[] = [
  "strength_base",
  "strength",
  "power",
  "sprint",
  "cod",
  "endurance_special",
  "endurance_rsa",
];

function isHardStimulus(s: Stimulus): boolean {
  return HARD_STIMULI.includes(s);
}

export type WeekPhase = "adaptation" | "development" | "peak" | "deload";

/** Rola tygodnia w periodyzacji 4-tygodniowej. */
export function phaseOf(weekIndex: number, totalWeeks: number): WeekPhase {
  if (totalWeeks <= 1) return "development";
  if (weekIndex === totalWeeks - 1) return "deload";
  if (weekIndex === 0) return "adaptation";
  if (weekIndex === 1) return "development";
  return "peak";
}

/** Rotujący główny bodziec wytrzymałościowy zależny od fazy tygodnia. */
function enduranceMainForPhase(phase: WeekPhase): Stimulus {
  switch (phase) {
    case "adaptation":
      return "endurance_aerobic";
    case "development":
      return "endurance_special";
    case "peak":
      return "endurance_rsa";
    case "deload":
    default:
      return "endurance_deload";
  }
}

/**
 * Uporządkowana lista bodźców na tydzień wg celu i fazy periodyzacji.
 * Każdy tydzień ma inną tożsamość: adaptacja → rozwój → szczyt → deload.
 */
function weeklyStimuli(
  profile: Profile,
  clubCount: number,
  matchCount: number,
  phase: WeekPhase,
): Stimulus[] {
  const clubCoversBall = clubCount >= 1 || matchCount >= 1;
  const deload = phase === "deload";
  let out: Stimulus[] = [];

  if (profile.painInjury) {
    if (deload) return ["prehab", "ball", "endurance_light"];
    if (phase === "development") return ["prehab", "endurance_light", "ball", "prehab"];
    if (phase === "peak") return ["ball", "prehab", "endurance_light", "ball"];
    return ["prehab", "ball", "endurance_light"];
  }

  switch (profile.goal) {
    case "strength":
      // Cel siła: min. 2 jednostki siłowo-mocowe (front-load), gdy faza pozwala.
      if (deload) {
        out = ["strength_deload", "ball", "speed_exposure", "prehab"];
      } else if (phase === "peak") {
        out = ["strength", "power", "sprint", "ball", "prehab"];
      } else if (phase === "development") {
        out = ["strength", "power", "ball", "speed_exposure", "endurance_light"];
      } else {
        out = ["strength_base", "power", "ball", "speed_exposure", "prehab"];
      }
      break;
    case "speed":
      // Cel szybkość: min. 2 bodźce sprint/szybkość (front-load).
      if (deload) {
        out = ["speed_exposure", "ball", "strength_deload", "prehab"];
      } else if (phase === "peak") {
        out = ["sprint", "speed_exposure", "cod", "ball", "power"];
      } else if (phase === "development") {
        out = ["sprint", "speed_exposure", "power", "ball", "endurance_light"];
      } else {
        out = ["speed_exposure", "sprint", "strength_base", "ball", "prehab"];
      }
      break;
    case "endurance": {
      // Cel wytrzymałość: min. 2 jednostki biegowe/kondycyjne (front-load).
      const main = enduranceMainForPhase(phase);
      if (deload) {
        out = [main, "ball", "speed_exposure", "prehab"];
      } else if (phase === "peak") {
        out = [main, "endurance_light", "speed_exposure", "strength", "ball"];
      } else if (phase === "development") {
        out = [main, "endurance_light", "ball", "strength", "prehab"];
      } else {
        // adaptation
        out = [main, "endurance_light", "ball", "speed_exposure", "strength_base"];
      }
      if (!clubCoversBall && !out.includes("ball")) out.splice(1, 0, "ball");
      break;
    }
    case "power":
      if (deload) {
        out = ["strength_deload", "ball", "speed_exposure", "prehab"];
      } else if (phase === "peak") {
        out = ["power", "sprint", "cod", "strength", "ball"];
      } else if (phase === "development") {
        out = ["power", "ball", "strength", "sprint", "endurance_light"];
      } else {
        out = ["strength_base", "power", "ball", "speed_exposure", "endurance_light"];
      }
      break;
    case "agility":
      if (deload) {
        out = ["ball", "prehab", "speed_exposure", "strength_deload"];
      } else if (phase === "peak") {
        out = ["cod", "ball", "cod", "power", "endurance_light"];
      } else if (phase === "development") {
        out = ["cod", "sprint", "ball", "power", "endurance_light"];
      } else {
        out = ["cod", "ball", "strength_base", "endurance_light", "prehab"];
      }
      break;
    case "general":
      if (deload) {
        out = ["ball", "strength_deload", "endurance_deload", "prehab"];
      } else if (phase === "peak") {
        out = ["sprint", "power", "ball", "endurance_rsa", "prehab"];
      } else if (phase === "development") {
        out = ["strength", "ball", "sprint", "endurance_special", "prehab"];
      } else {
        out = ["ball", "strength_base", "endurance_aerobic", "speed_exposure", "prehab"];
      }
      break;
    case "mobility":
      out = deload
        ? ["prehab", "ball", "endurance_light"]
        : ["prehab", "ball", "endurance_light", "speed_exposure", "strength_base"];
      break;
    case "return":
      if (deload) {
        out = ["prehab", "ball", "endurance_light"];
      } else if (phase === "peak") {
        out = ["ball", "endurance_light", "prehab", "ball"];
      } else if (phase === "development") {
        out = ["prehab", "endurance_light", "ball", "prehab"];
      } else {
        out = ["prehab", "ball", "endurance_light"];
      }
      break;
    case "matchready":
    default:
      if (deload) {
        out = ["ball", "speed_exposure", "prehab", "strength_deload"];
      } else if (phase === "peak") {
        out = ["sprint", "ball", "strength", "cod", "prehab"];
      } else if (phase === "development") {
        out = ["strength", "ball", "sprint", "endurance_light", "prehab"];
      } else {
        out = ["ball", "sprint", "speed_exposure", "strength_base", "prehab"];
      }
      break;
  }
  return out;
}



// ---------- Buildery sesji wg bodźca ----------

/** Sesja mocy: moc, praca unilateralna, core, prehab + plyo jako ELEMENT. */
function buildPower(profile: Profile): Built {
  const young = isYoung(profile.age);
  const beginner = profile.level === "beginner";
  const gentle = young || beginner;
  return {
    title: gentle ? "Sesja mocy i stabilizacji" : "Sesja mocy (power/strength)",
    sessionType: "Moc / siła eksplozywna",
    intensity: gentle ? "umiarkowana" : "wysoka",
    durationMin: gentle ? 45 : 50,
    goalOfSession:
      "Rozwój mocy i eksplozywności: praca unilateralna, akcent dynamiczny i plyometria jako element sesji (nie osobny trening).",
    riskManaged: gentle
      ? "Plyometria w lekkiej formie (lądowania, niskie skoki, kontrola), bez agresywnych skoków i ciężkich obciążeń dorosłych."
      : "Plyometria jako element sesji: niska objętość i jakość lądowania, nie samodzielna jednostka plyo.",
    avoidToday:
      "Bez łączenia z ciężkim sprintem tego samego dnia. Bez ciężkich nóg na 48 h przed meczem.",
    main: gentle
      ? [
          {
            name: "Lądowania i mechanika skoku (plyo — element)",
            prescription: "3 × 5 miękkich lądowań z niskiego podskoku",
            rest: "60 s",
            cue: "Ciche, miękkie lądowanie, kolana w linii stóp.",
            easier: "Tylko zeskok i stabilne lądowanie bez podskoku.",
          },
          {
            name: "Przysiad bułgarski (masa ciała)",
            prescription: "3 × 8 na nogę",
            rest: "60 s",
            cue: "Pion tułowia, stabilne kolano.",
          },
          {
            name: "Wyrzut piłki lekarskiej / dynamiczny mostek",
            prescription: "3 × 6 dynamicznie",
            rest: "60 s",
            cue: "Akcent eksplozywny, kontrola powrotu.",
          },
        ]
      : [
          {
            name: "Przysiad skoczny / trap-bar jump (lekko, plyo — element)",
            prescription: "4 × 4 dynamicznie, lekki ciężar",
            rest: "120 s",
            cue: "Maksymalna szybkość koncentryczna, miękkie lądowanie.",
            easier: "Bez ciężaru, sam wyskok pionowy.",
          },
          {
            name: "Wykrok bułgarski z akcentem mocy",
            prescription: "3 × 6 na nogę",
            rest: "90 s",
            cue: "Mocne wyjście w górę, stabilne kolano.",
          },
          {
            name: "Wyrzut piłki lekarskiej",
            prescription: "4 × 5 (klatka / zza głowy)",
            rest: "75 s",
            cue: "Cała kinetyka od bioder, dynamicznie.",
          },
        ],
    accessory: [
      {
        name: "Core antyrotacyjny + prehab",
        prescription: "3 × 30 s pallof + przywodziciele",
        cue: "Napięty tułów, kontrola.",
      },
    ],
    footballTransfer: [],
  };
}

function buildStrengthDeload(profile: Profile): Built {
  const base = buildLightAlternative({ ...profile, goal: "strength" });
  return {
    ...base,
    title: "Siła podtrzymująca (deload)",
    sessionType: "Siła podtrzymująca",
    intensity: "niska",
    durationMin: Math.min(base.durationMin, 30),
    goalOfSession:
      "Podtrzymanie wzorców siłowych przy niskiej objętości i świeżości nóg.",
  };
}

function buildCod(profile: Profile): Built {
  const young = isYoung(profile.age);
  return {
    title: "Zwinność, hamowanie i COD",
    sessionType: "Agility / COD",
    intensity: young ? "umiarkowana" : "wysoka",
    durationMin: young ? 35 : 45,
    goalOfSession:
      "Zmiana kierunku, hamowanie i decyzja z piłką — jakość ruchu bez przypadkowego zmęczenia.",
    riskManaged:
      "Kontrolowana liczba powtórzeń, pełne przerwy i brak ostrego COD przy bólu kończyn dolnych.",
    avoidToday:
      "Bez łączenia z ciężkimi nogami, twardymi interwałami lub dużą plyometrią.",
    main: [
      {
        name: "Mechanika hamowania",
        prescription: "4 × 5 m wejście + stop w stabilnej pozycji",
        rest: "60 s",
        cue: "Nisko biodra, kolano stabilne, cichy kontakt stopy.",
      },
      {
        name: young ? "Zmiana kierunku 45°" : "Zmiana kierunku 45°/90°",
        prescription: `${young ? 5 : 6} powtórzeń na stronę, pełna kontrola`,
        rest: "75–90 s",
        cue: "Najpierw wyhamuj, potem przyspiesz — nie ślizgaj kroku.",
      },
      {
        name: "Reakcja z piłką",
        prescription: "6 akcji: sygnał, przyjęcie, zmiana kierunku, podanie",
        cue: "Decyzja przed kontaktem, piłka blisko stopy.",
      },
    ],
    accessory: [
      {
        name: "Core i przywodziciele",
        prescription: "2 × 30 s plank boczny + 2 × 8 przywodziciele",
        cue: "Kontrola miednicy, bez bólu pachwiny.",
      },
    ],
    footballTransfer: [
      {
        name: "Akcja pozycyjna po zmianie kierunku",
        prescription: "8 min wg pozycji",
        cue: "Skan, zwód, decyzja, podanie lub wykończenie.",
      },
    ],
  };
}

/** Krótki bodziec szybkościowy: technika biegu, reakcja, mała objętość. */
function buildSpeedExposure(profile: Profile): Built {
  const young = isYoung(profile.age);
  const sprintCap = young ? Math.min(120, MAX_SPRINT_M) : MAX_SPRINT_M;
  return {
    title: "Ekspozycja szybkościowa i technika biegu",
    sessionType: "Szybkość / technika biegu",
    intensity: "umiarkowana",
    durationMin: young ? 25 : 30,
    goalOfSession:
      "Utrzymanie ekspozycji na szybkość, technika biegu i reakcja przy małej objętości.",
    riskManaged: `Bardzo niska objętość zrywów (≤ ${Math.min(100, sprintCap)} m) chroni mięśnie tylne uda.`,
    avoidToday:
      "Bez dużej objętości sprintów i ciężkich nóg tego samego dnia.",
    main: [
      {
        name: "Technika biegu (skip A/B, akcent)",
        prescription: "6 min ćwiczeń biegowych",
        cue: "Wysokie kolano, aktywna stopa, luźne barki.",
      },
      {
        name: "Przyspieszenia",
        prescription: `4 × 10 m — łącznie 40 m`,
        rest: "90 s",
        cue: "Mocny pierwszy krok, jakość ponad ilość.",
      },
      {
        name: "Reakcja z piłką",
        prescription: "3 × 15 m start na sygnał + przyjęcie",
        cue: "Skup się na starcie i pierwszym kontakcie.",
      },
    ],
    accessory: [],
    footballTransfer: [],
  };
}

/** Krótszy bodziec tlenowy. */
function buildEnduranceLight(profile: Profile): Built {
  const young = isYoung(profile.age);
  return {
    title: "Lekki bodziec tlenowy",
    sessionType: "Wytrzymałość (lekka)",
    intensity: "niska",
    durationMin: young ? 25 : 30,
    goalOfSession:
      "Lekka praca tlenowa wspierająca bazę i regenerację, bez twardych interwałów.",
    riskManaged: "Tempo konwersacyjne — utrzymuje wydolność bez zmęczenia.",
    avoidToday: "Bez twardych interwałów na 48 h przed meczem.",
    main: [
      {
        name: "Ciągły bieg / rower",
        prescription: `${young ? 18 : 22} min, tętno komfortowe`,
        cue: "Spokojne, równe tempo, konwersacyjnie.",
        easier: "Marszobieg.",
      },
      {
        name: "Prowadzenie piłki tempem",
        prescription: "6 × 40 m luźno",
        cue: "Miękkie kontakty, luźne barki.",
      },
    ],
    accessory: [],
    footballTransfer: [],
  };
}

/** Sesja piłkarska / techniczna z akcentem wg celu. */
function buildBall(profile: Profile): Built {
  const speedy = profile.goal === "speed" || profile.goal === "matchready";
  return {
    title: "Trening piłkarski (technika i decyzje)",
    sessionType: "Piłka / technika",
    intensity: "umiarkowana",
    durationMin: 45,
    goalOfSession: speedy
      ? "Technika i decyzje z akcentem szybkościowym: pierwszy kontakt, akcja po przyspieszeniu."
      : "Doskonalenie pierwszego kontaktu, skanowania, słabszej nogi i decyzji.",
    riskManaged:
      "Praca techniczna o umiarkowanej objętości — bez fatygujących obwodów.",
    avoidToday: "Bez bezsensownej objętości i twardego kondycyjnego.",
    main: [
      {
        name: "Pierwszy kontakt i skanowanie",
        prescription: "12 min przyjęć kierunkowych",
        cue: "Skan przed przyjęciem, kontakt w ruch.",
      },
      {
        name: speedy
          ? "Przyjęcie–zwrot–przyspieszenie"
          : "Podania obunóż i słabsza noga",
        prescription: speedy
          ? "8 powtórzeń: przyjęcie, zwrot, 8–10 m przyspieszenia"
          : "12 min, różne dystanse",
        cue: speedy
          ? "Pierwszy kontakt w kierunek biegu."
          : "Celność przed siłą, obie nogi.",
      },
    ],
    accessory: [],
    footballTransfer: [
      {
        name: "Akcja pozycyjna wg roli",
        prescription: "10 min wg pozycji",
        cue: "Realizuj zadania swojej pozycji.",
      },
    ],
  };
}

/** Sesja prehab / mobilność / stabilizacja. */
function buildPrehab(_profile: Profile): Built {
  return {
    title: "Prehab, mobilność i stabilizacja",
    sessionType: "Prehab / mobilność",
    intensity: "niska",
    durationMin: 30,
    goalOfSession:
      "Odporność bioder, przywodzicieli, ścięgien udowych i łydek oraz jakość ruchu.",
    riskManaged: "Lekka praca prewencyjna — bez przeciążenia.",
    avoidToday: "Bez zrywów maksymalnych i ciężkich obciążeń.",
    main: [
      {
        name: "Mobilność bioder, kostek i kręgosłupa",
        prescription: "10 min",
        cue: "Powoli, kontroluj końcowy zakres.",
      },
      {
        name: "Copenhagen + Nordic (lekko)",
        prescription: "2 × 6 przywodziciele, 2 × 4 nordic",
        cue: "Kontrola, bez bólu.",
        easier: "Wersje z kolan / mniejszy zakres.",
      },
      {
        name: "Balans, lądowania i core",
        prescription: "8 min: stabilizacja jednonóż, plank, dead bug",
        cue: "Napięcie tułowia, miękkie lądowanie.",
      },
    ],
    accessory: [],
    footballTransfer: [],
  };
}

/** Tydz. 1 (adaptacja): baza tlenowa / tempo — wejście w rytm. */
function buildEnduranceAerobic(profile: Profile): Built {
  const young = isYoung(profile.age);
  return {
    title: "Baza tlenowa i tempo",
    sessionType: "Wytrzymałość tlenowa (baza)",
    intensity: "umiarkowana",
    durationMin: young ? 40 : 50,
    goalOfSession:
      "Budowa bazy tlenowej i ekonomii biegu — wejście w rytm na początku bloku.",
    riskManaged:
      "Tempo kontrolowane, ekstensywne — bez twardych interwałów na starcie bloku.",
    avoidToday: "Bez maksymalnych zrywów i twardego kondycyjnego.",
    main: [
      {
        name: "Ciągły bieg tlenowy",
        prescription: `${young ? 14 : 18} min, tętno tlenowe`,
        cue: "Równe, konwersacyjne tempo, kontroluj oddech.",
        easier: "Marszobieg w blokach.",
      },
      {
        name: "Tempo ekstensywne",
        prescription: `${young ? 6 : 8} × 100 m luźnego tempa, trucht powrót`,
        rest: "trucht 100 m",
        cue: "Relaks w barkach, równe tempo, nie na czas.",
        harder: young ? undefined : "Dołóż 2 powtórzenia.",
      },
    ],
    accessory: [
      {
        name: "Prowadzenie piłki tempem",
        prescription: "6 × 40 m luźno",
        cue: "Miękkie kontakty, głowa do góry.",
      },
    ],
    footballTransfer: [
      {
        name: "Obieg pozycyjny z podaniem",
        prescription: "4 × bieg na pozycję + podanie",
        cue: "Skan przed przyjęciem.",
      },
    ],
  };
}

/** Tydz. 2 (rozwój): wytrzymałość specjalna / interwały ekstensywne / bieg pozycyjny. */
function buildEnduranceSpecial(profile: Profile): Built {
  const young = isYoung(profile.age);
  return {
    title: "Wytrzymałość specjalna (interwały)",
    sessionType: "Wytrzymałość specjalna",
    intensity: young ? "umiarkowana" : "wysoka",
    durationMin: young ? 45 : 55,
    goalOfSession:
      "Rozwój wytrzymałości specjalnej i zdolności do powtarzanego wysiłku z piłką.",
    riskManaged:
      "Kontrolowana objętość interwałów — bez twardej pracy na 48 h przed meczem.",
    avoidToday: "Bez interwałów MD-2/MD-1 i długich biegów na zmęczeniu.",
    main: [
      {
        name: "Interwały ekstensywne z piłką",
        prescription: `${young ? 6 : 8} × 1 min bieg / 1 min trucht`,
        rest: "1 min trucht",
        cue: "Równe tempo, kontrola oddechu na każdym powtórzeniu.",
        easier: "Skróć do 4–5 powtórzeń.",
        harder: young ? undefined : "Skróć przerwę do 45 s.",
      },
      {
        name: "Gra na małym polu (symulacja)",
        prescription: "4 × 3 min, przerwa 2 min",
        rest: "2 min",
        cue: "Aktywne ustawianie się, szybka decyzja.",
      },
    ],
    accessory: [
      {
        name: "Bieg pozycyjny wg roli",
        prescription: "6 × powtarzalny obieg na pozycji",
        cue: "Realizuj wzorce biegowe swojej pozycji.",
      },
    ],
    footballTransfer: [
      {
        name: "Akcja pozycyjna z podaniem",
        prescription: "8 min wg roli",
        cue: "Skan przed przyjęciem, decyzja przed kontaktem.",
      },
    ],
  };
}

/** Tydz. 3 (szczyt): RSA / wysoka specyfika, kontrolowana objętość. */
function buildEnduranceRSA(profile: Profile): Built {
  const young = isYoung(profile.age);
  const reps = young ? 6 : 10;
  return {
    title: "Powtarzalne sprinty (RSA)",
    sessionType: "Zdolność do powtarzanego sprintu (RSA)",
    intensity: "wysoka",
    durationMin: young ? 40 : 50,
    goalOfSession:
      "Zdolność do powtarzanego wysiłku sprinterskiego — najwyższy specyficzny bodziec bloku.",
    riskManaged: `Kontrolowana objętość (${reps} powtórzeń) i pełne przerwy chronią mechanikę — przerwij przy spadku jakości.`,
    avoidToday:
      "Nie dla 13–15 lat domyślnie w pełnej formie. Bez RSA na MD-2/MD-1 i przy zmęczeniu nóg.",
    main: [
      {
        name: "Powtarzalne sprinty",
        prescription: `${reps} × 20–25 m, przerwa 30–40 s`,
        rest: "30–40 s aktywnej przerwy",
        cue: "Maksymalna jakość biegu, utrzymaj mechanikę do końca.",
        easier: "Skróć do 6 × 20 m lub wydłuż przerwy.",
        harder: young ? undefined : "Seria 2 × (5 × 20 m), 3 min między seriami.",
      },
      {
        name: "Powtarzalny wysiłek z piłką",
        prescription: "4 × 45 s prowadzenie + akcja / 45 s trucht",
        rest: "45 s trucht",
        cue: "Wysoka intensywność z kontrolą piłki.",
      },
    ],
    accessory: [
      {
        name: "Mobilność i prehab tylnej taśmy",
        prescription: "6 min: przywodziciele, tylne uda, łydki",
        cue: "Kontrola, przygotuj się na kolejne powtórzenia.",
      },
    ],
    footballTransfer: [
      {
        name: "Sprint + akcja wg pozycji",
        prescription: "4 × sprint + wykończenie/podanie",
        cue: "Decyzja pod zmęczeniem, jakość ponad ilość.",
      },
    ],
  };
}

/** Tydz. 4 (deload): ostrość wytrzymałościowa, mała objętość, świeżość. */
function buildEnduranceDeload(profile: Profile): Built {
  const young = isYoung(profile.age);
  return {
    title: "Ostrość wytrzymałościowa (deload)",
    sessionType: "Wytrzymałość — deload / ostrość",
    intensity: "umiarkowana",
    durationMin: young ? 30 : 35,
    goalOfSession:
      "Podtrzymanie wydolności przy małej objętości — konsolidacja i świeżość na końcu bloku.",
    riskManaged:
      "Wyraźnie obniżona objętość względem szczytu — utrzymujesz formę bez zmęczenia.",
    avoidToday: "Bez dużej objętości interwałów i biegów na zmęczeniu.",
    main: [
      {
        name: "Krótkie tempo z piłką",
        prescription: `${young ? 4 : 6} × 40 m tempo, trucht powrót`,
        rest: "trucht 40 m",
        cue: "Płynnie i lekko, jakość ruchu ponad objętość.",
      },
      {
        name: "Gra/technika w tempie",
        prescription: "2 × 3 min lekkiej gry, przerwa 2 min",
        rest: "2 min",
        cue: "Aktywnie, ale kończysz świeży.",
      },
    ],
    accessory: [],
    footballTransfer: [
      {
        name: "Akcja pozycyjna w spokojnym tempie",
        prescription: "6 min wg roli",
        cue: "Realizuj zadania swojej pozycji.",
      },
    ],
  };
}

/** Buduje sesję dla danego bodźca tygodniowego. */
function buildStimulus(stimulus: Stimulus, profile: Profile): Built {
  const built = (() => {
  switch (stimulus) {
    case "strength_base":
    case "strength":
      return buildByGoal({ ...profile, goal: "strength" });
    case "strength_deload":
      return buildStrengthDeload(profile);
    case "power":
      return buildPower(profile);
    case "sprint":
      return buildByGoal({ ...profile, goal: "speed" });
    case "speed_exposure":
      return buildSpeedExposure(profile);
    case "cod":
      return buildCod(profile);
    case "endurance_aerobic":
      return buildEnduranceAerobic(profile);
    case "endurance_special":
      return buildEnduranceSpecial(profile);
    case "endurance_rsa":
      return buildEnduranceRSA(profile);
    case "endurance_deload":
      return buildEnduranceDeload(profile);
    case "endurance_light":
      return buildEnduranceLight(profile);
    case "ball":
      return buildBall(profile);
    case "prehab":
    default:
      return buildPrehab(profile);
  }
  })();

  switch (categoryOf(stimulus)) {
    case "strength_power":
      return { ...built, title: "Siła / moc na siłowni", sessionType: "Siła / moc" };
    case "speed":
      return { ...built, title: "Sprint i przyspieszenie", sessionType: "Szybkość" };
    case "conditioning":
      return { ...built, title: "Baza tlenowa i tempo", sessionType: "Wydolność" };
    case "athletic":
      return stimulus === "prehab"
        ? { ...built, title: "Prehab i mobilność", sessionType: "Regeneracja / prehab" }
        : { ...built, title: "Zmiana kierunku i motoryka", sessionType: "Motoryka" };
    case "ball":
    default:
      return { ...built, title: "Technika i decyzje z piłką", sessionType: "Piłka" };
  }
}

// ============================================================
// Kontekst sezonu + poziom rozgrywkowy → intensywność tygodnia
// Decyduje o liczbie sesji (cap), liczbie dni podwójnych (maxDoubles)
// oraz o dystrybucji bodźców (kompletny tydzień rozwojowy vs. lżejszy).
// ============================================================

type LevelTier = "high" | "mid" | "low";

/** Poziom organizacji/intensywności wg poziomu rozgrywkowego i poziomu zawodnika. */
function levelTier(profile: Profile): LevelTier {
  if (profile.level === "elite") return "high";
  switch (profile.competitionLevel) {
    case "iii_liga":
    case "ii_liga_plus":
    case "semi_pro":
    case "pro":
      return "high";
    case "okregowka":
    case "iv_liga":
    case "a_klasa":
      return "mid";
    case "academy":
    case "b_klasa":
    default:
      return "low";
  }
}

interface WeekLoad {
  cap: number; // maks. liczba własnych sesji rozwojowych w tygodniu
  maxDoubles: number; // maks. liczba dni podwójnych
}

/** Liczba sesji i dni podwójnych na tydzień wg sezonu, poziomu i bliskości meczu. */
function weekLoadConfig(
  profile: Profile,
  periodPhase: WeekPhase,
  hasMatchThisWeek: boolean,
): WeekLoad {
  const tier = levelTier(profile);
  let cap = tier === "high" ? 6 : tier === "mid" ? 5 : 4;
  let maxDoubles = tier === "high" ? 4 : tier === "mid" ? 3 : 2;

  switch (profile.seasonPhase) {
    case "offseason":
    case "preseason":
      // Pełny, ambitny tydzień rozwojowy — tu pchamy rozwój najmocniej.
      break;
    case "inseason":
      // Świeżość pod mecz; bez meczu zwiększamy gęstość.
      cap = hasMatchThisWeek ? cap - 1 : cap;
      maxDoubles = Math.min(maxDoubles, hasMatchThisWeek ? 2 : 3);
      break;
    case "transition":
      cap = Math.min(cap, 3);
      maxDoubles = 0;
      break;
    case "return_injury":
      cap = Math.min(cap, 3);
      maxDoubles = 0;
      break;
  }

  if (profile.painInjury) {
    cap = Math.min(cap, 2);
    maxDoubles = 0;
  }
  if (periodPhase === "deload") {
    cap = Math.min(cap, 3);
    maxDoubles = Math.min(maxDoubles, 1);
  }
  // Młodsi i początkujący: bez agresywnego tygodnia podwójnych sesji.
  if (isYoung(profile.age) || profile.level === "beginner") {
    maxDoubles = Math.min(maxDoubles, 1);
  }
  if (profile.doubleSessionsAllowed === "no") maxDoubles = 0;

  return { cap: Math.max(1, cap), maxDoubles };
}

/** Główny bodziec odpowiadający celowi zawodnika. */
function primaryStimulusForGoal(goal: Profile["goal"], gym: boolean): Stimulus {
  switch (goal) {
    case "strength":
      return gym ? "strength" : "strength_base";
    case "power":
      return "power";
    case "speed":
      return "sprint";
    case "agility":
      return "cod";
    case "endurance":
      return "endurance_special";
    case "general":
    case "matchready":
      // Rozwój piłkarski / gotowość = pełny rozwój wydolnościowy, nie tylko piłka.
      return gym ? "strength" : "sprint";
    default:
      return "ball";
  }
}

/** Przesuwa bodziec celu na początek listy (front-load), bez duplikatów. */
function frontLoadGoal(profile: Profile, list: Stimulus[]): Stimulus[] {
  const prim = primaryStimulusForGoal(profile.goal, profile.hasGym);
  const idx = list.indexOf(prim);
  if (idx > 0) {
    const copy = [...list];
    copy.splice(idx, 1);
    copy.unshift(prim);
    return copy;
  }
  return list;
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

type PerfCategory =
  | "strength_power"
  | "speed"
  | "conditioning"
  | "athletic"
  | "ball";

export type PlanSessionCategory =
  | PerfCategory
  | "club"
  | "match"
  | "activation"
  | "recovery_prehab"
  | "rest";

function categoryOf(s: Stimulus): PerfCategory {
  switch (s) {
    case "strength_base":
    case "strength":
    case "strength_deload":
    case "power":
      return "strength_power";
    case "sprint":
    case "speed_exposure":
      return "speed";
    case "endurance_aerobic":
    case "endurance_special":
    case "endurance_rsa":
    case "endurance_deload":
    case "endurance_light":
      return "conditioning";
    case "cod":
    case "prehab":
      return "athletic";
    case "ball":
    default:
      return "ball";
  }
}

function textOfSession(session: SessionDay): string {
  const exerciseText = [
    ...session.sections.warmup,
    ...session.sections.main,
    ...session.sections.accessory,
    ...session.sections.footballTransfer,
    ...session.sections.cooldown,
  ]
    .map((e) => `${e.name} ${e.prescription} ${e.cue ?? ""}`)
    .join(" ");
  return `${session.title} ${session.goalLabel} ${session.sessionType} ${session.goalOfSession} ${exerciseText}`.toLowerCase();
}

function headerTextOfSession(session: SessionDay): string {
  return `${session.title} ${session.goalLabel} ${session.sessionType} ${session.goalOfSession}`.toLowerCase();
}

export function sessionCategory(session: SessionDay): PlanSessionCategory {
  if (session.dayType === "club") return "club";
  if (session.dayType === "match") return "match";
  if (session.dayType === "md-1") return "activation";
  if (session.dayType === "recovery") return "recovery_prehab";
  if (session.dayType === "rest") return "rest";

  const header = headerTextOfSession(session);
  if (/sił|moc|power/.test(header)) {
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
  if (/wydol|tlen|tempo|interwa|rsa|kondyc|ciągły bieg|biegowy|bieg /.test(text)) return "conditioning";
  if (/sprint|szybko|przyspiesz|akceler|prędko|reakcja|flying/.test(text)) return "speed";
  if (/sił|moc\s*\/|mocą|power|przysiad|martwy|split squat|rdl|trap-bar|goblet/.test(text)) return "strength_power";
  if (/cod|zwin|zmian|hamowan|lądowa|prehab|mobil|stabil|core|przywodziciel|copenhagen|nordic/.test(text)) return "athletic";
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
  return /prehab|mobil|regener|stabil|core|przywodziciel|copenhagen|nordic|oddech|łydk|hamstring/.test(text);
}

// Kolejność priorytetu dla dodatkowych sesji indywidualnych.
const CATEGORY_PRIORITY: PerfCategory[] = [
  "strength_power",
  "speed",
  "conditioning",
  "athletic",
  "ball",
];

/**
 * Naprawia tygodniową listę bodźców tak, by spełniała minima kategorii
 * i nie była zdominowana przez piłkę. Zwraca listę uporządkowaną wg
 * priorytetu (wydolność najpierw, piłka i prehab na końcu), dłuższą niż
 * docelowy cap — dzięki temu po obcięciu w grafiku zostają sesje
 * wydolnościowe, a nie piłkarskie.
 */
function balanceWeeklyCategories(
  profile: Profile,
  list: Stimulus[],
  clubCount: number,
  matchCount: number,
  phase: WeekPhase,
): Stimulus[] {
  // Profile z bólem/urazem oraz okresy roztrenowania/powrotu zostają lekkie.
  if (profile.painInjury) return list;
  if (
    profile.seasonPhase === "transition" ||
    profile.seasonPhase === "return_injury"
  ) {
    return list;
  }
  if (profile.goal === "mobility" || profile.goal === "return") return list;

  const gym = profile.hasGym;
  const deload = phase === "deload";
  const strengthMain: Stimulus = deload
    ? "strength_deload"
    : gym
      ? "strength"
      : "strength_base";
  const condMain: Stimulus = deload
    ? "endurance_deload"
    : enduranceMainForPhase(phase);

  // Klub i mecz to już ekspozycja piłkarska — limituj własne sesje piłki.
  const footballExposure = clubCount + matchCount;
  const maxBall = footballExposure >= 1 ? 1 : 2;

  // 1. Ogranicz liczbę sesji stricte piłkarskich.
  let ballSeen = 0;
  const trimmed = list.filter((s) => {
    if (s === "ball") {
      ballSeen++;
      return ballSeen <= maxBall;
    }
    return true;
  });

  // 2. Zapewnij obecność kategorii wydolnościowych (minimum bazowe).
  const has = (c: PerfCategory) => trimmed.some((s) => categoryOf(s) === c);
  const additions: Stimulus[] = [];
  if (!has("strength_power")) additions.push(strengthMain);
  if (!has("speed")) additions.push(deload ? "speed_exposure" : "sprint");
  if (!has("conditioning")) additions.push(condMain);
  if (!has("athletic")) additions.push(deload ? "prehab" : "cod");
  if (footballExposure === 0 && !has("ball")) additions.push("ball");

  const all = [...trimmed, ...additions];

  // 3. Uporządkuj wg priorytetu kategorii (sort stabilny zachowuje kolejność
  //    wewnątrz kategorii). Piłka ląduje na końcu i jako pierwsza wypada przy
  //    obcinaniu do cap, więc tydzień nie jest zdominowany przez piłkę.
  return [...all].sort(
    (a, b) =>
      CATEGORY_PRIORITY.indexOf(categoryOf(a)) -
      CATEGORY_PRIORITY.indexOf(categoryOf(b)),
  );
}

/**
 * Tygodniowa lista bodźców z uwzględnieniem okresu sezonu.
 * Offseason/przedsezon = kompletny tydzień rozwojowy (siła/moc, sprint/COD,
 * kondycja, piłka, prehab). Okres przejściowy / powrót = lżej. W sezonie =
 * istniejąca logika periodyzacji + zagęszczenie, gdy brak meczu.
 */
function seasonWeeklyStimuli(
  profile: Profile,
  clubCount: number,
  matchCount: number,
  phase: WeekPhase,
): Stimulus[] {
  if (profile.painInjury) {
    return weeklyStimuli(profile, clubCount, matchCount, phase);
  }
  const gym = profile.hasGym;
  const strengthMain: Stimulus = gym ? "strength" : "strength_base";
  let raw: Stimulus[];

  switch (profile.seasonPhase) {
    case "offseason":
      raw = frontLoadGoal(profile, [
        strengthMain,
        "power",
        "sprint",
        "endurance_aerobic",
        "cod",
        "ball",
        "prehab",
      ]);
      break;
    case "preseason":
      raw = frontLoadGoal(profile, [
        strengthMain,
        "power",
        "sprint",
        "endurance_special",
        "endurance_aerobic",
        "cod",
        "ball",
        "prehab",
      ]);
      break;
    case "transition":
      return ["prehab", "endurance_light", "ball", "prehab", "strength_base", "ball"];
    case "return_injury":
      return ["prehab", "endurance_light", "ball", "prehab", "ball"];
    case "inseason":
    default: {
      raw = weeklyStimuli(profile, clubCount, matchCount, phase);
      if (matchCount === 0) {
        // Brak meczu w tym tygodniu — zwiększ gęstość PRACY WYDOLNOŚCIOWEJ,
        // nie piłkarskiej (klub i tak daje ekspozycję piłkarską).
        raw.push(strengthMain);
        raw.push("sprint");
        raw.push(phase === "deload" ? "endurance_light" : enduranceMainForPhase(phase));
        raw.push("cod");
      }
      break;
    }
  }

  // Walidacja + naprawa kategorii zanim tydzień trafi do grafiku.
  return balanceWeeklyCategories(profile, raw, clubCount, matchCount, phase);
}

// ============================================================
// Tygodniowy planer mikrocyklu (week-level microcycle planner)
// Zamiast oznaczać każdy dzień osobno (co dawało 7 "treningów własnych",
// 5 podwójnych dni i wolne weekendy), budujemy realny mikrocykl:
// mecz / MD-1 / klub / MD+1 są stałe, a dni dostępne dostają bodźce celu
// (siła, sprint/COD, kondycja, piłka, prehab) + regenerację, bez losowych
// dni wolnych i bez powtarzanych placeholderów.
// ============================================================

type BaseDayType = "match" | "md-1" | "club" | "md+1" | "available";

function baseDayType(date: Date, profile: Profile): BaseDayType {
  if (isMatchDay(date, profile)) return "match";
  if (daysToMatch(date, profile) === 1) return "md-1";
  if (profile.clubTrainingDays.includes(isoDayOfWeek(date))) return "club";
  if (daysSinceMatch(date, profile) === 1) return "md+1";
  return "available";
}

/** Rozdziela bodźce tak, by twarde nie wypadały dzień po dniu. */
function interleaveStimuli(list: Stimulus[]): Stimulus[] {
  const hard = list.filter(isHardStimulus);
  const soft = list.filter((s) => !isHardStimulus(s));
  const out: Stimulus[] = [];
  while (hard.length || soft.length) {
    if (hard.length) out.push(hard.shift()!);
    if (soft.length) out.push(soft.shift()!);
  }
  return out;
}

interface PlanCell {
  type: DayType;
  stimulus?: Stimulus;
  secondStimulus?: Stimulus;
}

function isHealthyPerformanceProfile(profile: Profile): boolean {
  return (
    !profile.painInjury &&
    profile.seasonPhase !== "transition" &&
    profile.seasonPhase !== "return_injury" &&
    profile.goal !== "mobility" &&
    profile.goal !== "return" &&
    profile.level !== "beginner"
  );
}

function hardWeeklyQuota(
  profile: Profile,
  clubCount: number,
  matchCount: number,
  phase: WeekPhase,
): Stimulus[] {
  if (!isHealthyPerformanceProfile(profile)) {
    return interleaveStimuli(seasonWeeklyStimuli(profile, clubCount, matchCount, phase));
  }

  const strengthMain: Stimulus = profile.hasGym ? "strength" : "strength_base";
  const secondStrength: Stimulus = profile.hasGym ? "power" : "strength_base";
  const conditioning: Stimulus =
    matchCount > 0
      ? "endurance_light"
      : phase === "deload"
        ? "endurance_deload"
        : enduranceMainForPhase(phase);

  const quota: Stimulus[] = [strengthMain, secondStrength, "sprint", conditioning, "prehab"];
  if (matchCount > 0) {
    return [strengthMain, "sprint", conditioning, "prehab", secondStrength];
  }
  if (clubCount + matchCount === 0) quota.push("ball");
  return quota;
}

function canPrimaryStimulus(stimulus: Stimulus, it: { base: BaseDayType; toMatch: number | null }): boolean {
  if (it.base !== "available") return false;
  const category = categoryOf(stimulus);
  if (it.toMatch === 1 || it.toMatch === 0) return false;
  if (it.toMatch === 2 && category !== "speed" && category !== "athletic" && category !== "ball") {
    return false;
  }
  if (it.toMatch !== null && it.toMatch <= 2 && (category === "strength_power" || category === "conditioning")) {
    return false;
  }
  return true;
}

function canSecondStimulus(
  stimulus: Stimulus,
  it: { base: BaseDayType; toMatch: number | null },
  primary?: Stimulus,
): boolean {
  if (it.base === "match" || it.base === "md-1" || it.base === "md+1") return false;
  if (it.toMatch !== null && it.toMatch <= 2) return false;
  const category = categoryOf(stimulus);
  if (it.base === "club") return category === "athletic";
  if (it.base !== "available") return false;
  if (!primary) return false;
  const primaryCategory = categoryOf(primary);
  if (category === "strength_power" || category === "speed") return false;
  if (primaryCategory === "strength_power" && category === "conditioning") return false;
  return true;
}

function slotScore(stimulus: Stimulus, it: { date: Date; toMatch: number | null }, second = false): number {
  const dow = isoDayOfWeek(it.date);
  const category = categoryOf(stimulus);
  let score = 100 - dow;
  if (category === "strength_power") score += dow === 2 || dow === 6 ? 40 : 0;
  if (category === "speed") score += it.toMatch === 3 ? 60 : dow === 4 ? 35 : 0;
  if (category === "conditioning") score += dow === 4 || dow === 7 ? 30 : 0;
  if (category === "athletic") score += dow === 1 || dow === 6 ? 25 : 0;
  if (second) score -= category === "conditioning" ? 5 : 15;
  if (it.toMatch !== null) score += Math.min(it.toMatch, 5) * 3;
  return score;
}

function countCellCategories(cells: PlanCell[]): Record<PerfCategory, number> {
  const counts: Record<PerfCategory, number> = {
    strength_power: 0,
    speed: 0,
    conditioning: 0,
    athletic: 0,
    ball: 0,
  };
  for (const cell of cells) {
    if (cell.stimulus) counts[categoryOf(cell.stimulus)]++;
    if (cell.secondStimulus) counts[categoryOf(cell.secondStimulus)]++;
  }
  return counts;
}

function repairWeekCells(
  profile: Profile,
  items: { iso: string; date: Date; base: BaseDayType; toMatch: number | null }[],
  result: Record<string, PlanCell>,
  maxDoubles: number,
): void {
  if (!isHealthyPerformanceProfile(profile)) return;
  const required: PerfCategory[] = ["strength_power", "speed", "conditioning", "athletic"];
  const replacementFor: Record<PerfCategory, Stimulus> = {
    strength_power: profile.hasGym ? "strength" : "strength_base",
    speed: "sprint",
    conditioning: "endurance_light",
    athletic: "prehab",
    ball: "ball",
  };

  const cells = () => items.map((it) => result[it.iso]).filter(Boolean) as PlanCell[];
  const doubles = () => cells().filter((c) => c.secondStimulus).length;

  for (const category of required) {
    if (countCellCategories(cells())[category] > 0) continue;
    const stimulus = replacementFor[category];

    const replaceablePrimary = items.find((it) => {
      const cell = result[it.iso];
      if (!cell || cell.type !== "training" || !cell.stimulus) return false;
      const c = categoryOf(cell.stimulus);
      return (c === "ball" || c === "athletic") && canPrimaryStimulus(stimulus, it);
    });
    if (replaceablePrimary) {
      result[replaceablePrimary.iso].stimulus = stimulus;
      continue;
    }

    if (doubles() >= maxDoubles) continue;
    const secondSlot = [...items]
      .sort((a, b) => slotScore(stimulus, b, true) - slotScore(stimulus, a, true))
      .find((it) => {
        const cell = result[it.iso];
        if (!cell || cell.secondStimulus) return false;
        return canSecondStimulus(stimulus, it, cell.stimulus);
      });
    if (secondSlot) result[secondSlot.iso].secondStimulus = stimulus;
  }
}

/**
 * Buduje mapę dni planu (per 7-dniowy blok). Każdy dzień dostaje konkretny
 * typ, a dni treningowe — konkretny bodziec. Bez losowych dni wolnych:
 * nadmiarowe dni dostępne stają się aktywną regeneracją, nie pustym "wolne".
 */
function planBlock(
  profile: Profile,
  startDate: Date,
  days: number,
  weekOffset = 0,
): Record<string, PlanCell> {
  const result: Record<string, PlanCell> = {};
  const ranges = weekRanges(startDate, days);
  const totalWeeks = Math.max(1, ranges.length);

  ranges.forEach((range, weekIndex) => {
    const phaseTotal = days <= 7 ? 4 : totalWeeks;
    const phase = phaseOf(weekOffset + weekIndex, phaseTotal);

    const items: { iso: string; date: Date; base: BaseDayType; toMatch: number | null }[] = [];
    let clubCount = 0;
    let matchCount = 0;

    for (let i = range.start; i < range.end; i++) {
      const date = addDays(startDate, i);
      const base = baseDayType(date, profile);
      if (base === "club") clubCount++;
      if (base === "match") matchCount++;
      items.push({ iso: isoDate(date), date, base, toMatch: daysToMatch(date, profile) });
    }

    // Dni stałe: mecz / MD-1 / klub / MD+1 (regeneracja).
    for (const it of items) {
      if (it.base === "match") result[it.iso] = { type: "match" };
      else if (it.base === "md-1") result[it.iso] = { type: "md-1" };
      else if (it.base === "club") result[it.iso] = { type: "club" };
      else if (it.base === "md+1") result[it.iso] = { type: "recovery" };
    }

    const avail = items.filter((it) => it.base === "available");
    const { cap, maxDoubles } = weekLoadConfig(profile, phase, matchCount > 0);
    const quota = hardWeeklyQuota(profile, clubCount, matchCount, phase).slice(0, cap);
    let doublesUsed = 0;

    for (const it of avail) {
      result[it.iso] = it.toMatch === 2 ? { type: "training", stimulus: "speed_exposure" } : { type: "recovery" };
    }

    for (const stimulus of quota) {
      const alreadyPlaced = items.some(
        (it) =>
          result[it.iso]?.stimulus === stimulus ||
          result[it.iso]?.secondStimulus === stimulus,
      );
      if (alreadyPlaced && stimulus !== "strength_base") continue;

      const primary = [...avail]
        .sort((a, b) => slotScore(stimulus, b) - slotScore(stimulus, a))
        .find((it) => {
          const cell = result[it.iso];
          return cell?.type === "recovery" && canPrimaryStimulus(stimulus, it);
        });

      if (primary) {
        result[primary.iso] = { type: "training", stimulus };
        continue;
      }

      if (doublesUsed >= maxDoubles) continue;
      const second = [...items]
        .sort((a, b) => slotScore(stimulus, b, true) - slotScore(stimulus, a, true))
        .find((it) => {
          const cell = result[it.iso];
          if (!cell || cell.secondStimulus) return false;
          return canSecondStimulus(stimulus, it, cell.stimulus);
        });
      if (second) {
        result[second.iso].secondStimulus = stimulus;
        doublesUsed++;
      }
    }

    repairWeekCells(profile, items, result, maxDoubles);
  });

  return result;
}

/**
 * Dzieli okres planu na tygodnie kalendarzowe (poniedziałek–niedziela).
 * Pierwszy tydzień może być niepełny, jeśli plan startuje w środku tygodnia.
 * Zwraca przedziały indeksów dni [start, end) względem startDate.
 */
export function weekRanges(
  startDate: Date,
  days: number,
): { start: number; end: number }[] {
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


/** Główny generator — zwraca bezpieczny plan miesięczny (domyślnie 28 dni) od dziś. */

export function generatePlan(
  profile: Profile,
  start?: Date,
  days = 28,
  weekOffset = 0,
): SessionDay[] {
  const startDate = start ?? warsawToday();
  const out: SessionDay[] = [];
  const blockMap = planBlock(profile, startDate, days, weekOffset);

  let lastWasHard = false;
  let doublesThisWeek = 0;
  let weeklyMaxDoubles = 0;
  const ranges = weekRanges(startDate, days);
  const totalWeeks = Math.max(1, ranges.length);
  // Limit podwójnych dni liczony per tydzień kalendarzowy (poniedziałek start).
  const maxDoublesAtStart = new Map<number, number>();
  ranges.forEach((range, weekIndex) => {
    const phaseTotal = days <= 7 ? 4 : totalWeeks;
    const phase = phaseOf(weekOffset + weekIndex, phaseTotal);
    let hasMatch = false;
    for (let k = range.start; k < range.end; k++) {
      if (isMatchDay(addDays(startDate, k), profile)) {
        hasMatch = true;
        break;
      }
    }
    maxDoublesAtStart.set(
      range.start,
      weekLoadConfig(profile, phase, hasMatch).maxDoubles,
    );
  });

  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    const iso = isoDate(date);
    if (maxDoublesAtStart.has(i)) {
      doublesThisWeek = 0;
      weeklyMaxDoubles = maxDoublesAtStart.get(i)!;
    }

    const cell = blockMap[iso];
    const type: DayType = cell?.type ?? "rest";

    let session: SessionDay;

    if (type === "match") {
      session = {
        date: iso,
        dayName: dayName(date),
        dayType: "match",
        title: "Dzień meczowy",
        goalLabel: "Mecz",
        intensity: "wysoka",
        durationMin: 90,
        reason:
          "To Twój dzień meczu — najważniejsze obciążenie tygodnia. Skup się na meczu i odżywieniu.",
        safetyNote:
          "Brak dodatkowego ciężkiego treningu w dniu meczu. Dobra rozgrzewka i nawodnienie.",
        whyToday:
          "Mecz jest głównym bodźcem dnia. Reszta tygodnia była zaplanowana wokół tej daty.",
        sessionType: "Mecz",
        goalOfSession: "Występ meczowy zgodnie z rolą na boisku.",
        riskManaged:
          "Bez dodatkowego treningu i ciężkich obciążeń — pełna świeżość na mecz.",
        avoidToday: "Bez dodatkowych sesji i ciężkich nóg.",
        mdLabel: "MD",
        slotLabel: null,
        sections: {
          warmup: [
            { name: "Rozgrzewka przedmeczowa", prescription: "15 min RAMP + piłka" },
          ],
          main: [{ name: "Mecz", prescription: "gra wg roli na boisku" }],
          accessory: [],
          footballTransfer: [],
          cooldown: cooldown(),
        },
        secondSession: null,
      };
      lastWasHard = true;
    } else if (type === "club") {
      session = {
        date: iso,
        dayName: dayName(date),
        dayType: "club",
        title: "Trening klubowy (monitoring)",
        goalLabel: "Obciążenie klubowe",
        intensity: "umiarkowana",
        durationMin: 90,
        reason:
          "Tego dnia masz trening z klubem — liczymy go jako obciążenie. Nie dokładamy ćwiczeń do samego treningu.",
        safetyNote:
          "Trening klubowy to realne obciążenie. Po nim monitoruj odczucia i sen.",
        whyToday:
          "Trening klubowy jest wliczany do tygodniowego obciążenia, dlatego to on jest sesją główną dnia.",
        sessionType: "Trening klubowy (monitoring)",
        goalOfSession: "Realizacja treningu klubowego jako głównego obciążenia.",
        riskManaged:
          "Nie dokładamy ćwiczeń do treningu klubowego — tylko monitoring obciążenia.",
        avoidToday:
          "Bez twardego kondycyjnego i ciężkich nóg dodatkowo w tym samym dniu.",
        mdLabel: mdLabelFor(date, profile),
        slotLabel: null,
        sections: {
          warmup: [],
          main: [],
          accessory: [],
          footballTransfer: [],
          cooldown: [],
        },
        secondSession: null,
      };
      lastWasHard = true;
    } else if (type === "md-1") {
      let built = md1Session(profile);
      const pain = applyPainSafety(built, profile);
      built = pain.built;
      const youth = youthSafety(built, profile, pain.note);
      built = youth.built;
      session = {
        date: iso,
        dayName: dayName(date),
        dayType: "md-1",
        title: built.title,
        goalLabel: GOAL_LABELS[profile.goal],
        intensity: built.intensity,
        durationMin: built.durationMin,
        reason:
          "Dzień przed meczem (MD-1): obniżamy intensywność, bez ciężkich nóg i dużej objętości sprintów.",
        safetyNote:
          youth.note ??
          "MD-1: tylko aktywacja, brak maksymalnych sprintów i ciężkiego dolnego partii ciała.",
        whyToday:
          "Dzień przed meczem ma Cię odświeżyć, a nie zmęczyć. Stąd lekka aktywacja zamiast ciężkiego treningu.",
        sessionType: built.sessionType,
        goalOfSession: built.goalOfSession,
        riskManaged: built.riskManaged,
        avoidToday: built.avoidToday,
        mdLabel: "MD-1",
        slotLabel: null,
        sections: {
          warmup: warmup(),
          main: built.main,
          accessory: built.accessory,
          footballTransfer: built.footballTransfer,
          cooldown: cooldown(),
        },
        secondSession: null,
      };
      lastWasHard = false;
    } else if (type === "recovery") {
      const built = recoverySession();
      session = {
        date: iso,
        dayName: dayName(date),
        dayType: "recovery",
        title: built.title,
        goalLabel: "Regeneracja",
        intensity: "niska",
        durationMin: built.durationMin,
        reason:
          "Po cięższym dniu wstawiamy regenerację, aby uniknąć śmieciowej objętości i przeciążenia.",
        safetyNote: null,
        whyToday:
          "Dzień wcześniej było duże obciążenie — regeneracja przyspiesza adaptację i chroni przed przeciążeniem.",
        sessionType: built.sessionType,
        goalOfSession: built.goalOfSession,
        riskManaged: built.riskManaged,
        avoidToday: built.avoidToday,
        mdLabel: mdLabelFor(date, profile),
        slotLabel: null,
        sections: {
          warmup: [],
          main: built.main,
          accessory: built.accessory,
          footballTransfer: built.footballTransfer,
          cooldown: cooldown(),
        },
        secondSession: null,
      };
      lastWasHard = false;
    } else if (type === "rest") {
      // Dzień wolny — bez dokładania sesji. Wyjątek: MD+1 trafia do gałęzi recovery.
      session = {
        date: iso,
        dayName: dayName(date),
        dayType: "rest",
        title: "Dzień wolny",
        goalLabel: "Wolne",
        intensity: "niska",
        durationMin: 0,
        reason:
          "Nie wybrałeś tego dnia jako dnia treningu indywidualnego — Loadwise nie dokłada sesji losowo.",
        safetyNote: null,
        whyToday:
          "Plan respektuje Twój kalendarz: trenujesz indywidualnie tylko w wybrane dni, a regeneracja jest chroniona.",
        sessionType: "Dzień wolny",
        goalOfSession:
          "Odpoczynek i regeneracja — w razie ochoty lekka mobilność lub spacer.",
        riskManaged:
          "Brak narzuconego obciążenia chroni przed przetrenowaniem i utrzymuje świeżość.",
        avoidToday: "Bez obowiązkowego treningu — jeśli chcesz, tylko lekki ruch.",
        mdLabel: mdLabelFor(date, profile),
        slotLabel: null,
        sections: {
          warmup: [],
          main: [],
          accessory: [],
          footballTransfer: [],
          cooldown: [],
        },
        secondSession: null,
      };
      lastWasHard = false;
    } else {
      // type === "training": wybór sensownej sesji zamiast domyślnej regeneracji
      const toMatch = daysToMatch(date, profile);
      const sinceMatch = daysSinceMatch(date, profile);
      let built: Built;
      let reason: string;
      let whyToday: string;

      if (toMatch === 2) {
        built = buildSharpness(profile);
        reason =
          "Dwa dni przed meczem (MD-2): ostrość i lekka szybkość, kończysz świeży.";
        whyToday =
          "MD-2 to moment na ostrość piłkarską i aktywację — bez dokładania zmęczenia przed meczem.";
      } else if (sinceMatch === 1) {
        built = buildCompensation(profile);
        reason =
          "Dzień po meczu (MD+1): lekka kompensacja i rozruszanie zamiast biernej regeneracji.";
        whyToday =
          "Po meczu lekka praca pomaga się rozruszać. Jeśli grałeś dużo lub czujesz się słabo, check-in zmieni to w regenerację.";
      } else {
        const stimulus = cell?.stimulus;
        if (lastWasHard && !profile.painInjury && stimulus === undefined) {
          // Tylko brak bodźca może zostać zamieniony na lżejszą pracę. Jawne
          // bodźce z kwot kategorii (siła/sprint/bieganie) nie mogą wypaść.
          built = buildLightAlternative(profile);
          reason =
            "Dzień po większym obciążeniu: kontrolowana, lżejsza praca zamiast ciężkiego bodźca.";
          whyToday =
            "Wczoraj było duże obciążenie — dziś lżejszy, sensowny bodziec utrzymuje rozwój bez przeciążenia.";
        } else if (stimulus) {
          built = buildStimulus(stimulus, profile);
          reason = `Bodziec tygodnia: ${built.sessionType.toLowerCase()} — plan rozkłada zdolności tak, by cel (${GOAL_LABELS[profile.goal].toLowerCase()}) miał priorytet, ale bez gubienia siły, sprintu, biegania i piłki.`;
          whyToday = `To Twój dzień treningu indywidualnego, a w tym tygodniu przypada na niego bodziec: ${built.sessionType.toLowerCase()}.`;
        } else {
          built = buildByGoal(profile);
          reason = `Sesja ukierunkowana na Twój cel: ${GOAL_LABELS[profile.goal].toLowerCase()}.`;
          whyToday = `Wybrano dziś, bo to Twój dzień treningu indywidualnego — dobry moment na rozwój w obszarze: ${GOAL_LABELS[profile.goal].toLowerCase()}.`;
        }
      }


      const pain = applyPainSafety(built, profile);
      built = pain.built;
      const youth = youthSafety(built, profile, pain.note);
      built = youth.built;
      session = {
        date: iso,
        dayName: dayName(date),
        dayType: "training",
        title: built.title,
        goalLabel: GOAL_LABELS[profile.goal],
        intensity: built.intensity,
        durationMin: built.durationMin,
        reason,
        safetyNote: youth.note,
        whyToday,
        sessionType: built.sessionType,
        goalOfSession: built.goalOfSession,
        riskManaged: built.riskManaged,
        avoidToday: built.avoidToday,
        mdLabel: mdLabelFor(date, profile),
        slotLabel: null,
        sections: {
          warmup: warmup(),
          main: built.main,
          accessory: built.accessory,
          footballTransfer: built.footballTransfer,
          cooldown: cooldown(),
        },
        secondSession: null,
      };
      lastWasHard = built.intensity === "wysoka";
    }


    // Druga sesja: najpierw realizuje konkretną kategorię z tygodniowej kwoty.
    // Dla zdrowych profili nie dokładamy już automatycznych fillerów.
    if (doublesThisWeek < weeklyMaxDoubles) {
      let second: SessionDay | null = null;
      if (cell?.secondStimulus) {
        const built = buildStimulus(cell.secondStimulus, profile);
        second = builtToSecondSession(built, date, profile);
        second.reason = `Druga sesja realizuje brakującą kategorię tygodnia: ${built.sessionType.toLowerCase()}.`;
        second.whyToday =
          "Podwójny dzień został użyty celowo, aby uzupełnić siłę/sprint/bieganie/motorykę zamiast dokładać lekki filler.";
      } else if (!isHealthyPerformanceProfile(profile)) {
        second = buildSecondSession(session.dayType, date, profile);
      }
      if (second) {
        session.secondSession = second;
        session.slotLabel =
          session.dayType === "club"
            ? "Sesja 1 (PM) — klub"
            : "Sesja 1";
        second.slotLabel = "Sesja 2 (lekka)";
        doublesThisWeek++;
      }
    }

    session.generatorVersion = PLAN_ENGINE_VERSION;
    if (session.secondSession) {
      session.secondSession.generatorVersion = PLAN_ENGINE_VERSION;
    }
    out.push(session);
  }

  return out;
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
  if (readiness && readiness.overall < 7) return false;
  return true;
}

/** Nakłada logikę readiness/bólu na dzisiejszą sesję i zwraca decyzję. */
export function applyReadiness(
  session: SessionDay,
  readiness: Readiness | undefined,
  profile: Profile,
): { session: SessionDay; decision: DecisionResult } {
  if (session.dayType === "match") {
    return {
      session,
      decision: {
        headline: "Dziś mecz",
        detail: "Skup się na rozgrzewce, nawodnieniu i grze. Powodzenia!",
        adjustment: null,
      },
    };
  }
  if (session.dayType === "club") {
    return {
      session,
      decision: {
        headline: "Dziś trening klubowy",
        detail:
          "To Twoje główne obciążenie dnia. Po treningu oceń jego ciężkość.",
        adjustment: null,
      },
    };
  }

  if (!readiness) {
    return {
      session,
      decision: {
        headline: "Uzupełnij check-in gotowości",
        detail:
          "Zaznacz, jak się dziś czujesz, a dopasujemy intensywność sesji.",
        adjustment: null,
      },
    };
  }

  const r = readiness.overall;
  let factor = 1;
  let adjustment: string | null = null;
  let removeHard = false;
  let recoveryOnly = false;

  if (r >= 8) {
    factor = 1;
    adjustment = null;
  } else if (r >= 6) {
    factor = 0.85;
    adjustment = "Gotowość 6–7: zmniejszamy objętość o ok. 10–20%.";
  } else if (r >= 4) {
    factor = 0.65;
    removeHard = true;
    adjustment =
      "Gotowość 4–5: redukcja objętości o 30–40% i usunięcie pracy o wysokiej intensywności.";
  } else {
    recoveryOnly = true;
    adjustment =
      "Gotowość 1–3: tylko regeneracja, mobilność, oddech i lekka technika.";
  }

  let adjusted: SessionDay = { ...session };

  if (recoveryOnly) {
    const built = recoverySession();
    adjusted = {
      ...session,
      title: "Regeneracja (na podstawie gotowości)",
      intensity: "niska",
      durationMin: built.durationMin,
      sections: {
        warmup: [],
        main: built.main,
        accessory: built.accessory,
        footballTransfer: [],
        cooldown: cooldown(),
      },
    };
  } else {
    adjusted = {
      ...session,
      durationMin: Math.round(session.durationMin * factor),
      intensity: removeHard
        ? lowerIntensity(session.intensity, 2)
        : factor < 1
          ? lowerIntensity(session.intensity, 1)
          : session.intensity,
      sections: {
        ...session.sections,
        main: removeHard
          ? session.sections.main.map((m) =>
              /sprint|zryw|przyspiesz|maksym|przysiad|martwy/i.test(m.name)
                ? {
                    name: "Lekka technika (zamiast pracy intensywnej)",
                    prescription: "spokojne podania i prowadzenie",
                  }
                : m,
            )
          : session.sections.main,
      },
    };
  }

  // Druga sesja: usuwana, jeśli gotowość < 7 lub ból
  if (adjusted.secondSession && !secondSessionAllowedToday(readiness, profile)) {
    adjusted = { ...adjusted, secondSession: null, slotLabel: null };
  }

  if (profile.painInjury) {
    adjustment =
      (adjustment ? adjustment + " " : "") +
      "Zgłoszony ból/uraz: blokujemy intensywne sprinty, ciężkie nogi i ryzykowne plyometrie.";
  }

  return {
    session: adjusted,
    decision: {
      headline: `Gotowość ${r}/10 — ${
        r >= 8
          ? "działamy normalnie"
          : r >= 6
            ? "lekka redukcja"
            : r >= 4
              ? "mocna redukcja"
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
