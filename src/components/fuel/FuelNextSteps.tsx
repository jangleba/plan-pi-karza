import { useState } from "react";
import { fuelDayGuide } from "@/lib/fuel/guidance";
import type { FuelContext, FuelDeviceData, FuelTiming } from "@/lib/fuel/experience";

export function FuelNextSteps({
  context,
  timing,
  now,
  data,
  nextSession,
  onOwn,
  onPack,
  onHistory,
  onDrink,
}: {
  context: FuelContext;
  timing: FuelTiming;
  now: number;
  data: FuelDeviceData;
  nextSession?: FuelContext | null;
  onOwn(): void;
  onPack(): void;
  onHistory(): void;
  onDrink(ml: number, kind: "water" | "sports"): void;
}) {
  const [ml, setMl] = useState("250");
  const [kind, setKind] = useState<"water" | "sports">("water");
  const guide = fuelDayGuide(context, timing, now, data, nextSession);
  const valid =
    ml.trim() !== "" && Number.isFinite(Number(ml)) && Number(ml) >= 1 && Number(ml) <= 2000;
  return (
    <section className="fuel-next-steps" aria-label="Jedzenie i napoje wokół sesji">
      <details>
        <summary>Twój plan · Teraz / Zabierz / Po sesji</summary>
        <ol>
          {guide.steps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
        <button className="fuel-secondary" onClick={onPack}>
          Lista do zabrania
        </button>
      </details>
      <div className="fuel-recent-meal">
        <strong>Wcześniejsze jedzenie</strong>
        <p>{guide.eaten}</p>
        <button className="fuel-text-button" onClick={onOwn}>
          Już jadłem · dodaj posiłek
        </button>
        {guide.last && (
          <button className="fuel-text-button" onClick={onHistory}>
            Popraw wpis
          </button>
        )}
      </div>
      <details>
        <summary>
          Napoje ·{" "}
          {guide.drinkMl ? `${guide.drinkMl} ml zapisane do tej sesji dziś` : "dodaj wypitą ilość"}
        </summary>
        <p className="fuel-note">
          Zapis ilości, którą wypiłeś. To nie jest cel ani ocena nawodnienia.
        </p>
        <form
          className="fuel-drink-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onDrink(Number(ml), kind);
          }}
        >
          <label>
            Napój
            <select value={kind} onChange={(e) => setKind(e.target.value as "water" | "sports")}>
              <option value="water">Woda</option>
              <option value="sports">Napój sportowy</option>
            </select>
          </label>
          <label>
            Ile wypiłeś (ml)?
            <input
              type="number"
              min="1"
              max="2000"
              inputMode="numeric"
              value={ml}
              onChange={(e) => setMl(e.target.value)}
              required
            />
          </label>
          <button className="fuel-secondary" disabled={!valid}>
            Zapisz napój
          </button>
        </form>
      </details>
    </section>
  );
}
