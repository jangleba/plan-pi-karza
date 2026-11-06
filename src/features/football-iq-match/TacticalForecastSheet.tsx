import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TacticalForecast } from "./journeyTypes";
import { planLabels, reactionLabels } from "./tacticalForecast";

type Input = Pick<TacticalForecast, "predicted" | "plan">;
export function TacticalForecastSheet({
  rivalNumber,
  onClose,
  onConfirm,
}: {
  rivalNumber: number;
  onClose: () => void;
  onConfirm: (input: Input) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [predicted, setPredicted] = useState<Input["predicted"] | null>(null);
  const [plan, setPlan] = useState<Input["plan"] | null>(null);
  const [page, setPage] = useState<"reaction" | "plan">("reaction");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="iqF-sheet"
      aria-labelledby="iqF-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button type="button" className="iqJ-text iqF-close" onClick={onClose}>
        <ChevronDown size={18} /> Zwiń i wróć do boiska
      </button>
      <span className="iqJ-kicker">
        {page === "reaction" ? "Przewiduj · 1/2" : "Zaplanuj · 2/2"}
      </span>
      <h2 id="iqF-title">
        {page === "reaction"
          ? `Jak zareaguje rywal nr ${rivalNumber}?`
          : "Co sprawdzisz po tej reakcji?"}
      </h2>
      <p>
        {page === "reaction"
          ? "Pomyśl o jego pierwszej reakcji po wybranym zagraniu. Potem porównasz ją z animacją."
          : "Wybierz własny zamiar na kolejny krok. Zmienisz go, jeśli sytuacja się zmieni."}
      </p>
      <div className="iqF-answers">
        {page === "reaction"
          ? (Object.entries(reactionLabels) as [Input["predicted"], string][]).map(
              ([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={predicted === id}
                  onClick={() => setPredicted(id)}
                >
                  {label}
                </button>
              ),
            )
          : (Object.entries(planLabels) as [Input["plan"], string][]).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={plan === id} onClick={() => setPlan(id)}>
                {label}
              </button>
            ))}
      </div>
      <div className="iqF-actions">
        {page === "plan" && (
          <button type="button" className="iqJ-text" onClick={() => setPage("reaction")}>
            Wstecz
          </button>
        )}
        <button
          type="button"
          className="iqJ-button iqJ-primary"
          disabled={page === "reaction" ? !predicted : !plan}
          onClick={() => {
            if (page === "reaction") setPage("plan");
            else if (predicted && plan) onConfirm({ predicted, plan });
          }}
        >
          {page === "reaction" ? "Zaplanuj kolejny krok" : "Rozegraj i sprawdź"}
        </button>
      </div>
    </dialog>
  );
}
