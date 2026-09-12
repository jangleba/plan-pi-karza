// Biblioteka bramkarska BallWise IQ.
// 9 rodzin decyzji × 4 poziomy = 36 wariantów. Każdy wariant działa w tym
// samym silniku mikrosymulacji co scenariusze zawodników z pola.

import { defineScenario } from "./scenarioKit";
import type {
  SimAction,
  SimActionOutcome,
  SimScenario,
  SimSourceReference,
  SimTopic,
} from "./types";

type Level = NonNullable<SimScenario["levels"]>[number];
type ReactionId = "stays" | "closes_center" | "jumps";
type ActionKey = "primary" | "secondary" | "reset";

const FIFA_GOAL: SimSourceReference = {
  label: "FIFA Training Centre — Goalkeeping fundamentals: defending the goal",
  url: "https://www.fifatrainingcentre.com/en/environment/fifa-goalkeeper-training/sessions/goalkeeping-fundamentals-defending-the-goal.php",
};

const FIFA_AREA: SimSourceReference = {
  label: "FIFA Training Centre — Goalkeeping fundamentals: defending the penalty area",
  url: "https://www.fifatrainingcentre.com/en/environment/fifa-goalkeeper-training/sessions/goalkeeping-fundamentals-defending-the-penalty-area.php",
};

const FIFA_TRANSITIONS: SimSourceReference = {
  label: "FIFA Training Centre — Managing defensive-offensive-defensive transitions",
  url: "https://www.fifatrainingcentre.com/en/environment/fifa-goalkeeper-training/sessions/managing-defensive-offensive-defensive-transitions.php",
};

const FIFA_GOALKEEPING: SimSourceReference = {
  label: "FIFA Training Centre — Goalkeeping",
  url: "https://www.fifatrainingcentre.com/en/environment/goalkeeping.php",
};

const LEVELS: Array<{
  id: Level;
  code: string;
  label: string;
  decisionMs: number;
  minute: number;
  scoreline: string;
  pressureShift: number;
}> = [
  { id: "beginner", code: "l2", label: "L2", decisionMs: 3000, minute: 18, scoreline: "0:0", pressureShift: 0 },
  { id: "intermediate", code: "l3", label: "L3", decisionMs: 2400, minute: 39, scoreline: "1:0", pressureShift: 2 },
  { id: "advanced", code: "l4", label: "L4", decisionMs: 1900, minute: 67, scoreline: "1:1", pressureShift: 4 },
  { id: "elite", code: "l5", label: "L5", decisionMs: 1400, minute: 86, scoreline: "0:1", pressureShift: 6 },
];

interface Family {
  id: string;
  title: string;
  brief: string;
  phase: string;
  topic: SimTopic;
  source: SimSourceReference;
  zoneLabels: [string, string, string];
  actions: [string, string, string];
  preferred: Record<ReactionId, ActionKey>;
  consequences: Record<ActionKey, string>;
}

const FAMILIES: Family[] = [
  {
    id: "close-shot-angle",
    title: "Kąt przy strzale z bliska",
    brief: "Napastnik schodzi do środka pola karnego. Ustaw kąt i głębokość, zanim odsłoni piłkę do strzału.",
    phase: "Obrona bramki",
    topic: "rest_defence",
    source: FIFA_GOAL,
    zoneLabels: ["Skróć kąt", "Chroń środek", "Zostań na linii"],
    actions: ["Set i obrona", "Atak piłki", "Kontrola linii"],
    preferred: { stays: "primary", closes_center: "reset", jumps: "secondary" },
    consequences: {
      primary: "Niska, stabilna pozycja i barki skierowane do piłki zamykają największą część bramki.",
      secondary: "Agresywne wyjście odbiera czas po wyraźnym wypuszczeniu piłki przez napastnika.",
      reset: "Małe kroki pozwalają skorygować pozycję bez utraty równowagi.",
    },
  },
  {
    id: "cutback",
    title: "Niskie dośrodkowanie i cutback",
    brief: "Skrzydłowy dociera do linii końcowej. Rozpoznaj piłkę wzdłuż bramki, wycofanie albo blokowany tor podania.",
    phase: "Obrona pola karnego",
    topic: "rest_defence",
    source: FIFA_AREA,
    zoneLabels: ["Pierwszy słupek", "Linia podania wstecz", "Strefa bramkowa"],
    actions: ["Przetnij niską piłkę", "Broń wycofanie", "Utrzymaj pozycję"],
    preferred: { stays: "reset", closes_center: "primary", jumps: "secondary" },
    consequences: {
      primary: "Wczesny krok przecina tor niskiego dośrodkowania przed napastnikiem.",
      secondary: "Cofnięcie ciężaru ciała utrzymuje reakcję na wycofanie w okolice jedenastego metra.",
      reset: "Pozycja odniesiona do piłki i bramki nie otwiera bliższego słupka.",
    },
  },
  {
    id: "through-ball",
    title: "Prostopadła piłka: wyjść czy zostać",
    brief: "Podanie mija linię obrony. Oceń przewagę czasową, pierwszy kontakt napastnika i osłonę stopera.",
    phase: "Obrona przestrzeni",
    topic: "transition",
    source: FIFA_AREA,
    zoneLabels: ["Strefa przechwytu", "Punkt 1 na 1", "Pozycja asekuracyjna"],
    actions: ["Wyjdź po piłkę", "Zamknij 1 na 1", "Zostań i prowadź obronę"],
    preferred: { stays: "reset", closes_center: "secondary", jumps: "primary" },
    consequences: {
      primary: "Przewaga do piłki pozwala przejąć ją przed kontaktem napastnika.",
      secondary: "Kontrolowane wyjście zmniejsza bramkę bez przedwczesnego położenia się.",
      reset: "Brak przewagi czasowej wymaga utrzymania pozycji i komunikacji ze stoperem.",
    },
  },
  {
    id: "aerial-cross",
    title: "Dośrodkowanie: chwyt, piąstkowanie czy pozycja",
    brief: "Piłka leci w tłok. Oceń wysokość, tor lotu, kontakt rywali i bezpieczną strefę lądowania.",
    phase: "Obrona pola karnego",
    topic: "rest_defence",
    source: FIFA_AREA,
    zoneLabels: ["Punkt chwytu", "Tor piąstkowania", "Linia reakcji"],
    actions: ["Chwyć wysoko", "Piąstkuj szeroko", "Zostań na reakcję"],
    preferred: { stays: "primary", closes_center: "secondary", jumps: "reset" },
    consequences: {
      primary: "Czysty tor i najwyższy punkt pozwalają zakończyć akcję chwytem.",
      secondary: "Przy kontakcie w tłoku piąstkowanie szeroko usuwa piłkę ze strefy największego zagrożenia.",
      reset: "Nieosiągalna piłka wymaga pozycji do obrony kolejnego uderzenia.",
    },
  },
  {
    id: "one-v-one-touch",
    title: "1 na 1 i ciężki kontakt napastnika",
    brief: "Napastnik prowadzi piłkę centralnie. Jego kolejny kontakt może być ciężki, kontrolowany albo skierowany w bok.",
    phase: "Obrona bramki",
    topic: "transition",
    source: FIFA_AREA,
    zoneLabels: ["Atak ciężkiego kontaktu", "Blok kąta", "Opóźnij decyzję"],
    actions: ["Atakuj piłkę", "Zamknij i wytrzymaj", "Cofnij pół kroku"],
    preferred: { stays: "secondary", closes_center: "reset", jumps: "primary" },
    consequences: {
      primary: "Ciężki kontakt jest wyzwalaczem do zdecydowanego przejęcia piłki.",
      secondary: "Przy kontroli napastnika cierpliwość utrzymuje bramkarza na nogach.",
      reset: "Ruch piłki w bok wymaga korekty kąta, a nie ślepego ataku do przodu.",
    },
  },
  {
    id: "save-or-parry",
    title: "Chwyt czy odbicie poza zagrożenie",
    brief: "Strzał jest szybki i kozłujący. Wybierz chwyt, bezpieczne zbicie szeroko albo kontrolę drugiej piłki.",
    phase: "Obrona bramki",
    topic: "rest_defence",
    source: FIFA_GOAL,
    zoneLabels: ["Linia chwytu", "Szeroka strefa odbicia", "Strefa drugiej piłki"],
    actions: ["Chwyć", "Zbij szeroko", "Zabezpiecz dobitkę"],
    preferred: { stays: "primary", closes_center: "secondary", jumps: "reset" },
    consequences: {
      primary: "Przy czystym torze dłonie i ciało za piłką kończą akcję.",
      secondary: "Trudną piłkę kierujesz szeroko, poza centralną strefę dobitki.",
      reset: "Po odbiciu natychmiast wracasz w linię piłki i organizujesz drugą obronę.",
    },
  },
  {
    id: "fast-release",
    title: "Po obronie: szybkie wznowienie czy pauza",
    brief: "Po chwycie widzisz możliwy kontratak, ale rywale mogą zamknąć pierwsze podanie.",
    phase: "Przejście obrona–atak",
    topic: "transition",
    source: FIFA_TRANSITIONS,
    zoneLabels: ["Natychmiastowy wyrzut", "Zmiana strony", "Kontrola tempa"],
    actions: ["Wyrzuć do kontry", "Przenieś ciężar gry", "Zatrzymaj i ustaw zespół"],
    preferred: { stays: "primary", closes_center: "secondary", jumps: "reset" },
    consequences: {
      primary: "Otwarty odbiorca i przewaga liczebna pozwalają uruchomić kontratak przed odbudową rywala.",
      secondary: "Zamknięty środek otwiera bezpieczne wznowienie na dalszą stronę.",
      reset: "Brak czystego celu oznacza kontrolę piłki i odbudowanie ustawienia zespołu.",
    },
  },
  {
    id: "build-up",
    title: "Budowanie pod pressingiem",
    brief: "Masz piłkę przy nodze. Pierwsza linia pressingu zmienia kierunek i liczbę zawodników w doskoku.",
    phase: "Budowanie od bramkarza",
    topic: "press_manipulation",
    source: FIFA_GOALKEEPING,
    zoneLabels: ["Krótka przewaga", "Podanie łamiące linię", "Bezpieczna strefa długa"],
    actions: ["Graj krótko", "Złam linię podaniem", "Graj długo w zabezpieczenie"],
    preferred: { stays: "secondary", closes_center: "reset", jumps: "primary" },
    consequences: {
      primary: "Doskok uwalnia partnera za pierwszą linią i otwiera bezpieczne podanie krótkie.",
      secondary: "Bierny pressing pozwala znaleźć zawodnika między liniami.",
      reset: "Przy zamknięciu środka dłuższe zagranie do zabezpieczonej strefy ogranicza ryzyko straty pod bramką.",
    },
  },
  {
    id: "second-phase",
    title: "Druga faza po stałym fragmencie",
    brief: "Pierwsza piłka została wybita, lecz akcja trwa. Ustaw linię, skanuj dobitkę i zdecyduj o nowej głębokości.",
    phase: "Przejście po obronie pola karnego",
    topic: "transition",
    source: FIFA_TRANSITIONS,
    zoneLabels: ["Nowa linia strzału", "Kontrola dośrodkowania", "Wyższa asekuracja"],
    actions: ["Ustaw się do strzału", "Zarządzaj kolejną piłką", "Podnieś linię"],
    preferred: { stays: "primary", closes_center: "secondary", jumps: "reset" },
    consequences: {
      primary: "Szybki powrót w linię piłki przygotowuje obronę dobitki.",
      secondary: "Gdy piłka wraca na bok, pozycja i komunikacja przygotowują kolejne dośrodkowanie.",
      reset: "Po oddaleniu zagrożenia wyższa pozycja skraca przestrzeń za linią obrony.",
    },
  },
];

const reactionIds: ReactionId[] = ["stays", "closes_center", "jumps"];
const actionKeys: ActionKey[] = ["primary", "secondary", "reset"];

function quality(preferred: boolean, levelIndex: number): Pick<SimActionOutcome, "progression" | "advantage" | "risk"> {
  if (preferred) {
    return {
      progression: Math.min(0.96, 0.84 + levelIndex * 0.03),
      advantage: Math.min(0.95, 0.82 + levelIndex * 0.035),
      risk: Math.min(0.96, 0.86 + levelIndex * 0.025),
    };
  }
  return {
    progression: Math.max(0.28, 0.48 - levelIndex * 0.04),
    advantage: Math.max(0.25, 0.44 - levelIndex * 0.04),
    risk: Math.max(0.3, 0.54 - levelIndex * 0.05),
  };
}

function makeScenario(family: Family, levelIndex: number): SimScenario {
  const level = LEVELS[levelIndex];
  const actionIds: Record<ActionKey, string> = {
    primary: `${family.id}-primary`,
    secondary: `${family.id}-secondary`,
    reset: `${family.id}-reset`,
  };

  const actions: SimAction[] = actionKeys.map((key, actionIndex) => ({
    id: actionIds[key],
    label: family.actions[actionIndex],
    outcomes: Object.fromEntries(
      reactionIds.map((reaction) => {
        const preferred = family.preferred[reaction] === key;
        return [
          reaction,
          {
            ...quality(preferred, levelIndex),
            consequence: preferred
              ? family.consequences[key]
              : `Ta decyzja nie odpowiada na zmianę obrazu gry. ${family.consequences[key]}`,
            path: preferred
              ? [
                  { x: 50, y: 128 - level.pressureShift },
                  { x: 50 + (actionIndex - 1) * 24, y: 82 - level.pressureShift },
                ]
              : undefined,
          },
        ];
      }),
    ),
  }));

  const scenario = defineScenario({
    id: `gk-${family.id}-${level.code}`,
    title: `${family.title} — ${level.label}`,
    brief: `${family.brief} Na poziomie ${level.label} zmiana obrazu gry następuje szybciej, a margines błędu jest mniejszy.`,
    topic: family.topic,
    positions: ["goalkeeper"],
    levels: [level.id],
    status: "sourced",
    sourceReference: family.source,
    context: {
      minute: level.minute,
      scoreline: level.scoreline,
      phase: family.phase,
      positionLabel: `Bramkarz ${level.label}`,
      weightsNote: `${level.minute}. minuta, wynik ${level.scoreline}. Oceniane są moment decyzji, geometria bramki, przewaga do piłki i kontrola ryzyka.`,
      weights: {
        timing: 1.25 + levelIndex * 0.1,
        body: 1.2,
        progression: family.topic === "transition" || family.topic === "press_manipulation" ? 1.2 : 0.8,
        advantage: 1.1,
        risk: 1.35 + levelIndex * 0.1,
      },
    },
    decisionMs: level.decisionMs,
    actors: [
      { id: "self", kind: "self", label: "BR", path: [{ t: 0, x: 50, y: 132 }, { t: 1, x: 50, y: 126 - level.pressureShift }] },
      { id: "ball", kind: "ball", path: [{ t: 0, x: 36 + level.pressureShift, y: 72 }, { t: 1, x: 48, y: 103 + level.pressureShift }] },
      { id: "attacker", kind: "opponent", label: "Napastnik", path: [{ t: 0, x: 42, y: 68 }, { t: 1, x: 48, y: 96 + level.pressureShift }] },
      { id: "winger", kind: "opponent", label: "Skrzydłowy", path: [{ t: 0, x: 16, y: 70 }, { t: 1, x: 14 + level.pressureShift, y: 100 }] },
      { id: "cb", kind: "mate", label: "Stoper", path: [{ t: 0, x: 60, y: 96 }, { t: 1, x: 56, y: 106 }] },
    ],
    zones: [
      { id: "gk-prime", x: 50, y: 115 - level.pressureShift, radius: 12, label: family.zoneLabels[0], quality: 0.94, note: family.consequences.primary, reaction: "jumps" },
      { id: "gk-adjust", x: 35 + level.pressureShift, y: 122, radius: 12, label: family.zoneLabels[1], quality: 0.82, note: family.consequences.secondary, reaction: "closes_center" },
      { id: "gk-hold", x: 62 - level.pressureShift, y: 130, radius: 11, label: family.zoneLabels[2], quality: 0.72, note: family.consequences.reset, reaction: "stays" },
    ],
    reactions: {
      stays: [{ actorId: "attacker", x: 48, y: 94 }],
      closes_center: [{ actorId: "attacker", x: 51, y: 103 }, { actorId: "winger", x: 24, y: 102 }],
      jumps: [{ actorId: "attacker", x: 49, y: 112 }, { actorId: "ball", x: 49, y: 115 }],
    },
    actions,
    alternatives: Object.fromEntries(
      reactionIds.map((reaction) => [
        reaction,
        {
          actionId: actionIds[family.preferred[reaction]],
          changed: `Po reakcji „${reaction}” najlepsza odpowiedź zmienia się na: ${family.actions[actionKeys.indexOf(family.preferred[reaction])]}.`,
        },
      ]),
    ),
    timingMissNote: "Spóźniona decyzja odbiera przewagę do piłki i zmusza do reakcji awaryjnej.",
    zoneMissNote: "Pozycja nie była odniesiona jednocześnie do piłki, bramki i najgroźniejszego przeciwnika.",
    fallbackConsequence: "Brak decyzji w oknie czasowym pozostawia bramkarza pomiędzy pozycjami.",
  });

  return {
    ...scenario,
    bodyAngles: [
      { id: "set", centerDeg: 0, toleranceDeg: 28, label: "Barki do piłki", quality: 0.95, note: "Niska, stabilna pozycja i barki do piłki umożliwiają reakcję w obie strony." },
      { id: "side-on", centerDeg: 45, toleranceDeg: 30, label: "Półbokiem", quality: 0.75, note: "Półbokiem łatwiej ruszyć do przestrzeni, ale trudniej bronić natychmiastowy strzał." },
      { id: "turned", centerDeg: 90, toleranceDeg: 30, label: "Bokiem do piłki", quality: 0.4, note: "Odwrócone barki ograniczają widzenie i reakcję na zmianę toru piłki." },
    ],
    feet: [
      { foot: "right", quality: 0.9, note: "Wybierz nogę zgodną z kierunkiem zagrania i utrzymaj ciało za piłką." },
      { foot: "left", quality: 0.9, note: "Wybierz nogę zgodną z kierunkiem zagrania i utrzymaj ciało za piłką." },
    ],
    bodyMissNote: "Bramkarz nie zdążył ustawić barków do piłki przed momentem działania.",
  };
}

export const GOALKEEPER_SCENARIOS: SimScenario[] = FAMILIES.flatMap((family) =>
  LEVELS.map((_, levelIndex) => makeScenario(family, levelIndex)),
);
