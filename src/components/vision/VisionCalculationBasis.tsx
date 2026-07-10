import { Microscope } from "lucide-react";
import type { CalculationBasis } from "@/lib/vision/types";

/** Sekcja „Jak powstał wynik?” — transparentna podstawa obliczeń. */
export function VisionCalculationBasis({
  basis,
}: {
  basis: CalculationBasis | null;
}) {
  if (!basis) return null;
  return (
    <div className="soft-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Microscope className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Jak powstał wynik?</h2>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{basis.method}</p>
      <dl className="space-y-2">
        {basis.items.map((it) => (
          <div key={it.label} className="flex items-center justify-between gap-3 text-xs">
            <dt className="text-muted-foreground">{it.label}</dt>
            <dd className="font-semibold text-foreground">{it.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
