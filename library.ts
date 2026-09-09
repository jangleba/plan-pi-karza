// Biblioteka zaawansowanych scenariuszy BallWise IQ.
// Wyłącznie dane dla jednego silnika mikrosymulacji — bez logiki UI i bez osobnych ekranów.
// Każdy scenariusz: kilka poprawnych rozwiązań (zależnych od reakcji), reakcja rywala,
// konsekwencja decyzji i zmienny kontekst meczu.

import { defineScenario } from "./scenarioKit";
import type { SimActor, SimActorKind, SimScenario } from "./types";

type Pt = [number, number];

/** Skrót definicji zawodnika: statyczny punkt lub tor ruchu. */
function a(
  id: string,
  kind: SimActorKind,
  label: string | undefined,
  points: Pt | Pt[],
): SimActor {
  const list: Pt[] = Array.isArray(points[0]) ? (points as Pt[]) : [points as Pt];
  const path = list.map((p, i) => ({
    t: list.length === 1 ? 0 : i / (list.length - 1),
    x: p[0],
    y: p[1],
  }));
  return { id, kind, label, path };
}

/** Tło strukturalne — pokazuje szerszy fragment ustawienia zespołu. */
function backdrop(): SimActor[] {
  return [
    a("gk", "mate", "BR", [50, 133]),
    a("bd1", "mate", undefined, [16, 118]),
    a("bd2", "mate", undefined, [84, 118]),
    a("bd3", "opponent", undefined, [50, 30]),
    a("bd4", "opponent", undefined, [22, 46]),
    a("bd5", "opponent", undefined, [78, 46]),
    a("bd6", "mate", undefined, [66, 24]),
  ];
}

const UEFA = {
  label: "UEFA Coaching Convention — materiały metodyczne dla trenerów A/Pro",
  url: "https://uefatechnicalreports.com/",
};
const FIFA = {
  label: "FIFA Training Centre — analizy fazy budowania i przejść",
  url: "https://www.fifatrainingcentre.com/",
};

export const ADVANCED_SCENARIOS: SimScenario[] = [
  defineScenario({
    id: "press-manipulation-cb",
    title: "Prowadzenie piłki jako wabik",
    brief:
      "Prowadzisz piłkę w kierunku napastnika rywala. Dopóki nie wciągniesz go w kontakt, żadna linia podania się nie otworzy.",
    topic: "press_manipulation",
    positions: ["defender"],
    status: "sourced",
    sourceReference: UEFA,
    context: {
      minute: 12,
      scoreline: "0:0",
      phase: "Budowanie od bramkarza",
      positionLabel: "Stoper",
      weightsNote:
        "12. minuta przy 0:0 — priorytetem jest wciągnięcie pressingu, nie szybka progresja.",
      weights: { progression: 1, risk: 1.4 },
    },
    observationMs: 7000,
    actors: [
      ...backdrop(),
      a("ball", "ball", undefined, [[40, 116], [47, 106], [52, 100]]),
      a("self", "self", undefined, [[38, 118], [45, 108], [50, 102]]),
      a("cb2", "mate", "Stoper", [[70, 116], [72, 112]]),
      a("dm", "mate", "Szóstka", [[56, 92], [60, 90]]),
      a("lw", "mate", "Skrzydło", [[10, 82], [9, 70]]),
      a("oppst", "opponent", "Napastnik", [[52, 88], [50, 96], [50, 99]]),
      a("opp8", "opponent", "Ósemka", [[64, 80], [62, 86]]),
      a("opp10", "opponent", undefined, [[34, 82], [36, 88]]),
    ],
    zones: [
      {
        id: "carry-in",
        x: 50,
        y: 101,
        radius: 13,
        label: "Wejście w kontakt",
        quality: 0.92,
        note: "Wszedłeś w kontakt z napastnikiem — jego decyzja odsłania jedną z linii.",
        reaction: "jumps",
      },
      {
        id: "hold-wide",
        x: 26,
        y: 108,
        radius: 13,
        label: "Wyjście na bok",
        quality: 0.7,
        note: "Wyjście na bok wciąga rywala, ale zawęża Twoje pole podania do jednej strony.",
        reaction: "closes_center",
      },
      {
        id: "stand",
        x: 62,
        y: 112,
        radius: 12,
        label: "Zatrzymanie z piłką",
        quality: 0.45,
        note: "Bez ruchu z piłką pressing nie musi podejmować żadnej decyzji.",
        reaction: "stays",
      },
    ],
    reactions: {
      jumps: [
        { actorId: "oppst", x: 48, y: 104 },
        { actorId: "opp8", x: 60, y: 88 },
      ],
      closes_center: [
        { actorId: "oppst", x: 42, y: 96 },
        { actorId: "opp8", x: 54, y: 92 },
      ],
      stays: [
        { actorId: "oppst", x: 50, y: 94 },
        { actorId: "opp8", x: 64, y: 84 },
      ],
    },
    actions: [
      {
        id: "split_pass",
        label: "Podanie w szóstkę",
        outcomes: {
          jumps: {
            progression: 0.94,
            advantage: 0.9,
            risk: 0.82,
            consequence:
              "Napastnik wypadł z cienia — podanie mija pierwszą linię i szóstka gra przodem.",
            path: [
              [50, 102],
              [60, 90],
            ].map(([x, y]) => ({ x, y })),
          },
          closes_center: {
            progression: 0.4,
            advantage: 0.35,
            risk: 0.3,
            consequence: "Środek był domknięty — podanie trafia w pułapkę w strefie odbudowy.",
          },
          stays: {
            progression: 0.5,
            advantage: 0.45,
            risk: 0.5,
            consequence: "Podanie przechodzi, ale szóstka dostaje piłkę tyłem i pod presją.",
          },
        },
      },
      {
        id: "switch",
        label: "Przerzut na drugą stronę",
        outcomes: {
          jumps: {
            progression: 0.7,
            advantage: 0.68,
            risk: 0.8,
            consequence: "Przerzut jest bezpieczny, ale marnujesz wywołany błąd napastnika.",
          },
          closes_center: {
            progression: 0.9,
            advantage: 0.9,
            risk: 0.85,
            consequence:
              "Skoro środek był zamknięty, przerzut otwiera całą wolną stronę boiska.",
            path: [
              [26, 108],
              [72, 112],
            ].map(([x, y]) => ({ x, y })),
          },
          stays: {
            progression: 0.6,
            advantage: 0.55,
            risk: 0.8,
            consequence: "Przerzut utrzymuje piłkę, ale ustawienie rywala się nie zmienia.",
          },
        },
      },
      {
        id: "carry_more",
        label: "Prowadź dalej",
        outcomes: {
          jumps: {
            progression: 0.45,
            advantage: 0.4,
            risk: 0.3,
            consequence: "Prowadzenie w doskakującego rywala kończy się stratą przed polem karnym.",
          },
          closes_center: {
            progression: 0.55,
            advantage: 0.5,
            risk: 0.5,
            consequence: "Kolejne metry z piłką wciągają drugą falę pressingu i zawężają opcje.",
          },
          stays: {
            progression: 0.82,
            advantage: 0.8,
            risk: 0.7,
            consequence:
              "Rywal nie reaguje — kolejne metry z piłką zmuszają w końcu kogoś do wyjścia.",
          },
        },
      },
      {
        id: "back_gk",
        label: "Cofnięcie do bramkarza",
        outcomes: {
          jumps: {
            progression: 0.3,
            advantage: 0.3,
            risk: 0.9,
            consequence: "Cofnięcie oddaje wywołaną przewagę, ale nie tracisz piłki.",
          },
          closes_center: {
            progression: 0.45,
            advantage: 0.4,
            risk: 0.92,
            consequence: "Bramkarz przenosi ciężar gry i pressing musi biec od nowa.",
          },
          stays: {
            progression: 0.25,
            advantage: 0.25,
            risk: 0.9,
            consequence: "Cofnięcie bez wywołanego pressingu zeruje całą akcję.",
          },
        },
      },
    ],
    alternatives: {
      jumps: {
        actionId: "split_pass",
        changed:
          "Napastnik wyszedł z linii — podanie między liniami likwidowało cały pierwszy pressing.",
      },
      closes_center: {
        actionId: "switch",
        changed: "Domknięty środek oznacza, że wolna była strona — przerzut kończył akcję pressingu.",
      },
      stays: {
        actionId: "carry_more",
        changed: "Skoro nikt nie wyszedł, kolejne metry z piłką wymuszały decyzję rywala.",
      },
    },
  }),

  defineScenario({
    id: "third-man-cm",
    title: "Gra na trzeciego z odegrania",
    brief:
      "Szóstka ma piłkę, napastnik schodzi do gry. Twoje wejście decyduje, czy odegranie ma adresata za linią.",
    topic: "third_man",
    positions: ["midfielder"],
    status: "sourced",
    sourceReference: FIFA,
    context: {
      minute: 34,
      scoreline: "1:0",
      phase: "Atak pozycyjny",
      positionLabel: "Ósemka",
      weightsNote: "Prowadzisz 1:0 — kontrola ryzyka waży więcej niż efektowna progresja.",
      weights: { risk: 1.5, timing: 1.3 },
    },
    observationMs: 6500,
    actors: [
      ...backdrop(),
      a("ball", "ball", undefined, [[48, 100], [50, 96], [52, 94]]),
      a("dm", "mate", "Szóstka", [[46, 102], [49, 98], [51, 96]]),
      a("st", "mate", "Napastnik", [[54, 52], [56, 62], [57, 68]]),
      a("rw", "mate", "Skrzydło", [[88, 62], [88, 54]]),
      a("self", "self", undefined, [[62, 88], [64, 84]]),
      a("opp6", "opponent", "Szóstka", [[52, 76], [51, 78]]),
      a("opp5", "opponent", "Stoper", [[58, 46], [57, 54], [56, 58]]),
      a("opp8", "opponent", undefined, [[70, 78], [68, 80]]),
    ],
    zones: [
      {
        id: "run-beyond",
        x: 68,
        y: 66,
        radius: 14,
        label: "Start za plecy",
        quality: 0.93,
        note: "Startujesz za linię w momencie odegrania napastnika — jesteś trzecim zawodnikiem.",
        reaction: "jumps",
      },
      {
        id: "support-side",
        x: 70,
        y: 88,
        radius: 13,
        label: "Wsparcie z boku",
        quality: 0.72,
        note: "Boczne wsparcie daje pewną opcję, ale nie atakuje przestrzeni za linią.",
        reaction: "stays",
      },
      {
        id: "inside-lane",
        x: 50,
        y: 82,
        radius: 12,
        label: "Wejście w środek",
        quality: 0.5,
        note: "Wchodzisz w strefę kontrolowaną przez szóstkę rywala i zabierasz miejsce napastnikowi.",
        reaction: "closes_center",
      },
    ],
    reactions: {
      jumps: [
        { actorId: "opp5", x: 56, y: 64 },
        { actorId: "opp6", x: 54, y: 80 },
      ],
      stays: [
        { actorId: "opp5", x: 57, y: 52 },
        { actorId: "opp6", x: 52, y: 78 },
      ],
      closes_center: [
        { actorId: "opp6", x: 52, y: 84 },
        { actorId: "opp8", x: 62, y: 84 },
      ],
    },
    actions: [
      {
        id: "third_man_run",
        label: "Odbiór od napastnika",
        outcomes: {
          jumps: {
            progression: 0.95,
            advantage: 0.93,
            risk: 0.75,
            consequence:
              "Stoper wyszedł za napastnikiem — odegranie trafia w Ciebie już za linią obrony.",
            path: [
              [52, 94],
              [57, 68],
              [68, 60],
            ].map(([x, y]) => ({ x, y })),
          },
          stays: {
            progression: 0.6,
            advantage: 0.55,
            risk: 0.6,
            consequence: "Napastnik odgrywa, ale linia się nie rozerwała — grasz przed obroną.",
          },
          closes_center: {
            progression: 0.4,
            advantage: 0.4,
            risk: 0.35,
            consequence: "Odbiór w zatłoczonym środku kończy się przechwytem szóstki.",
          },
        },
      },
      {
        id: "switch_wing",
        label: "Przeniesienie na skrzydło",
        outcomes: {
          jumps: {
            progression: 0.7,
            advantage: 0.68,
            risk: 0.85,
            consequence: "Skrzydło dostaje piłkę 1v1, ale rozerwana linia zdąży wrócić.",
          },
          stays: {
            progression: 0.85,
            advantage: 0.82,
            risk: 0.85,
            consequence:
              "Blok stoi zwarcie — przeniesienie na izolowane skrzydło daje pojedynek 1v1.",
            path: [
              [70, 88],
              [88, 54],
            ].map(([x, y]) => ({ x, y })),
          },
          closes_center: {
            progression: 0.8,
            advantage: 0.78,
            risk: 0.82,
            consequence: "Domknięty środek zostawia bok — przeniesienie omija całą linię pomocy.",
          },
        },
      },
      {
        id: "recycle",
        label: "Odegranie i przebudowa",
        outcomes: {
          jumps: {
            progression: 0.35,
            advantage: 0.3,
            risk: 0.9,
            consequence: "Marnujesz wyjście stopera z linii, ale utrzymujesz piłkę.",
          },
          stays: {
            progression: 0.5,
            advantage: 0.45,
            risk: 0.92,
            consequence: "Przebudowa przy 1:0 jest rozsądna — kontrolujesz tempo meczu.",
          },
          closes_center: {
            progression: 0.55,
            advantage: 0.5,
            risk: 0.92,
            consequence: "Wycofanie piłki rozciąga blok, który wszedł zbyt wysoko w środek.",
          },
        },
      },
      {
        id: "shoot_gap",
        label: "Wejście w lukę z piłką",
        outcomes: {
          jumps: {
            progression: 0.75,
            advantage: 0.72,
            risk: 0.45,
            consequence: "Wejście z piłką w rozerwaną linię działa, ale kosztuje kontakt i tempo.",
          },
          stays: {
            progression: 0.45,
            advantage: 0.4,
            risk: 0.35,
            consequence: "Prowadzenie w zwarty blok kończy się odbiorem i kontrą.",
          },
          closes_center: {
            progression: 0.35,
            advantage: 0.3,
            risk: 0.25,
            consequence: "Strata w środku pola przy 1:0 to najgorszy możliwy scenariusz.",
          },
        },
      },
    ],
    alternatives: {
      jumps: {
        actionId: "third_man_run",
        changed: "Stoper poszedł za napastnikiem — gra na trzeciego zostawiała Cię za linią.",
      },
      stays: {
        actionId: "switch_wing",
        changed: "Blok się nie rozerwał, więc wartość była na izolowanym skrzydle.",
      },
      closes_center: {
        actionId: "switch_wing",
        changed: "Przeciążony środek oznaczał wolną drugą stronę — przeniesienie było najtańsze.",
      },
    },
  }),

  defineScenario({
    id: "overload-isolate-fw",
    title: "Przeciążenie strony i izolacja drugiej",
    brief:
      "Zespół przeciąża prawą stronę. Twoje ustawienie decyduje, czy lewe skrzydło zostanie realnie izolowane.",
    topic: "overload_isolate",
    positions: ["forward", "midfielder"],
    status: "draft",
    context: {
      minute: 58,
      scoreline: "0:1",
      phase: "Atak pozycyjny przeciw niskiemu blokowi",
      positionLabel: "Napastnik",
      weightsNote: "Przegrywasz 0:1 — progresja i tworzenie przewagi ważą więcej niż ryzyko.",
      weights: { progression: 1.5, advantage: 1.4, risk: 0.8 },
    },
    observationMs: 7500,
    actors: [
      ...backdrop(),
      a("ball", "ball", undefined, [[74, 84], [80, 76], [82, 72]]),
      a("rb", "mate", "Boczny", [[86, 90], [88, 80]]),
      a("cm", "mate", "Pomocnik", [[66, 88], [70, 82]]),
      a("lw", "mate", "Lewe skrzydło", [[10, 70], [8, 62]]),
      a("self", "self", undefined, [[56, 50], [58, 54]]),
      a("opp2", "opponent", undefined, [[80, 62], [82, 66]]),
      a("opp6", "opponent", "Szóstka", [[60, 62], [68, 62]]),
      a("opp5", "opponent", "Stoper", [[52, 42], [56, 46]]),
      a("opp3", "opponent", "Boczny", [[24, 50], [34, 52]]),
    ],
    zones: [
      {
        id: "pin-cb",
        x: 46,
        y: 40,
        radius: 14,
        label: "Przypięcie stopera",
        quality: 0.94,
        note: "Trzymasz stopera przypiętego do linii — bloku nie da się przesunąć na stronę piłki.",
        reaction: "stays",
      },
      {
        id: "join-overload",
        x: 74,
        y: 62,
        radius: 14,
        label: "Dołączenie do przeciążenia",
        quality: 0.6,
        note: "Dokładasz zawodnika tam, gdzie i tak jest przewaga — rywal może zagęścić stronę.",
        reaction: "closes_center",
      },
      {
        id: "drop-ball",
        x: 62,
        y: 76,
        radius: 12,
        label: "Zejście do piłki",
        quality: 0.5,
        note: "Zejście zwalnia linię obrony rywala z pilnowania przestrzeni za plecami.",
        reaction: "jumps",
      },
    ],
    reactions: {
      stays: [
        { actorId: "opp5", x: 52, y: 42 },
        { actorId: "opp3", x: 30, y: 50 },
      ],
      closes_center: [
        { actorId: "opp3", x: 48, y: 56 },
        { actorId: "opp6", x: 72, y: 64 },
      ],
      jumps: [
        { actorId: "opp5", x: 60, y: 68 },
        { actorId: "opp6", x: 64, y: 70 },
      ],
    },
    actions: [
      {
        id: "switch_weak",
        label: "Szybki przerzut na słabą stronę",
        outcomes: {
          stays: {
            progression: 0.92,
            advantage: 0.95,
            risk: 0.7,
            consequence:
              "Blok został przy piłce — przerzut zastaje lewe skrzydło w czystym 1v1.",
            path: [
              [82, 72],
              [8, 62],
            ].map(([x, y]) => ({ x, y })),
          },
          closes_center: {
            progression: 0.7,
            advantage: 0.65,
            risk: 0.6,
            consequence: "Boczny rywala już przesunął się do środka — izolacja jest tylko częściowa.",
          },
          jumps: {
            progression: 0.6,
            advantage: 0.55,
            risk: 0.55,
            consequence: "Przerzut jest długi, a rozciągnięty blok zdąży się przesunąć.",
          },
        },
      },
      {
        id: "combine_strong",
        label: "Rozegranie na przeciążonej stronie",
        outcomes: {
          stays: {
            progression: 0.6,
            advantage: 0.55,
            risk: 0.5,
            consequence: "Kombinacja w tłoku daje pół okazji, ale nie wykorzystujesz izolacji.",
          },
          closes_center: {
            progression: 0.45,
            advantage: 0.4,
            risk: 0.35,
            consequence: "Zagęszczony sektor kończy się stratą w strefie kontry rywala.",
          },
          jumps: {
            progression: 0.85,
            advantage: 0.82,
            risk: 0.6,
            consequence: "Rywal wyszedł ze strefy — kombinacja wchodzi w powstałą lukę.",
            path: [
              [82, 72],
              [70, 60],
              [76, 48],
            ].map(([x, y]) => ({ x, y })),
          },
        },
      },
      {
        id: "run_behind",
        label: "Start w przestrzeń za obroną",
        outcomes: {
          stays: {
            progression: 0.7,
            advantage: 0.68,
            risk: 0.55,
            consequence: "Start w plecy zmusza linię do cofnięcia i otwiera pas między liniami.",
          },
          closes_center: {
            progression: 0.75,
            advantage: 0.7,
            risk: 0.6,
            consequence: "Zagęszczony środek zostawia plecy — Twój start zmusza do faulu lub cofnięcia.",
          },
          jumps: {
            progression: 0.9,
            advantage: 0.88,
            risk: 0.6,
            consequence: "Stoper wyszedł z linii — start w jego plecy daje wejście w pole karne.",
            path: [
              [62, 76],
              [58, 44],
            ].map(([x, y]) => ({ x, y })),
          },
        },
      },
      {
        id: "recirculate",
        label: "Cofnięcie i przebudowa",
        outcomes: {
          stays: {
            progression: 0.4,
            advantage: 0.35,
            risk: 0.9,
            consequence: "Przy 0:1 kolejna przebudowa oddaje inicjatywę i czas.",
          },
          closes_center: {
            progression: 0.6,
            advantage: 0.55,
            risk: 0.9,
            consequence: "Przebudowa rozciąga zagęszczony sektor przed kolejnym atakiem.",
          },
          jumps: {
            progression: 0.35,
            advantage: 0.3,
            risk: 0.88,
            consequence: "Cofnięcie marnuje wyjście rywala z linii.",
          },
        },
      },
    ],
    alternatives: {
      stays: {
        actionId: "switch_weak",
        changed: "Blok został na stronie piłki — przerzut zamieniał przeciążenie w realne 1v1.",
      },
      closes_center: {
        actionId: "run_behind",
        changed: "Rywal zszedł do środka, więc wartość przeniosła się do przestrzeni za linią.",
      },
      jumps: {
        actionId: "run_behind",
        changed: "Wyjście stopera zostawiło plecy — start w tę przestrzeń był najtańszą opcją.",
      },
    },
  }),

  defineScenario({
    id: "rotation-fb-cm",
    title: "Rotacja boczny–pomocnik",
    brief:
      "Boczny wchodzi do środka, skrzydłowy trzyma szerokość. Twoja rotacja decyduje, kto zostaje kryty, a kto wolny.",
    topic: "positional_rotation",
    positions: ["midfielder", "defender"],
    status: "draft",
    context: {
      minute: 21,
      scoreline: "0:0",
      phase: "Budowanie w środkowej strefie",
      positionLabel: "Pomocnik",
      weightsNote: "Wczesna faza meczu — testujesz reakcję rywala na rotacje.",
    },
    observationMs: 7000,
    actors: [
      ...backdrop(),
      a("ball", "ball", undefined, [[30, 104], [34, 98], [36, 96]]),
      a("cb", "mate", "Stoper", [[28, 106], [33, 100]]),
      a("fb", "mate", "Boczny", [[12, 92], [26, 86], [34, 82]]),
      a("lw", "mate", "Skrzydło", [[10, 74], [9, 66]]),
      a("self", "self", undefined, [[44, 88], [40, 86]]),
      a("opp7", "opponent", "Skrzydło", [[20, 82], [24, 88]]),
      a("opp6", "opponent", "Szóstka", [[46, 76], [44, 80]]),
      a("opp8", "opponent", undefined, [[58, 82], [54, 84]]),
    ],
    zones: [
      {
        id: "vacate-wide",
        x: 22,
        y: 74,
        radius: 14,
        label: "Wyjście na zwolnione skrzydło",
        quality: 0.9,
        note: "Zamieniasz się miejscami z bocznym — rywal musi wybrać, kogo przekazać.",
        reaction: "closes_center",
      },
      {
        id: "hold-pivot",
        x: 42,
        y: 92,
        radius: 13,
        label: "Utrzymanie pozycji pivotu",
        quality: 0.68,
        note: "Zostajesz w osi — rotacja bocznego nie wywołuje żadnego problemu decyzyjnego.",
        reaction: "stays",
      },
      {
        id: "run-inside",
        x: 52,
        y: 70,
        radius: 13,
        label: "Wejście między linie",
        quality: 0.78,
        note: "Wchodzisz między linie razem z bocznym — mocno, ale zostawiacie strefę odbudowy pustą.",
        reaction: "jumps",
      },
    ],
    reactions: {
      closes_center: [
        { actorId: "opp7", x: 30, y: 86 },
        { actorId: "opp6", x: 42, y: 82 },
      ],
      stays: [
        { actorId: "opp7", x: 22, y: 84 },
        { actorId: "opp6", x: 46, y: 78 },
      ],
      jumps: [
        { actorId: "opp6", x: 50, y: 74 },
        { actorId: "opp8", x: 52, y: 80 },
      ],
    },
    actions: [
      {
        id: "pass_wide",
        label: "Podanie na skrzydło",
        outcomes: {
          closes_center: {
            progression: 0.88,
            advantage: 0.85,
            risk: 0.78,
            consequence: "Rywal poszedł do środka za rotacją — skrzydło przyjmuje bez presji.",
            path: [
              [36, 96],
              [9, 66],
            ].map(([x, y]) => ({ x, y })),
          },
          stays: {
            progression: 0.6,
            advantage: 0.55,
            risk: 0.7,
            consequence: "Podanie dochodzi, ale skrzydło dostaje piłkę w pojedynku tyłem do gry.",
          },
          jumps: {
            progression: 0.7,
            advantage: 0.65,
            risk: 0.6,
            consequence: "Skrzydło ma przestrzeń, choć rywal zdąży doskoczyć w przyjęciu.",
          },
        },
      },
      {
        id: "pass_inside",
        label: "Podanie w środek",
        outcomes: {
          closes_center: {
            progression: 0.4,
            advantage: 0.35,
            risk: 0.3,
            consequence: "Środek został domknięty — podanie trafia w pułapkę.",
          },
          stays: {
            progression: 0.8,
            advantage: 0.78,
            risk: 0.65,
            consequence: "Blok się nie przesunął — podanie w środek łamie pierwszą linię.",
            path: [
              [36, 96],
              [50, 78],
            ].map(([x, y]) => ({ x, y })),
          },
          jumps: {
            progression: 0.55,
            advantage: 0.5,
            risk: 0.4,
            consequence: "Podanie w doskakującego rywala kończy się walką o drugą piłkę.",
          },
        },
      },
      {
        id: "hold_ball",
        label: "Krótkie przytrzymanie i obrót",
        outcomes: {
          closes_center: {
            progression: 0.6,
            advantage: 0.55,
            risk: 0.6,
            consequence: "Obrót pod domkniętym środkiem daje czas, ale nie zmienia obrazu gry.",
          },
          stays: {
            progression: 0.65,
            advantage: 0.6,
            risk: 0.7,
            consequence: "Kontrolujesz tempo, rywal nadal nie musi podejmować decyzji.",
          },
          jumps: {
            progression: 0.9,
            advantage: 0.88,
            risk: 0.6,
            consequence: "Obrót mija doskakującego rywala i otwiera całą wolną strefę przed Tobą.",
            path: [
              [52, 70],
              [56, 56],
            ].map(([x, y]) => ({ x, y })),
          },
        },
      },
      {
        id: "back_cb",
        label: "Cofnięcie do stopera",
        outcomes: {
          closes_center: {
            progression: 0.45,
            advantage: 0.4,
            risk: 0.92,
            consequence: "Cofnięcie pozwala przenieść grę, ale rotacja nie przynosi zysku.",
          },
          stays: {
            progression: 0.35,
            advantage: 0.3,
            risk: 0.9,
            consequence: "Bezpieczne cofnięcie zaczyna akcję od nowa.",
          },
          jumps: {
            progression: 0.5,
            advantage: 0.5,
            risk: 0.88,
            consequence: "Rywal wypadł z linii — cofnięcie zostawia za nim wolną przestrzeń.",
          },
        },
      },
    ],
    alternatives: {
      closes_center: {
        actionId: "pass_wide",
        changed: "Skoro rywal poszedł do środka, zwolnione skrzydło było najprostszą progresją.",
      },
      stays: {
        actionId: "pass_inside",
        changed: "Nikt nie zareagował na rotację — podanie w środek łamało linię.",
      },
      jumps: {
        actionId: "hold_ball",
        changed: "Doskok rywala zostawił przestrzeń — obrót mijał go bez ryzyka podania.",
      },
    },
  }),

  defineScenario({
    id: "between-lines-10",
    title: "Przyjęcie między liniami pod kontrolą",
    brief:
      "Piłka wraca do wolnego stopera, a Ty stoisz w pasie między pomocą a obroną rywala.",
    topic: "between_lines",
    positions: ["midfielder", "forward"],
    status: "sourced",
    sourceReference: UEFA,
    context: {
      minute: 71,
      scoreline: "1:1",
      phase: "Atak pozycyjny",
      positionLabel: "Dziesiątka",
      weightsNote: "71. minuta przy 1:1 — liczy się progresja bez oddawania kontry.",
      weights: { progression: 1.4, risk: 1.3 },
    },
    observationMs: 6500,
    actors: [
      ...backdrop(),
      a("ball", "ball", undefined, [[58, 100], [52, 96], [48, 94]]),
      a("dm", "mate", "Szóstka", [[60, 102], [52, 98]]),
      a("st", "mate", "Napastnik", [[50, 40], [46, 44]]),
      a("rw", "mate", "Skrzydło", [[86, 60], [86, 54]]),
      a("self", "self", undefined, [[54, 74], [52, 72]]),
      a("opp6", "opponent", "Szóstka", [[48, 82], [50, 80]]),
      a("opp5", "opponent", "Stoper", [[46, 52], [48, 56]]),
      a("opp8", "opponent", undefined, [[64, 84], [60, 84]]),
    ],
    zones: [
      {
        id: "blind-side",
        x: 66,
        y: 74,
        radius: 14,
        label: "Martwe pole szóstki",
        quality: 0.94,
        note: "Ustawiasz się poza polem widzenia szóstki — przyjęcie masz w pełnym obrocie.",
        reaction: "stays",
      },
      {
        id: "center-lane",
        x: 48,
        y: 72,
        radius: 12,
        label: "Środkowy pas",
        quality: 0.62,
        note: "Środkowy pas jest najkrótszy, ale całkowicie kontrolowany przez szóstkę.",
        reaction: "closes_center",
      },
      {
        id: "high-line",
        x: 52,
        y: 58,
        radius: 12,
        label: "Wysoko przy linii obrony",
        quality: 0.7,
        note: "Wysokie ustawienie wywołuje wyjście stopera, ale skraca Twój czas na przyjęcie.",
        reaction: "jumps",
      },
    ],
    reactions: {
      stays: [
        { actorId: "opp6", x: 48, y: 82 },
        { actorId: "opp5", x: 46, y: 52 },
      ],
      closes_center: [
        { actorId: "opp6", x: 48, y: 76 },
        { actorId: "opp8", x: 56, y: 80 },
      ],
      jumps: [
        { actorId: "opp5", x: 52, y: 64 },
        { actorId: "opp6", x: 50, y: 76 },
      ],
    },
    actions: [
      {
        id: "turn_forward",
        label: "Obrót i gra do przodu",
        outcomes: {
          stays: {
            progression: 0.94,
            advantage: 0.9,
            risk: 0.75,
            consequence: "Przyjmujesz w martwym polu i obracasz się twarzą do bramki rywala.",
            path: [
              [66, 74],
              [62, 54],
            ].map(([x, y]) => ({ x, y })),
          },
          closes_center: {
            progression: 0.35,
            advantage: 0.3,
            risk: 0.28,
            consequence: "Obrót w domkniętym środku to strata w najgorszej strefie boiska.",
          },
          jumps: {
            progression: 0.6,
            advantage: 0.6,
            risk: 0.4,
            consequence: "Obrót przy doskakującym stoperze kończy się kontaktem i faulem.",
          },
        },
      },
      {
        id: "set_back",
        label: "Odegranie i start",
        outcomes: {
          stays: {
            progression: 0.75,
            advantage: 0.7,
            risk: 0.85,
            consequence: "Odegranie jest pewne, ale marnuje wolną pozycję w martwym polu.",
          },
          closes_center: {
            progression: 0.9,
            advantage: 0.88,
            risk: 0.85,
            consequence:
              "Domknięty środek oznacza, że odegranie i gra na trzeciego omijają całą linię pomocy.",
            path: [
              [48, 72],
              [52, 98],
              [86, 54],
            ].map(([x, y]) => ({ x, y })),
          },
          jumps: {
            progression: 0.72,
            advantage: 0.7,
            risk: 0.8,
            consequence: "Odegranie jest szybkie, ale nie karze wyjścia stopera.",
          },
        },
      },
      {
        id: "release_striker",
        label: "Podanie za linię do napastnika",
        outcomes: {
          stays: {
            progression: 0.8,
            advantage: 0.78,
            risk: 0.55,
            consequence: "Podanie za linię jest ambitne, ale obrona stoi w komplecie.",
          },
          closes_center: {
            progression: 0.5,
            advantage: 0.45,
            risk: 0.35,
            consequence: "Pod presją podanie jest niedokładne i wychodzi poza boisko.",
          },
          jumps: {
            progression: 0.95,
            advantage: 0.94,
            risk: 0.6,
            consequence: "Stoper wyszedł — pierwsze podanie za linię wypuszcza napastnika sam na sam.",
            path: [
              [52, 58],
              [46, 40],
            ].map(([x, y]) => ({ x, y })),
          },
        },
      },
      {
        id: "hold_delay",
        label: "Przytrzymanie i czekanie na wsparcie",
        outcomes: {
          stays: {
            progression: 0.55,
            advantage: 0.5,
            risk: 0.8,
            consequence: "Przytrzymanie daje wsparcie, ale pozwala blokowi się przesunąć.",
          },
          closes_center: {
            progression: 0.45,
            advantage: 0.4,
            risk: 0.6,
            consequence: "W domkniętym środku każda dodatkowa sekunda to zaproszenie do odbioru.",
          },
          jumps: {
            progression: 0.4,
            advantage: 0.4,
            risk: 0.45,
            consequence: "Czekanie przy doskakującym rywalu kończy się utratą piłki.",
          },
        },
      },
    ],
    alternatives: {
      stays: {
        actionId: "turn_forward",
        changed: "Nikt nie wyszedł ze strefy — obrót w martwym polu dawał wolne pole do przodu.",
      },
      closes_center: {
        actionId: "set_back",
        changed: "Domknięty środek premiował odegranie i grę na trzeciego zamiast obrotu.",
      },
      jumps: {
        actionId: "release_striker",
        changed: "Wyjście stopera zostawiało przestrzeń za linią — podanie za obronę było najsilniejsze.",
      },
    },
  }),

  defineScenario({
    id: "weak-side-exit-cb",
    title: "Wyjście spod pressingu słabą stroną",
    brief:
      "Rywal ustawia pressing na Twoją silną nogę. Wyjście z tej sytuacji istnieje tylko po słabej stronie.",
    topic: "weak_side_exit",
    positions: ["defender", "midfielder"],
    status: "draft",
    context: {
      minute: 8,
      scoreline: "0:0",
      phase: "Wyjście spod wysokiego pressingu",
      positionLabel: "Stoper",
      weightsNote: "Wczesna faza — strata w tej strefie natychmiast kosztuje bramkę.",
      weights: { risk: 1.6, body: 1.3 },
    },
    observationMs: 6500,
    actors: [
      ...backdrop(),
      a("ball", "ball", undefined, [[62, 112], [58, 108], [56, 106]]),
      a("gk2", "mate", "Bramkarz", [[50, 128], [46, 126]]),
      a("cb2", "mate", "Stoper", [[30, 112], [26, 110]]),
      a("dm", "mate", "Szóstka", [[52, 96], [48, 94]]),
      a("self", "self", undefined, [[64, 110], [60, 108]]),
      a("oppst", "opponent", "Napastnik", [[70, 100], [64, 102], [62, 103]]),
      a("opp7", "opponent", "Skrzydło", [[86, 106], [80, 104]]),
      a("opp8", "opponent", undefined, [[52, 88], [50, 92]]),
    ],
    zones: [
      {
        id: "open-weak",
        x: 44,
        y: 110,
        radius: 14,
        label: "Otwarcie na słabą stronę",
        quality: 0.92,
        note: "Otwierasz ciało na wolną stronę — pressing musi przebiec całą szerokość.",
        reaction: "stays",
      },
      {
        id: "stay-strong",
        x: 70,
        y: 108,
        radius: 13,
        label: "Trzymanie silnej strony",
        quality: 0.45,
        note: "Zostajesz tam, gdzie pressing jest przygotowany — to jego pułapka.",
        reaction: "jumps",
      },
      {
        id: "drop-gk",
        x: 56,
        y: 120,
        radius: 13,
        label: "Cofnięcie w linię bramkarza",
        quality: 0.68,
        note: "Cofnięcie daje sekundę, ale wciąga pressing bliżej Twojej bramki.",
        reaction: "closes_center",
      },
    ],
    reactions: {
      stays: [
        { actorId: "oppst", x: 64, y: 104 },
        { actorId: "opp7", x: 82, y: 102 },
      ],
      jumps: [
        { actorId: "oppst", x: 62, y: 108 },
        { actorId: "opp7", x: 74, y: 106 },
      ],
      closes_center: [
        { actorId: "oppst", x: 56, y: 114 },
        { actorId: "opp8", x: 50, y: 98 },
      ],
    },
    actions: [
      {
        id: "long_switch",
        label: "Podanie na drugiego stopera",
        outcomes: {
          stays: {
            progression: 0.9,
            advantage: 0.88,
            risk: 0.85,
            consequence: "Przeniesienie omija pressing i drugi stoper wychodzi z piłką przodem.",
            path: [
              [44, 110],
              [26, 110],
            ].map(([x, y]) => ({ x, y })),
          },
          jumps: {
            progression: 0.6,
            advantage: 0.55,
            risk: 0.5,
            consequence: "Podanie w bok pod doskokiem jest ryzykowne, ale piłka wychodzi ze strefy.",
          },
          closes_center: {
            progression: 0.7,
            advantage: 0.65,
            risk: 0.7,
            consequence: "Przeniesienie działa, choć pressing zdąży domknąć drugą stronę.",
          },
        },
      },
      {
        id: "line_dm",
        label: "Podanie w szóstkę",
        outcomes: {
          stays: {
            progression: 0.82,
            advantage: 0.8,
            risk: 0.6,
            consequence: "Szóstka przyjmuje półotwarta i natychmiast przenosi grę do przodu.",
            path: [
              [44, 110],
              [48, 94],
            ].map(([x, y]) => ({ x, y })),
          },
          jumps: {
            progression: 0.45,
            advantage: 0.4,
            risk: 0.25,
            consequence: "Podanie w krytą szóstkę to strata 25 metrów od własnej bramki.",
          },
          closes_center: {
            progression: 0.4,
            advantage: 0.35,
            risk: 0.3,
            consequence: "Środek jest domknięty — podanie kończy się przechwytem.",
          },
        },
      },
      {
        id: "gk_pass",
        label: "Podanie do bramkarza",
        outcomes: {
          stays: {
            progression: 0.35,
            advantage: 0.3,
            risk: 0.92,
            consequence: "Bezpiecznie, ale oddajesz wypracowaną wolną stronę.",
          },
          jumps: {
            progression: 0.6,
            advantage: 0.6,
            risk: 0.9,
            consequence: "Doskok rywala zostawia lukę — bramkarz spokojnie przenosi grę.",
            path: [
              [70, 108],
              [46, 126],
            ].map(([x, y]) => ({ x, y })),
          },
          closes_center: {
            progression: 0.4,
            advantage: 0.4,
            risk: 0.75,
            consequence: "Podanie do bramkarza pod domkniętym środkiem to ostatnia wolna opcja.",
          },
        },
      },
      {
        id: "clear",
        label: "Wybicie w pole",
        outcomes: {
          stays: {
            progression: 0.2,
            advantage: 0.15,
            risk: 0.85,
            consequence: "Wybicie oddaje piłkę mimo wypracowanej przewagi.",
          },
          jumps: {
            progression: 0.35,
            advantage: 0.3,
            risk: 0.88,
            consequence: "Wybicie jest tanie w ryzyku, ale rywal odzyskuje piłkę wysoko.",
          },
          closes_center: {
            progression: 0.3,
            advantage: 0.25,
            risk: 0.86,
            consequence: "Piłka wraca do rywala i pressing zaczyna się od nowa.",
          },
        },
      },
    ],
    alternatives: {
      stays: {
        actionId: "long_switch",
        changed: "Pressing został po silnej stronie — przeniesienie zabierało całą jego pracę.",
      },
      jumps: {
        actionId: "gk_pass",
        changed: "Doskok zostawił lukę za plecami — bramkarz miał czas na spokojne przeniesienie.",
      },
      closes_center: {
        actionId: "long_switch",
        changed: "Zamknięty środek oznaczał, że jedyną progresją było przeniesienie w bok.",
      },
    },
  }),

  defineScenario({
    id: "press-trap-fw",
    title: "Pressing kierunkowy i pułapka przy linii",
    brief:
      "Rywal rozgrywa od bramkarza. Twój bieg decyduje, w którą stronę pójdzie piłka i gdzie zamkniecie pułapkę.",
    topic: "press_trap",
    positions: ["forward", "midfielder"],
    status: "sourced",
    sourceReference: FIFA,
    context: {
      minute: 4,
      scoreline: "0:0",
      phase: "Pressing na połowie rywala",
      positionLabel: "Napastnik",
      weightsNote: "Początek meczu — pressing ma narzucić kierunek, nie odzyskać piłkę za wszelką cenę.",
      weights: { timing: 1.5, body: 1.3 },
    },
    observationMs: 7000,
    actors: [
      ...backdrop(),
      a("ball", "ball", undefined, [[50, 22], [40, 30], [36, 34]]),
      a("oppgk", "opponent", "Bramkarz", [[50, 18], [48, 20]]),
      a("oppcb1", "opponent", "Stoper", [[38, 32], [34, 36]]),
      a("oppcb2", "opponent", "Stoper", [[64, 32], [68, 34]]),
      a("oppfb", "opponent", "Boczny", [[16, 46], [14, 52]]),
      a("self", "self", undefined, [[50, 46], [46, 42]]),
      a("mate7", "mate", "Skrzydło", [[22, 56], [20, 50]]),
      a("mate8", "mate", "Ósemka", [[42, 62], [40, 56]]),
    ],
    zones: [
      {
        id: "curved-run",
        x: 52,
        y: 36,
        radius: 14,
        label: "Bieg z cieniem na środek",
        quality: 0.93,
        note: "Biegniesz łukiem, zamykasz drugiego stopera i wypychasz grę do linii bocznej.",
        reaction: "closes_center",
      },
      {
        id: "straight-press",
        x: 36,
        y: 40,
        radius: 13,
        label: "Bieg prosto na piłkę",
        quality: 0.5,
        note: "Prosty bieg zostawia otwartą linię przeniesienia na drugiego stopera.",
        reaction: "jumps",
      },
      {
        id: "hold-center",
        x: 50,
        y: 52,
        radius: 12,
        label: "Kontrola środka bez wyjścia",
        quality: 0.66,
        note: "Trzymasz środek, ale bez presji rywal spokojnie wybiera stronę.",
        reaction: "stays",
      },
    ],
    reactions: {
      closes_center: [
        { actorId: "oppcb1", x: 26, y: 42 },
        { actorId: "oppfb", x: 12, y: 56 },
      ],
      jumps: [
        { actorId: "oppcb2", x: 72, y: 36 },
        { actorId: "oppgk", x: 52, y: 20 },
      ],
      stays: [
        { actorId: "oppcb1", x: 36, y: 36 },
        { actorId: "oppcb2", x: 66, y: 34 },
      ],
    },
    actions: [
      {
        id: "trigger_trap",
        label: "Zamknięcie pułapki przy linii",
        outcomes: {
          closes_center: {
            progression: 0.92,
            advantage: 0.94,
            risk: 0.8,
            consequence: "Piłka poszła do bocznego przy linii — odbiór wysoko i natychmiastowa okazja.",
            path: [
              [52, 36],
              [20, 50],
            ].map(([x, y]) => ({ x, y })),
          },
          jumps: {
            progression: 0.4,
            advantage: 0.35,
            risk: 0.4,
            consequence: "Pułapka po złej stronie — rywal przenosi grę i wychodzi z pressingu.",
          },
          stays: {
            progression: 0.5,
            advantage: 0.45,
            risk: 0.6,
            consequence: "Zamknięcie bez wywołanego kierunku wymaga biegu przez całą szerokość.",
          },
        },
      },
      {
        id: "press_gk_back",
        label: "Docisk do bramkarza",
        outcomes: {
          closes_center: {
            progression: 0.6,
            advantage: 0.55,
            risk: 0.6,
            consequence: "Zmuszasz do długiej piłki, ale oddajesz wypracowaną pułapkę.",
          },
          jumps: {
            progression: 0.75,
            advantage: 0.72,
            risk: 0.65,
            consequence: "Cofnięcie do bramkarza pod dociskiem kończy się wybiciem i drugą piłką.",
            path: [
              [36, 40],
              [48, 20],
            ].map(([x, y]) => ({ x, y })),
          },
          stays: {
            progression: 0.55,
            advantage: 0.5,
            risk: 0.6,
            consequence: "Docisk bez wsparcia to bieg w pustkę — linia pomocy zostaje daleko.",
          },
        },
      },
      {
        id: "drop_block",
        label: "Cofnięcie do bloku",
        outcomes: {
          closes_center: {
            progression: 0.3,
            advantage: 0.25,
            risk: 0.9,
            consequence: "Cofnięcie oddaje idealnie przygotowaną pułapkę.",
          },
          jumps: {
            progression: 0.6,
            advantage: 0.55,
            risk: 0.92,
            consequence: "Skoro rywal wyszedł z pressingu, powrót do bloku ratuje strukturę.",
          },
          stays: {
            progression: 0.5,
            advantage: 0.45,
            risk: 0.9,
            consequence: "Bezpieczny powrót, ale bez żadnej presji na rozegranie rywala.",
          },
        },
      },
      {
        id: "cover_switch",
        label: "Zamknięcie linii przeniesienia",
        outcomes: {
          closes_center: {
            progression: 0.7,
            advantage: 0.68,
            risk: 0.85,
            consequence: "Blokujesz przeniesienie, choć pułapka przy linii była bliżej odbioru.",
          },
          jumps: {
            progression: 0.85,
            advantage: 0.85,
            risk: 0.8,
            consequence: "Rywal szukał przeniesienia — zamknięcie tej linii kończy jego wyjście.",
            path: [
              [36, 40],
              [66, 36],
            ].map(([x, y]) => ({ x, y })),
          },
          stays: {
            progression: 0.6,
            advantage: 0.6,
            risk: 0.85,
            consequence: "Kontrolujesz obie strony, ale nie wymuszasz błędu.",
          },
        },
      },
    ],
    alternatives: {
      closes_center: {
        actionId: "trigger_trap",
        changed: "Kierunek był narzucony — pułapka przy linii kończyła rozegranie rywala.",
      },
      jumps: {
        actionId: "cover_switch",
        changed: "Rywal szukał przeniesienia, więc wartość leżała w zamknięciu tej linii.",
      },
      stays: {
        actionId: "trigger_trap",
        changed: "Rywal nie wybrał strony — dopiero domknięcie jednej opcji wymuszało decyzję.",
      },
    },
  }),

  defineScenario({
    id: "rest-defence-dm",
    title: "Zabezpieczenie ataku pozycyjnego",
    brief:
      "Zespół atakuje prawą stroną. Twoje ustawienie decyduje o tym, czy strata skończy się kontrą.",
    topic: "rest_defence",
    positions: ["midfielder", "defender"],
    status: "sourced",
    sourceReference: UEFA,
    context: {
      minute: 78,
      scoreline: "2:1",
      phase: "Atak pozycyjny z przewagą w wyniku",
      positionLabel: "Szóstka",
      weightsNote: "78. minuta przy prowadzeniu — zabezpieczenie waży najwięcej.",
      weights: { risk: 1.8, advantage: 1.2, progression: 0.7 },
    },
    observationMs: 7500,
    actors: [
      ...backdrop(),
      a("ball", "ball", undefined, [[80, 60], [84, 52], [86, 48]]),
      a("rb", "mate", "Boczny", [[88, 64], [88, 52]]),
      a("cm", "mate", "Ósemka", [[70, 62], [72, 54]]),
      a("cb1", "mate", "Stoper", [[40, 96], [42, 92]]),
      a("cb2", "mate", "Stoper", [[62, 96], [60, 92]]),
      a("self", "self", undefined, [[58, 82], [60, 78]]),
      a("oppst", "opponent", "Napastnik", [[46, 74], [44, 80]]),
      a("opp7", "opponent", "Skrzydło", [[22, 66], [24, 74]]),
      a("opp6", "opponent", undefined, [[68, 60], [72, 56]]),
    ],
    zones: [
      {
        id: "cover-central",
        x: 52,
        y: 84,
        radius: 14,
        label: "Kontrola osi za piłką",
        quality: 0.94,
        note: "Stoisz w osi za piłką — każda strata idzie przez Ciebie, zanim ruszy kontra.",
        reaction: "stays",
      },
      {
        id: "join-attack",
        x: 74,
        y: 66,
        radius: 13,
        label: "Dołączenie do ataku",
        quality: 0.5,
        note: "Dokładasz zawodnika w ataku, ale zostawiasz oś odbudowy pustą przy prowadzeniu 2:1.",
        reaction: "jumps",
      },
      {
        id: "cover-weak-side",
        x: 36,
        y: 82,
        radius: 13,
        label: "Zabezpieczenie słabej strony",
        quality: 0.8,
        note: "Zamykasz stronę skrzydłowego rywala, ale środek zostaje na dwóch stoperach.",
        reaction: "closes_center",
      },
    ],
    reactions: {
      stays: [
        { actorId: "oppst", x: 46, y: 78 },
        { actorId: "opp7", x: 24, y: 70 },
      ],
      jumps: [
        { actorId: "oppst", x: 48, y: 88 },
        { actorId: "opp7", x: 26, y: 82 },
      ],
      closes_center: [
        { actorId: "oppst", x: 52, y: 82 },
        { actorId: "opp6", x: 66, y: 66 },
      ],
    },
    actions: [
      {
        id: "intercept",
        label: "Przechwyt pierwszego podania",
        outcomes: {
          stays: {
            progression: 0.85,
            advantage: 0.9,
            risk: 0.95,
            consequence: "Kontra umiera na pierwszym podaniu — odzyskujesz piłkę wysoko i bez faulu.",
            path: [
              [52, 84],
              [46, 78],
            ].map(([x, y]) => ({ x, y })),
          },
          jumps: {
            progression: 0.4,
            advantage: 0.35,
            risk: 0.4,
            consequence: "Jesteś za wysoko — przechwyt nie dochodzi i kontra rusza w otwarte pole.",
          },
          closes_center: {
            progression: 0.6,
            advantage: 0.6,
            risk: 0.7,
            consequence: "Przechwyt na słabej stronie działa, ale środek pozostaje odsłonięty.",
          },
        },
      },
      {
        id: "delay",
        label: "Spowolnienie i cofnięcie",
        outcomes: {
          stays: {
            progression: 0.6,
            advantage: 0.6,
            risk: 0.9,
            consequence: "Spowalniasz kontrę i zespół wraca w komplecie.",
          },
          jumps: {
            progression: 0.7,
            advantage: 0.7,
            risk: 0.85,
            consequence: "Cofanie się z kontrą to minimum, jakie możesz zrobić po dołączeniu do ataku.",
            path: [
              [74, 66],
              [56, 92],
            ].map(([x, y]) => ({ x, y })),
          },
          closes_center: {
            progression: 0.65,
            advantage: 0.62,
            risk: 0.9,
            consequence: "Spowolnienie pozwala domknąć środek dwóm stoperom.",
          },
        },
      },
      {
        id: "tactical_foul",
        label: "Faul taktyczny",
        outcomes: {
          stays: {
            progression: 0.4,
            advantage: 0.5,
            risk: 0.55,
            consequence: "Faul jest niepotrzebny — miałeś czysty przechwyt.",
          },
          jumps: {
            progression: 0.75,
            advantage: 0.8,
            risk: 0.6,
            consequence: "Przy odsłoniętej osi faul w środku pola jest najtańszym rozwiązaniem.",
          },
          closes_center: {
            progression: 0.6,
            advantage: 0.6,
            risk: 0.55,
            consequence: "Faul zatrzymuje kontrę, ale przy 2:1 kosztuje Cię kartkę i pozycję.",
          },
        },
      },
      {
        id: "stay_shape",
        label: "Utrzymanie struktury",
        outcomes: {
          stays: {
            progression: 0.7,
            advantage: 0.72,
            risk: 0.92,
            consequence: "Struktura się nie rusza — rywal nie ma jak wejść w przejście.",
          },
          jumps: {
            progression: 0.3,
            advantage: 0.3,
            risk: 0.45,
            consequence: "Trzymanie pozycji zbyt wysoko zostawia dwóch stoperów w otwartym polu.",
          },
          closes_center: {
            progression: 0.65,
            advantage: 0.6,
            risk: 0.85,
            consequence: "Struktura jest przesunięta, ale kompaktowa — kontra idzie w bok, nie w środek.",
          },
        },
      },
    ],
    alternatives: {
      stays: {
        actionId: "intercept",
        changed: "Byłeś w osi za piłką — przechwyt kończył kontrę bez faulu i bez ryzyka.",
      },
      jumps: {
        actionId: "tactical_foul",
        changed: "Po dołączeniu do ataku jedynym tanim rozwiązaniem było zatrzymanie kontry faulem.",
      },
      closes_center: {
        actionId: "stay_shape",
        changed: "Przy przesuniętym zabezpieczeniu utrzymanie kompaktowości było ważniejsze niż wyjście.",
      },
    },
  }),

  defineScenario({
    id: "counterpress-cm",
    title: "Kontrpressing w pierwszych 5 sekundach",
    brief:
      "Właśnie straciliście piłkę w ataku pozycyjnym. Masz kilka sekund, zanim rywal ustawi się do wyprowadzenia.",
    topic: "counterpress",
    positions: ["midfielder", "forward"],
    status: "sourced",
    sourceReference: FIFA,
    context: {
      minute: 66,
      scoreline: "1:2",
      phase: "Strata w ataku pozycyjnym",
      positionLabel: "Ósemka",
      weightsNote: "Przegrywasz 1:2 — natychmiastowy odbiór jest wart wyższego ryzyka.",
      weights: { timing: 1.6, progression: 1.3, risk: 0.8 },
    },
    observationMs: 6000,
    actors: [
      ...backdrop(),
      a("ball", "ball", undefined, [[58, 58], [56, 66], [54, 70]]),
      a("oppcarrier", "opponent", "Odbiorca", [[60, 56], [57, 66], [55, 71]]),
      a("opp6", "opponent", "Szóstka", [[42, 62], [40, 70]]),
      a("opp7", "opponent", "Skrzydło", [[84, 58], [80, 66]]),
      a("self", "self", undefined, [[66, 62], [62, 66]]),
      a("mate9", "mate", "Napastnik", [[50, 50], [52, 58]]),
      a("mate6", "mate", "Szóstka", [[54, 84], [54, 78]]),
      a("mate2", "mate", "Boczny", [[86, 70], [84, 74]]),
    ],
    zones: [
      {
        id: "press-carrier",
        x: 58,
        y: 68,
        radius: 13,
        label: "Natychmiastowy docisk",
        quality: 0.92,
        note: "Atakujesz prowadzącego, zanim podniesie głowę — nie ma czasu na wyprowadzenie.",
        reaction: "jumps",
      },
      {
        id: "cut-outlet",
        x: 44,
        y: 68,
        radius: 13,
        label: "Zamknięcie pierwszego podania",
        quality: 0.85,
        note: "Zamykasz wolną szóstkę rywala — kontra nie ma pierwszego adresata.",
        reaction: "closes_center",
      },
      {
        id: "recover-deep",
        x: 58,
        y: 84,
        radius: 13,
        label: "Powrót do bloku",
        quality: 0.5,
        note: "Powrót jest bezpieczny, ale przy 1:2 oddaje inicjatywę i czas.",
        reaction: "stays",
      },
    ],
    reactions: {
      jumps: [
        { actorId: "oppcarrier", x: 56, y: 74 },
        { actorId: "opp6", x: 44, y: 72 },
      ],
      closes_center: [
        { actorId: "oppcarrier", x: 62, y: 70 },
        { actorId: "opp7", x: 78, y: 68 },
      ],
      stays: [
        { actorId: "oppcarrier", x: 56, y: 76 },
        { actorId: "opp6", x: 40, y: 74 },
      ],
    },
    actions: [
      {
        id: "win_ball",
        label: "Odbiór w kontakcie",
        outcomes: {
          jumps: {
            progression: 0.93,
            advantage: 0.92,
            risk: 0.65,
            consequence: "Odbierasz piłkę 30 metrów od bramki rywala z rozbitą strukturą obrony.",
            path: [
              [58, 68],
              [56, 52],
            ].map(([x, y]) => ({ x, y })),
          },
          closes_center: {
            progression: 0.55,
            advantage: 0.5,
            risk: 0.4,
            consequence: "Prowadzący zdążył się obrócić — odbiór to ryzyko faulu i żółtej kartki.",
          },
          stays: {
            progression: 0.4,
            advantage: 0.35,
            risk: 0.35,
            consequence: "Wchodzisz w kontakt zbyt późno — rywal Cię mija i rusza kontra.",
          },
        },
      },
      {
        id: "force_wide",
        label: "Wypchnięcie do linii",
        outcomes: {
          jumps: {
            progression: 0.7,
            advantage: 0.68,
            risk: 0.8,
            consequence: "Rywal ucieka w bok, ale tracisz najlepszy moment na odbiór.",
          },
          closes_center: {
            progression: 0.88,
            advantage: 0.86,
            risk: 0.82,
            consequence: "Bez pierwszego adresata rywal idzie do linii i tam go zamykacie.",
            path: [
              [44, 68],
              [22, 76],
            ].map(([x, y]) => ({ x, y })),
          },
          stays: {
            progression: 0.6,
            advantage: 0.55,
            risk: 0.8,
            consequence: "Wypchnięcie działa, ale rywal ma już podniesioną głowę.",
          },
        },
      },
      {
        id: "counter_foul",
        label: "Faul taktyczny",
        outcomes: {
          jumps: {
            progression: 0.45,
            advantage: 0.5,
            risk: 0.55,
            consequence: "Faul zamiast czystego odbioru marnuje najlepszą sytuację akcji.",
          },
          closes_center: {
            progression: 0.6,
            advantage: 0.6,
            risk: 0.6,
            consequence: "Zatrzymujesz przejście, ale przy 1:2 stoisz gorzej z czasem gry.",
          },
          stays: {
            progression: 0.7,
            advantage: 0.7,
            risk: 0.6,
            consequence: "Skoro straciłeś moment na odbiór, faul chroni przed kontrą 3v3.",
          },
        },
      },
      {
        id: "restore_shape",
        label: "Odbudowa struktury",
        outcomes: {
          jumps: {
            progression: 0.3,
            advantage: 0.3,
            risk: 0.85,
            consequence: "Cofnięcie marnuje idealny moment kontrpressingu.",
          },
          closes_center: {
            progression: 0.45,
            advantage: 0.4,
            risk: 0.88,
            consequence: "Odbudowa jest bezpieczna, ale przy stracie punktów nie odzyskujesz piłki.",
          },
          stays: {
            progression: 0.6,
            advantage: 0.55,
            risk: 0.9,
            consequence: "Skoro pressing się nie udał, powrót w blok jest jedyną sensowną opcją.",
          },
        },
      },
    ],
    alternatives: {
      jumps: {
        actionId: "win_ball",
        changed: "Rywal nie zdążył podnieść głowy — natychmiastowy odbiór dawał najlepszą pozycję.",
      },
      closes_center: {
        actionId: "force_wide",
        changed: "Bez adresata w środku wypchnięcie do linii kończyło przejście rywala.",
      },
      stays: {
        actionId: "restore_shape",
        changed: "Moment kontrpressingu minął — struktura była ważniejsza niż pościg.",
      },
    },
  }),

  defineScenario({
    id: "transition-fw",
    title: "Decyzja w pierwszych sekundach kontry",
    brief:
      "Odzyskaliście piłkę w środku pola. Twoja pierwsza decyzja przesądza, czy kontra ma szerokość, czy głębokość.",
    topic: "transition",
    positions: ["forward", "midfielder"],
    status: "draft",
    context: {
      minute: 88,
      scoreline: "2:2",
      phase: "Przejście z obrony do ataku",
      positionLabel: "Napastnik",
      weightsNote: "88. minuta przy 2:2 — jedna decyzja może rozstrzygnąć mecz w obie strony.",
      weights: { progression: 1.5, timing: 1.4, risk: 1.1 },
    },
    observationMs: 6500,
    actors: [
      ...backdrop(),
      a("ball", "ball", undefined, [[50, 90], [52, 82], [54, 78]]),
      a("cm", "mate", "Pomocnik", [[48, 92], [52, 84], [54, 80]]),
      a("rw", "mate", "Skrzydło", [[86, 74], [84, 60]]),
      a("lw", "mate", "Skrzydło", [[14, 76], [16, 62]]),
      a("self", "self", undefined, [[56, 62], [56, 58]]),
      a("oppcb1", "opponent", "Stoper", [[44, 48], [46, 54]]),
      a("oppcb2", "opponent", "Stoper", [[62, 46], [60, 52]]),
      a("opp6", "opponent", "Szóstka", [[52, 70], [52, 74]]),
    ],
    zones: [
      {
        id: "run-channel",
        x: 68,
        y: 52,
        radius: 14,
        label: "Start w kanał między stoperami",
        quality: 0.93,
        note: "Atakujesz kanał, zanim stoperzy się zwężą — kontra dostaje głębokość.",
        reaction: "jumps",
      },
      {
        id: "show-to-ball",
        x: 54,
        y: 68,
        radius: 12,
        label: "Zejście do piłki",
        quality: 0.62,
        note: "Zejście daje pewne podanie, ale zabija głębokość kontry.",
        reaction: "closes_center",
      },
      {
        id: "hold-width",
        x: 78,
        y: 62,
        radius: 13,
        label: "Wyjście na szerokość",
        quality: 0.7,
        note: "Szerokość rozciąga obronę, ale wydłuża czas dojścia piłki do pola karnego.",
        reaction: "stays",
      },
    ],
    reactions: {
      jumps: [
        { actorId: "oppcb2", x: 64, y: 58 },
        { actorId: "opp6", x: 54, y: 68 },
      ],
      closes_center: [
        { actorId: "opp6", x: 54, y: 72 },
        { actorId: "oppcb1", x: 48, y: 58 },
      ],
      stays: [
        { actorId: "oppcb1", x: 46, y: 52 },
        { actorId: "oppcb2", x: 60, y: 50 },
      ],
    },
    actions: [
      {
        id: "through_ball",
        label: "Podanie w kanał",
        outcomes: {
          jumps: {
            progression: 0.95,
            advantage: 0.94,
            risk: 0.6,
            consequence: "Stoper wyszedł z linii — podanie w kanał daje wejście w pole karne.",
            path: [
              [54, 78],
              [70, 46],
            ].map(([x, y]) => ({ x, y })),
          },
          closes_center: {
            progression: 0.45,
            advantage: 0.4,
            risk: 0.35,
            consequence: "Kanał jest zamknięty — podanie kończy się przechwytem i kontrą rywala.",
          },
          stays: {
            progression: 0.6,
            advantage: 0.6,
            risk: 0.5,
            consequence: "Podanie w kanał przeciw zwartej dwójce stoperów to loteria.",
          },
        },
      },
      {
        id: "carry_center",
        label: "Prowadzenie w środek",
        outcomes: {
          jumps: {
            progression: 0.75,
            advantage: 0.72,
            risk: 0.55,
            consequence: "Prowadzenie zmusza drugiego stopera do wyboru, ale kosztuje sekundy.",
          },
          closes_center: {
            progression: 0.8,
            advantage: 0.78,
            risk: 0.6,
            consequence: "Skoro podania nie ma, prowadzenie w środek wciąga szóstkę i otwiera boki.",
            path: [
              [54, 68],
              [56, 56],
            ].map(([x, y]) => ({ x, y })),
          },
          stays: {
            progression: 0.7,
            advantage: 0.65,
            risk: 0.6,
            consequence: "Prowadzenie działa, ale obrona zdąży się ustawić w komplecie.",
          },
        },
      },
      {
        id: "wide_release",
        label: "Podanie na szerokość",
        outcomes: {
          jumps: {
            progression: 0.7,
            advantage: 0.68,
            risk: 0.8,
            consequence: "Szerokość jest bezpieczna, ale marnujesz wyjście stopera z linii.",
          },
          closes_center: {
            progression: 0.72,
            advantage: 0.7,
            risk: 0.82,
            consequence: "Zamknięty środek premiuje wyjście na wolne skrzydło.",
          },
          stays: {
            progression: 0.88,
            advantage: 0.86,
            risk: 0.82,
            consequence: "Obrona stoi wąsko — podanie na szerokość daje wbiegnięcie w pole karne z boku.",
            path: [
              [78, 62],
              [84, 48],
            ].map(([x, y]) => ({ x, y })),
          },
        },
      },
      {
        id: "slow_down",
        label: "Zwolnienie tempa",
        outcomes: {
          jumps: {
            progression: 0.3,
            advantage: 0.3,
            risk: 0.85,
            consequence: "Zwolnienie oddaje wywołaną lukę i pozwala obronie wrócić.",
          },
          closes_center: {
            progression: 0.55,
            advantage: 0.5,
            risk: 0.9,
            consequence: "Przy zamkniętej kontrze zwolnienie i atak pozycyjny są rozsądne.",
          },
          stays: {
            progression: 0.4,
            advantage: 0.4,
            risk: 0.88,
            consequence: "W 88. minucie przy 2:2 zwolnienie oddaje najlepszy moment meczu.",
          },
        },
      },
    ],
    alternatives: {
      jumps: {
        actionId: "through_ball",
        changed: "Wyjście stopera otworzyło kanał — podanie za linię było najostrzejszą opcją.",
      },
      closes_center: {
        actionId: "carry_center",
        changed: "Bez wolnej linii podania prowadzenie w środek wymuszało reakcję i otwierało boki.",
      },
      stays: {
        actionId: "wide_release",
        changed: "Obrona zwęziła się w środku — wartość leżała na szerokości.",
      },
    },
  }),
];
