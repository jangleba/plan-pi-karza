import { createFileRoute } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionGymReview } from "@/components/vision/VisionGymReview";

export const Route = createFileRoute("/vision-lab/gym/review")({
  component: () => (
    <VisionGuard>
      <VisionGymReview />
    </VisionGuard>
  ),
});
