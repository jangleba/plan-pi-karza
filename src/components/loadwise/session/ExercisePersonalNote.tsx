import { useId } from "react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { useAuth } from "@/lib/loadwise/auth";
import { exerciseKey } from "@/lib/loadwise/setLogs";
import { parseExerciseNote, trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";

export function ExercisePersonalNote({ exercise }: { exercise: TrainingExercise }) {
  const { user } = useAuth();
  const id = useId();
  const note = useTrainingLocalState(
    trainingStorageKey("note", user?.id, exerciseKey(exercise)),
    "",
    parseExerciseNote,
  );
  return (
    <details className="mt-2 rounded-xl border border-border/60 bg-card px-3 text-xs">
      <summary className="cursor-pointer py-3 font-medium text-foreground">
        Moja notatka{note.value ? (note.available ? " · zapisana" : " · szkic") : ""}
      </summary>
      <label htmlFor={id} className="block text-muted-foreground">
        Ustawienie sprzętu lub wskazówka do następnego treningu
      </label>
      <textarea
        id={id}
        value={note.value}
        maxLength={500}
        rows={2}
        onChange={(event) => note.setValue(event.target.value)}
        placeholder="Np. ławka na ustawieniu 3"
        className="mt-2 w-full resize-y rounded-lg border border-border bg-background p-2 text-sm text-foreground"
      />
      <p className="pb-3 text-[11px] text-muted-foreground" role="status">
        {note.available
          ? "Notatka zapisywana na tym urządzeniu."
          : "Zapis na urządzeniu jest niedostępny. Notatka pozostaje w otwartym ekranie."}
      </p>
    </details>
  );
}
