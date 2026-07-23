import { createFileRoute, useParams } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionTestDetails } from "@/components/vision/VisionTestDetails";
import { VisionTestNotFound } from "@/components/vision/VisionTestNotFound";
import { getVisionTest } from "@/lib/vision/visionTests";
import { isTestVisibleInUi } from "@/lib/vision/supportedTests";

export const Route = createFileRoute("/vision-lab/test/$testId/")({
  component: TestDetailsRoute,
});

function TestDetailsRoute() {
  const { testId } = useParams({ from: "/vision-lab/test/$testId/" });
  const test = getVisionTest(testId);
  const visible = test ? isTestVisibleInUi(test.id) : false;
  return (
    <VisionGuard>
      {test && visible ? <VisionTestDetails test={test} /> : <VisionTestNotFound />}
    </VisionGuard>
  );
}
