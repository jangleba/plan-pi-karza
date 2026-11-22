import type { Vec } from "../iq";

export type Team = "us" | "them";
export type Role = "GK" | "CB" | "FB" | "DM" | "W" | "ST" | "S" | "M" | "D" | "P";

export interface Agent {
  id: string;
  name: string;
  team: Team;
  role: Role;
  number: number;
  pos: Vec;
  vel: Vec;
  /** Kierunek ciała (rad, układ boiska: x – wzdłuż, y – w poprzek). */
  heading: number;
  vmax: number;
  /** Pozycja wyjściowa w ustawieniu (kotwica). */
  home: Vec;
  /** Chwila (s), do której zawodnik „kontroluje” piłkę i jeszcze nie gra dalej. */
  controlUntil: number;
  /** Do tej chwili (s) zawodnik jest „wyminięty” po udanym dryblingu rywala i prawie stoi. */
  stunUntil?: number;
}

export interface Flight {
  from: Vec;
  to: Vec;
  /** Czas lotu od startu (s). */
  t: number;
  dur: number;
  kind: "pass" | "shot";
  /** Dośrodkowanie: piłka leci górą, więc przechwycić ją można dopiero na końcu lotu. */
  high?: boolean;
  by: string;
  target: string | null;
  /** Dla strzału: z góry wylosowany (z ziarna) wynik. */
  verdict?: "goal" | "save" | "miss";
}

export interface Ball {
  pos: Vec;
  vel: Vec;
  owner: string | null;
  flight: Flight | null;
  lastTouch: string | null;
}

export type EventType =
  | "pass" | "intercept" | "tackle" | "turnover" | "regain" | "shot" | "goal" | "save" | "miss" | "control" | "counter" | "timeout" | "block" | "dribble";

export interface SimEvent {
  t: number;
  type: EventType;
  /** Wykonawca. */
  by?: string;
  /** Adresat lub ofiara. */
  to?: string;
  pos?: Vec;
  /** Dodatkowe liczby (np. szansa strzału, odległość). */
  info?: Record<string, number | string | boolean>;
}

export type OutcomeKind =
  | "goal_for" | "saved_for" | "miss_for"
  | "goal_against" | "saved_against" | "miss_against"
  | "regain" | "timeout";

/** Styl ataku naszej drużyny w danej sytuacji (losowany z ziarna): różni przebieg akcji po Twoim podaniu. */
export type AttackStyle = "wall" | "switch" | "dribble" | "direct" | "mixed";
export const ATTACK_STYLES: AttackStyle[] = ["wall", "switch", "dribble", "direct", "mixed", "mixed"];

/** Rodzaj sytuacji w IQ: wyjście spod pressingu, odbiór i kontra, rozegranie od bramkarza, 2 na 1 na skrzydle. */
export type Situation = "press" | "counter" | "keeper" | "two_one";

export interface Outcome { kind: OutcomeKind; t: number }

export interface World {
  t: number;
  agents: Agent[];
  ball: Ball;
  seed: number;
  rn: number;
  events: SimEvent[];
  outcome: Outcome | null;
  /** Czas kontaktu defensora z posiadaczem piłki: klucz „obrońca>posiadacz”. */
  contact: Record<string, number>;
  /** Do tej chwili (s) posiadacza nie można odebrać piłki (osłona tuż po przyjęciu/odbiorze). */
  immuneUntil: number;
  /** Ostatnia decyzja AI posiadacza (s) – decyzje co ok. 0,25 s. */
  lastDecision: number;
  /** Id zawodnika sterowanego przez użytkownika (nie ma AI), albo null. */
  user: string | null;
  /** Limit czasu symulacji (s). */
  limit: number;
  /** Rodzaj sytuacji i rola użytkownika (do tytułów i podpowiedzi). */
  situation?: Situation;
  userRole?: string;
  /** Styl ataku naszej drużyny (brak = mieszany). */
  style?: AttackStyle;
  /** Ostatnia próba dryblingu (s), żeby nie ponawiać jej co klatkę. */
  lastDribble?: number;
  /** Ostatni zwód użytkownika (s): krótki odstęp między zwodami. */
  lastFeint?: number;
}

export const FIELD_W = 105;
export const FIELD_H = 68;
