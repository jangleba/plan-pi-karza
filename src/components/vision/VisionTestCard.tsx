import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Camera, Gauge } from "lucide-react";
import { DIFFICULTY_LABELS } from "./visionUi";
import { CAMERA_VIEW_LABELS, type VisionTest } from "@/lib/vision/types";

function VisionTestCardBase({ test }: { test: VisionTest }) {
  return (
    <Link
      to="/vision-lab/test/$testId"
      params={{ testId: test.id }}
      preload="intent"
      className="soft-card flex items-center gap-3 p-4 transition-transform duration-200 ease-out active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">{test.name}</h3>
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {DIFFICULTY_LABELS[test.difficulty]}
          </span>
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{test.goal}</p>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Camera className="h-3.5 w-3.5" /> {CAMERA_VIEW_LABELS[test.cameraView]}
          </span>
          <span className="inline-flex items-center gap-1">
            <Gauge className="h-3.5 w-3.5" /> {test.recommendedFps} FPS
          </span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export const VisionTestCard = memo(VisionTestCardBase);
