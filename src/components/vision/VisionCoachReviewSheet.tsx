import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Sparkles, LineChart, Check, Loader2, Info } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  COACH_REVIEW_DISCLAIMER,
  type ReviewType,
  type VisionTestResult,
} from "@/lib/vision/types";
import { requestCoachReview } from "@/lib/vision/visionRepo";

const SERVICES: {
  type: ReviewType;
  title: string;
  tagline: string;
  icon: typeof ShieldCheck;
  includes: string[];
}[] = [
  {
    type: "coach_check",
    title: "Coach Check",
    tagline: "Krótka weryfikacja testu.",
    icon: ShieldCheck,
    includes: [
      "Sprawdzenie, czy test jest ważny",
      "Ocena ustawienia kamery",
      "Ocena techniki",
      "Krótka notatka trenera",
      "Status: Coach Verified / Invalid by Coach",
    ],
  },
  {
    type: "technique_review",
    title: "Coach Technique Review",
    tagline: "Dokładniejsza analiza techniki.",
    icon: Sparkles,
    includes: [
      "Ocena techniki ruchu",
      "Wskazanie 1–3 błędów",
      "Konkretne zalecenia",
      "Notatka do kolejnego treningu",
      "Status: Coach Feedback Added",
    ],
  },
  {
    type: "performance_consultation",
    title: "Performance Consultation",
    tagline: "Premium analiza kilku testów.",
    icon: LineChart,
    includes: [
      "Analiza kilku filmów",
      "Porównanie wyników",
      "Ocena trendu",
      "Rekomendacje treningowe",
      "Czy problem powinien wpływać na plan",
    ],
  },
];

export function VisionCoachReviewSheet({
  open,
  onOpenChange,
  result,
  onRequested,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: VisionTestResult;
  onRequested: (updated: VisionTestResult) => void;
}) {
  const [busy, setBusy] = useState<ReviewType | null>(null);

  async function choose(type: ReviewType) {
    setBusy(type);
    try {
      const updated = await requestCoachReview(result.id, type);
      onRequested(updated);
      toast.success("Zgłoszono do analizy trenera.");
      onOpenChange(false);
    } catch {
      toast.error("Nie udało się zgłosić analizy.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader className="text-left">
          <SheetTitle>Poproś o analizę trenera</SheetTitle>
          <SheetDescription>
            AI liczy wynik. Trener weryfikuje poprawność testu i technikę. To opcja premium.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {SERVICES.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.type} className="soft-card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
                    <p className="text-xs text-muted-foreground">{s.tagline}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {s.includes.map((i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      {i}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-3 w-full"
                  disabled={busy !== null}
                  onClick={() => choose(s.type)}
                >
                  {busy === s.type ? (
                    <>
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Zgłaszanie…
                    </>
                  ) : (
                    "Wybierz i zgłoś"
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl bg-secondary p-3 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{COACH_REVIEW_DISCLAIMER}</span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
