import { createFileRoute, useParams } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionAutoAnalysis } from "@/components/vision/VisionAutoAnalysis";
import { VisionAthleteFrameAnalysis } from "@/components/vision/VisionAthleteFrameAnalysis";
import { VisionTestNotFound } from "@/components/vision/VisionTestNotFound";
import { getVisionTest } from "@/lib/vision/visionTests";
import { isAthleteFrameAnalysisSupported } from "@/lib/vision/frameAnalysisService";
import { isTestVisibleInUi } from "@/lib/vision/supportedTests";

export const Route = createFileRoute("/vision-lab/analyze/$testId")({
  ssr: false,
  component: AnalyzeRoute,
});

function AnalyzeRoute() {
  const { testId } = useParams({ from: "/vision-lab/analyze/$testId" });
  const test = getVisionTest(testId);
  if (!test || !isTestVisibleInUi(test.id)) return <VisionTestNotFound />;
  const supportsVerifiedFrames = isAthleteFrameAnalysisSupported(test.id);
  return (
    <VisionGuard withNav>
      {supportsVerifiedFrames ? (
        <VisionAthleteFrameAnalysis test={test} />
      ) : (
        <VisionAutoAnalysis test={test} />
      )}
    </VisionGuard>
  );
}
