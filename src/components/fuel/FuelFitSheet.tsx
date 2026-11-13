import { useEffect, useState } from "react";
import { Check, Clock3 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { FuelRecipe } from "@/lib/fuel/catalog";

export interface FuelFitOption {
  recipe: FuelRecipe;
  /** Position of the set in the list the main card shows after this fit is applied. */
  index: number;
}

/** "2 min · bez gotowania", "5 min · na wynos". */
export function fitOptionMeta(recipe: FuelRecipe): string {
  const kind = recipe.noCook ? "bez gotowania" : recipe.portable ? "na wynos" : "z gotowaniem";
  return `${recipe.prepMin} min · ${kind}`;
}

/**
 * A quick fit ("Mam 5 minut", "W sklepie") as a short choice: two or three
 * matching sets, "Mam coś innego" for own products, and one confirming button.
 * Nothing changes on the main card until "Wybierz zestaw".
 */
export function FuelFitSheet({
  open,
  title,
  subtitle,
  when,
  options,
  onChoose,
  onOther,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  /** "Przed treningiem · 2 h do startu". */
  when: string | null;
  options: FuelFitOption[];
  onChoose(option: FuelFitOption): void;
  onOther(): void;
  onClose(): void;
}) {
  const [picked, setPicked] = useState<number | "other">(0);
  useEffect(() => {
    if (open) setPicked(options.length ? 0 : "other");
  }, [open, options.length]);
  const chosen = picked === "other" ? null : options[picked];
  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent side="bottom" className="fuel-sheet fuel-fit-sheet">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{subtitle}</SheetDescription>
        <div className="fuel-fit-body">
          <div className="fuel-fit-options" role="radiogroup" aria-label={title}>
            {options.map((option, i) => (
              <button
                key={option.recipe.id}
                type="button"
                role="radio"
                aria-checked={picked === i}
                className="fuel-fit-option"
                onClick={() => setPicked(i)}
              >
                <span>
                  <strong>{option.recipe.title}</strong>
                  <small>{fitOptionMeta(option.recipe)}</small>
                </span>
                <i aria-hidden="true">{picked === i && <Check size={16} strokeWidth={3} />}</i>
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={picked === "other"}
              className="fuel-fit-option"
              onClick={() => setPicked("other")}
            >
              <span>
                <strong>Mam coś innego</strong>
                <small>Wybierz swoje produkty</small>
              </span>
              <i aria-hidden="true">{picked === "other" && <Check size={16} strokeWidth={3} />}</i>
            </button>
          </div>
          {when && (
            <p className="fuel-fit-when">
              <Clock3 size={16} aria-hidden="true" /> {when}
            </p>
          )}
          <button
            type="button"
            className="fuel-primary fuel-fit-confirm"
            onClick={() => (chosen ? onChoose(chosen) : onOther())}
          >
            {chosen ? "Wybierz zestaw" : "Wybierz produkty"}
          </button>
          <button type="button" className="fuel-fit-back" onClick={onClose}>
            Wróć
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
