import { createFileRoute } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionGymSelect } from "@/components/vision/VisionGymSelect";

export const Route = createFileRoute("/vision-lab/gym/")({
  component: () => (
    <VisionGuard>
      <VisionGymSelect />
    </VisionGuard>
  ),
});
