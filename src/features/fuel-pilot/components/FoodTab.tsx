import { Apple, ChevronRight, CookingPot, Home, MapPin, RefreshCw, Store, Timer, Wheat } from "lucide-react";

import type { MealOption, QuickSignals } from "../engine/fuelEngine";

interface FoodTabProps {
  options: MealOption[];
  selectedId?: string;
  signals: QuickSignals;
  onSelect: (meal: MealOption) => void;
  onSwap: () => void;
  onOpenQuickCheck: () => void;
}

const placeLabel = (place?: QuickSignals["place"]) => {
  if (place === "store") return "W sklepie";
  if (place === "out") return "Na mieście";
  return "W domu";
};

export function FoodTab({ options, selectedId, signals, onSelect, onSwap, onOpenQuickCheck }: FoodTabProps) {
  const lead = options.find((option) => option.id === selectedId) ?? options[0];

  return (
    <section className="bw-fuel-food" aria-labelledby="bw-fuel-food-title">
      <div className="bw-fuel-section-heading">
        <div>
          <p className="bw-fuel-eyebrow">INTELIGENTNY WYBÓR</p>
          <h2 id="bw-fuel-food-title">Co pasuje teraz?</h2>
          <p>Opcje dopasowane do czasu, miejsca i najbliższej sesji.</p>
        </div>
      </div>

      <button className="bw-fuel-context-row" type="button" onClick={onOpenQuickCheck}>
        <span><Timer aria-hidden="true" />{signals.prepMinutes ?? 10} min</span>
        <span>
          {signals.place === "store" ? <Store aria-hidden="true" /> : signals.place === "out" ? <MapPin aria-hidden="true" /> : <Home aria-hidden="true" />}
          {placeLabel(signals.place)}
        </span>
        <span><Apple aria-hidden="true" />Przed treningiem</span>
      </button>

      <div className="bw-fuel-builder" aria-label="Interaktywny skład posiłku">
        <div className="bw-fuel-builder__orbit" />
        <span className="bw-fuel-builder__ingredient bw-fuel-builder__ingredient--one"><Apple aria-hidden="true" /></span>
        <span className="bw-fuel-builder__ingredient bw-fuel-builder__ingredient--two"><Wheat aria-hidden="true" /></span>
        <span className="bw-fuel-builder__ingredient bw-fuel-builder__ingredient--three"><CookingPot aria-hidden="true" /></span>
        <div className="bw-fuel-builder__bowl">
          <span />
          <strong>{lead?.name ?? "Wybierz kontekst"}</strong>
        </div>
      </div>

      <button className="bw-fuel-swap" type="button" onClick={onSwap}>
        <RefreshCw aria-hidden="true" />
        Zamień składnik lub cały zestaw
        <ChevronRight aria-hidden="true" />
      </button>

      <div className="bw-fuel-meals">
        {options.length ? (
          options.map((meal) => (
            <button
              className={`bw-fuel-meal ${meal.id === selectedId ? "bw-fuel-meal--selected" : ""}`}
              key={meal.id}
              type="button"
              onClick={() => onSelect(meal)}
            >
              <span className="bw-fuel-meal__icon"><CookingPot aria-hidden="true" /></span>
              <span>
                <strong>{meal.name}</strong>
                <small>{meal.description}</small>
                <em>{meal.prepMinutes} min · {meal.tags.slice(0, 2).join(" · ")}</em>
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          ))
        ) : (
          <div className="bw-fuel-empty">
            <strong>Brak bezpiecznej opcji dla obecnych filtrów</strong>
            <p>Zmień kontekst albo uzupełnij listę własnych sprawdzonych posiłków.</p>
          </div>
        )}
      </div>
    </section>
  );
}

