import { AlertTriangle } from "lucide-react";
import type { FrameAnalysisResult } from "@/lib/vision/types";
import { FRAME_STATUS_LABELS, FRAME_STATUS_DESCRIPTIONS } from "@/lib/vision/types";
import { Button } from "@/components/ui/button";

interface Props {
  result: FrameAnalysisResult | null;
  onCompute: () => void;
  onSave: () => void;
  saving: boolean;
  canSave: boolean;
}

/** Podgląd wyliczonego wyniku + przyciski Oblicz / Zapisz. */
export function FrameResultPreview({ result, onCompute, onSave, saving, canSave }: Props) {
  return (
    <div className="space-y-3">
      <Button type="button" variant="secondary" size="lg" className="w-full" onClick={onCompute}>
        Oblicz wynik
      </Button>

      {result && result.status === "invalid" && (
        <div className="soft-card flex items-start gap-2 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{result.error}</p>
        </div>
      )}

      {result && result.status !== "invalid" && (
        <div className="soft-card p-4">
          <div className="text-center">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Wynik
            </div>
            <div className="mt-1 text-4xl font-bold text-foreground">
              {result.mainResultValue}
              <span className="ml-1 text-xl font-semibold text-muted-foreground">
                {result.mainResultUnit}
              </span>
            </div>
            <div className="mt-2 inline-flex rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
              {FRAME_STATUS_LABELS[result.status]}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {FRAME_STATUS_DESCRIPTIONS[result.status]}
            </p>
          </div>

          <dl className="mt-4 space-y-1.5 border-t border-border pt-3">
            {result.basis.items.map((it) => (
              <div key={it.label} className="flex items-center justify-between gap-3 text-xs">
                <dt className="text-muted-foreground">{it.label}</dt>
                <dd className="font-semibold text-foreground">{it.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!canSave || saving}
        onClick={onSave}
      >
        {saving ? "Zapisywanie…" : "Zapisz wynik"}
      </Button>
    </div>
  );
}
