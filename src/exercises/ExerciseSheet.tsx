import { EXERCISES } from "../engine";
import { Sheet } from "../Sheet";
import { ExerciseAnim } from "./ExerciseAnim";
import { INFO, tempoParts } from "./info";

/** Karta ćwiczenia (wysuwana od dołu): animacja, tempo, 3 wskazówki. */
export function ExerciseSheet({ id, note, onClose }: { id: string; note?: string; onClose: () => void }) {
  const ex = EXERCISES[id];
  const info = INFO[id];
  const tempo = tempoParts(note);
  return (
    <Sheet title={ex?.name ?? id} onClose={onClose}>
      {info ? (
        <>
          <div className="h-52 overflow-hidden rounded-2xl bg-canvas">
            <ExerciseAnim anim={info.anim} />
          </div>
          {tempo && (
            <div className="mt-4">
              <div className="text-xs text-muted">Tempo <span className="tabular-nums">{tempo.raw}</span></div>
              <div className="mt-1.5 grid grid-cols-3 gap-2 text-center text-xs">
                {tempo.parts.map((p, k) => <span key={k} className="rounded-xl bg-canvas px-2 py-2 text-ink">{p}</span>)}
              </div>
            </div>
          )}
          {info.pace && (
            <p className="mt-4 text-sm"><span className="text-muted">Intensywność: </span>{info.pace}</p>
          )}
          <ul className="mt-4 flex flex-col gap-2.5">
            {info.cues.map((c) => (
              <li key={c} className="flex gap-2.5 text-[15px] leading-snug"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink/70" />{c}</li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-muted">Opis orientacyjny – szczegóły potwierdzi trener.</p>
        </>
      ) : (
        <p className="text-sm text-muted">Opis tego ćwiczenia jest w przygotowaniu.</p>
      )}
    </Sheet>
  );
}
