import { createFileRoute } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionHistory } from "@/components/vision/VisionHistory";

export const Route = createFileRoute("/vision-lab/history")({
  component: () => (
    <VisionGuard>
      <VisionHistory />
    </VisionGuard>
  ),
});
