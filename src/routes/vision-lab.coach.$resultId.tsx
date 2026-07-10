import { createFileRoute, useParams } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionCoachReview } from "@/components/vision/VisionCoachReview";

export const Route = createFileRoute("/vision-lab/coach/$resultId")({
  component: CoachReviewRoute,
});

function CoachReviewRoute() {
  const { resultId } = useParams({ from: "/vision-lab/coach/$resultId" });
  return (
    <VisionGuard>
      <VisionCoachReview resultId={resultId} />
    </VisionGuard>
  );
}
