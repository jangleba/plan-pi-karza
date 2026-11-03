import { ChevronLeft, ChevronRight, Info, Play } from "lucide-react";
import type { JourneyChoice, JourneySession, JourneyStep } from "./journeyTypes";
import { lessonOption } from "./lessonPresentation";
import { useState, type ReactNode } from "react";
type Props = {
  session: JourneySession;
  step: JourneyStep;
  choices: JourneyChoice[];
  activeId: string;
  disabled: boolean;
  onPreview: (id: string) => void;
  onCommit: () => void;
  deliveryControl?: ReactNode;
  intentControl?: ReactNode;
  hintControl?: ReactNode;
};
export function LessonChoicePanel({
  session,
  step,
  choices,
  activeId,
  disabled,
  onPreview,
  onCommit,
  deliveryControl,
  intentControl,
  hintControl,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const index = Math.max(
      0,
      choices.findIndex((c) => c.id === activeId),
    ),
    choice = choices[index];
  if (!choice) return null;
  const expanded = expandedId === choice.id;
  const description = lessonOption(session, step, choice);
  return (
    <section className="iqL-options" aria-label="Porównaj warianty">
      <div className="iqS-intent">
        {intentControl ?? <span className="iqS-phase-label">Wybierz swój ruch</span>}
        {hintControl}
        <button
          type="button"
          className="iqJ-text"
          aria-label="Opis wariantu"
          aria-expanded={expanded}
          onClick={() => setExpandedId(expanded ? null : choice.id)}
        >
          <Info size={16} />
        </button>
      </div>
      <div className="iqL-option-nav">
        <button
          type="button"
          aria-label="Poprzedni wariant"
          disabled={disabled || index === 0}
          onClick={() => onPreview(choices[index - 1].id)}
        >
          <ChevronLeft size={20} />
        </button>
        <span className="iqL-intent-slot" aria-live="polite">
          <strong>{description.title}</strong>
          <small>
            Wariant {index + 1} z {choices.length}
          </small>
        </span>
        <button
          type="button"
          aria-label="Następny wariant"
          disabled={disabled || index === choices.length - 1}
          onClick={() => onPreview(choices[index + 1].id)}
        >
          <ChevronRight size={20} />
        </button>
      </div>
      {expanded && (
        <div className="iqL-option-copy" aria-live="polite">
          <p>{description.detail}</p>
        </div>
      )}
      <div className="iqS-execute-row">
        {deliveryControl}
        <button
          type="button"
          className="iqL-commit"
          data-iq-commit={choice.id}
          disabled={disabled}
          onClick={onCommit}
        >
          <Play size={16} /> Zagraj tak
        </button>
      </div>
    </section>
  );
}
