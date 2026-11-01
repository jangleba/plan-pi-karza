import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import type { JourneyChoice, JourneySession, JourneyStep } from "./journeyTypes";
import { lessonOption } from "./lessonPresentation";
import type { ReactNode } from "react";
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
}: Props) {
  const index = Math.max(
      0,
      choices.findIndex((c) => c.id === activeId),
    ),
    choice = choices[index];
  if (!choice) return null;
  const description = lessonOption(session, step, choice);
  return (
    <section className="iqL-options" aria-label="Porównaj warianty">
      <div className="iqL-option-nav">
        <button
          type="button"
          aria-label="Poprzedni wariant"
          disabled={disabled || index === 0}
          onClick={() => onPreview(choices[index - 1].id)}
        >
          <ChevronLeft size={20} />
        </button>
        <span className="iqL-intent-slot">
          {intentControl ?? "Podgląd wariantu"}{" "}
          <strong>
            {index + 1} z {choices.length}
          </strong>
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
      <div className="iqL-option-copy" aria-live="polite">
        <div className="iqL-option-title">
          <strong>{description.title}</strong>
          {deliveryControl}
        </div>
        <p>{description.detail}</p>
      </div>
      <button
        type="button"
        className="iqL-commit"
        data-iq-commit={choice.id}
        disabled={disabled}
        onClick={onCommit}
      >
        <Play size={16} /> Zagraj tak
      </button>
    </section>
  );
}
