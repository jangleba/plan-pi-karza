import { AudioLines, Check, ChevronRight, Info, Mic, RotateCcw, Square, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { FuelIngredient, FuelMealSuggestion, FuelMoment } from "@/lib/fuel/assistant";
import { FuelMomentPicker } from "./FuelMomentPicker";

export function FuelAssistantSheet({
  open,
  text,
  ingredients,
  unknown,
  moment,
  listening,
  suggestions,
  selectedIndex,
  onClose,
  onTextChange,
  onMomentChange,
  onToggleVoice,
  onRemoveIngredient,
  onGenerate,
  onAlternative,
  onAccept,
  onReset,
}: {
  open: boolean;
  text: string;
  ingredients: FuelIngredient[];
  unknown: string[];
  moment: FuelMoment;
  listening: boolean;
  suggestions: FuelMealSuggestion[];
  selectedIndex: number;
  onClose: () => void;
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
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        className="z-[72] mx-auto max-h-[94dvh] w-full max-w-[30rem] overflow-y-auto rounded-t-[2rem] bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-border" />
        {!suggestion ? (
          <div className="fuel-enter pb-2">
            <div className="mt-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.17em] text-primary">
                  Fuel Voice
                </div>
                <SheetTitle className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.045em]">
                  {listening ? "Słucham…" : "Co masz pod ręką?"}
                </SheetTitle>
                <SheetDescription className="mt-1.5 text-sm leading-relaxed">
                  Powiedz składniki. Nie musisz podawać kalorii ani gramów.
                </SheetDescription>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-card"
                aria-label="Zamknij"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleVoice}
              className={`fuel-mic mx-auto mt-6 grid h-28 w-28 place-items-center rounded-full transition-colors duration-200 ${
                listening ? "bg-primary text-primary-foreground" : "bg-primary/[0.08] text-primary"
              }`}
              aria-label={listening ? "Zatrzymaj nagrywanie" : "Rozpocznij nagrywanie"}
            >
              {listening ? (
                <Square className="h-5 w-5 fill-current" />
              ) : (
                <Mic className="h-9 w-9" />
              )}
            </button>
            {listening && <VoiceWave />}

            <div className="mt-5 rounded-[1.4rem] border border-border/80 bg-card p-3 shadow-[var(--bw-shadow-card)]">
              <label htmlFor="fuel-voice-input" className="sr-only">
                Składniki
              </label>
              <textarea
                id="fuel-voice-input"
                rows={2}
                value={text}
                onChange={(event) => onTextChange(event.target.value)}
                placeholder="Np. mam ryż, jajka, skyr i banana"
                className="min-h-[4.25rem] w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
              />
              {ingredients.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 border-t border-border/70 pt-3">
                  {ingredients.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onRemoveIngredient(item.id)}
                      className="fuel-chip inline-flex min-h-10 items-center gap-2 rounded-full bg-primary/[0.08] px-3 text-xs font-semibold text-primary"
                    >
                      {item.label}
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {unknown.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl bg-muted/60 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                Nie rozpoznałem: {unknown.slice(0, 2).join(", ")}. Popraw tekst albo usuń te słowa.
              </div>
            )}

            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold text-foreground">Ten posiłek jest:</div>
              <FuelMomentPicker value={moment} onChange={onMomentChange} />
            </div>

            <button
              type="button"
              onClick={onGenerate}
              disabled={ingredients.length === 0}
              className="mt-5 inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-35"
            >
              <AudioLines className="h-4 w-4" /> Dopasuj do planu
            </button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
              BallWise nie zapisuje nagrania. Rozpoznawanie może wykonywać system urządzenia.
            </p>
          </div>
        ) : (
          <div className="fuel-enter pb-2">
            <div className="mt-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                  Najlepszy wybór
                </div>
                <SheetTitle className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.045em]">
                  {suggestion.title}
                </SheetTitle>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-card"
                aria-label="Zamknij"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 rounded-[1.65rem] border border-border/80 bg-card p-5 shadow-[var(--bw-shadow-card)]">
              <div className="flex flex-wrap gap-2">
                {suggestion.ingredients.map((item) => (
                  <span
                    key={item.id}
                    className="rounded-full bg-primary/[0.07] px-3 py-2 text-xs font-semibold text-primary"
                  >
                    {item.label}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{suggestion.why}</p>
              {suggestion.add && (
                <div className="mt-4 rounded-2xl bg-primary/[0.07] px-4 py-3.5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                    Dodaj
                  </div>
                  <div className="mt-1 text-sm font-semibold">{suggestion.add}</div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onAccept}
              className="mt-5 inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground active:scale-[0.99]"
            >
              <Check className="h-4 w-4" /> Biorę
            </button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onReset}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-xs font-semibold text-muted-foreground"
              >
                <RotateCcw className="h-4 w-4" /> Zmień składniki
              </button>
              <button
                type="button"
                onClick={onAlternative}
                disabled={suggestions.length < 2}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-xs font-semibold text-muted-foreground disabled:opacity-35"
              >
                Inna opcja <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex items-start gap-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Dopasowanie jakościowe do typu i obciążenia sesji. To nie jest porada medyczna.
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function VoiceWave() {
  return (
    <div className="mx-auto mt-4 flex h-10 items-center justify-center gap-1" aria-hidden="true">
      {Array.from({ length: 13 }, (_, index) => (
        <span
          key={index}
          className="fuel-wave-bar w-1 rounded-full bg-primary"
          style={{ animationDelay: `${index * 55}ms` }}
        />
      ))}
    </div>
  );
}
