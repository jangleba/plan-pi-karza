import { sanitizeRuns, type SavedRun } from "../engine/routeMap";
import { scoped } from "./store";

const KEY = "runs";

/** Zapisane biegi (walidowane przy odczycie). */
export function loadRuns(): SavedRun[] {
  try { return sanitizeRuns(JSON.parse(scoped.getItem(KEY) ?? "[]")); } catch { return []; }
}

export function saveRuns(runs: SavedRun[]): void {
  const plain = runs.map((r) => ({ ...r, route: r.route.map((p) => (p.t !== undefined ? [p.lat, p.lon, p.t] : [p.lat, p.lon])) }));
  scoped.setItem(KEY, JSON.stringify(plain));
}

/** Usuwa jeden bieg (po dacie i czasie trwania); zwraca pozostałe. */
export function removeRun(target: SavedRun): SavedRun[] {
  const left = loadRuns().filter((r) => !(r.date === target.date && r.elapsedMs === target.elapsedMs && r.distanceM === target.distanceM));
  saveRuns(left);
  return left;
}
