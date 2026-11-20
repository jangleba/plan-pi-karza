import type { Position } from "./profile";

/** Model ćwiczenia z diagramem boiska (współrzędne w metrach). */
export type ArrowStyle = "run" | "dribble" | "pass" | "shot";
export type Tone = "green" | "yellow" | "red" | "blue";

export interface Point { x: number; y: number }
export interface Cone extends Point { color?: Tone; label?: string }
export interface Arrow {
  style: ArrowStyle;
  /** Punkty ścieżki: pierwszy = start, ostatni = grot. */
  points: Point[];
  /** Kolejność w serii (1, 2, 3…). */
  step?: number;
  /** Krótki opis kroku pokazywany podczas animacji (bez niego: nazwa strzałki). */
  note?: string;
}

/** Grupy ćwiczeń z piłką w sesji techniki. */
export type DrillGroup = "dribble" | "touch" | "finish";
export const DRILL_GROUPS: Array<[DrillGroup, string]> = [["dribble", "Prowadzenie i zwody"], ["touch", "Pierwszy kontakt i podania"], ["finish", "Wykończenie i strzały"]];

export interface Drill {
  id: string;
  title: string;
  group: DrillGroup;
  /** Zakres rysowanego fragmentu boiska w metrach. */
  field: { width: number; height: number; kind: "full" | "half" | "patch" };
  cones: Cone[];
  arrows: Arrow[];
  goals?: Array<Point & { width: number }>;
  /** Cele, serie i wskazówki – krótko. */
  goal: string;
  dose: string;
  points: string[];
  /** Pozycje, dla których ćwiczenie jest szczególnie ważne (puste = dla wszystkich). */
  positions?: Position[];
  /** Źródło treści (uzupełniane po researchu). */
  source: string;
}

/** Konwencja strzałek: ciągła = bieg bez piłki, falista = prowadzenie, przerywana = podanie, gruba przerywana = strzał. */
export const ARROW_LEGEND: Record<ArrowStyle, string> = {
  run: "Bieg",
  dribble: "Prowadzenie",
  pass: "Podanie",
  shot: "Strzał",
};

export const TONE_HEX: Record<Tone, string> = {
  green: "#7bc99a",
  yellow: "#f0cf6b",
  red: "#e89494",
  blue: "#8fb3e8",
};
