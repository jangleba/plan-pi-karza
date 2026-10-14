import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { ActionMode, Scenario } from "./types";
import { lessons, actionAdvice } from "./teaching";
import type { TeachingMarker } from "./teaching";
import { modeHints, modeLabels } from "./planner";

export function LearningGuide({
  scenario,
  mode,
  marker,
  onClose,
}: {
  scenario: Scenario;
  mode: ActionMode;
  marker?: TeachingMarker;
  onClose: () => void;
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
          <small>IQ · Nauka taktyki</small>
          <h2 id="bwiq-guide-title">{scenario.title}</h2>
        </div>
        <button aria-label="Zamknij wskazówki" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="bwiq-guide-body">
        {marker && (
          <section className="bwiq-guide-cue">
            <h3>Miejsce na boisku · {marker.label}</h3>
            <p>{marker.instruction}</p>
          </section>
        )}
        {lesson && (
          <>
            <p className="bwiq-guide-observe">{lesson.observe}</p>
            <dl>
              <dt>Kiedy wykorzystać?</dt>
              <dd>{lesson.when}</dd>
              <dt>Dlaczego to działa?</dt>
              <dd>{lesson.why}</dd>
              <dt>Na Twoim boisku</dt>
              <dd>{lesson.transfer}</dd>
            </dl>
          </>
        )}
        <section>
          <h3>{modeLabels[mode]}</h3>
          <p>{modeHints[mode]}</p>
          <dl>
            <dt>Kiedy?</dt>
            <dd>{actionAdvice[mode].when}</dd>
            <dt>Po co?</dt>
            <dd>{actionAdvice[mode].why}</dd>
          </dl>
        </section>
        <section>
          <h3>Jak zaplanować ruch?</h3>
          <p>
            Z piłką: wskaż partnera lub miejsce prowadzenia. Bez piłki: wybierz zawodnika, potem
            miejsce. W obronie: wybierz zawodnika, potem rywala lub miejsce asekuracji. Do pięciu
            kroków; możesz cofnąć ostatni.
          </p>
          <p>
            Strzał kończy plan jednym wyborem. Nie wskazujesz bramki ani kierunku i nie musisz
            oddawać strzału, by osiągnąć cel ćwiczenia.
          </p>
        </section>
        <p className="bwiq-guide-note">
          Przykład pokazuje jedną możliwość. Na boisku dostosuj decyzję do ruchu rywali, komunikacji
          i zasad drużyny.
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
          Więcej o zasadach · FIFA Training Centre
        </a>
      </div>
      <footer>
        <button className="bwiq-primary" onClick={onClose}>
          Wróć do sytuacji
        </button>
      </footer>
    </dialog>
  );
}
