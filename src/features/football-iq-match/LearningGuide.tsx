import { useEffect, useRef } from "react";
import { Play, X } from "lucide-react";
import type { ActionMode, Scenario } from "./types";
import { lessons, actionAdvice } from "./teaching";
import type { TeachingMarker } from "./teaching";
import { modeHints, modeLabels } from "./planner";

export function LearningGuide({
  scenario,
  mode,
  marker,
  onClose,
  onDemo,
}: {
  scenario: Scenario;
  mode: ActionMode;
  marker?: TeachingMarker;
  onClose: () => void;
  onDemo?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const lesson = lessons[scenario.id];
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog className="bwiq-guide" ref={ref} onCancel={onClose} aria-labelledby="bwiq-guide-title">
      <header>
        <div>
          <small>IQ · Wskazówka</small>
          <h2 id="bwiq-guide-title">{marker?.label ?? scenario.title}</h2>
        </div>
        <button aria-label="Zamknij wskazówki" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="bwiq-guide-body">
        <p className="bwiq-guide-observe">{marker?.instruction ?? lesson?.observe}</p>
        {lesson && (
          <>
            <details>
              <summary>Kiedy?</summary>
              <p>{lesson.when}</p>
            </details>
            <details>
              <summary>Dlaczego?</summary>
              <p>{lesson.why}</p>
            </details>
            <details>
              <summary>W Twoim meczu</summary>
              <p>{lesson.transfer}</p>
            </details>
          </>
        )}
        <details>
          <summary>Jak: {modeLabels[mode]}</summary>
          <p>{modeHints[mode]}</p>
          <p>
            {actionAdvice[mode].when} {actionAdvice[mode].why}
          </p>
        </details>
        <details>
          <summary>Sterowanie</summary>
          <p>
            Wybierz działanie, potem partnera lub miejsce. Przy ruchu bez piłki najpierw wskaż
            zawodnika. Cofnij usuwa ostatni krok.
          </p>
          <p>Strzał jest opcjonalnym zakończeniem planu, bez wskazywania bramki.</p>
        </details>
        <details>
          <summary>Więcej o zasadzie</summary>
          <p>
            Przykład pokazuje jedną możliwość. Dostosuj decyzję do ruchu rywali i zasad drużyny.
          </p>
          <a
            href={
              scenario.defensive
                ? "https://www.fifatrainingcentre.com/en/practice/talent-coach-programme/zonal-defending/from-principles-to-practice-using-a-progressive-methodology.php"
                : scenario.category === "Zmiana strony"
                  ? "https://www.fifatrainingcentre.com/en/game/game-analysis/in-possession/switch-of-play.php"
                  : "https://www.fifatrainingcentre.com/en/practice/elite-sessions/in-possession/building_from_the_back_skinner.php"
            }
            target="_blank"
            rel="noreferrer"
          >
            FIFA Training Centre
          </a>
        </details>
      </div>
      <footer>
        {onDemo && (
          <button
            className="bwiq-secondary"
            onClick={() => {
              onClose();
              onDemo();
            }}
          >
            <Play size={15} />
            Zobacz ruch
          </button>
        )}
        <button className="bwiq-primary" onClick={onClose}>
          Wróć do boiska
        </button>
      </footer>
    </dialog>
  );
}
