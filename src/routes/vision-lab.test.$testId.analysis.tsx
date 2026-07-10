import { createFileRoute, useParams } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionAnalysis } from "@/components/vision/VisionAnalysis";
import { VisionTestNotFound } from "@/components/vision/VisionTestNotFound";
import { getVisionTest } from "@/lib/vision/visionTests";

export const Route = createFileRoute("/vision-lab/test/$testId/analysis")({
  component: AnalysisRoute,
});

function AnalysisRoute() {
  const { testId } = useParams({ from: "/vision-lab/test/$testId/analysis" });
  const test = getVisionTest(testId);
  return (
    <VisionGuard>
      {test ? <VisionAnalysis test={test} /> : <VisionTestNotFound />}
    </VisionGuard>
  );
}
