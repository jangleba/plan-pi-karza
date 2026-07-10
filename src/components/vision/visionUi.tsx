import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  Zap,
  Timer,
  Repeat2,
  Dumbbell,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  type VisionTestCategory,
  type VisionValidityStatus,
  type VisionConfidenceScore,
  VALIDITY_LABELS,
  CONFIDENCE_LABELS,
} from "@/lib/vision/types";

export const CATEGORY_ICONS: Record<VisionTestCategory, LucideIcon> = {
  jump: Zap,
  sprint: Timer,
  cod: Repeat2,
  technique: Dumbbell,
};

export function VisionHeader({
  title,
  subtitle,
  backTo,
  right,
}: {
  title: string;
  subtitle?: string;
  backTo?: string;
  right?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="px-5 pb-3 pt-5">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            backTo
              ? navigate({ to: backTo })
              : window.history.length > 1
                ? window.history.back()
                : navigate({ to: "/vision-lab" })
          }
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground active:scale-95"
        >
          <ChevronLeft className="h-4 w-4" /> Wróć
        </button>
        {right}
      </div>
      <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
        {title}
      </h1>
      {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
    </header>
  );
}

export function ValidityBadge({ status }: { status: VisionValidityStatus }) {
  const map: Record<VisionValidityStatus, { cls: string; Icon: LucideIcon }> = {
    valid: { cls: "bg-emerald-500/12 text-emerald-600", Icon: CheckCircle2 },
    caution: { cls: "bg-amber-500/12 text-amber-600", Icon: AlertTriangle },
    invalid: { cls: "bg-destructive/12 text-destructive", Icon: XCircle },
  };
  const { cls, Icon } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" /> {VALIDITY_LABELS[status]}
    </span>
  );
}

export function ConfidenceBadge({ level }: { level: VisionConfidenceScore }) {
  const map: Record<VisionConfidenceScore, string> = {
    high: "bg-emerald-500/12 text-emerald-600",
    medium: "bg-amber-500/12 text-amber-600",
    low: "bg-destructive/12 text-destructive",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[level]}`}
    >
      Pewność: {CONFIDENCE_LABELS[level]}
    </span>
  );
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const map: Record<ReviewStatus, { cls: string; Icon: LucideIcon }> = {
    ai_result: { cls: "bg-primary/12 text-primary", Icon: Cpu },
    ai_estimated: { cls: "bg-amber-500/12 text-amber-600", Icon: Cpu },
    ai_high_confidence: { cls: "bg-emerald-500/12 text-emerald-600", Icon: Cpu },
    coach_verified: { cls: "bg-emerald-500/12 text-emerald-600", Icon: ShieldCheck },
    coach_corrected: { cls: "bg-primary/12 text-primary", Icon: UserCheck },
    coach_feedback_added: { cls: "bg-primary/12 text-primary", Icon: UserCheck },
    invalid_by_ai: { cls: "bg-destructive/12 text-destructive", Icon: XCircle },
    invalid_by_coach: { cls: "bg-destructive/12 text-destructive", Icon: XCircle },
  };
  const { cls, Icon } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" /> {REVIEW_STATUS_LABELS[status]}
    </span>
  );
}

export const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Podstawowy",
  intermediate: "Średni",
  advanced: "Zaawansowany",
};
