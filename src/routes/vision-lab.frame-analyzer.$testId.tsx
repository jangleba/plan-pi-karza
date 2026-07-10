import { createFileRoute, useParams } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionFrameAnalyzer } from "@/components/vision/VisionFrameAnalyzer";
import { VisionTestNotFound } from "@/components/vision/VisionTestNotFound";
import { getVisionTest } from "@/lib/vision/visionTests";

export const Route = createFileRoute("/vision-lab/frame-analyzer/$testId")({
  component: FrameAnalyzerRoute,
});

function FrameAnalyzerRoute() {
  const { testId } = useParams({ from: "/vision-lab/frame-analyzer/$testId" });
  const test = getVisionTest(testId);
  return (
    <VisionGuard>
      {test ? <VisionFrameAnalyzer test={test} /> : <VisionTestNotFound />}
    </VisionGuard>
  );
}
