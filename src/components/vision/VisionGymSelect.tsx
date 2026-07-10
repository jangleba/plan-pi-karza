import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dumbbell, ChevronRight, CalendarClock, ArrowRight } from "lucide-react";
import { VisionHeader } from "./visionUi";
import { Button } from "@/components/ui/button";
import { useLoadwise } from "@/lib/loadwise/store";
import { buildPlanWeeks } from "@/lib/loadwise/planEngine";
import {
  getGymExercisesFromWeek,
  type GymPlanExercise,
  type GymExerciseCategory,
} from "@/lib/vision/gymExercises";
import { setSelectedGymExercise } from "@/lib/vision/gymFlow";
import { formatDate } from "@/lib/loadwise/labels";

const CATEGORY_TONE: Record<GymExerciseCategory, string> = {
  Strength: "bg-primary/12 text-primary",
  Power: "bg-amber-500/15 text-amber-600",
  Isometric: "bg-violet-500/15 text-violet-600",
  Accessory: "bg-secondary text-secondary-foreground",
  Rehab: "bg-emerald-500/15 text-emerald-600",
  Core: "bg-sky-500/15 text-sky-600",
};

export function VisionGymSelect() {
  const navigate = useNavigate();
  const { state, todayIso } = useLoadwise();

  const exercises = useMemo(() => {
    const weeks = buildPlanWeeks(state.plan, state.profile);
    if (weeks.length === 0) return [];
    const current =
      weeks.find((w) => todayIso >= w.startDate && todayIso <= w.endDate) ??
      weeks[0];
    return getGymExercisesFromWeek(current);
  }, [state.plan, state.profile, todayIso]);

  function pick(ex: GymPlanExercise) {
    setSelectedGymExercise(ex);
    navigate({ to: "/vision-lab/gym/review" });
  }

  return (
    <div className="pb-16">
      <VisionHeader
        title="Analyze Gym Exercise"
        subtitle="Wybierz ćwiczenie z aktualnego planu siłowego."
        backTo="/vision-lab"
      />

      <div className="space-y-4 px-5">
        {exercises.length === 0 ? (
          <div className="soft-card p-6 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-brand">
              <Dumbbell className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm text-muted-foreground">
              Nie masz obecnie ćwiczeń siłowych w planie. Analiza techniki pojawi
              się, gdy w planie będzie jednostka gym.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Button
                variant="outline"
                onClick={() => navigate({ to: "/vision-lab" })}
              >
                Wróć do Vision Lab
              </Button>
              <Button onClick={() => navigate({ to: "/plan" })}>
                Przejdź do planu <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Wybierz ćwiczenie z planu, aby przejść do analizy techniki.
            </p>
            {exercises.map((ex) => (
              <button
                key={ex.key}
                type="button"
                onClick={() => pick(ex)}
                className="soft-card flex w-full items-start gap-3 p-4 text-left transition-transform active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {ex.trainingDayLabel} · {formatDate(ex.date)}
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-foreground">
                    {ex.exerciseName}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {ex.sessionTitle}
                  </div>
                  {ex.goal && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {ex.goal}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_TONE[ex.category]}`}
                    >
                      {ex.category}
                    </span>
                    {ex.prescription && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                        {ex.prescription}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
