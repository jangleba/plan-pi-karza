import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  HelpCircle,
  Lightbulb,
  Play,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type {
  JourneyChoice,
  JourneyMode,
  JourneySession,
  ActionTiming,
  DribbleStyle,
} from "./journeyTypes";
import { roleLabels } from "./journeyBank";
import { observationCue } from "./tacticalForecast";
import { spatialChoiceTitle } from "./spatialDecision";
import { dribbleLabels } from "./tacticalJourney";
import { journeyStep } from "./journeyEngine";
import { deliveryLabels, type BallDelivery } from "./ballFlight";

export function SpatialHeader({
  session,
  mode,
  onBack,
  onRole,
  onHelp,
  onMode,
}: {
  session: JourneySession;
  mode: JourneyMode;
  onBack?: () => void;
  onRole: () => void;
  onHelp: () => void;
  onMode: () => void;
}) {
  return (
    <>
      <div className="iqB-heading">
        <button type="button" className="iqJ-icon" aria-label="Wróć do aplikacji" onClick={onBack}>
          <ArrowLeft size={21} />
        </button>
        <button
          type="button"
          className="iqB-role"
          onClick={onRole}
          aria-label="Wybierz sytuację i rolę"
        >
          IQ · {roleLabels[session.definition.role]}
        </button>
        <button type="button" className="iqJ-icon" onClick={onHelp} aria-label="Jak rozegrać akcję">
          <HelpCircle size={20} />
        </button>
      </div>
      <div className="iqB-context">
        <span>{session.definition.contextLabel.split(" · ").slice(0, 2).join(" · ")}</span>
        <span className="iqB-count">{Math.min(session.step + 1, 8)}/8</span>
        <button
          type="button"
          onClick={onMode}
          disabled={session.step > 0}
          aria-pressed={mode === "learn"}
          aria-label="Podpowiedzi na życzenie"
        >
          <Lightbulb size={14} />
          {mode === "learn" ? "Na życzenie" : "Samodzielnie"}
        </button>
      </div>
    </>
  );
}
function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="iqF-sheet iqB-sheet"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <button type="button" className="iqJ-text" onClick={onClose}>
        <ChevronDown size={18} />
        Zwiń
      </button>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
export function SpatialDecisionPanel({
  session,
  choice,
  mode,
  disabled,
  onStay,
  onClear,
  onCommit,
  onForecast,
  onChange,
  onTakeover,
  takeoverNumber,
}: {
  session: JourneySession;
  choice?: JourneyChoice;
  mode: JourneyMode;
  disabled: boolean;
  onStay: () => void;
  onClear: () => void;
  onCommit: () => void;
  onForecast: () => void;
  onChange: (timing: ActionTiming, style?: DribbleStyle, delivery?: BallDelivery) => string | void;
  onTakeover?: () => void;
  takeoverNumber?: number;
}) {
  const [hint, setHint] = useState(false),
    [editing, setEditing] = useState(false),
    [error, setError] = useState("");
  const own = session.world.carrierId === (session.controlledId ?? "you");
  const description = own
    ? "Dotknij partnera lub miejsca dla piłki."
    : "Dotknij miejsca własnego ruchu lub rywala.";
  return (
    <section className="iqB-decision" aria-label="Decyzja na boisku">
      <div className="iqB-decision-line">
        <p aria-live="polite">{choice ? spatialChoiceTitle(session, choice) : description}</p>
        {choice && (
          <button
            type="button"
            className="iqJ-icon"
            aria-label="Usuń planowany ruch"
            onClick={onClear}
          >
            <X size={17} />
          </button>
        )}
      </div>
      <div className="iqB-tools">
        {choice ? (
          <>
            <button
              type="button"
              className="iqB-execute"
              data-iq-commit={choice.id}
              disabled={disabled}
              onClick={onCommit}
            >
              <Play size={16} />
              Rozegraj
            </button>
            <button
              type="button"
              className="iqJ-icon"
              aria-label="Sposób i moment wykonania"
              disabled={disabled}
              onClick={() => setEditing(true)}
            >
              <SlidersHorizontal size={19} />
            </button>
            {mode === "learn" && (
              <button type="button" className="iqB-text" disabled={disabled} onClick={onForecast}>
                Przewidź
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="iqB-text" disabled={disabled} onClick={onStay}>
              Zostań w pozycji
            </button>
            {onTakeover && (
              <button type="button" className="iqB-text" disabled={disabled} onClick={onTakeover}>
                {takeoverNumber ? `Zdecyduj za ${takeoverNumber}` : "Wróć do TY"}
              </button>
            )}
          </>
        )}
        {mode === "learn" && (
          <button
            type="button"
            className="iqJ-icon iqB-hint"
            aria-label="Wskazówka"
            disabled={disabled}
            onClick={() => setHint(true)}
          >
            <Lightbulb size={19} />
          </button>
        )}
      </div>
      {hint && (
        <Sheet title="Na co zwrócić uwagę" onClose={() => setHint(false)}>
          <p>{observationCue(session)}</p>
          <p>
            Porównaj dwie możliwości i pomyśl, co zrobisz po reakcji rywala. Wskazówka nie wybiera
            ruchu za Ciebie.
          </p>
          <button type="button" className="iqJ-button iqJ-primary" onClick={() => setHint(false)}>
            Wróć do boiska
          </button>
        </Sheet>
      )}
      {editing && choice && (
        <Sheet title="Wykonanie Twojego wyboru" onClose={() => setEditing(false)}>
          <p>{spatialChoiceTitle(session, choice)}. Miejsce wybrałeś na boisku.</p>
          {!["hold", "wait"].includes(choice.intent ?? "") && (
            <div className="iqB-segments" role="group" aria-label="Moment wykonania">
              {(["now", "delay"] as ActionTiming[]).map((id) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={(choice.timing ?? "now") === id}
                  onClick={() => setError(onChange(id) || "")}
                >
                  {id === "now" ? "Teraz" : "Po chwili"}
                </button>
              ))}
            </div>
          )}
          {choice.intent === "pass" && (
            <div className="iqB-segments" role="group" aria-label="Tor podania">
              {[
                ...new Set(
                  journeyStep(session)
                    .choices.filter((c) => c.intent === "pass")
                    .map((c) => c.delivery!),
                ),
              ].map((id) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={choice.delivery === id}
                  onClick={() => setError(onChange(choice.timing ?? "now", undefined, id) || "")}
                >
                  {deliveryLabels[id]}
                </button>
              ))}
            </div>
          )}
          {choice.intent === "carry" && (
            <div className="iqB-variants" role="group" aria-label="Wykonanie dryblingu">
              {(
                [
                  "direct",
                  "cut-left",
                  "cut-right",
                  "stop-go",
                  "turn-back",
                  "shield",
                ] as DribbleStyle[]
              ).map((id) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={choice.style === id}
                  onClick={() => setError(onChange(choice.timing ?? "now", id) || "")}
                >
                  {dribbleLabels[id]}
                </button>
              ))}
            </div>
          )}
          {error && <p role="status">{error}</p>}
          <button
            type="button"
            className="iqJ-button iqJ-primary"
            onClick={() => setEditing(false)}
          >
            Wróć do boiska
          </button>
        </Sheet>
      )}
    </section>
  );
}
