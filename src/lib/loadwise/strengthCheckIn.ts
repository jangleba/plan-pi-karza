import type { SessionDay } from "./types";

/** A training preference, not a health/readiness measurement. */
export type StrengthLoadPreference = "as_planned" | "lighter";
export interface StrengthCheckIn {
  version: 1;
  loadPreference: StrengthLoadPreference;
  date: string;
  recordedAt: string;
}
export const isStrengthSession = (s: SessionDay) =>
  !!s.engineV2?.roles.some((r) => r === "strengthA" || r === "strengthB");

export function strengthPreference(s: SessionDay): StrengthLoadPreference | undefined {
  const c = s.strengthCheckIn;
  return isStrengthSession(s) &&
    c?.version === 1 &&
    c.date === s.date &&
    typeof c.recordedAt === "string" &&
    Number.isFinite(Date.parse(c.recordedAt)) &&
    ["as_planned", "lighter"].includes(c.loadPreference)
    ? c.loadPreference
    : undefined;
}
