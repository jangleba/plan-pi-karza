import { createFileRoute, useParams } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionCoachAnalyzer } from "@/components/vision/VisionCoachAnalyzer";

export const Route = createFileRoute("/vision-lab/coach/analyzer/$resultId")({
  component: CoachAnalyzerRoute,
});

function CoachAnalyzerRoute() {
  const { resultId } = useParams({
    from: "/vision-lab/coach/analyzer/$resultId",
  });
  return (
    <VisionGuard>
      <VisionCoachAnalyzer resultId={resultId} />
    </VisionGuard>
  );
}
