import { createFileRoute } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionCoachQueue } from "@/components/vision/VisionCoachQueue";

export const Route = createFileRoute("/vision-lab/coach/")({
  component: () => (
    <VisionGuard>
      <VisionCoachQueue />
    </VisionGuard>
  ),
});
