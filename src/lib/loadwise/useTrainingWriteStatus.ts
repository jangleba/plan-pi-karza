import { useCallback, useSyncExternalStore } from "react";
import { hasUnresolvedTrainingWrites } from "./offlineTrainingQueue";

const subscribe = (changed: () => void) => {
  window.addEventListener("ballwise:training-queue-changed", changed);
  window.addEventListener("ballwise:training-synced", changed);
  window.addEventListener("storage", changed);
  return () => {
    window.removeEventListener("ballwise:training-queue-changed", changed);
    window.removeEventListener("ballwise:training-synced", changed);
    window.removeEventListener("storage", changed);
  };
};
const serverSnapshot = () => false;

/** Queue changes must invalidate previews even when no profile/plan React state changed. */
export function useTrainingWriteStatus(ownerId?: string): boolean {
  const snapshot = useCallback(() => !!ownerId && hasUnresolvedTrainingWrites(ownerId), [ownerId]);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
