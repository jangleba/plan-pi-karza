import { TrendingUp, TrendingDown, Minus, Trophy } from "lucide-react";
import type { VisionComparison } from "@/lib/vision/types";

export function VisionProgressComparison({
  comparison,
}: {
  comparison: VisionComparison | null;
}) {
  if (!comparison) return null;

  const label = comparison.label;
  const Icon =
    label === "improvement" ? TrendingUp : label === "regression" ? TrendingDown : Minus;
  const tone =
    label === "improvement"
      ? "text-emerald-600"
      : label === "regression"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div className="soft-card p-4">
      <h2 className="mb-2 text-sm font-semibold text-foreground">Porównanie progresu</h2>
      <div className="space-y-2">
        {comparison.vsPrevious && (
          <div className={`flex items-center gap-2 text-sm ${tone}`}>
            <Icon className="h-4 w-4 shrink-0" />
            <span>{comparison.vsPrevious}</span>
          </div>
        )}
        {comparison.vsBest && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Trophy className="h-4 w-4 shrink-0 text-amber-500" />
            <span>{comparison.vsBest}</span>
          </div>
        )}
        {comparison.techniqueNote && (
          <p className="text-xs text-muted-foreground">{comparison.techniqueNote}</p>
        )}
      </div>
    </div>
  );
}
