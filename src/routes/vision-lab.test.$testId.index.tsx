import { createFileRoute, useParams } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionTestDetails } from "@/components/vision/VisionTestDetails";
import { VisionTestNotFound } from "@/components/vision/VisionTestNotFound";
import { getVisionTest } from "@/lib/vision/visionTests";

export const Route = createFileRoute("/vision-lab/test/$testId/")({
  component: TestDetailsRoute,
});

function TestDetailsRoute() {
  const { testId } = useParams({ from: "/vision-lab/test/$testId/" });
  const test = getVisionTest(testId);
  return (
    <VisionGuard>
      {test ? <VisionTestDetails test={test} /> : <VisionTestNotFound />}
    </VisionGuard>
  );
}
