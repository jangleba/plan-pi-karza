import type { GymBandSetup, GymObservation, GymProgressionInput } from "./engineV2/gymProgression";
import type { ExerciseSessionLog } from "./setLogHistory";

export interface GymEquipment {
  kind: "equipment";
  version: 1;
  exerciseId: string;
  /** New ID when the station or kg convention changes; old records keep their own snapshot. */
  id: string;
  label: string;
  convention: "total" | "per_hand" | "machine";
  incrementKg?: number;
  availableWeightsKg?: number[];
}
export interface GymLoadResponse {
  kind: "response";
  version: 1;
  sessionId: string;
  exerciseId: string;
  prescriptionKey: string;
  suggestionKey: string;
  decision: "accept" | "hold" | "lighter" | "unanswered";
  reason?: "preference" | "not_ready" | "unable";
  suggestedKg?: number;
  chosenKg: number;
  equipment: GymEquipment;
}
export type GymRecordData =
  | GymEquipment
  | GymLoadResponse
  | {
      kind: "observation";
      version: 1;
      sessionId: string;
      exerciseId: string;
      observation: GymObservation;
    }
  | { kind: "band_setup"; version: 1; setup: GymBandSetup }
  | { kind: "band_selection"; version: 1; exerciseId: string; setupId: string | null };
export interface GymRecord {
  user_id: string;
  record_key: string;
  payload: GymRecordData;
  revision: number;
  updated_at: string;
  last_operation_id: string;
  pending?: boolean;
}
const number = (n: unknown, min: number, max: number) =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
const text = (s: unknown) => typeof s === "string" && s.length > 0 && s.length <= 160;
const uuid = (s: unknown) =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export function validGymEquipment(e: unknown): e is GymEquipment {
  if (!e || typeof e !== "object") return false;
  const v = e as GymEquipment;
  return (
    v.kind === "equipment" &&
    v.version === 1 &&
    text(v.exerciseId) &&
    uuid(v.id) &&
    text(v.label) &&
    ["total", "per_hand", "machine"].includes(v.convention) &&
    (v.incrementKg === undefined || number(v.incrementKg, 0.05, 100)) &&
    (v.availableWeightsKg === undefined ||
      (Array.isArray(v.availableWeightsKg) &&
        v.availableWeightsKg.length > 0 &&
        v.availableWeightsKg.length <= 200 &&
        v.availableWeightsKg.every((n) => number(n, 0.05, 1000)))) &&
    (v.incrementKg !== undefined || v.availableWeightsKg !== undefined)
  );
}
export function validGymRecordData(raw: unknown): raw is GymRecordData {
  if (!raw || typeof raw !== "object" || JSON.stringify(raw).length > 32000) return false;
  const v = raw as GymRecordData;
  if (v.version !== 1) return false;
  if (v.kind === "equipment") return validGymEquipment(v);
  if (v.kind === "band_selection")
    return text(v.exerciseId) && (v.setupId === null || uuid(v.setupId));
  if (v.kind === "band_setup") {
    const s = v.setup;
    return (
      !!s &&
      uuid(s.id) &&
      text(s.exerciseId) &&
      text(s.bandId) &&
      text(s.stationId) &&
      ["resistance", "assistance"].includes(s.direction) &&
      /^\d{4}-\d{2}-\d{2}$/.test(s.measuredOn) &&
      Array.isArray(s.positions) &&
      s.positions.length === 2 &&
      s.positions.every(text) &&
      s.positions[0] !== s.positions[1] &&
      Array.isArray(s.lengthsCm) &&
      s.lengthsCm.length === 2 &&
      s.lengthsCm.every((n) => number(n, 0.1, 1000)) &&
      Array.isArray(s.forceNewtons) &&
      s.forceNewtons.length === 2 &&
      s.forceNewtons.every((n) => number(n, 0.1, 5000))
    );
  }
  if (!["response", "observation"].includes(v.kind) || !uuid(v.sessionId) || !text(v.exerciseId))
    return false;
  if (v.kind === "response")
    return (
      validGymEquipment(v.equipment) &&
      v.equipment.exerciseId === v.exerciseId &&
      ["accept", "hold", "lighter", "unanswered"].includes(v.decision) &&
      (v.reason === undefined || ["preference", "not_ready", "unable"].includes(v.reason)) &&
      number(v.chosenKg, 0, 1000) &&
      (v.suggestedKg === undefined || number(v.suggestedKg, 0, 1000)) &&
      typeof v.prescriptionKey === "string" &&
      v.prescriptionKey.length <= 8000 &&
      typeof v.suggestionKey === "string" &&
      v.suggestionKey.length <= 8000
    );
  if (v.kind === "observation") {
    const o = v.observation;
    return (
      o?.sessionId === v.sessionId &&
      o.exerciseId === v.exerciseId &&
      ["athlete_observed", "video_reviewed"].includes(o.source) &&
      Array.isArray(o.sets) &&
      o.sets.length <= 40 &&
      o.sets.every(
        (s) =>
          Number.isInteger(s.setNumber) &&
          number(s.setNumber, 1, 20) &&
          ["both", "left", "right"].includes(s.side) &&
          ["stable", "lost", "unknown"].includes(s.control) &&
          number(s.completed, 0, 120) &&
          (!s.metric ||
            (number(s.metric.value, 0.01, 200) &&
              ["jump_height_cm", "cycles_per_second"].includes(s.metric.kind) &&
              ["video_reviewed", "device"].includes(s.metric.method))),
      ) &&
      (!o.minimumMetric ||
        (number(o.minimumMetric.value, 0.01, 200) &&
          ["jump_height_cm", "cycles_per_second"].includes(o.minimumMetric.kind) &&
          ["video_reviewed", "device"].includes(o.minimumMetric.method))) &&
      (o.controlLossReported === undefined || o.controlLossReported === true)
    );
  }
  return false;
}
export function gymRecordKey(d: GymRecordData): string {
  if (d.kind === "band_setup") return `band_setup:${d.setup.id}`;
  if (d.kind === "equipment" || d.kind === "band_selection") return `${d.kind}:${d.exerciseId}`;
  return `${d.kind}:${d.sessionId}:${d.exerciseId}`;
}
export function equipmentFor(records: GymRecord[], id: string): GymEquipment | undefined {
  const d = records.find((r) => r.record_key === `equipment:${id}`)?.payload;
  return d?.kind === "equipment" && validGymEquipment(d) ? d : undefined;
}
export function equipmentKey(e: GymEquipment): string {
  return JSON.stringify([e.id, e.convention]);
}
export function equipmentHistory(
  history: ExerciseSessionLog[],
  records: GymRecord[],
  id: string,
  equipment: GymEquipment,
): ExerciseSessionLog[] {
  return history.map((s) => {
    const record = records.find(
      (r) => !r.pending && r.record_key === `response:${s.sessionKey}:${id}`,
    );
    const d = record?.payload;
    return d?.kind === "response" && equipmentKey(d.equipment) === equipmentKey(equipment)
      ? s
      : { ...s, verification: undefined };
  });
}
export function gymProgressionInput(records: GymRecord[], propose = false): GymProgressionInput {
  const data = records.filter((r) => !r.pending).map((r) => r.payload);
  return {
    observations: data.flatMap((d) => (d.kind === "observation" ? [d.observation] : [])),
    bandSetups: data.flatMap((d) => (d.kind === "band_setup" ? [d.setup] : [])),
    selectedBandSetups: Object.fromEntries(
      data.flatMap((d) => (d.kind === "band_selection" ? [[d.exerciseId, d.setupId]] : [])),
    ),
    proposalOnly: propose,
  };
}
export function gymStrengthResponses(records: GymRecord[]): GymLoadResponse[] {
  return records.flatMap((r) => (!r.pending && r.payload.kind === "response" ? [r.payload] : []));
}

/**
 * One shared evidence context for every rebuild of the plan (new plan, running calibration,
 * proposals). `confirmed` is false while any record is still waiting for the server, so callers can
 * defer instead of rebuilding against an incomplete picture.
 */
export function gymPlanContext(records: GymRecord[], propose = false) {
  return {
    gymProgression: gymProgressionInput(records, propose),
    strengthLoadResponses: gymStrengthResponses(records),
    confirmed: !records.some((r) => r.pending),
  };
}
