import { createFileRoute, useParams } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionSetupCheck } from "@/components/vision/VisionSetupCheck";
import { VisionTestNotFound } from "@/components/vision/VisionTestNotFound";
import { getVisionTest } from "@/lib/vision/visionTests";

export const Route = createFileRoute("/vision-lab/test/$testId/setup")({
  component: SetupRoute,
});

function SetupRoute() {
  const { testId } = useParams({ from: "/vision-lab/test/$testId/setup" });
  const test = getVisionTest(testId);
  return (
    <VisionGuard>
      {test ? <VisionSetupCheck test={test} /> : <VisionTestNotFound />}
    </VisionGuard>
  );
}
