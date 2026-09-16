import { useEffect, useMemo, useState } from "react";
import { Camera, Check, LoaderCircle, ScanLine, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  analyzeMealPhoto,
  scannedMealText,
  type MealPhotoAnalysis,
  type PreparedMealPhoto,
} from "@/lib/fuel/photoScanner";
import type { FuelSessionInput, Portion } from "@/lib/fuel/types";

const PORTIONS: { id: Portion; label: string }[] = [
  { id: "mala", label: "Mała" },
  { id: "normalna", label: "Normalna" },
  { id: "duza", label: "Duża" },
];

export function MealScannerSheet({
  open,
  photo,
  session,
  onClose,
  onUse,
}: {
  open: boolean;
  photo: PreparedMealPhoto | null;
  session: FuelSessionInput;
  onClose: () => void;
  onUse: (text: string, portion: Portion, analysis: MealPhotoAnalysis) => void;
}) {
  const [permission, setPermission] = useState(false);
  const [analysis, setAnalysis] = useState<MealPhotoAnalysis | null>(null);
  const [clarification, setClarification] = useState<string | null>(null);
  const [portion, setPortion] = useState<Portion>("normalna");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPermission(false);
    setAnalysis(null);
    setClarification(null);
    setPortion("normalna");
    setError(null);
  }, [open, photo]);

  const ready = useMemo(
    () =>
      Boolean(
        analysis?.safeToAnalyze &&
          analysis.items.length > 0 &&
          (!analysis.clarificationQuestion || clarification),
      ),
    [analysis, clarification],
  );

  if (!open || !photo) return null;

  async function runAnalysis() {
    if (!permission || loading) return;
    setLoading(true);
    setError(null);
    try {
      setAnalysis(await analyzeMealPhoto(photo!, session));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nie udało się przeanalizować zdjęcia.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-foreground/25 backdrop-blur-[2px]">
      <button className="absolute inset-0" aria-label="Zamknij skaner" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="meal-scanner-title"
        className="relative mx-auto max-h-[92vh] w-full max-w-[30rem] overflow-y-auto rounded-t-[1.75rem] border-t border-border bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 shadow-2xl"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-border" />
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              <ScanLine className="h-4 w-4" /> Skan posiłku
            </div>
            <h2 id="meal-scanner-title" className="mt-2 text-xl font-medium tracking-[-0.03em]">
              Najpierw skład, potem decyzja
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

        <div className="relative mt-4 overflow-hidden rounded-3xl bg-muted">
          <img src={photo.dataUrl} alt="Posiłek wybrany do analizy" className="h-52 w-full object-cover" />
          <div className="absolute bottom-3 left-3 rounded-full bg-foreground/75 px-3 py-1 text-xs font-medium text-background backdrop-blur">
            {photo.width} × {photo.height}
          </div>
        </div>

        {!analysis && (
          <>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-background/50 p-3.5">
              <input
                type="checkbox"
                checked={permission}
                onChange={(event) => setPermission(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
              />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Wyślij do jednorazowej analizy AI
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  Fotografuj tylko posiłek — bez osób i dokumentów. OpenAI przetworzy obraz;
                  BallWise nie zapisze zdjęcia ani wyniku w profilu.
                </span>
              </span>
            </label>
            <Button
              type="button"
              size="lg"
              className="mt-3 w-full gap-2"
              disabled={!permission || loading}
              onClick={runAnalysis}
            >
              {loading ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Analizuję skład…
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" /> Rozpoznaj posiłek
                </>
              )}
            </Button>
          </>
        )}

        {error && (
          <div className="mt-3 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {analysis && !analysis.safeToAnalyze && (
          <div className="mt-4 rounded-2xl border border-border bg-muted/60 p-4">
            <div className="text-sm font-medium">Zrób ciaśniejsze zdjęcie samego posiłku</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{analysis.summary}</p>
          </div>
        )}

        {analysis?.safeToAnalyze && (
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Check className="h-4 w-4 text-primary" /> Rozpoznany skład
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{analysis.summary}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {analysis.items.map((item, index) => (
                  <span
                    key={`${item.label}-${index}`}
                    className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-medium"
                  >
                    {item.label}
                    {item.confidence === "low" ? " ?" : ""}
                  </span>
                ))}
              </div>
            </div>

            {analysis.clarificationQuestion && (
              <div>
                <div className="text-sm font-medium">{analysis.clarificationQuestion}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {analysis.clarificationOptions.map((option) => (
                    <button
                      type="button"
                      key={option}
                      onClick={() => setClarification(option)}
                      className={`rounded-full border px-3 py-2 text-sm transition active:scale-95 ${
                        clarification === option
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background/60 text-muted-foreground"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="text-sm font-medium">Wielkość porcji</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {PORTIONS.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setPortion(item.id)}
                    className={`rounded-full border px-3 py-2 text-sm transition active:scale-95 ${
                      portion === item.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background/60 text-muted-foreground"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-muted/60 p-3 text-center">
              <Metric label="kcal" value={`${analysis.estimate.caloriesMin}–${analysis.estimate.caloriesMax}`} />
              <Metric label="węgle" value={`${analysis.estimate.carbsMinG}–${analysis.estimate.carbsMaxG} g`} />
              <Metric label="białko" value={`${analysis.estimate.proteinMinG}–${analysis.estimate.proteinMaxG} g`} />
              <Metric label="tłuszcz" value={`${analysis.estimate.fatMinG}–${analysis.estimate.fatMaxG} g`} />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Szacunek z obrazu, nie pomiar. Skan nie wykrywa alergenów ani wszystkich ukrytych
              składników — potwierdź skład przed oceną.
            </p>

            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={!ready}
              onClick={() => onUse(scannedMealText(analysis, clarification), portion, analysis)}
            >
              Potwierdź skład i oceń
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium leading-tight">{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
