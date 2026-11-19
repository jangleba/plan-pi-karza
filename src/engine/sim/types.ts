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
}

export interface Flight {
  from: Vec;
  to: Vec;
  /** Czas lotu od startu (s). */
  t: number;
  dur: number;
  kind: "pass" | "shot";
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
  | "pass" | "intercept" | "tackle" | "turnover" | "regain" | "shot" | "goal" | "save" | "miss" | "control" | "counter" | "timeout" | "block";

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
}

export const FIELD_W = 105;
export const FIELD_H = 68;
