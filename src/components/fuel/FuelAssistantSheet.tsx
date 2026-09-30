import { Check, Mic, RotateCcw, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FuelIngredient, FuelMealSuggestion, FuelMoment } from "@/lib/fuel/assistant";
import { FuelMomentPicker } from "./FuelMomentPicker";

export function FuelAssistant({
  text,
  ingredients,
  unknown,
  moment,
  listening,
  suggestions,
  selectedIndex,
  onTextChange,
  onMomentChange,
  onToggleVoice,
  onRemoveIngredient,
  onGenerate,
  onAlternative,
  onAccept,
  onReset,
}: {
  text: string;
  ingredients: FuelIngredient[];
  unknown: string[];
  moment: FuelMoment;
  listening: boolean;
  suggestions: FuelMealSuggestion[];
  selectedIndex: number;
  onTextChange: (value: string) => void;
  onMomentChange: (value: FuelMoment) => void;
  onToggleVoice: () => void;
  onRemoveIngredient: (id: string) => void;
  onGenerate: () => void;
  onAlternative: () => void;
  onAccept: () => void;
  onReset: () => void;
}) {
  const suggestion = suggestions[selectedIndex] ?? null;
  return (
    <div className="bw-columns fuel-layout">
      <form
        className="bw-section space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onGenerate();
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="fuel-ingredients" className="bw-field-label">
            Co masz pod ręką?
          </label>
          <Button
            type="button"
            variant={listening ? "default" : "secondary"}
            className={listening ? undefined : "bg-primary/[0.08] text-primary"}
            size="icon"
            onClick={onToggleVoice}
            aria-label={listening ? "Zatrzymaj nagrywanie" : "Powiedz składniki"}
            aria-pressed={listening}
          >
            {listening ? <Square className="fill-current" /> : <Mic />}
          </Button>
        </div>
        <Textarea
          id="fuel-ingredients"
          rows={3}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Np. ryż, jajka, skyr i banan"
        />
        {listening && (
          <p className="text-sm text-primary" role="status">
            Słucham…
          </p>
        )}
        {ingredients.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Rozpoznane składniki">
            {ingredients.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant="secondary"
                onClick={() => onRemoveIngredient(item.id)}
                aria-label={`Usuń składnik: ${item.label}`}
                className="fuel-ingredient"
              >
                {item.label}
                <X className="h-4 w-4" />
              </Button>
            ))}
          </div>
        )}
        {unknown.length > 0 && (
          <p className="text-sm text-muted-foreground" role="status">
            Nie rozpoznano: {unknown.join(", ")}. Popraw tekst.
          </p>
        )}
        <div className="space-y-3">
          <FuelMomentPicker value={moment} onChange={onMomentChange} />
        </div>
        <Button type="submit" disabled={ingredients.length === 0} className="fuel-submit">
          Dopasuj posiłek
        </Button>
        <p className="text-sm text-muted-foreground">
          Nagranie nie jest zapisywane. Rozpoznawanie głosu może wykonywać system urządzenia.
        </p>
      </form>
      {suggestion && (
        <section
          className="bw-section space-y-4 fuel-result"
          aria-live="polite"
          aria-label="Propozycja posiłku"
        >
          <h2>{suggestion.title}</h2>
          <p>{suggestion.ingredients.map((item) => item.label).join(", ")}</p>
          <p className="text-muted-foreground">{suggestion.why}</p>
          {suggestion.add && (
            <p>
              <span className="font-semibold text-primary">Dodaj: </span>
              {suggestion.add}
            </p>
          )}
          <div className="space-y-3">
            <Button type="button" onClick={onAccept}>
              <Check />
              Wybieram ten posiłek
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="bg-card text-muted-foreground"
                onClick={onReset}
              >
                <RotateCcw />
                Zmień składniki
              </Button>
              <Button
                type="button"
                variant="outline"
                className="bg-card text-muted-foreground"
                onClick={onAlternative}
                disabled={suggestions.length < 2}
              >
                Inna propozycja
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Dopasowanie do aktywności, bez liczenia kalorii. To nie jest porada medyczna.
          </p>
        </section>
      )}
    </div>
  );
}
