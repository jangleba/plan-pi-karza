import { useNavigate } from "@tanstack/react-router";
import {
  CalendarClock,
  Dumbbell,
  Video,
  VideoOff,
  Info,
  RotateCcw,
} from "lucide-react";
import { VisionHeader } from "./visionUi";
import { Button } from "@/components/ui/button";
import {
  GYM_REVIEW_STATUS_LABELS,
  GYM_TECHNIQUE_MESSAGE,
  type VisionTestResult,
  type TechniqueReview,
} from "@/lib/vision/types";
import { deriveGymStatus } from "@/lib/vision/visionRepo";
import { formatDate } from "@/lib/loadwise/labels";

const FIELD_LABELS: { key: keyof TechniqueReview; label: string }[] = [
  { key: "trunk_position", label: "Pozycja tułowia" },
  { key: "knee_control", label: "Kontrola kolana" },
  { key: "hip_control", label: "Kontrola biodra" },
  { key: "foot_position", label: "Ustawienie stopy" },
  { key: "range_of_motion", label: "Zakres ruchu" },
  { key: "tempo_control", label: "Tempo ruchu" },
  { key: "stability", label: "Stabilność" },
];

export function VisionGymResult({ result }: { result: VisionTestResult }) {
  const navigate = useNavigate();
  const status = deriveGymStatus(result);
  const tr = result.techniqueReview ?? {};
  const rows = FIELD_LABELS.filter((f) => (tr[f.key] as string)?.trim());

  return (
    <div className="pb-28">
      <VisionHeader
        title={result.linkedExerciseName ?? result.testName}
        subtitle="Analiza techniki ćwiczenia"
        backTo="/vision-lab"
      />

      <div className="space-y-4 px-5">
        <div className="soft-card flex items-center gap-3 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-brand">
            <Dumbbell className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">
              {result.linkedExerciseName ?? result.testName}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              {result.linkedTrainingDay ?? "—"} · {formatDate(result.createdAt.slice(0, 10))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-semibold text-primary">
            {GYM_REVIEW_STATUS_LABELS[status]}
          </span>
          {result.exerciseCategory && (
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
              {result.exerciseCategory}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
            {result.videoUrl && !result.videoUrl.startsWith("placeholder://") ? (
              <>
                <Video className="h-3.5 w-3.5" /> Film załączony
              </>
            ) : (
              <>
                <VideoOff className="h-3.5 w-3.5" /> Brak filmu
              </>
            )}
          </span>
        </div>

        {rows.length > 0 && (
          <div className="soft-card p-4">
            <h2 className="mb-2 text-sm font-semibold text-foreground">Ocena techniki</h2>
            <div className="space-y-2">
              {rows.map((f) => (
                <div key={f.key} className="flex justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="text-right font-medium text-foreground">
                    {tr[f.key] as string}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tr.main_issue && (
          <div className="soft-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">
              Główny błąd techniczny
            </div>
            <p className="mt-0.5 text-sm text-foreground">{tr.main_issue}</p>
          </div>
        )}
        {tr.coaching_cue && (
          <div className="soft-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">
              Wskazówka do poprawy
            </div>
            <p className="mt-0.5 text-sm text-foreground">{tr.coaching_cue}</p>
          </div>
        )}
        {tr.coach_note && (
          <div className="soft-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notatka trenera
            </div>
            <p className="mt-0.5 text-sm text-foreground">{tr.coach_note}</p>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-[11px] leading-snug text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{GYM_TECHNIQUE_MESSAGE}</span>
        </div>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-5 py-3 backdrop-blur"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
      >
        <div className="mx-auto w-full max-w-[30rem]">
          <Button
            className="w-full"
            size="lg"
            variant="outline"
            onClick={() => navigate({ to: "/vision-lab/gym" })}
          >
            <RotateCcw className="mr-1 h-4 w-4" /> Analizuj inne ćwiczenie
          </Button>
        </div>
      </div>
    </div>
  );
}
