/** Isolated browser QA entry. No route imports this file; all recordings below are simulated. */
import { createRoot } from "react-dom/client";
import BrowserLab from "../BrowserLab";
import { VideoAnalyzer } from "../VideoAnalyzer";
import { attemptPlan } from "../protocols";
import { createBrowserResult, type BrowserResult } from "../results";
import { buildJumpTimeline } from "../measurement";
import { storeBrowserResults } from "../storage";
import type { AutomaticLongJumpCalibration } from "../longJump";

export const timeline = buildJumpTimeline(
  Array.from({ length: 720 }, (_, cts) => ({ cts, timescale: 240, duration: 1 })),
);
const params = new URLSearchParams(location.search);
const portrait = params.get("orientation") === "portrait";
const p = (x: number, y: number): [number, number] => [0.1 + 0.004 * x, 0.1 + 0.0025 * y];
const corners = [
  p(0, -24),
  p(20, -24),
  p(20, 0),
  p(0, 0),
] as AutomaticLongJumpCalibration["referenceCorners"];
const range = [p(0, 288), p(20, 288), p(20, 312), p(0, 312)] as typeof corners;
export const spatial: AutomaticLongJumpCalibration = {
  method: "ballwise-marker-pose-v3",
  referenceCorners: corners,
  rangeCorners: range,
  landingReferenceCorners: corners,
  landingRangeCorners: range,
  referenceWidthCm: 20,
  referenceDepthCm: 24,
  baselineCm: 300,
  imageWidth: portrait ? 720 : 1280,
  imageHeight: portrait ? 1280 : 720,
  calibrationFrameIndex: 60,
  lineFrameIndex: 60,
  heelFrameIndex: 190,
  takeoffLine: [corners[2], corners[3]],
  heel: p(7, 214),
  poseConfidence: 0.95,
  markerQuality: 0.95,
  heelSource: "pose",
};
// The build-time adapters read these values only in the isolated QA bundle.
const qa = Object.assign(window, {
  __labQA: { timeline, spatial, portrait, saved: [] as BrowserResult[] },
});
if (params.get("history") === "1") {
  const rows = [1, 2, 3].map((trial) =>
    createBrowserResult({
      attempt: { ...attemptPlan(["cmj"])[0], trial },
      sessionId: "qa-history-session",
      timeline,
      start: 60,
      end: 160 + trial * 4,
      sourceName: "Dane kontrolne.mp4",
      sourceHash: trial.toString(16).padStart(64, "0"),
      sourceBytes: 1000,
      codec: "avc1.640029",
      guidePositions: [0.5, 0.5],
      notes: "Próba kontrolna układu",
    }),
  );
  storeBrowserResults("browser-qa", rows);
}
const mode = params.get("mode");
const testId = mode === "long-jump" ? "standing_long_jump" : mode === "505" ? "cod_505" : "cmj";
createRoot(document.getElementById("root")!).render(
  <div className="app-shell" style={{ minHeight: "100vh" }}>
    <header className="lab-qa-banner">BallWise Lab · dane kontrolne interfejsu</header>
    {mode ? (
      <div className="browser-lab">
        <VideoAnalyzer
          ownerId="browser-qa"
          attempt={attemptPlan([testId])[0]}
          sessionId="qa-browser-session"
          onSave={(result) => qa.__labQA.saved.push(result)}
        />
      </div>
    ) : (
      <BrowserLab ownerId="browser-qa" />
    )}
  </div>,
);
