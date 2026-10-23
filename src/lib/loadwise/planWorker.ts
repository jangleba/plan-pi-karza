import { generatePlan } from "./planEngine";
import type { Profile } from "./types";

export interface PlanWorkerRequest {
  profile: Profile;
  start: string;
  days: number;
  weekOffset: number;
}
self.addEventListener("message", (event: MessageEvent<PlanWorkerRequest>) => {
  try {
    const { profile, start, days, weekOffset } = event.data;
    self.postMessage({ plan: generatePlan(profile, new Date(start), days, weekOffset) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Nie udało się ułożyć planu.",
    });
  }
});
