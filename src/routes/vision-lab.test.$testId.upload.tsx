import { createFileRoute, useParams } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionUpload } from "@/components/vision/VisionUpload";
import { VisionTestNotFound } from "@/components/vision/VisionTestNotFound";
import { getVisionTest } from "@/lib/vision/visionTests";
import { isTestVisibleInUi } from "@/lib/vision/supportedTests";

export const Route = createFileRoute("/vision-lab/test/$testId/upload")({
  component: UploadRoute,
});

function UploadRoute() {
  const { testId } = useParams({ from: "/vision-lab/test/$testId/upload" });
  const test = getVisionTest(testId);
  const visible = test ? isTestVisibleInUi(test.id) : false;
  return (
    <VisionGuard>
      {test && visible ? <VisionUpload test={test} /> : <VisionTestNotFound />}
    </VisionGuard>
  );
}
