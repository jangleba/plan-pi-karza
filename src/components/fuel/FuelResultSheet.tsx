import { Check, Droplets, Sparkles, Utensils, X } from "lucide-react";
import type { MealPhotoAnalysis } from "@/lib/fuel/photoScanner";
import type { FuelResult } from "@/lib/fuel/types";
import type { FuelTargetRange } from "@/lib/fuel/recommendations";
import type { Fix } from "@/lib/fuel/uiModel";

const VERDICT_COPY: Record<FuelResult["verdict"], { label: string; className: string }> = {
  PASUJE: { label: "Dobrze pasuje", className: "bg-primary text-primary-foreground" },
  POPRAW: { label: "Jedna mała korekta", className: "bg-primary/12 text-primary" },
  ZOSTAW_NA_POZNIEJ: { label: "Lepszy po treningu", className: "bg-muted text-foreground" },
};

export function FuelResultSheet({
  open,
  result,
  target,
  scan,
  fixes,
  onFix,
  onClose,
}: {
  open: boolean;
  result: FuelResult | null;
  target: FuelTargetRange;
  scan: MealPhotoAnalysis | null;
  fixes: Fix[];
  onFix: (id: Fix["id"]) => void;
  onClose: () => void;
}) {
  if (!result) return null;
  const verdict = VERDICT_COPY[result.verdict];

  return (
    <div className={`fixed inset-0 z-[65] ${open ? "pointer-events-auto" : "pointer-events-none"}`}>
      <button
        className={`absolute inset-0 bg-foreground/20 backdrop-blur-[1px] transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        aria-label="Zamknij wynik"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Ocena posiłku"
        className={`absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] w-full max-w-[30rem] overflow-y-auto rounded-t-[1.75rem] border-t border-border bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 shadow-2xl transition-transform duration-300 ${open ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-border" />
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${verdict.className}`}>
              {verdict.label}
            </span>
            <h2 className="mt-3 text-[22px] font-medium leading-tight tracking-[-0.035em]">
              Najlepsza wersja na teraz
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{result.why}</p>

        <div className="mt-4 rounded-3xl bg-primary/[0.07] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="h-4 w-4" /> Rekomendacja
          </div>
          <p className="mt-2 text-[15px] font-medium leading-relaxed">{result.bestVersion}</p>
        </div>

        {result.change && (
          <div className="mt-3 rounded-2xl border border-border p-3.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Największa różnica
            </div>
            <p className="mt-1 text-sm leading-relaxed">{result.change}</p>
          </div>
        )}

        {fixes.length > 0 && !result.safetyBlocked && (
          <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1">
            {fixes.slice(0, 3).map((fix) => (
              <button
                key={fix.id}
                type="button"
                onClick={() => onFix(fix.id)}
                className="shrink-0 rounded-full border border-primary/30 bg-primary/[0.06] px-3.5 py-2 text-sm font-medium text-primary active:scale-95"
              >
                {fix.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-muted/55 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Utensils className="h-3.5 w-3.5" /> Węglowodany
            </div>
            <div className="mt-1 text-sm font-medium">{target.carbMinG}–{target.carbMaxG} g</div>
          </div>
          <div className="rounded-2xl bg-muted/55 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Droplets className="h-3.5 w-3.5" /> Płyny
            </div>
            <div className="mt-1 text-sm font-medium">{target.fluidMinMl}–{target.fluidMaxMl} ml</div>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{target.label}</p>

        {scan && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-primary" /> Szacunek ze zdjęcia
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px]">
              <span>{scan.estimate.caloriesMin}–{scan.estimate.caloriesMax}<small className="block text-[9px] text-muted-foreground">kcal</small></span>
              <span>{scan.estimate.carbsMinG}–{scan.estimate.carbsMaxG}<small className="block text-[9px] text-muted-foreground">węgle g</small></span>
              <span>{scan.estimate.proteinMinG}–{scan.estimate.proteinMaxG}<small className="block text-[9px] text-muted-foreground">białko g</small></span>
              <span>{scan.estimate.fatMinG}–{scan.estimate.fatMaxG}<small className="block text-[9px] text-muted-foreground">tłuszcz g</small></span>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Utensils className="h-3.5 w-3.5" /> Do startu {result.minutesToStart} min · trawienie ok. {result.requiredLeadMinutes} min
        </div>
      </section>
    </div>
  );
}
