// Typy silnika mikrosymulacji Football IQ.
// Silnik jest sterowany danymi — scenariusze to czyste obiekty, bez logiki UI.

export type SimStage = "observation" | "reaction" | "decision" | "replay";

export type SimCriterion =
  | "timing"
  | "body"
  | "progression"
  | "advantage"
  | "risk";

export type SimFoot = "left" | "right";

export type SimActorKind = "self" | "mate" | "opponent" | "ball";

export interface SimKeyframe {
  /** t = 0..1 w obrębie fazy obserwacji. */
  t: number;
  x: number;
  y: number;
  /** Opcjonalny kierunek ustawienia ciała (stopnie, 0 = w stronę bramki rywala). */
  facingAngle?: number;
  /** Opcjonalna etykieta akcji w tej klatce (np. "receive", "turn", "scan"). */
  action?: string;
}

export interface SimActor {
  id: string;
  kind: SimActorKind;
  label?: string;
  /** Klatki kluczowe: t = 0..1 w obrębie fazy obserwacji. */
  path: SimKeyframe[];
}


export interface SimTimingWindow {
  id: string;
  /** Milisekundy od startu obserwacji. */
  fromMs: number;
  toMs: number;
  label: string;
  /** 0..1 — jakość momentu startu ruchu. */
  quality: number;
  note: string;
}

export interface SimZone {
  id: string;
  x: number;
  y: number;
  radius: number;
  label: string;
  quality: number;
  note: string;
  /** Reakcja rywala wywołana wejściem w tę strefę. */
  reaction: string;
}

export interface SimBodyAngle {
  id: string;
  /** Kąt w stopniach, 0 = w stronę bramki rywala (w górę boiska). */
  centerDeg: number;
  toleranceDeg: number;
  label: string;
  quality: number;
  note: string;
}

export interface SimReaction {
  id: string;
  label: string;
  description: string;
  /** Docelowe pozycje rywali po reakcji. */
  moves: { actorId: string; x: number; y: number }[];
}

export interface SimActionOutcome {
  /** 0..1 na kryterium. */
  progression: number;
  advantage: number;
  /** 0..1, gdzie 1 = ryzyko w pełni kontrolowane. */
  risk: number;
  /** Krótki opis konsekwencji. */
  consequence: string;
  /** Tor zagrania rysowany w replayu. */
  path?: { x: number; y: number }[];
}

export interface SimAction {
  id: string;
  label: string;
  /** Wynik zależny od reakcji rywala. */
  outcomes: Record<string, SimActionOutcome>;
}

export interface SimAlternative {
  /** Klucz: reactionId. */
  actionId: string;
  changed: string;
}

export interface SimScenarioContext {
  minute: number;
  scoreline: string;
  phase: string;
  positionLabel: string;
  /** Wagi kryteriów wynikające z kontekstu meczu. Suma dowolna, normalizowana. */
  weights: Record<SimCriterion, number>;
  weightsNote: string;
}

/** Temat taktyczny scenariusza (biblioteka zaawansowana). */
export type SimTopic =
  | "press_manipulation"
  | "third_man"
  | "overload_isolate"
  | "positional_rotation"
  | "between_lines"
  | "weak_side_exit"
  | "press_trap"
  | "rest_defence"
  | "counterpress"
  | "transition";

export interface SimSourceReference {
  /** Np. "UEFA Coaching Convention" / "FIFA Training Centre". */
  label: string;
  url?: string;
}

export interface SimScenario {
  id: string;
  title: string;
  brief: string;
  topic: SimTopic;
  /** Grupy pozycyjne, dla których scenariusz jest trafny. */
  positions: ("defender" | "midfielder" | "forward")[];
  /**
   * "draft" = materiał roboczy bez źródła i bez akceptacji eksperta.
   * "sourced" = ma sourceReference do materiału FIFA/UEFA.
   */
  status: "draft" | "sourced";
  sourceReference?: SimSourceReference;
  context: SimScenarioContext;
  observationMs: number;
  decisionMs: number;
  actors: SimActor[];
  timingWindows: SimTimingWindow[];
  timingMissNote: string;
  zones: SimZone[];
  zoneMissNote: string;
  defaultReaction: string;
  bodyAngles: SimBodyAngle[];
  bodyMissNote: string;
  feet: { foot: SimFoot; quality: number; note: string }[];
  reactions: SimReaction[];
  actions: SimAction[];
  /** Lepsza alternatywa per reakcja rywala. */
  alternatives: Record<string, SimAlternative>;
  fallbackOutcome: SimActionOutcome;
}

export interface SimChoice {
  timingMs: number | null;
  x: number;
  y: number;
  angleDeg: number;
  foot: SimFoot;
  actionId: string | null;
}

export type SimFeedbackKey = "timing" | "space" | "consequence";
export type SimVerdict = "good" | "mixed" | "poor";

export interface SimFeedbackItem {
  key: SimFeedbackKey;
  label: string;
  verdict: SimVerdict;
  text: string;
}

export interface SimResult {
  reaction: SimReaction;
  /** Trzy deterministyczne wnioski wynikające z danych scenariusza. */
  feedback: SimFeedbackItem[];
  action: SimAction | null;
  outcome: SimActionOutcome;
  alternative: { action: SimAction; outcome: SimActionOutcome; changed: string } | null;
}

