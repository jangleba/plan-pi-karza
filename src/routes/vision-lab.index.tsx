import { createFileRoute } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionLabHome } from "@/components/vision/VisionLabHome";

export const Route = createFileRoute("/vision-lab/")({
  component: () => (
    <VisionGuard withNav>
      <VisionLabHome />
    </VisionGuard>
  ),
});
