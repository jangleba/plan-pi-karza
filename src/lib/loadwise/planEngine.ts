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
        title: "Sesja wytrzymałości specjalnej",
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

// ---------- Drugie sesje (zawsze lekkie) ----------

function secondBallMastery(): Built {
  return {
    title: "Lekkie czucie piłki (AM)",
    sessionType: "Ball mastery (lekka)",
    intensity: "niska",
    durationMin: 20,
    goalOfSession: "Utrzymanie czucia piłki bez generowania zmęczenia.",
    riskManaged: "Bardzo niska intensywność — bezpieczne uzupełnienie dnia.",
    avoidToday: "Bez zrywów, bez obciążeń. Kończysz świeży na sesję główną.",
    main: [
      {
        name: "Żonglerka i prowadzenie",
        prescription: "8 min, spokojnie",
        cue: "Miękkie kontakty, obie nogi.",
      },
      {
        name: "Podania o ścianę / odbojnik",
        prescription: "8 min, różne kierunki",
        cue: "Przyjęcie kierunkowe, skan przed kontaktem.",
      },
    ],
    accessory: [],
    footballTransfer: [],
  };
}

function secondMobilityActivation(): Built {
  return {
    title: "Mobilność i aktywacja (AM)",
    sessionType: "Mobilność / aktywacja (lekka)",
    intensity: "niska",
    durationMin: 20,
    goalOfSession: "Przygotowanie ciała do sesji głównej bez zmęczenia.",
    riskManaged: "Niska intensywność, fokus na jakość ruchu.",
    avoidToday: "Bez intensywnych zrywów i obciążeń.",
    main: [
      {
        name: "Mobilność bioder, kostek i kręgosłupa",
        prescription: "10 min",
        cue: "Pełen, kontrolowany zakres.",
      },
      {
        name: "Aktywacja pośladków i tułowia",
        prescription: "8 min: mostki, ptak-pies, dead bug",
        cue: "Napięcie tułowia, spokojny oddech.",
      },
    ],
    accessory: [],
    footballTransfer: [],
  };
}

function secondPrehab(): Built {
  return {
    title: "Prehab i stabilizacja (AM)",
    sessionType: "Prehab (lekka)",
    intensity: "niska",
    durationMin: 20,
    goalOfSession:
      "Wzmocnienie odporności bioder, przywodzicieli, ścięgien i łydek.",
    riskManaged: "Lekka praca prewencyjna — bez przeciążenia.",
    avoidToday: "Bez ciężkich obciążeń i zrywów.",
    main: [
      {
        name: "Copenhagen (przywodziciele) — lekko",
        prescription: "2 × 6 na stronę",
        cue: "Kontrola, bez bólu.",
        easier: "Wersja z kolan.",
      },
      {
        name: "Nordic curl ekscentryczny — lekko",
        prescription: "2 × 4",
        cue: "Powolne opuszczanie, kontrola.",
        easier: "Mniejszy zakres / podpora.",
      },
      {
        name: "Wspięcia na łydki",
        prescription: "2 × 12",
        cue: "Pełen zakres, pauza w górze.",
      },
    ],
    accessory: [],
    footballTransfer: [],
  };
}

function secondLightTechnical(): Built {
  return {
    title: "Lekka praca techniczna (druga sesja)",
    sessionType: "Technika (lekka)",
    intensity: "niska",
    durationMin: 25,
    goalOfSession:
      "Doskonalenie techniki i decyzji przy niskim obciążeniu fizycznym.",
    riskManaged:
      "Niska intensywność — bez zrywów maksymalnych i ciężkich nóg w drugiej sesji.",
    avoidToday: "Bez sprintów i ciężkich obciążeń jako druga sesja dnia.",
    main: [
      {
        name: "Pierwszy kontakt i skanowanie",
        prescription: "10 min przyjęć kierunkowych",
        cue: "Skan przed przyjęciem, kontakt w ruch.",
      },
      {
        name: "Podania pod presją czasu",
        prescription: "10 min, różne dystanse",
        cue: "Szybka decyzja, celność przed siłą.",
        harder: "Dodaj słabszą nogę co drugie powtórzenie.",
      },
    ],
    accessory: [],
    footballTransfer: [
      {
        name: "Akcja pozycyjna w spokojnym tempie",
        prescription: "5 min wg roli",
        cue: "Realizuj zadania swojej pozycji.",
      },
    ],
  };
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

function dayTypeFor(date: Date, profile: Profile): DayType {
  // 1. Mecz ma priorytet nad wszystkim.
  if (isMatchDay(date, profile)) return "match";
  // 2. MD-1 (dzień przed meczem) — lekki.
  if (daysToMatch(date, profile) === 1) return "md-1";
  // 3. Trening klubowy = realne obciążenie.
  if (profile.clubTrainingDays.includes(isoDayOfWeek(date))) return "club";
  // 4. Sesje Loadwise tylko w wybranych dniach indywidualnych.
  if (profile.individualTrainingDays.includes(isoDayOfWeek(date)))
    return "training";
  // 5. MD+1 zwykle regeneracja/niska intensywność.
  if (daysSinceMatch(date, profile) === 1) return "recovery";
  // 6. W pozostałe dni: wolne (bez dokładania sesji losowo).
  return "rest";
}

function builtToSecondSession(
  built: Built,
  date: Date,
  profile: Profile,
): SessionDay {
  return {
    date: isoDate(date),
    dayName: dayName(date),
    dayType: built.sessionType.toLowerCase().includes("regener")
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
    // AM lekka + PM klub — kanoniczny, bezpieczny przykład
    const choices = young
      ? [secondMobilityActivation(), secondBallMastery()]
      : [secondBallMastery(), secondMobilityActivation(), secondPrehab()];
    const pick = choices[(date.getDate() + choices.length) % choices.length];
    return builtToSecondSession(pick, date, profile);
  }

  // Dzień własnego treningu
  if (primaryType === "training") {
    // "light_only" dokłada drugie sesje tylko w dni klubowe; tu nic.
    if (mode === "light_only") return null;
    // "yes_if_safe": dołóż lekką pracę techniczną/mobilność, nigdy sprint+ciężkie nogi
    const built = young ? secondMobilityActivation() : secondLightTechnical();
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
        title: "Mikrodawka szybkości",
        sessionType: "Szybkość (mikrodawka)",
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
      return {
        title: "Lekka praca techniczna i prehab",
        sessionType: "Technika / prehab (lekka)",
        intensity: "niska",
        durationMin: young ? 30 : 35,
        goalOfSession:
          "Doskonalenie techniki i odporności przy niskim obciążeniu.",
        riskManaged:
          "Niska intensywność po cięższym dniu — bez zrywów i ciężkich nóg.",
        avoidToday:
          "Bez sprintów maksymalnych, ciężkich nóg i twardego kondycyjnego.",
        main: [
          {
            name: "Pierwszy kontakt i skanowanie",
            prescription: "10 min przyjęć kierunkowych",
            cue: "Skan przed przyjęciem, kontakt w ruch.",
          },
          {
            name: "Podania obunóż",
            prescription: "10 min, różne dystanse",
            cue: "Celność przed siłą, obie nogi.",
          },
        ],
        accessory: [
          {
            name: "Prehab: przywodziciele, łydki, tylne uda",
            prescription: "8 min, lekko",
            cue: "Kontrola, bez bólu.",
          },
        ],
        footballTransfer: [
          {
            name: "Akcja pozycyjna w spokojnym tempie",
            prescription: "6 min wg roli",
            cue: "Realizuj zadania swojej pozycji.",
          },
        ],
      };
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

  switch (profile.goal) {
    case "strength":
      if (deload) {
        out = ["strength_deload", "ball", "speed_exposure", "prehab"];
      } else if (phase === "peak") {
        out = ["strength", "power", "sprint", "ball", "prehab"];
      } else if (phase === "development") {
        out = ["strength", "ball", "power", "endurance_light", "speed_exposure"];
      } else {
        out = ["strength_base", "ball", "speed_exposure", "endurance_light", "prehab"];
      }
      break;
    case "speed":
      if (deload) {
        out = ["speed_exposure", "ball", "strength_deload", "prehab"];
      } else if (phase === "peak") {
        out = ["sprint", "cod", "power", "ball", "endurance_light"];
      } else if (phase === "development") {
        out = ["sprint", "speed_exposure", "power", "ball", "endurance_light"];
      } else {
        out = ["speed_exposure", "strength_base", "sprint", "ball", "prehab"];
      }
      break;
    case "endurance": {
      const main = enduranceMainForPhase(phase);
      if (deload) {
        out = [main, "ball", "speed_exposure", "prehab"];
      } else if (phase === "peak") {
        out = [main, "endurance_light", "speed_exposure", "strength", "ball"];
      } else if (phase === "development") {
        out = [main, "ball", "strength", "endurance_light", "prehab"];
      } else {
        // adaptation
        out = [main, "ball", "speed_exposure", "strength_base", "prehab"];
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
      out = ["prehab", "ball", "endurance_light"];
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

/**
 * Przypisuje bodziec do każdego indywidualnego dnia treningowego w obrębie
 * każdego 7-dniowego bloku planu. MD-2 i MD+1 zostają obsłużone osobno
 * (ostrość / kompensacja), więc nie biorą udziału w dystrybucji.
 */
function planStimuli(
  profile: Profile,
  startDate: Date,
  days: number,
): Record<string, Stimulus> {
  const map: Record<string, Stimulus> = {};
  if (profile.goal === "return" || profile.painInjury) return map;

  const totalWeeks = Math.max(1, Math.ceil(days / 7));

  for (let blockStart = 0; blockStart < days; blockStart += 7) {
    const weekIndex = Math.floor(blockStart / 7);
    const phase = phaseOf(weekIndex, totalWeeks);
    const trainingDates: string[] = [];
    let clubCount = 0;
    let matchCount = 0;

    for (let i = blockStart; i < Math.min(blockStart + 7, days); i++) {
      const date = addDays(startDate, i);
      const type = dayTypeFor(date, profile);
      if (type === "club") clubCount++;
      if (type === "match") matchCount++;
      if (type !== "training") continue;
      // MD-2 (ostrość) i MD+1 (kompensacja) mają dedykowane sesje.
      if (daysToMatch(date, profile) === 2) continue;
      if (daysSinceMatch(date, profile) === 1) continue;
      trainingDates.push(isoDate(date));
    }

    if (trainingDates.length === 0) continue;

    const desired = weeklyStimuli(profile, clubCount, matchCount, phase);
    // Wypełniacze zależne od fazy — w deloadzie tylko lekkie bodźce.
    const fillers: Stimulus[] =
      phase === "deload"
        ? ["ball", "prehab", "endurance_light"]
        : ["ball", "prehab", "endurance_light", "speed_exposure"];

    trainingDates.forEach((iso, idx) => {
      const stim =
        idx < desired.length
          ? desired[idx]
          : fillers[(idx - desired.length) % fillers.length];
      map[iso] = stim;
    });
  }

  return map;
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

/** Krótki bodziec szybkościowy: technika biegu, reakcja, microdose. */
function buildSpeedMicro(profile: Profile): Built {
  const young = isYoung(profile.age);
  const sprintCap = young ? Math.min(120, MAX_SPRINT_M) : MAX_SPRINT_M;
  return {
    title: "Mikrodawka szybkości i technika biegu",
    sessionType: "Szybkość (mikrodawka)",
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
  switch (stimulus) {
    case "strength":
      return buildByGoal({ ...profile, goal: "strength" });
    case "power":
      return buildPower(profile);
    case "sprint":
      return buildByGoal({ ...profile, goal: "speed" });
    case "speed_micro":
      return buildSpeedMicro(profile);
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
}

/** Główny generator — zwraca bezpieczny plan miesięczny (domyślnie 28 dni) od dziś. */
export function generatePlan(
  profile: Profile,
  start?: Date,
  days = 28,
): SessionDay[] {
  const startDate = start ?? warsawToday();
  const out: SessionDay[] = [];
  const stimulusMap = planStimuli(profile, startDate, days);

  let lastWasHard = false;


  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    const iso = isoDate(date);
    const type = dayTypeFor(date, profile);

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
        const stimulus = stimulusMap[iso];
        if (
          lastWasHard &&
          !profile.painInjury &&
          (stimulus === undefined || isHardStimulus(stimulus))
        ) {
          // Nie stawiamy ciężkiego bodźca dzień po dużym obciążeniu (np. po klubie).
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


    // Druga, lekka sesja (jeśli dozwolona i bezpieczna)
    const second = buildSecondSession(session.dayType, date, profile);
    if (second) {
      session.secondSession = second;
      session.slotLabel =
        session.dayType === "club"
          ? "Sesja główna (PM) — klub"
          : "Sesja główna";
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
