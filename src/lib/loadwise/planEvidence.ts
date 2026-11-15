import { type GymRecord } from "./gymEvidence";

export interface PlanGymEvidence {
  loading: boolean;
  available: boolean;
  records: GymRecord[];
}
export function planEvidenceIssue(gym: PlanGymEvidence, unresolvedWrites: boolean): string | null {
  if (gym.loading) return "Czekam na wczytanie zapisów treningu przed przygotowaniem planu.";
  if (!gym.available)
    return "Nie udało się wczytać zapisów treningu. Odśwież dane przed zmianą planu.";
  if (unresolvedWrites || gym.records.some((r) => r.pending))
    return "Zapisy treningu czekają na synchronizację lub rozwiązanie konfliktu. Plan będzie dostępny po ich potwierdzeniu.";
  return null;
}
/** Captures all confirmed decision data used to build a preview, not just an array reference. */
export function planEvidenceKey(gym: PlanGymEvidence): string {
  return JSON.stringify(
    gym.records
      .map((r) => [r.record_key, r.revision, r.payload])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}
