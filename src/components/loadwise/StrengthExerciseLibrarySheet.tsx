import { useMemo, useState } from "react";
import { Dumbbell, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ExerciseDetailSheet } from "./ExerciseDetailSheet";
import {
  buildStrengthLibraryTrainingExercise,
  filterStrengthLibraryExercises,
  getStrengthLibraryFilterOptions,
  getStrengthLibraryExercises,
  movementLabelForStrengthExercise,
  musclesForStrengthExercise,
} from "@/lib/loadwise/strengthExerciseLibrary";

export function StrengthExerciseLibrarySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [movement, setMovement] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [level, setLevel] = useState("");
  const [place, setPlace] = useState("");
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);

  const options = useMemo(() => getStrengthLibraryFilterOptions(), []);
  const allExercises = useMemo(() => getStrengthLibraryExercises(), []);
  const exercises = useMemo(
    () => filterStrengthLibraryExercises({ query, movement, muscle, equipment, level, place }),
    [equipment, level, movement, muscle, place, query],
  );
  const exerciseCards = useMemo(
    () =>
      exercises.map((exercise) => ({
        exercise,
        preview: buildStrengthLibraryTrainingExercise(exercise),
      })),
    [exercises],
  );
  const selectedExercise = useMemo(
    () =>
      exercises.find((exercise) => exercise.id === selectedExerciseId) ??
      allExercises.find((exercise) => exercise.id === selectedExerciseId) ??
      null,
    [allExercises, exercises, selectedExerciseId],
  );

  const detailExercise = selectedExercise
    ? buildStrengthLibraryTrainingExercise(selectedExercise)
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="h-[92vh] max-w-md overflow-hidden border-border/60 bg-background/95 p-0 backdrop-blur-xl">
          <div className="flex h-full flex-col">
            <div className="border-b border-border/60 px-5 pb-4 pt-5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                <Dumbbell className="h-3.5 w-3.5" />
                Biblioteka ćwiczeń
              </div>
              <DialogTitle className="mt-1 text-xl font-semibold tracking-tight">
                Siła
              </DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Szukaj po polskiej nazwie lub aliasie i filtruj po ruchu, mięśniach, sprzęcie,
                poziomie oraz miejscu.
              </p>
            </div>

            <div className="space-y-3 border-b border-border/60 px-5 py-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Szukaj: Przysiad goblet, RDL, nordic..."
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={movement}
                  onChange={(event) => setMovement(event.target.value)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Ruch</option>
                  {options.movements.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={muscle}
                  onChange={(event) => setMuscle(event.target.value)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Mięśnie</option>
                  {options.muscles.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={equipment}
                  onChange={(event) => setEquipment(event.target.value)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Sprzęt</option>
                  {options.equipment.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={level}
                  onChange={(event) => setLevel(event.target.value)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Poziom</option>
                  {options.levels.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={place}
                  onChange={(event) => setPlace(event.target.value)}
                  className="col-span-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Miejsce</option>
                  {options.places.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-muted-foreground">
                Wyniki: <span className="font-semibold text-foreground">{exercises.length}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-3">
                {exerciseCards.map(({ exercise, preview }) => {
                  return (
                    <button
                      key={exercise.id}
                      type="button"
                      onClick={() => setSelectedExerciseId(exercise.id)}
                      className="w-full rounded-2xl border border-border/70 bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-primary/40"
                    >
                      <div className="text-sm font-semibold leading-snug text-foreground">
                        {exercise.displayNamePl}
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {movementLabelForStrengthExercise(exercise)} ·{" "}
                        {musclesForStrengthExercise(exercise).slice(0, 3).join(", ")}
                      </div>
                      <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {preview.equipment} · {preview.displayPrescription}
                      </div>
                    </button>
                  );
                })}
                {exerciseCards.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                    Brak wyników dla wybranych filtrów. Wyczyść część filtrów albo wyszukaj inną
                    nazwę.
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ExerciseDetailSheet
        exercise={detailExercise}
        open={Boolean(detailExercise)}
        onOpenChange={(next) => {
          if (!next) setSelectedExerciseId(null);
        }}
      />
    </>
  );
}
