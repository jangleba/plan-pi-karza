// Typy modułu Football IQ — nauka decyzji boiskowych.
// Moduł jest w pełni lokalny i nie zależy od Planu ani Vision Lab.

export type IQPhase = "attack" | "defense";

/** Grupa pozycyjna używana przez scenariusze IQ. */
export type IQPositionGroup = "defender" | "midfielder" | "forward";

export type IQRating = "optimal" | "safe" | "risky" | "wrong";

export type IQInteraction = "move" | "zone" | "pass" | "press";

export type IQMarkerKind = "self" | "mate" | "opponent" | "ball";

export interface IQMarker {
  id: string;
  kind: IQMarkerKind;
  x: number; // 0-100
  y: number; // 0-140, kierunek ataku = malejące y
  label?: string;
}

export interface IQTarget {
  id: string;
  x: number;
  y: number;
  /** Promień trafienia w jednostkach boiska (domyślnie 16). */
  radius?: number;
  label: string;
  rating: IQRating;
  explanation: string;
  consequence: string;
}

export interface IQScenario {
  id: string;
  position: IQPositionGroup;
  phase: IQPhase;
  theme: string;
  title: string;
  /** Maksymalnie 2 zdania. */
  description: string;
  interaction: IQInteraction;
  markers: IQMarker[];
  targets: IQTarget[];
  /** Komunikat, gdy decyzja nie trafia w żaden zdefiniowany obszar. */
  missExplanation: string;
  missConsequence: string;
}

export interface IQDecision {
  x: number;
  y: number;
  targetId?: string;
}

export interface IQEvaluation {
  rating: IQRating;
  label: string;
  explanation: string;
  consequence: string;
  best: IQTarget;
  matched?: IQTarget;
}
