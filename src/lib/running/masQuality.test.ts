import { describe, expect, it } from "vitest";
import { fieldMasFromActivity } from "./engine";
import { measureMasEvidence, masEvidenceProblem, verifiedMasKmh } from "./masQuality";
import { masEvidence, masResult } from "./__fixtures__/mas";
import type { RoutePoint, RunningActivityDraft } from "./types";
const start = Date.parse("2026-11-14T10:00:00Z");
function activity(): RunningActivityDraft {
  // Continuous 20-minute route; the trial is only minutes 10–15.
  const route: RoutePoint[] = Array.from({ length: 601 }, (_, i) => ({
    lat: 0,
    lng: (i * 2 * 1300) / 300 / 111194.92664455874,
    elapsedSec: i * 2,
    recordedAt: new Date(start + i * 2000).toISOString(),
    accuracyM: 4,
    segment: 0,
  }));
  return {
    sessionId: "mas",
    date: "2026-11-14",
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(start + 1200000).toISOString(),
    durationSec: 1200,
    distanceM: 5200,
    avgPaceSecPerKm: null,
    route,
    splits: [],
    source: "gps",
    intervalResults: [{ ...masResult(), startElapsedSec: 600 }],
  };
}
describe("MAS continuous-trial measurement", () => {
  it("uses exactly the 300-second segment, excluding warm-up and cool-down", () => {
    const a = activity(),
      e = measureMasEvidence(a)!;
    expect(e.distanceM).toBeCloseTo(1300, 5);
    expect(e.wallDurationSec).toBe(300);
    expect(masEvidenceProblem(e)).toBeNull();
    expect(fieldMasFromActivity(a)).toBe(15.6);
  });
  it("rejects a pause even if the active timer still reads five minutes", () => {
    const a = activity();
    a.route = a.route.map((p) =>
      p.elapsedSec >= 750
        ? { ...p, recordedAt: new Date(Date.parse(p.recordedAt) + 60000).toISOString(), segment: 1 }
        : p,
    );
    expect(fieldMasFromActivity(a)).toBeNull();
  });
  it.each(["coarse", "missing_accuracy", "gap", "missing_start", "missing_end", "gpx"])(
    "rejects %s evidence without losing the activity",
    (type) => {
      const a = activity();
      if (type === "coarse") a.route.forEach((p) => (p.accuracyM = 80));
      if (type === "missing_accuracy") a.route.forEach((p) => delete p.accuracyM);
      if (type === "gap") a.route = a.route.filter((p) => p.elapsedSec < 720 || p.elapsedSec > 750);
      if (type === "missing_start") a.route = a.route.filter((p) => p.elapsedSec > 610);
      if (type === "missing_end") a.route = a.route.filter((p) => p.elapsedSec < 890);
      if (type === "gpx") a.source = "gpx";
      expect(fieldMasFromActivity(a)).toBeNull();
    },
  );
  it.each([null, NaN, Infinity, -1])("does not accept invalid distance %s", (value) => {
    expect(verifiedMasKmh({ ...masEvidence(), distanceM: value as number })).toBeNull();
  });
  it("binds a summary to its trial and refuses a borrowed summary", () => {
    expect(
      fieldMasFromActivity({
        durationSec: 300,
        distanceM: 1300,
        intervalResults: [],
        masTestEvidence: masEvidence(),
      }),
    ).toBeNull();
    expect(
      fieldMasFromActivity({
        durationSec: 300,
        distanceM: 1300,
        intervalResults: [masResult(1500)],
        masTestEvidence: masEvidence(),
      }),
    ).toBeNull();
  });
});
