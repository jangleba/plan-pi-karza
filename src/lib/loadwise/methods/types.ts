export type TrainingMethodId =
  `M${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20" | "21" | "22" | "23" | "24" | "25" | "26" | "27" | "28" | "29" | "30" | "31" | "32" | "33" | "34" | "35" | "36" | "37" | "38" | "39" | "40" | "41" | "42" | "43" | "44"}`;

export type MethodDomain =
  | "preparation"
  | "strength"
  | "power"
  | "sprint"
  | "conditioning"
  | "skills"
  | "support"
  | "coaching"
  | "planning";
export type MethodClockMode =
  "none" | "continuous" | "intervals" | "cluster" | "hold" | "reactive" | "velocity";
export interface TrainingMethodPreferences {
  /** Explicit supervised primer option; never inferred from strength level. */
  coachedIsometricPrimer?: boolean;
  activationLocation?: "field" | "gym";
  mobilityFocus?: "general" | "hip" | "ankle" | "thoracic";
  periodization?: "auto" | "linear" | "undulating";
  strength?: "auto" | TrainingMethodId;
  conditioning?: "auto" | TrainingMethodId;
  sprint?: "auto" | TrainingMethodId;
  spaceLengthM?: number;
  declaredEquipment?: string[];
}
export interface MethodSessionConditions {
  coachPresent?: boolean;
  participants?: number;
  spaceLengthM?: number;
  equipment?: string[];
  validatedVelocityDevice?: boolean;
}
export interface TrainingMethodDefinition {
  id: TrainingMethodId;
  name: string;
  domain: MethodDomain;
  role: "workout" | "support" | "planning" | "coaching";
  purpose: string;
  requirements: string;
  evidenceNote: string;
  sources: string[];
  minAge?: number;
  minMonths?: number;
  minGymLevel?: "beginner" | "intermediate" | "advanced";
  minCompetence?: "medium" | "high";
  requiresCoach?: boolean;
  equipment?: string[];
  anyEquipment?: string[];
  minSpaceM?: number;
  minParticipants?: number;
  requiresVelocityDevice?: boolean;
  manualOnly?: boolean;
  highCost?: boolean;
  clock: MethodClockMode;
  coachingFocus: string;
  stopRule: string;
}
export interface MethodEligibility {
  allowed: boolean;
  reasons: string[];
}
export interface MethodExecution {
  methodId: TrainingMethodId;
  mode: MethodClockMode;
  rounds: number;
  repetitions: number;
  workSeconds?: number;
  workReps?: number;
  repGroups?: number[];
  restSeconds: number;
  roundRestSeconds: number;
  distanceM?: number;
  runInM?: number;
  runOutM?: number;
  intensityLabel: string;
  stopRule: string;
  focus: string;
  /** A timer and manual input never verify technique, direction or reaction latency. */
  assessment: "athlete_or_coach" | "external_validated_measurement";
  velocityLossLimitPct?: number;
}
export interface TrainingMethodPlan {
  schema: "ballwise-methods-v1";
  recipeVersion: "47";
  primary: TrainingMethodId;
  support: TrainingMethodId[];
  organization: TrainingMethodId[];
  selection: "automatic" | "athlete";
  reason: string;
  conditions?: MethodSessionConditions;
  /** Signature of actual exercise identities and doses, not a medical readiness score. */
  recipeKey: string;
}
