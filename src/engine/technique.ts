import type { Drill } from "./drill";
import type { Position } from "./profile";

/**
 * Szkice ćwiczeń technicznych solo (bez partnera) oparte na typowych układach
 * ze źródeł treningowych (siatka z kolorowymi stożkami, slalom, pierwszy kontakt).
 * DO PRZEGLĄDU przez trenera – nie są to gotowe sesje trenera.
 */
export const TECHNIQUE_DRILLS: Drill[] = [
  {
    id: "colour-grid",
    group: "dribble",
    title: "Siatka z kolorami",
    field: { width: 15, height: 15, kind: "patch" },
    cones: [
      { x: 2, y: 2, color: "red" },
      { x: 13, y: 2, color: "yellow" },
      { x: 2, y: 13, color: "green" },
      { x: 13, y: 13, color: "blue" },
    ],
    arrows: [
      { style: "dribble", points: [{ x: 7.5, y: 7.5 }, { x: 2.5, y: 3 }], step: 1 },
      { style: "dribble", points: [{ x: 2.5, y: 3 }, { x: 12.5, y: 12.5 }], step: 2 },
    ],
    goal: "Prowadzenie z głową do góry i reakcja na bodziec.",
    dose: "4 serie × 45 s, przerwa 60 s",
    points: [
      "Gdy zobaczysz kolor, prowadź piłkę do stożka tego koloru.",
      "Głowa do góry, krótkie dotknięcia.",
      "Zmieniaj nogę prowadzącą.",
    ],
    source: "Układ siatki 15×15 m z kolorowymi stożkami (plany FAW, sportsessionplanner.com).",
  },
  {
    id: "slalom-sprint",
    group: "dribble",
    title: "Slalom i zmiana kierunku",
    field: { width: 30, height: 12, kind: "patch" },
    cones: [4, 9, 14, 19, 24].map((x, i) => ({ x, y: i % 2 ? 4 : 8, color: "yellow" as const })),
    arrows: [
      { style: "dribble", points: [{ x: 1, y: 6 }, { x: 4, y: 6 }, { x: 9, y: 6 }, { x: 14, y: 6 }, { x: 19, y: 6 }, { x: 24, y: 6 }, { x: 29, y: 6 }], step: 1 },
      { style: "run", points: [{ x: 29, y: 10 }, { x: 1, y: 10 }], step: 2 },
    ],
    goal: "Kontrola piłki przy zmianie kierunku, potem szybki powrót.",
    dose: "6 × odcinek, powrót biegiem",
    points: ["Zewnętrzną częścią stopy przy stożku.", "Przyspiesz po minięciu stożka."],
    source: "Zig-zag cone dribbling (sportsessionplanner.com, plan dla początkujących).",
  },
  {
    id: "figure-eight",
    group: "dribble",
    title: "Ósemka wokół dwóch stożków",
    field: { width: 12, height: 8, kind: "patch" },
    cones: [{ x: 3.5, y: 4, color: "yellow" }, { x: 8.5, y: 4, color: "yellow" }],
    arrows: [
      { style: "dribble", points: [{ x: 6, y: 4 }, { x: 4.8, y: 1.8 }, { x: 2, y: 4 }, { x: 4.8, y: 6.2 }, { x: 6, y: 4 }, { x: 7.2, y: 1.8 }, { x: 10, y: 4 }, { x: 7.2, y: 6.2 }, { x: 6, y: 4 }], step: 1, note: "Ósemka wokół stożków, piłka blisko stopy" },
    ],
    goal: "Bliska kontrola piłki w ciasnych zwrotach, obiema nogami.",
    dose: "4 serie × 40 s, przerwa 45 s",
    points: ["Krótkie dotknięcia, piłka blisko stopy.", "Raz zewnętrzną, raz wewnętrzną częścią stopy.", "Co serię zmieniaj kierunek ósemki."],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "feint-accelerate",
    group: "dribble",
    title: "Zwód i przyspieszenie",
    field: { width: 25, height: 10, kind: "patch" },
    cones: [{ x: 12, y: 5, color: "red", label: "obrońca" }],
    arrows: [
      { style: "dribble", points: [{ x: 2, y: 5 }, { x: 9, y: 5 }], step: 1, note: "Spokojne prowadzenie do obrońcy" },
      { style: "dribble", points: [{ x: 9, y: 5 }, { x: 11, y: 3 }, { x: 14, y: 3.4 }], step: 2, note: "Zwód: pokaż jedno, idź w drugą stronę" },
      { style: "dribble", points: [{ x: 14, y: 3.4 }, { x: 23, y: 3.4 }], step: 3, note: "Mocne przyspieszenie za obrońcą" },
    ],
    goal: "Zwód i wyjście z przyspieszeniem, bez zatrzymywania piłki.",
    dose: "6 powtórzeń, powrót truchtem, zmień stronę zwodu",
    points: ["Zwolnij przed stożkiem, potem wybuch.", "Pierwsze dotknięcie po zwodzie daleko przed siebie.", "Zmieniaj stronę zwodu."],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "t-turns",
    group: "dribble",
    title: "Zmiana kierunku „T”",
    field: { width: 14, height: 14, kind: "patch" },
    cones: [{ x: 7, y: 12, color: "green", label: "start" }, { x: 7, y: 5, color: "yellow" }, { x: 2, y: 5, color: "red" }, { x: 12, y: 5, color: "blue" }],
    arrows: [
      { style: "dribble", points: [{ x: 7, y: 12 }, { x: 7, y: 5 }], step: 1, note: "Do środkowego stożka" },
      { style: "dribble", points: [{ x: 7, y: 5 }, { x: 2, y: 5 }], step: 2, note: "W lewo, ostry zwrot przy stożku" },
      { style: "dribble", points: [{ x: 2, y: 5 }, { x: 12, y: 5 }], step: 3, note: "Przez środek na prawą stronę" },
      { style: "dribble", points: [{ x: 12, y: 5 }, { x: 7, y: 5 }, { x: 7, y: 12 }], step: 4, note: "Z powrotem na start" },
    ],
    goal: "Hamowanie, zwrot i ruszenie z piłką w każdą stronę.",
    dose: "5 przejazdów, przerwa 40 s",
    points: ["Zwrot wewnętrzną lub zewnętrzną częścią stopy.", "Nisko na nogach przy zwrocie.", "Zmieniaj nogę prowadzącą co przejazd."],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "wall-first-touch",
    group: "touch",
    title: "Odbicie o ścianę i przyjęcie w ruch",
    field: { width: 14, height: 10, kind: "patch" },
    cones: [{ x: 7, y: 0.8, color: "green", label: "ściana" }],
    arrows: [
      { style: "pass", points: [{ x: 7, y: 7.2 }, { x: 7, y: 1.5 }], step: 1, note: "Podanie w ścianę, jednym kontaktem" },
      { style: "pass", points: [{ x: 7, y: 1.5 }, { x: 7, y: 6.6 }], step: 2, note: "Piłka wraca" },
      { style: "dribble", points: [{ x: 7, y: 6.6 }, { x: 11.5, y: 6 }], step: 3, note: "Przyjęcie od razu w kierunku następnego ruchu" },
    ],
    goal: "Pierwszy kontakt, który od razu ustawia piłkę do dalszej gry.",
    dose: "4 serie × 40 s, przerwa 45 s",
    points: ["Przyjmij piłkę w ruch, nie pod siebie.", "Zmieniaj nogę przyjęcia.", "Podanie twardo, żeby piłka wróciła."],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "touch-and-turn",
    group: "touch",
    title: "Przyjęcie z obrotem po odbiciu",
    field: { width: 14, height: 12, kind: "patch" },
    cones: [{ x: 7, y: 0.8, color: "green", label: "ściana" }, { x: 4, y: 8, color: "yellow" }, { x: 10, y: 8, color: "yellow" }],
    arrows: [
      { style: "pass", points: [{ x: 7, y: 9 }, { x: 7, y: 1.5 }], step: 1, note: "Podanie w ścianę" },
      { style: "pass", points: [{ x: 7, y: 1.5 }, { x: 7, y: 8.4 }], step: 2, note: "Piłka wraca" },
      { style: "dribble", points: [{ x: 7, y: 8.4 }, { x: 4.8, y: 6.4 }, { x: 2.5, y: 9 }], step: 3, note: "Przyjęcie z obrotem na stożek" },
    ],
    goal: "Przyjęcie z obrotem, bez zatrzymywania się.",
    dose: "4 serie × 6 powtórzeń, naprzemiennie strony",
    points: ["Obejrzyj się przed przyjęciem (barki, głowa).", "Przyjmij w stronę obrotu.", "Obracaj się raz w lewo, raz w prawo."],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "two-point-passing",
    group: "touch",
    title: "Podania w dwa punkty",
    field: { width: 16, height: 10, kind: "patch" },
    cones: [{ x: 4, y: 0.8, color: "red", label: "A" }, { x: 12, y: 0.8, color: "blue", label: "B" }],
    arrows: [
      { style: "pass", points: [{ x: 8, y: 8 }, { x: 4, y: 1.5 }], step: 1, note: "Podanie w punkt A" },
      { style: "pass", points: [{ x: 4, y: 1.5 }, { x: 7, y: 7.6 }], step: 2, note: "Przyjęcie jednym kontaktem" },
      { style: "pass", points: [{ x: 7, y: 7.6 }, { x: 12, y: 1.5 }], step: 3, note: "Podanie w punkt B" },
      { style: "pass", points: [{ x: 12, y: 1.5 }, { x: 9, y: 7.6 }], step: 4, note: "Przyjęcie jednym kontaktem" },
    ],
    goal: "Celność podań i przyjęcie w ruchu na obie strony.",
    dose: "4 serie × 45 s, przerwa 45 s",
    points: ["Celuj w stożek, nie w ścianę.", "Przyjęcie zawsze w stronę następnego podania.", "Oba punkty obiema nogami."],
    source: "Szkic własny (do przeglądu trenera).",
  },
];

export const POSITION_DRILLS: Drill[] = [
  {
    id: "run-in-finish",
    group: "finish",
    title: "Wbiegnięcie w pole karne i strzał",
    field: { width: 24, height: 22, kind: "half" },
    cones: [{ x: 4, y: 17, color: "red" }, { x: 12, y: 12, color: "yellow" }],
    arrows: [
      { style: "run", points: [{ x: 4, y: 20 }, { x: 4, y: 17 }, { x: 12, y: 12 }], step: 1 },
      { style: "shot", points: [{ x: 12, y: 12 }, { x: 12, y: 2 }], step: 2 },
    ],
    goals: [{ x: 12, y: 1, width: 7 }],
    goal: "Ruch za obronę i wykończenie.",
    dose: "4 serie × 4 powtórzenia, przerwa 90 s",
    points: ["Zmień tempo przy stożku.", "Strzał po pierwszym kontakcie."],
    positions: ["napastnik", "skrzydlowy"],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "wall-passing",
    group: "touch",
    title: "Podanie i pierwszy kontakt o ścianę",
    field: { width: 12, height: 10, kind: "patch" },
    cones: [{ x: 3, y: 8, color: "green" }, { x: 9, y: 8, color: "green" }],
    arrows: [
      { style: "pass", points: [{ x: 6, y: 7 }, { x: 6, y: 1 }], step: 1 },
      { style: "run", points: [{ x: 3, y: 8 }, { x: 9, y: 8 }], step: 2 },
    ],
    goal: "Pierwszy kontakt i podanie bez partnera.",
    dose: "4 serie × 40 s, przerwa 45 s",
    points: ["Przyjęcie w kierunku następnego ruchu.", "Zmieniaj nogę."],
    positions: ["pomocnik", "obronca"],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "dribble-shoot",
    group: "finish",
    title: "Prowadzenie i strzał",
    field: { width: 24, height: 22, kind: "half" },
    cones: [{ x: 12, y: 18, color: "green", label: "start" }, { x: 12, y: 11, color: "yellow" }],
    arrows: [
      { style: "dribble", points: [{ x: 12, y: 18 }, { x: 12, y: 12 }], step: 1, note: "Prowadzenie do stożka, głowa do góry" },
      { style: "shot", points: [{ x: 12, y: 12 }, { x: 9, y: 1.5 }], step: 2, note: "Strzał w dalszy róg po ostatnim dotknięciu" },
    ],
    goals: [{ x: 12, y: 1, width: 7 }],
    goal: "Strzał po prowadzeniu: ostatnie dotknięcie ustawia piłkę pod strzał.",
    dose: "4 serie × 4 powtórzenia, przerwa 90 s",
    points: ["Ostatnie dotknięcie lekko z boku piłki.", "Celuj w róg, nie w bramkarza.", "Naprzemiennie prawa i lewa noga."],
    positions: ["napastnik", "skrzydlowy", "pomocnik"],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "wall-one-touch-shot",
    group: "finish",
    title: "Strzał z pierwszej piłki po odbiciu",
    field: { width: 24, height: 22, kind: "half" },
    cones: [{ x: 6, y: 14, color: "green", label: "ściana" }, { x: 12, y: 12, color: "yellow" }],
    arrows: [
      { style: "pass", points: [{ x: 12, y: 17 }, { x: 6, y: 14.4 }], step: 1, note: "Podanie w ścianę" },
      { style: "pass", points: [{ x: 6, y: 14.4 }, { x: 11, y: 12.4 }], step: 2, note: "Piłka wraca pod strzał" },
      { style: "shot", points: [{ x: 11, y: 12.4 }, { x: 15, y: 1.5 }], step: 3, note: "Strzał z pierwszej piłki" },
    ],
    goals: [{ x: 12, y: 1, width: 7 }],
    goal: "Szybkie wykończenie z pierwszej piłki po wymianie.",
    dose: "4 serie × 4 powtórzenia, przerwa 90 s",
    points: ["Ustaw ciało do strzału, zanim piłka wróci.", "Uderz bez przyjęcia, noga pewna.", "Zmieniaj stronę ściany i nogę strzału."],
    positions: ["napastnik", "skrzydlowy", "pomocnik"],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "corner-accuracy",
    group: "finish",
    title: "Celność strzałów w narożniki",
    field: { width: 24, height: 22, kind: "half" },
    cones: [{ x: 9, y: 2, color: "red", label: "L" }, { x: 15, y: 2, color: "blue", label: "P" }, { x: 12, y: 14, color: "green", label: "start" }],
    arrows: [
      { style: "shot", points: [{ x: 12, y: 14 }, { x: 9, y: 1.5 }], step: 1, note: "Strzał w lewy narożnik" },
      { style: "shot", points: [{ x: 12, y: 14 }, { x: 15, y: 1.5 }], step: 2, note: "Strzał w prawy narożnik" },
    ],
    goals: [{ x: 12, y: 1, width: 7 }],
    goal: "Celność strzału z miejsca, w obie strony.",
    dose: "5 serii × 6 strzałów (liczysz trafienia w stożek), przerwa 60 s",
    points: ["Noga podporowa obok piłki, wzrok na celu.", "Najpierw celność, potem moc.", "Zapisuj trafienia w stożki i próbuj poprawić wynik."],
    positions: ["napastnik", "skrzydlowy", "pomocnik"],
    source: "Szkic własny (do przeglądu trenera).",
  },
];

/** Wszystkie ćwiczenia z biblioteki. */
export const ALL_DRILLS: Drill[] = [...POSITION_DRILLS, ...TECHNIQUE_DRILLS];
export const drillById = (id: string): Drill | undefined => ALL_DRILLS.find((d) => d.id === id);

/** Ćwiczenia dla pozycji najpierw, potem wspólne. */
export function drillsFor(position: Position | undefined): Drill[] {
  const all = [...POSITION_DRILLS, ...TECHNIQUE_DRILLS];
  const forMe = all.filter((d) => !d.positions || (position && d.positions.includes(position)));
  return [...forMe.filter((d) => d.positions), ...forMe.filter((d) => !d.positions)];
}

export interface RecoverySession {
  title: string;
  minutes: number;
  /** Elementy z mocniejszymi dowodami na górze. */
  foundation: string[];
  optional: string[];
  source: string;
}

/**
 * Regeneracja po meczu wg przeglądów: fundamentem są odżywianie, nawodnienie i sen;
 * zimna woda i masaż poprawiają głównie odczuwaną regenerację; aktywna regeneracja
 * i rozciąganie – słabe dowody, więc opcjonalnie.
 */
export const RECOVERY: RecoverySession = {
  title: "Regeneracja po meczu",
  minutes: 15,
  foundation: [
    "Posiłek z węglowodanami i białkiem w ciągu 1–2 godzin po meczu.",
    "Nawodnienie: pij do jasnego koloru moczu.",
    "Sen: priorytet, bez skracania nocy po meczu.",
  ],
  optional: [
    "Spokojny spacer lub rower 10–15 min (dla poczucia lekkości).",
    "Rolowanie lub masaż na obolałe partie.",
    "Zimny prysznic lub kąpiel 5–15 °C, 5–20 min – głównie na ból i zmęczenie odczuwane.",
  ],
  source:
    "Przeglądy systematyczne: pubmed.ncbi.nlm.nih.gov/35961644, pubmed.ncbi.nlm.nih.gov/23315753, pmc.ncbi.nlm.nih.gov/articles/PMC9465732.",
};

/**
 * Krótka regeneracja na słaby dzień (zamiast sesji, gdy check-in jest bardzo słaby). Bez meczu w tle.
 * Ogólne zasady (spokojny ruch, rozciąganie, nawodnienie i posiłek); treść do przeglądu trenera.
 */
export const RECOVERY_LIGHT: RecoverySession = {
  title: "Regeneracja na słaby dzień",
  minutes: 20,
  foundation: [
    "Lekki ruch 10–15 min: spacer albo spokojny rower. Bez zadyszki.",
    "Rozciąganie i mobilność 5–10 min: łydki, uda, biodra. Bez bólu.",
    "Pij regularnie i zjedz normalny posiłek z białkiem i węglowodanami.",
  ],
  optional: [],
  source: "Ogólne zasady regeneracji; treść do przeglądu trenera.",
};

