import { createFileRoute } from "@tanstack/react-router";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionCalibrationWizard } from "@/components/vision/VisionCalibrationWizard";

export const Route = createFileRoute("/vision-lab/calibration")({
  component: CalibrationRoute,
});

function CalibrationRoute() {
  return (
    <VisionGuard>
      <VisionCalibrationWizard />
    </VisionGuard>
  );
}
