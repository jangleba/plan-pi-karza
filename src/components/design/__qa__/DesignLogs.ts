/** Isolated browser fixtures: production set-log APIs and account writes are not called. */
import { useState } from "react";
import {
  exerciseHistoryKey,
  plannedExerciseSets,
  type HistorySetLog,
} from "@/lib/loadwise/setLogHistory";
export { exerciseHistoryKey as exerciseKey, plannedExerciseSets as plannedSets };
export type SetLog = HistorySetLog;
export function useExerciseSetLogs() {
  const [current, setCurrent] = useState<Record<number, HistorySetLog>>({});
  return {
    current,
    previous: {},
    recentSessions: [],
    loading: false,
    saveSet: async (log: HistorySetLog) => {
      setCurrent((rows) => ({ ...rows, [log.setNumber]: log }));
      return true;
    },
  };
}
