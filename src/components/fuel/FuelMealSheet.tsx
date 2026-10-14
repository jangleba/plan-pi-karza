import { useEffect, useState } from "react";
import { Check, Heart, RefreshCw, Utensils } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  FOODS,
  FOOD_BY_ID,
  assessMeal,
  equivalentSwap,
  foodAllowed,
  mealNutrition,
  portionLabel,
  type FuelRecipe,
} from "@/lib/fuel/catalog";
import { FOOD_NUTRIENTS } from "@/lib/fuel/foodNutrients";
import type { FuelContext, FuelPreferences, FuelTiming, MealLine } from "@/lib/fuel/experience";

export interface FuelMealDraft {
  id: string;
  title: string;
  lines: MealLine[];
  recipe?: FuelRecipe;
  own?: boolean;
  fraction?: number;
  edited?: boolean;
  repeated?: boolean;
}
export function FuelMealSheet({
  draft,
  context,
  timing,
  now,
  preferences,
  restrictions,
  onClose,
  onSave,
  onFavorite,
}: {
  draft: FuelMealDraft | null;
  context: FuelContext;
  timing: FuelTiming;
  now: number;
  preferences: FuelPreferences;
  restrictions: string[];
  onClose: () => void;
  onSave: (draft: FuelMealDraft, lines: MealLine[], eaten: boolean, fraction: number) => void;
  onFavorite: (id: string) => void;
}) {
  const [lines, setLines] = useState<MealLine[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [fraction, setFraction] = useState(1);
  const [swapping, setSwapping] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [lastSwap, setLastSwap] = useState("");
  const [portionScale, setPortionScale] = useState(1);
  const [gramsDrafts, setGramsDrafts] = useState<Record<number, string>>({});
  useEffect(() => {
    setLines(draft?.lines.map((l) => ({ ...l })) ?? []);
    setConfirmed(!draft?.own);
    setFraction(draft?.fraction ?? 1);
    setSwapping(null);
    setAdding(false);
    setShowSteps(false);
    setLastSwap("");
    setPortionScale(1);
    setGramsDrafts({});
  }, [draft]);
  const validAmounts = Object.values(gramsDrafts).every(
    (raw) =>
      raw.trim() !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 1 && Number(raw) <= 2000,
  );
  const nutrition = mealNutrition(lines);
  const assessment = assessMeal(lines, context, timing, now);
  const safe =
    validAmounts &&
    lines.length > 0 &&
    lines.every(
      (l) =>
        FOOD_BY_ID[l.foodId] && foodAllowed(FOOD_BY_ID[l.foodId], restrictions, preferences.diet),
    );
  const changed = Boolean(
    draft && JSON.stringify(lines) !== JSON.stringify(draft.recipe?.lines ?? draft.lines),
  );
  const candidates =
    swapping === null || !lines[swapping]
      ? []
      : FOODS.filter(
          (f) =>
            f.id !== lines[swapping]?.foodId &&
            !lines.some((line, index) => index !== swapping && line.foodId === f.id) &&
            foodAllowed(f, restrictions, preferences.diet) &&
            equivalentSwap(lines[swapping], f.id),
        );
  const favorite = Boolean(draft && preferences.favorites.includes(draft.id));
  function updateLine(index: number, raw: string) {
    setGramsDrafts((current) => ({ ...current, [index]: raw }));
    setConfirmed(!draft?.own);
    const grams = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(grams) || grams < 1 || grams > 2000) return;
    setLines((current) => current.map((l, i) => (i === index ? { ...l, grams } : l)));
  }
  function swap(id: string) {
    if (swapping === null) return;
    const next = equivalentSwap(lines[swapping], id);
    if (!next) return;
    const role = FOOD_BY_ID[lines[swapping].foodId].role;
    setLastSwap(
      `Porcja zamiennika zachowuje w przybliżeniu ilość ${role === "protein" ? "białka" : role === "fat" ? "tłuszczu" : "węglowodanów"}. Pozostałe wartości posiłku zostały przeliczone.`,
    );
    setLines((current) => current.map((l, i) => (i === swapping ? next : l)));
    setGramsDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[swapping];
      return nextDrafts;
    });
    setConfirmed(!draft?.own);
    setSwapping(null);
  }
  return (
    <Sheet open={Boolean(draft)} onOpenChange={(value) => !value && onClose()}>
      <SheetContent side="bottom" className="fuel-sheet">
        <p className="fuel-eyebrow">{draft?.own ? "Twój posiłek" : "Propozycja dla Ciebie"}</p>
        <SheetTitle>{changed ? "Twój dopasowany zestaw" : (draft?.title ?? "Posiłek")}</SheetTitle>
        <SheetDescription>
          {draft?.edited
            ? "Popraw zapisane składniki i ilość zjedzonej porcji."
            : draft?.repeated
              ? "Porcje z poprzedniego wpisu. Potwierdź ilości — zapis utworzy nowy posiłek."
              : draft?.own
                ? "Ustaw faktyczne ilości. Podane na start porcje są przykładowe."
                : `${draft?.recipe?.subtitle ? `${draft.recipe.subtitle}. ` : ""}Porcję możesz zmniejszyć, zwiększyć lub zmienić składniki.`}
        </SheetDescription>
        {draft && (
          <>
            {!draft.own && (
              <div className="fuel-chips" aria-label="Wielkość porcji">
                {[0.75, 1, 1.25].map((scale) => (
                  <button
                    key={scale}
                    className={`fuel-chip-button ${portionScale === scale ? "is-active" : ""}`}
                    aria-pressed={portionScale === scale}
                    disabled={!validAmounts}
                    onClick={() => {
                      const ratio = scale / portionScale;
                      setLines((current) =>
                        current.map((l) => ({
                          ...l,
                          grams: Math.max(5, Math.min(2000, Math.round(l.grams * ratio))),
                        })),
                      );
                      setPortionScale(scale);
                      setGramsDrafts({});
                      setLastSwap("");
                    }}
                  >
                    {scale === 1 ? "Wyjściowa" : scale < 1 ? "Mniejsza" : "Większa"}
                  </button>
                ))}
              </div>
            )}
            <div className="fuel-panel mt-4">
              <div className="fuel-row">
                <h3>Składniki i porcje</h3>
                <button className="fuel-text-button" onClick={() => setAdding(!adding)}>
                  + Dodaj
                </button>
              </div>
              {lines.map((line, index) => {
                const f = FOOD_BY_ID[line.foodId];
                if (!f) return null;
                return (
                  <div className="fuel-ingredient-row" key={`${line.foodId}:${index}`}>
                    <div>
                      <strong>{f.label}</strong>
                      <p className="fuel-note">{f.state}</p>
                      {validAmounts && <p className="fuel-note">{portionLabel(line)}</p>}
                    </div>
                    <div className="fuel-ingredient-actions">
                      <label className="fuel-grams">
                        <span className="sr-only">Ilość {f.label} w gramach</span>
                        <input
                          type="number"
                          min="1"
                          max="2000"
                          step="any"
                          inputMode="decimal"
                          value={gramsDrafts[index] ?? line.grams}
                          aria-invalid={
                            gramsDrafts[index] !== undefined &&
                            (gramsDrafts[index].trim() === "" ||
                              Number(gramsDrafts[index]) < 1 ||
                              Number(gramsDrafts[index]) > 2000)
                          }
                          onChange={(e) => updateLine(index, e.target.value)}
                        />
                        <span>g</span>
                      </label>
                      <button
                        className="fuel-text-button"
                        disabled={!validAmounts}
                        onClick={() => setSwapping(swapping === index ? null : index)}
                      >
                        <RefreshCw size={12} />
                        Zamień
                      </button>
                      {draft.own && (
                        <button
                          className="fuel-text-button"
                          onClick={() => {
                            setSwapping(null);
                            setLines((current) => current.filter((_, i) => i !== index));
                            setGramsDrafts((current) =>
                              Object.fromEntries(
                                Object.entries(current)
                                  .filter(([key]) => Number(key) !== index)
                                  .map(([key, value]) => [
                                    Number(key) > index ? Number(key) - 1 : Number(key),
                                    value,
                                  ]),
                              ),
                            );
                            setConfirmed(false);
                          }}
                        >
                          Usuń
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {swapping !== null && (
                <div className="fuel-swap-list">
                  <p className="fuel-note">Zamienniki według głównego składnika odżywczego:</p>
                  {candidates.length === 0 ? (
                    <p className="fuel-note">
                      Brak pasującego zamiennika w katalogu przy tych ograniczeniach.
                    </p>
                  ) : (
                    candidates.map((f) => (
                      <button key={f.id} className="fuel-chip-button" onClick={() => swap(f.id)}>
                        {f.label} · {equivalentSwap(lines[swapping!], f.id)?.grams} g
                      </button>
                    ))
                  )}
                </div>
              )}
              {lastSwap && (
                <p role="status" className="fuel-note">
                  {lastSwap}
                </p>
              )}
              {adding && (
                <div className="fuel-swap-list">
                  <label className="fuel-label">
                    Wybierz dodatek
                    <select
                      className="fuel-input"
                      value=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id) {
                          setLines((current) => [
                            ...current,
                            { foodId: id, grams: FOOD_BY_ID[id].unitGrams },
                          ]);
                          setAdding(false);
                          setConfirmed(!draft.own);
                        }
                      }}
                    >
                      <option value="">Wybierz składnik</option>
                      {FOODS.filter(
                        (f) =>
                          foodAllowed(f, restrictions, preferences.diet) &&
                          !lines.some((l) => l.foodId === f.id),
                      ).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
            {!validAmounts && (
              <p className="fuel-note mt-3" role="alert">
                Uzupełnij ilości od 1 do 2000 g, żeby przeliczyć i zapisać posiłek.
              </p>
            )}
            {preferences.detailed && nutrition && validAmounts && (
              <div className="fuel-panel mt-3">
                <div className="fuel-row">
                  <h3>Orientacyjnie w całym zestawie</h3>
                </div>
                <div className="fuel-macros">
                  {[
                    ["Węglowodany", nutrition.carbs, "g"],
                    ["Białko", nutrition.protein, "g"],
                    ["Tłuszcz", nutrition.fat, "g"],
                    ["Energia", nutrition.kcal, "kcal"],
                  ].map(([label, value, unit]) => (
                    <div key={String(label)}>
                      <strong>
                        ≈ {Math.round(Number(value))} {unit}
                      </strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                <p className="fuel-note">
                  Wartości wzorcowe, nie pomiar Twojego posiłku. Gramatura dotyczy wskazanego stanu
                  produktu. Miary domowe są przybliżone.
                </p>
                <details>
                  <summary className="fuel-text-button">Źródła wartości</summary>
                  {lines.map((l) => (
                    <p className="fuel-note" key={l.foodId}>
                      <a
                        href={FOOD_NUTRIENTS[l.foodId]?.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {FOOD_BY_ID[l.foodId]?.label}
                      </a>{" "}
                      · {FOOD_NUTRIENTS[l.foodId]?.sourceLabel}
                    </p>
                  ))}
                </details>
              </div>
            )}
            {validAmounts && (
              <div className="fuel-panel mt-3">
                <h3>{assessment.title}</h3>
                {assessment.details.map((d) => (
                  <p className="fuel-note" key={d}>
                    {d}
                  </p>
                ))}
                <p className="fuel-note">
                  Przygotuj też wodę. Fuel nie zakłada, że brak wpisu oznacza pominięty posiłek.
                </p>
              </div>
            )}
            {draft.recipe && (
              <div className="fuel-panel mt-3">
                <button
                  className="fuel-row w-full text-left"
                  onClick={() => setShowSteps(!showSteps)}
                  aria-expanded={showSteps}
                >
                  <h3>
                    <Utensils size={15} />
                    Jak przygotować
                  </h3>
                  <span>{changed ? "Dopasowany zestaw" : `${draft.recipe.prepMin} min`}</span>
                </button>
                {showSteps && (
                  <>
                    {changed ? (
                      <ol className="fuel-steps">
                        <li>
                          Przygotuj każdy składnik do stanu wskazanego przy jego gramaturze.
                          Produkty zwierzęce wymagające obróbki przygotuj do pełnego ugotowania lub
                          upieczenia.
                        </li>
                        <li>
                          Odmierz podane porcje i połącz je w posiłek; dodatki przygotuj zgodnie z
                          ich etykietą.
                        </li>
                      </ol>
                    ) : (
                      <ol className="fuel-steps">
                        {draft.recipe.steps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                    )}
                    <p className="fuel-note">{draft.recipe.storage}</p>
                  </>
                )}
              </div>
            )}
            {validAmounts && !safe && (
              <p className="fuel-note" role="alert">
                Ten zestaw zawiera składnik wykluczony przez Twoje ustawienia. Usuń go lub wybierz
                zamiennik.
              </p>
            )}
            {draft.own && (
              <label className="fuel-consent">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  Potwierdzam składniki, ich stan oraz ilości. Obliczenia obejmują tylko wpisane
                  produkty i nie uwzględniają nieopisanych sosów ani tłuszczu.
                </span>
              </label>
            )}
            <div className="fuel-action-grid mt-4">
              <button
                className="fuel-secondary"
                disabled={!safe || !confirmed}
                onClick={() => onSave(draft, lines, false, 1)}
              >
                Wybieram na później
              </button>
              <button
                className="fuel-primary"
                disabled={!safe || !confirmed}
                onClick={() => onSave(draft, lines, true, fraction)}
              >
                <Check size={15} />
                Zjedzone
              </button>
            </div>
            <label className="fuel-label mt-3">
              Ile zjadłeś?
              <select
                className="fuel-input"
                value={fraction}
                onChange={(e) => setFraction(Number(e.target.value))}
              >
                <option value={1}>Cały zestaw</option>
                <option value={0.75}>Około ¾ każdego składnika</option>
                <option value={0.5}>Około połowy każdego składnika</option>
                <option value={0.25}>Około ¼ każdego składnika</option>
              </select>
            </label>
            <p className="fuel-note">
              Gdy zjadłeś różne części składników, popraw ich gramatury powyżej i wybierz „Cały
              zestaw”.
            </p>
            {!draft.own && (
              <button className="fuel-text-button mt-4" onClick={() => onFavorite(draft.id)}>
                <Heart size={15} fill={favorite ? "currentColor" : "none"} />
                {favorite ? "Usuń z ulubionych" : "Zapisz bazowy przepis w ulubionych"}
              </button>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
