import { useState } from "react";
import { ChevronRight, Info, ShieldAlert } from "lucide-react";
import type { FuelDayTargets, Range } from "@/lib/fuel/dayTargets";
import type { MatchFuelPlan } from "@/lib/fuel/matchPlan";
import { foodSafetyNotice, type FuelFoodSafety } from "@/lib/fuel/practical";

export interface FuelQuestion {
  id: string;
  question: string;
  /** Why the answer changes the advice — shown under the question. */
  why: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string | null;
  onAnswer(value: string): void;
}

const range = (r: Range, unit: string) => `${r.min}–${r.max} ${unit}`;

/** Match timeline: what to eat when, with the step that applies now highlighted. */
export function FuelMatchPlan({ plan, title }: { plan: MatchFuelPlan; title: string }) {
  return (
    <section className="fuel-day-card fuel-match-plan" aria-labelledby="fuel-match-plan-title">
      <h2 id="fuel-match-plan-title" className="fuel-section-title">
        {title}
      </h2>
      <ol className="fuel-match-steps">
        {plan.steps.map((step) => (
          <li
            key={step.id}
            data-state={step.status}
            aria-current={step.status === "now" ? "step" : undefined}
          >
            <span className="fuel-match-when">
              {step.when}
              {step.status === "now" && <b className="fuel-timeline-now">Teraz</b>}
              {step.optional && <small>opcjonalnie</small>}
            </span>
            <strong>{step.title}</strong>
            {step.status !== "past" && (
              <>
                <span className="fuel-match-portion">{step.portion}</span>
                <span className="fuel-match-swap">Zamiennik: {step.swap}</span>
                <span className="fuel-match-why">{step.why}</span>
              </>
            )}
          </li>
        ))}
      </ol>
      {plan.notes.length > 0 && (
        <ul className="fuel-day-notes">
          {plan.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Only the questions whose answer changes the advice; each can stay unanswered. */
export function FuelQuestions({ questions }: { questions: FuelQuestion[] }) {
  if (!questions.length) return null;
  return (
    <section className="fuel-day-card fuel-questions" aria-label="Doprecyzuj">
      {questions.map((q) => (
        <div key={q.id} className="fuel-question">
          <p className="fuel-question-text">{q.question}</p>
          <p className="fuel-question-why">{q.why}</p>
          <div className="fuel-question-options" role="group" aria-label={q.question}>
            {q.options.map((o) => (
              <button
                key={o.value}
                type="button"
                className="fuel-chip-button"
                aria-pressed={q.value === o.value}
                onClick={() => q.onAnswer(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Day ranges below the "what now" answer. No intake log, so never "X kcal left". */
export function FuelDayDetails({
  targets,
  safety,
  onEditSafety,
  canAddWeight,
  onAddWeight,
}: {
  targets: FuelDayTargets;
  safety: FuelFoodSafety;
  onEditSafety(): void;
  canAddWeight: boolean;
  onAddWeight(kg: number): Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [kg, setKg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const notice = foodSafetyNotice(safety);
  return (
    <section className="fuel-day-card fuel-day-details" aria-labelledby="fuel-day-title">
      <div className="fuel-row">
        <h2 id="fuel-day-title" className="fuel-section-title">
          {targets.label}
        </h2>
        <span className="fuel-day-badge">
          {targets.precision === "grams" ? "Orientacyjnie" : "Ograniczona precyzja"}
        </span>
      </div>
      <p className="fuel-day-reason">{targets.reason}</p>
      {targets.precision === "grams" && targets.kcal ? (
        <dl className="fuel-day-ranges">
          <div>
            <dt>Energia</dt>
            <dd>{range(targets.kcal, "kcal")}</dd>
          </div>
          <div>
            <dt>Węglowodany</dt>
            <dd>
              {range(targets.carbsG!, "g")}
              <small>{range(targets.carbsGPerKg, "g/kg")}</small>
            </dd>
          </div>
          <div>
            <dt>Białko</dt>
            <dd>
              {range(targets.proteinG!, "g")}
              <small>{range(targets.proteinGPerKg, "g/kg")}, w 3–5 posiłkach</small>
            </dd>
          </div>
          <div>
            <dt>Tłuszcz</dt>
            <dd>{range(targets.fatG!, "g")}</dd>
          </div>
        </dl>
      ) : (
        <p className="fuel-day-portions">{targets.portions}</p>
      )}
      <p className="fuel-day-fine">
        {targets.precision === "grams"
          ? "Zakres z masy ciała i rodzaju dnia — nie z RPE ani kalorii z zegarka. To nie jest cel do odliczania."
          : "Bez masy ciała pokazuję porcje zamiast gramów i kalorii."}
        {targets.youth && " Dla rosnącego zawodnika bez deficytu i bez celów redukcji masy."}
      </p>
      {canAddWeight &&
        (adding ? (
          <form
            className="fuel-day-weight"
            onSubmit={async (e) => {
              e.preventDefault();
              const value = Number(kg.replace(",", "."));
              setBusy(true);
              setError("");
              try {
                await onAddWeight(value);
                setAdding(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Nie zapisano.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Masa ciała (kg)
              <input
                inputMode="decimal"
                value={kg}
                onChange={(e) => setKg(e.target.value)}
                aria-describedby="fuel-weight-consent"
              />
            </label>
            <p id="fuel-weight-consent" className="fuel-day-fine">
              Zapisując, zgadzasz się na użycie masy ciała do zakresów Fuel (zgoda „Fuel
              Precision”). Wycofasz ją w Profilu — masa zostanie usunięta.
            </p>
            {error && (
              <p className="bw-inline-error" role="alert">
                {error}
              </p>
            )}
            <button className="fuel-primary" disabled={busy || !kg}>
              Zapisz i przelicz
            </button>
            <button type="button" className="fuel-text-button" onClick={() => setAdding(false)}>
              Anuluj
            </button>
          </form>
        ) : (
          <button className="fuel-now-link" onClick={() => setAdding(true)}>
            Dodaj masę ciała, aby zobaczyć gramy (opcjonalnie)
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        ))}
      <button className="fuel-day-safety" onClick={onEditSafety}>
        {safety.status === "has_allergies" ? (
          <ShieldAlert size={18} aria-hidden="true" className="bw-tone--warning" />
        ) : (
          <Info size={18} aria-hidden="true" />
        )}
        <span>
          <strong>{notice.title}</strong>
          <small>{notice.detail}</small>
        </span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      <p className="fuel-day-fine">
        {targets.version} · UEFA 2021, IOC REDs 2023. Zalecenia ogólne, nie porada medyczna ani
        dietetyczna.
      </p>
    </section>
  );
}
