/* eslint-disable @typescript-eslint/no-explicit-any */
/** Authored visual audit state. No account access or backend writes. */
import { useSyncExternalStore } from "react";
import cases from "./session-flow-cases.json";
import { initialState, applyExerciseReplacements } from "@/lib/loadwise/store/model";
export { applyExerciseReplacements };
const q = new URLSearchParams(location.search),
  kind = q.get("kind") || "strength";
const fixture = (cases as Record<string, any>)[kind];
const session = fixture.session,
  sid = session.dbId;
const listeners = new Set<() => void>(),
  receipts: any[] = [];
let state: any = {
  ...initialState,
  profile: { ...fixture.profile, healthPersonalizationEnabled: q.get("health") === "1" },
  plan: [session],
};
const completion = (done = false) => ({
  completed: done,
  status: done ? "completed" : "started",
  rpe: done ? 7 : null,
  notes: "",
  durationMin: done ? session.durationMin : null,
  startedAt: new Date(Date.now() - 12 * 60000).toISOString(),
  endedAt: done ? new Date().toISOString() : null,
  executionSnapshot: session,
  writeVersion: 1,
});
if (q.get("phase") === "active" || q.get("phase") === "done")
  state.completions = { [sid]: completion(q.get("phase") === "done") };
function update(next: any) {
  state = next;
  listeners.forEach((fn) => fn());
}
Object.assign(window, { __sessionAudit: { state: () => state, receipts, session, kind } });
export function useLoadwise() {
  const current = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => state,
    () => state,
  );
  return {
    state: current,
    hydrated: true,
    todayIso: "2026-11-02",
    syncing: false,
    loading: false,
    todaySession: session,
    startSession: async (s: any) => {
      receipts.push({ kind: "start", session: s });
      update({ ...state, completions: { ...state.completions, [s.dbId]: completion() } });
    },
    completeSession: async (s: any, rpe: any, notes: any, details: any) => {
      receipts.push({ kind: "complete", session: s, rpe, notes, details });
      update({
        ...state,
        completions: {
          ...state.completions,
          [s.dbId]: {
            ...completion(true),
            rpe,
            notes,
            durationMin: details?.durationMin ?? s.durationMin,
          },
        },
      });
    },
    saveRunningActivity: async (draft: any) => {
      receipts.push({ kind: "run", draft });
      update({
        ...state,
        runningActivities: {
          ...state.runningActivities,
          [draft.sessionId]: { ...draft, id: "qa-run", createdAt: new Date().toISOString() },
        },
      });
    },
    deleteRunningActivity: async () => {},
    saveStrengthExperience: async (values: any) =>
      update({ ...state, profile: { ...state.profile, ...values } }),
    markEquipmentUnavailable: async () => {},
    undoModification: async () => {},
    undoExerciseReplacement: async () => {},
    applyModification: async () => {},
    updateProfile: async () => {},
    refreshPlanIfNeeded: async () => {},
  };
}
