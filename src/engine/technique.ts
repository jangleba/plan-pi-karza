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
];

export const POSITION_DRILLS: Drill[] = [
  {
    id: "run-in-finish",
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
];

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
