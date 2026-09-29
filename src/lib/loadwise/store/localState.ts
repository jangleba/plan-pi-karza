import type { ExerciseReplacement, LoadwiseState } from "../types";

export function localKey(userId: string) {
  return `loadwise:v3:${userId}`;
}

export interface LocalState {
  unavailableEquipmentIds: string[];
  exerciseReplacements: Record<string, ExerciseReplacement[]>;
}

export function loadLocal(userId: string): LocalState {
  if (typeof window === "undefined")
    return {
      unavailableEquipmentIds: [],
      exerciseReplacements: {},
    };
  try {
    const raw = window.localStorage.getItem(localKey(userId));
    if (!raw)
      return {
        unavailableEquipmentIds: [],
        exerciseReplacements: {},
      };
    const parsed = JSON.parse(raw) as Partial<LocalState>;
    return {
      unavailableEquipmentIds: Array.isArray(parsed.unavailableEquipmentIds)
        ? parsed.unavailableEquipmentIds
        : [],
      exerciseReplacements: parsed.exerciseReplacements ?? {},
    };
  } catch {
    return {
      unavailableEquipmentIds: [],
      exerciseReplacements: {},
    };
  }
}

export function saveLocal(userId: string, s: LocalState) {
  try {
    window.localStorage.setItem(localKey(userId), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function persistLocal(userId: string | undefined, next: LoadwiseState) {
  if (userId)
    saveLocal(userId, {
      unavailableEquipmentIds: next.profile?.unavailableEquipmentIds ?? [],
      exerciseReplacements: next.exerciseReplacements,
    });
}
