import type { SessionDay } from "@/lib/loadwise/types";

const NON_RUNNING = /rower|bike|basen|pływ|ergometr|orbitrek/i;

export function isTrackableEnduranceRun(session: SessionDay): boolean {
  if (session.isUnavailable || session.dayType !== "training") return false;
  const text = `${session.title} ${session.sessionType} ${session.goalOfSession}`;
  if (NON_RUNNING.test(text)) return false;
  if (session.classification) return session.classification.isEndurance;
  if (session.type === "endurance_running") return true;
  return /bieg|wytrzyma|wydol|tlen|tempo|interwa|rsa|kondyc/i.test(text);
}
