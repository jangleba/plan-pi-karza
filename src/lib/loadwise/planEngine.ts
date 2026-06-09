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
  parseIso,
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
    { name: "Trucht i mobilizacja", prescription: "5 min, niska intensywność" },
    {
      name: "Rozgrzewka dynamiczna (RAMP)",
      prescription: "wykroki, krążenia, otwieranie bioder — 6 min",
    },
    {
      name: "Aktywacja z piłką",
      prescription: "lekkie podania i prowadzenie — 4 min",
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
  main: ExerciseItem[];
  accessory: ExerciseItem[];
  intensity: Intensity;
  durationMin: number;
}

function buildByGoal(profile: Profile): Built {
  const young = isYoung(profile.age);
  const sprintCap = young ? Math.min(160, MAX_SPRINT_M) : MAX_SPRINT_M;

  switch (profile.goal) {
    case "speed":
      return {
        title: "Sesja szybkości i przyspieszeń",
        intensity: "wysoka",
        durationMin: young ? 50 : 60,
        main: [
          {
            name: "Sprinty z piłką (akceleracja)",
            prescription: `6 × 20 m, pełna przerwa — łącznie ${Math.min(120, sprintCap)} m`,
          },
          {
            name: "Sprinty liniowe",
            prescription: `${young ? 4 : 6} × 20 m, przerwa 90 s — łącznie ${Math.min(young ? 80 : 120, sprintCap)} m`,
          },
        ],
        accessory: [
          {
            name: "Zwody i zmiana kierunku",
            prescription: "5 × przejście slalomu z piłką",
          },
        ],
      };
    case "strength":
      return {
        title: young ? "Sesja siły bazowej" : "Sesja siły piłkarskiej",
        intensity: young ? "umiarkowana" : "wysoka",
        durationMin: 55,
        main: young
          ? [
              { name: "Przysiad z masą ciała", prescription: "4 × 10, technika" },
              { name: "Wykroki w miejscu", prescription: "3 × 8 na nogę" },
              { name: "Plank", prescription: "3 × 30 s" },
            ]
          : [
              { name: "Przysiad", prescription: "4 × 6, ciężar kontrolowany" },
              { name: "Martwy ciąg rumuński", prescription: "3 × 8" },
              { name: "Wykrok bułgarski", prescription: "3 × 8 na nogę" },
            ],
        accessory: [
          { name: "Stabilizacja core", prescription: "3 × 40 s plank boczny" },
        ],
      };
    case "endurance":
      return {
        title: "Sesja wytrzymałości specjalnej",
        intensity: "umiarkowana",
        durationMin: young ? 45 : 55,
        main: [
          {
            name: "Interwały biegowe z piłką",
            prescription: `${young ? 6 : 8} × 1 min bieg / 1 min trucht`,
          },
          {
            name: "Gra na małym polu (symulacja)",
            prescription: "4 × 3 min, przerwa 2 min",
          },
        ],
        accessory: [
          { name: "Prowadzenie piłki tempem", prescription: "6 × 40 m luźno" },
        ],
      };
    case "mobility":
      return {
        title: "Sesja mobilności i techniki",
        intensity: "niska",
        durationMin: 40,
        main: [
          {
            name: "Mobilność bioder i kostek",
            prescription: "6 ćwiczeń × 8 powtórzeń",
          },
          {
            name: "Technika podań obunóż",
            prescription: "10 min przy ścianie / z partnerem",
          },
        ],
        accessory: [
          { name: "Praca nad pierwszym kontaktem", prescription: "8 min" },
        ],
      };
    case "return":
      return {
        title: "Powrót do rytmu — sesja kontrolowana",
        intensity: "niska",
        durationMin: 40,
        main: [
          {
            name: "Lekki bieg ciągły",
            prescription: "10 min, tętno komfortowe",
          },
          {
            name: "Technika i podania",
            prescription: "10 min, bez zrywów",
          },
        ],
        accessory: [
          { name: "Lekka koordynacja w drabince", prescription: "5 min" },
        ],
      };
    case "matchready":
    default:
      return {
        title: "Sesja gotowości meczowej",
        intensity: "umiarkowana",
        durationMin: 50,
        main: [
          {
            name: "Aktywacja szybkościowa",
            prescription: `4 × 15 m przyspieszeń — łącznie ${Math.min(60, sprintCap)} m`,
          },
          {
            name: "Sytuacje meczowe 1v1 / podanie-odbiór",
            prescription: "12 min",
          },
          { name: "Wykończenia akcji", prescription: "8 min, średnie tempo" },
        ],
        accessory: [
          { name: "Koordynacja i zwinność", prescription: "6 min drabinka" },
        ],
      };
  }
}

function md1Session(profile: Profile): Built {
  return {
    title: "Aktywacja przedmeczowa (MD-1)",
    intensity: "niska",
    durationMin: 35,
    main: [
      {
        name: "Krótkie zrywy aktywacyjne",
        prescription: "4 × 10 m, luźno (bez maksymalnych sprintów)",
      },
      {
        name: "Podania i pierwszy kontakt",
        prescription: "10 min, spokojne tempo",
      },
      { name: "Stałe fragmenty / ustawienia", prescription: "8 min" },
    ],
    accessory: [
      { name: "Lekka koordynacja", prescription: "5 min drabinka" },
    ],
  };
}

function recoverySession(): Built {
  return {
    title: "Regeneracja i mobilność",
    intensity: "niska",
    durationMin: 30,
    main: [
      { name: "Spacer / bardzo lekki trucht", prescription: "10 min" },
      { name: "Mobilność całego ciała", prescription: "10 min" },
      { name: "Oddech i wyciszenie", prescription: "5 min" },
    ],
    accessory: [
      { name: "Lekka technika piłkarska", prescription: "5 min, bez wysiłku" },
    ],
  };
}

const INTENSITY_ORDER: Intensity[] = ["niska", "umiarkowana", "wysoka"];

function lowerIntensity(i: Intensity, steps: number): Intensity {
  const idx = Math.max(0, INTENSITY_ORDER.indexOf(i) - steps);
  return INTENSITY_ORDER[idx];
}

function applyPainSafety(built: Built, profile: Profile): {
  built: Built;
  note: string | null;
} {
  if (!profile.painInjury) return { built, note: null };
  // Pain/injury override: blokuj intensywne sprinty, ciężkie nogi, ryzykowne plyo
  const safeMain = built.main.map((m) => {
    if (/sprint|zryw|przyspiesz|przysiad|martwy|wykrok|skok|plyo/i.test(m.name)) {
      return {
        name: "Lekka technika piłkarska (zastąpione)",
        prescription: "spokojne podania i prowadzenie — bez bólu",
      };
    }
    return m;
  });
  return {
    built: {
      ...built,
      title: "Sesja z ograniczeniami (ból/uraz)",
      intensity: "niska",
      durationMin: Math.min(built.durationMin, 35),
      main: safeMain,
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
      intensity: lowerIntensity(built.intensity, built.intensity === "wysoka" ? 1 : 0),
    },
    note: note ? note : newNote,
  };
}

function dayTypeFor(date: Date, profile: Profile): DayType {
  const iso = isoDate(date);
  if (profile.matchDate && iso === profile.matchDate) return "match";
  if (
    profile.matchDate &&
    iso === isoDate(addDays(parseIso(profile.matchDate), -1))
  )
    return "md-1";
  if (profile.clubTrainingDays.includes(isoDayOfWeek(date))) return "club";
  return "training";
}

/** Główny generator — zawsze zwraca bezpieczny plan na 7 dni do przodu. */
export function generatePlan(profile: Profile, start?: Date): SessionDay[] {
  const startDate = start ?? warsawToday();
  const days: SessionDay[] = [];

  // wzorzec rozłożenia obciążenia, by uniknąć śmieciowej objętości
  let lastWasHard = false;

  for (let i = 0; i < 7; i++) {
    const date = addDays(startDate, i);
    const iso = isoDate(date);
    let type = dayTypeFor(date, profile);

    // unikaj dwóch ciężkich dni z rzędu we własnych treningach
    if (type === "training" && lastWasHard) {
      type = "recovery";
    }

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
        sections: {
          warmup: [
            { name: "Rozgrzewka przedmeczowa", prescription: "15 min RAMP + piłka" },
          ],
          main: [{ name: "Mecz", prescription: "gra wg roli na boisku" }],
          accessory: [],
          cooldown: cooldown(),
        },
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
          "Tego dnia masz trening z klubem — liczymy go jako obciążenie. Nie dokładamy własnej sesji.",
        safetyNote:
          "Trening klubowy to realne obciążenie. Po nim monitoruj odczucia i sen.",
        whyToday:
          "Trening klubowy jest wliczany do tygodniowego obciążenia, dlatego nie planujemy dodatkowych ćwiczeń.",
        sections: {
          warmup: [],
          main: [
            {
              name: "Monitoruj trening klubowy",
              prescription: "oceń ciężkość sesji (RPE 1–10) po zakończeniu",
            },
            {
              name: "Notuj minuty i odczucia",
              prescription: "zapisz, jak czułeś nogi i intensywność",
            },
          ],
          accessory: [],
          cooldown: [],
        },
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
        sections: {
          warmup: warmup(),
          main: built.main,
          accessory: built.accessory,
          cooldown: cooldown(),
        },
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
        sections: {
          warmup: [],
          main: built.main,
          accessory: built.accessory,
          cooldown: cooldown(),
        },
      };
      lastWasHard = false;
    } else {
      // własny trening — jeden główny cel sesji
      let built = buildByGoal(profile);
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
        reason: `Sesja ukierunkowana na Twój cel: ${GOAL_LABELS[profile.goal].toLowerCase()}. Jeden główny bodziec, bez zbędnej objętości.`,
        safetyNote: youth.note,
        whyToday: `Wybrano dziś, bo dzień jest wolny od meczu i klubu — to dobry moment na rozwój w obszarze: ${GOAL_LABELS[profile.goal].toLowerCase()}.`,
        sections: {
          warmup: warmup(),
          main: built.main,
          accessory: built.accessory,
          cooldown: cooldown(),
        },
      };
      lastWasHard = built.intensity === "wysoka";
    }

    days.push(session);
  }

  return days;
}

export interface DecisionResult {
  headline: string;
  detail: string;
  adjustment: string | null;
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
