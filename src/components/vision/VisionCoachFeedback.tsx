import { ShieldCheck, MessageSquareText, ListChecks, Target, StickyNote } from "lucide-react";
import type { VisionTestResult } from "@/lib/vision/types";
import { PAID_REVIEW_STATUS_LABELS, REVIEW_TYPE_LABELS } from "@/lib/vision/types";

/** Sekcja z wynikiem pracy trenera (notatka, feedback techniczny). */
export function VisionCoachFeedback({ result }: { result: VisionTestResult }) {
  const fb = result.coachFeedback;
  const hasAnything =
    result.coachNote ||
    fb ||
    result.coachVerified ||
    result.paidReviewRequested;

  if (!hasAnything) return null;

  return (
    <div className="soft-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Analiza trenera</h2>
        </div>
        {result.reviewType && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
            {REVIEW_TYPE_LABELS[result.reviewType]}
          </span>
        )}
      </div>

      <p className="mb-3 text-[11px] text-muted-foreground">
        Status usługi: {PAID_REVIEW_STATUS_LABELS[result.paidReviewStatus]}
      </p>

      {result.manualOverride && result.manualOverrideReason && (
        <div className="mb-3 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700">
          Ręczna korekta wyniku przez trenera. Uzasadnienie: {result.manualOverrideReason}
        </div>
      )}

      {result.coachNote && (
        <Block icon={StickyNote} title="Notatka trenera">
          <p className="text-sm text-foreground">{result.coachNote}</p>
        </Block>
      )}

      {fb?.techniqueSummary && (
        <Block icon={MessageSquareText} title="Ocena techniki">
          <p className="text-sm text-foreground">{fb.techniqueSummary}</p>
        </Block>
      )}

      {fb?.errors && fb.errors.length > 0 && (
        <Block icon={ListChecks} title="Wykryte błędy">
          <ul className="space-y-1 text-sm text-foreground">
            {fb.errors.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-600">•</span> {e}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {fb?.recommendations && fb.recommendations.length > 0 && (
        <Block icon={Target} title="Zalecenia">
          <ul className="space-y-1 text-sm text-foreground">
            {fb.recommendations.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary">•</span> {r}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {fb?.nextSessionNote && (
        <Block icon={StickyNote} title="Na kolejny trening">
          <p className="text-sm text-foreground">{fb.nextSessionNote}</p>
        </Block>
      )}
    </div>
  );
}

function Block({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Target;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      {children}
    </div>
  );
}
