import { createFileRoute, useParams } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionUpload } from "@/components/vision/VisionUpload";
import { VisionTestNotFound } from "@/components/vision/VisionTestNotFound";
import { getVisionTest } from "@/lib/vision/visionTests";

export const Route = createFileRoute("/vision-lab/test/$testId/upload")({
  component: UploadRoute,
});

function UploadRoute() {
  const { testId } = useParams({ from: "/vision-lab/test/$testId/upload" });
  const test = getVisionTest(testId);
  return (
    <VisionGuard>
      {test ? <VisionUpload test={test} /> : <VisionTestNotFound />}
    </VisionGuard>
  );
}
