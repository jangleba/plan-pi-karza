import { AlertTriangle, ArrowRight, ChevronRight, Clock3, Droplets, FlaskConical, Utensils } from "lucide-react";

import { formatDuration, type FuelRecommendation, type MealOption } from "../engine/fuelEngine";
import { FuelCore } from "./FuelCore";

interface NowTabProps {
  recommendation: FuelRecommendation;
  selectedMeal?: MealOption;
  sessionTitle?: string;
  onChooseMeal: () => void;
  onAlternate: () => void;
  onOpenQuickCheck: () => void;
  onOpenExplanation: () => void;
  onPlanChanged: () => void;
}

export function NowTab({
  recommendation,
  selectedMeal,
  sessionTitle,
  onChooseMeal,
  onAlternate,
  onOpenQuickCheck,
  onOpenExplanation,
  onPlanChanged
}: NowTabProps) {
  const countdown =
    recommendation.minutesToStart !== null && recommendation.minutesToStart >= 0
      ? `${sessionTitle ?? "Sesja"} za ${formatDuration(recommendation.minutesToStart)}`
      : recommendation.phase === "during"
        ? `${sessionTitle ?? "Sesja"} trwa`
        : recommendation.phase === "recovery"
          ? "Czas na regenerację"
          : sessionTitle ?? "Fuel";

  return (
    <section className="bw-fuel-now" aria-labelledby="bw-fuel-now-title">
      <button className="bw-fuel-session-pill" type="button" onClick={onPlanChanged}>
        <Clock3 aria-hidden="true" />
        <span>{countdown}</span>
        <ChevronRight aria-hidden="true" />
      </button>

      <FuelCore state={recommendation.coreState} label={`Stan Fuel: ${recommendation.title}`} />

      <div className="bw-fuel-now__copy">
        <p className="bw-fuel-eyebrow">{recommendation.eyebrow}</p>
        <h2 id="bw-fuel-now-title">{recommendation.title}</h2>
        <p>{selectedMeal?.name ?? recommendation.subtitle}</p>
      </div>

      {recommendation.targets.length > 0 && (
        <div className="bw-fuel-targets" aria-label="Zakres dopasowany">
          {recommendation.targets.slice(0, 3).map((target) => (
            <div className="bw-fuel-target" key={`${target.id}-${target.label}`}>
              {target.id === "fluid" ? <Droplets aria-hidden="true" /> : <Utensils aria-hidden="true" />}
              <span>{target.label}</span>
              <strong>{target.display}</strong>
            </div>
          ))}
        </div>
      )}

      {recommendation.safetyNotes.length > 0 && (
        <button className="bw-fuel-inline-safety" type="button" onClick={onOpenExplanation}>
          <AlertTriangle aria-hidden="true" />
          <span>{recommendation.safetyNotes[0]}</span>
          <ChevronRight aria-hidden="true" />
        </button>
      )}

      <div className="bw-fuel-actions">
        <button className="bw-fuel-button bw-fuel-button--primary" type="button" onClick={onChooseMeal}>
          {recommendation.primaryAction}
          <ArrowRight aria-hidden="true" />
        </button>
        <button className="bw-fuel-button bw-fuel-button--secondary" type="button" onClick={onAlternate}>
          {recommendation.alternateAction}
        </button>
      </div>

      <div className="bw-fuel-utility-grid">
        <button type="button" onClick={onOpenQuickCheck}>
          <span className="bw-fuel-utility-grid__icon"><Clock3 aria-hidden="true" /></span>
          <span><strong>Szybki check</strong><small>5 odpowiedzi bez pisania</small></span>
          <ChevronRight aria-hidden="true" />
        </button>
        <button type="button" onClick={onOpenExplanation}>
          <span className="bw-fuel-utility-grid__icon"><FlaskConical aria-hidden="true" /></span>
          <span><strong>Dlaczego?</strong><small>Wyjaśnienie i badania</small></span>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>

      <button className="bw-fuel-text-button" type="button" onClick={onPlanChanged}>
        Plan się zmienił
      </button>
    </section>
  );
}
