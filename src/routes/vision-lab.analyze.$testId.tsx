import { createFileRoute, useParams } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionAutoAnalysis } from "@/components/vision/VisionAutoAnalysis";
import { VisionTestNotFound } from "@/components/vision/VisionTestNotFound";
import { getVisionTest } from "@/lib/vision/visionTests";

export const Route = createFileRoute("/vision-lab/analyze/$testId")({
  ssr: false,
  component: AnalyzeRoute,
});

function AnalyzeRoute() {
  const { testId } = useParams({ from: "/vision-lab/analyze/$testId" });
  const test = getVisionTest(testId);
  if (!test) return <VisionTestNotFound testId={testId} />;
  return (
    <VisionGuard>
      <VisionAutoAnalysis test={test} />
    </VisionGuard>
  );
}
