import { useEffect, useRef, useState } from "react";
import { Barcode, Camera, LoaderCircle, Mic, Square } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { FuelMoment } from "@/lib/fuel/assistant";
import type { StoreEvaluation, StoreProduct } from "@/lib/fuel/storeCheck";
import { FuelMomentPicker } from "./FuelMomentPicker";

export function StoreCheckSheet({
  open,
  productName,
  barcode,
  product,
  evaluation,
  moment,
  listening,
  loading,
  onClose,
  onProductNameChange,
  onBarcodeChange,
  onMomentChange,
  onToggleVoice,
  onImage,
  onCheckName,
  onCheckBarcode,
  onReset,
  onLabelProduct,
  onLog,
  initialPortion,
  initialUnit,
  onPortionChange,
}: {
  open: boolean;
  productName: string;
  barcode: string;
  product: StoreProduct | null;
  evaluation: StoreEvaluation | null;
  moment: FuelMoment;
  listening: boolean;
  loading: boolean;
  onClose: () => void;
  onProductNameChange: (value: string) => void;
  onBarcodeChange: (value: string) => void;
  onMomentChange: (value: FuelMoment) => void;
  onToggleVoice: () => void;
  onImage: (file: File | undefined) => void;
  onCheckName: () => void;
  onCheckBarcode: () => void;
  onReset: () => void;
  onLabelProduct?: (value: StoreProduct) => void;
  onLog?: (value: StoreProduct, portion: number, unit: "g" | "ml", eaten: boolean) => void;
  initialPortion?: number;
  initialUnit?: "g" | "ml";
  onPortionChange?: (portion: number | null, unit: "g" | "ml") => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const [labelOpen, setLabelOpen] = useState(false);
  const [portionInput, setPortionInput] = useState("100");
  const portion = Number(portionInput);
  const validPortion =
    portionInput.trim() !== "" && Number.isFinite(portion) && portion >= 1 && portion <= 2000;
  const [unit, setUnit] = useState<"g" | "ml">("g");
  useEffect(() => {
    onPortionChange?.(validPortion ? portion : null, unit);
  }, [validPortion, portion, unit, onPortionChange]);
  const [labelUnit, setLabelUnit] = useState<"g" | "ml">("g");
  const [portionConfirmed, setPortionConfirmed] = useState(false);
  const [carbs, setCarbs] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [energy, setEnergy] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [formError, setFormError] = useState("");
  useEffect(() => {
    setPortionInput(String(initialPortion ?? 100));
    setUnit(product?.nutritionUnit ?? initialUnit ?? "g");
    setPortionConfirmed(false);
    if (product) setLabelOpen(false);
    setFormError("");
  }, [product, initialPortion, initialUnit]);
  useEffect(() => {
    if (!open) {
      setCarbs("");
      setProtein("");
      setFat("");
      setEnergy("");
      setIngredients("");
      setFormError("");
      setPortionConfirmed(false);
    }
  }, [open]);
  if (!open) return null;
  const nutrients = product?.nutriments;
  function fromLabel(event: React.FormEvent) {
    event.preventDefault();
    const parse = (raw: string) => (raw.trim() === "" ? null : Number(raw.replace(",", ".")));
    const c = parse(carbs),
      p = parse(protein),
      f = parse(fat),
      k = parse(energy);
    if (
      !productName.trim() ||
      [c, p, f].some((n) => n === null || !Number.isFinite(n) || n < 0 || n > 100) ||
      c! + p! + f! > 101 ||
      (k !== null && (!Number.isFinite(k) || k < 0 || k > 1000))
    ) {
      setFormError(
        "Podaj nazwę i poprawne wartości z etykiety na 100 g lub 100 ml. Puste pole nie oznacza zera.",
      );
      return;
    }
    onLabelProduct?.({
      name: productName.trim(),
      source: "label",
      nutritionUnit: labelUnit,
      ingredientsText: ingredients.trim() || null,
      nutriments: { carbohydrates100g: c, protein100g: p, fat100g: f, energyKcal100g: k },
    });
    setLabelOpen(false);
  }
  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent side="bottom" className="fuel-sheet">
        <p className="fuel-eyebrow">W sklepie</p>
        <SheetTitle>Sprawdź produkt</SheetTitle>
        <SheetDescription>
          Kod wyszukuje produkt w bazie. Nazwa daje tylko ocenę rodzaju produktu.
        </SheetDescription>
        {!evaluation ? (
          <>
            <button
              className="fuel-photo-pick"
              disabled={loading}
              onClick={() => camera.current?.click()}
            >
              <Camera size={24} />
              <span>Odczytaj kod ze zdjęcia</span>
              <small>Jeśli aparat nie odczyta kodu, wpisz cyfry.</small>
            </button>
            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                onImage(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
            <label className="fuel-label mt-4">
              Nazwa produktu
              <div className="fuel-row">
                <input
                  className="fuel-input"
                  value={productName}
                  placeholder="Np. skyr naturalny"
                  onChange={(e) => onProductNameChange(e.target.value)}
                />
                <button
                  className="fuel-icon-button"
                  aria-label={listening ? "Zatrzymaj mikrofon" : "Powiedz nazwę produktu"}
                  onClick={onToggleVoice}
                >
                  {listening ? <Square size={15} /> : <Mic size={18} />}
                </button>
              </div>
            </label>
            <button
              className="fuel-secondary mt-2"
              disabled={productName.trim().length < 3 || loading}
              onClick={onCheckName}
            >
              Sprawdź rodzaj produktu
            </button>
            <label className="fuel-label mt-4">
              Kod EAN / UPC
              <div className="fuel-row">
                <input
                  className="fuel-input"
                  inputMode="numeric"
                  value={barcode}
                  onChange={(e) => onBarcodeChange(e.target.value.replace(/\D/g, "").slice(0, 14))}
                  placeholder="8, 12, 13 lub 14 cyfr"
                />
                <button
                  className="fuel-icon-button"
                  disabled={loading || barcode.length < 8}
                  onClick={onCheckBarcode}
                  aria-label="Sprawdź kod produktu"
                >
                  <Barcode size={19} />
                </button>
              </div>
            </label>
          </>
        ) : (
          <div className="fuel-panel mt-4">
            <span className="fuel-tag">
              {product?.source === "name" ? "Ocena orientacyjna po nazwie" : evaluation.label}
            </span>
            <h3 className="mt-3">{product?.name}</h3>
            {product?.brand && <p className="fuel-note">{product.brand}</p>}
            <p className="fuel-note">{evaluation.reason}</p>
            {evaluation.addition && (
              <p className="fuel-note">
                Możliwy dodatek: {evaluation.addition}. Wybierz zgodnie ze swoimi ograniczeniami.
              </p>
            )}
            {evaluation.replacement && (
              <p className="fuel-note">
                Możliwa alternatywa: {evaluation.replacement}. Sprawdź skład i alergeny.
              </p>
            )}
            {product?.source === "name" && (
              <p className="fuel-note">
                Nazwa nie potwierdza składu, ilości ani wartości odżywczych. Dodaj etykietę poniżej,
                żeby przeliczyć porcję.
              </p>
            )}
            {product && (
              <>
                <label className="fuel-label mt-4">
                  Ilość, którą chcesz zjeść
                  <div className="fuel-row">
                    <input
                      className="fuel-input"
                      type="number"
                      min="1"
                      max="2000"
                      step="any"
                      inputMode="decimal"
                      value={portionInput}
                      aria-invalid={!validPortion}
                      onChange={(e) => {
                        setPortionInput(e.target.value);
                        setPortionConfirmed(false);
                      }}
                    />
                    <select
                      className="fuel-input"
                      value={unit}
                      disabled={Boolean(product.nutritionUnit)}
                      onChange={(e) => {
                        setUnit(e.target.value as "g" | "ml");
                        setPortionConfirmed(false);
                      }}
                    >
                      <option value="g">g</option>
                      <option value="ml">ml</option>
                    </select>
                  </div>
                </label>
                <p className="fuel-note">
                  Wybierz jednostkę zgodną z podstawą danych na etykiecie: 100 g lub 100 ml. Wpisz
                  ilość porcji, nie masę całego opakowania, jeśli jesz tylko część.
                </p>
                {!validPortion && (
                  <p className="fuel-note" role="alert">
                    Podaj ilość od 1 do 2000 {unit}, żeby przeliczyć porcję.
                  </p>
                )}
                {validPortion && (
                  <div className="fuel-macros">
                    {[
                      ["Węglowodany", nutrients?.carbohydrates100g, "g"],
                      ["Białko", nutrients?.protein100g, "g"],
                      ["Tłuszcz", nutrients?.fat100g, "g"],
                      ["Energia", nutrients?.energyKcal100g, "kcal"],
                    ].map(([label, value, suffix]) => (
                      <div key={String(label)}>
                        <strong>
                          {typeof value === "number"
                            ? `${Math.round((value * portion) / 100)} ${suffix}`
                            : "Brak danych"}
                        </strong>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                )}
                <details className="mt-3">
                  <summary className="fuel-text-button">
                    Wartości na 100 g / ml z bazy lub etykiety
                  </summary>
                  <p className="fuel-note">
                    Węglowodany: {nutrients?.carbohydrates100g ?? "brak"} · białko:{" "}
                    {nutrients?.protein100g ?? "brak"} · tłuszcz: {nutrients?.fat100g ?? "brak"}.
                  </p>
                </details>
              </>
            )}
            {product?.ingredientsText && (
              <p className="fuel-note">Skład: {product.ingredientsText}</p>
            )}
            {(product?.allergens?.length ?? 0) > 0 && (
              <p className="fuel-note">
                Alergeny z bazy: {product?.allergens?.join(", ")}. Etykieta na opakowaniu jest
                rozstrzygająca.
              </p>
            )}
            <p className="fuel-note">
              Źródło:{" "}
              {product?.source === "label"
                ? "wartości przepisane przez Ciebie z etykiety"
                : product?.source === "openfoodfacts"
                  ? "Open Food Facts — dane społecznościowe, mogą być niepełne lub nieaktualne"
                  : "nazwa podana przez Ciebie"}
              . Nie potwierdzamy ceny ani dostępności.
            </p>
            <button className="fuel-secondary mt-4" onClick={onReset}>
              Sprawdź inny produkt
            </button>
            {onLog && product && (
              <>
                <label className="fuel-consent">
                  <input
                    type="checkbox"
                    checked={portionConfirmed}
                    onChange={(e) => setPortionConfirmed(e.target.checked)}
                  />
                  <span>
                    Sprawdziłem skład, alergeny oraz ilość porcji. Jednostka odpowiada etykiecie.
                    Brak wartości pozostanie oznaczony jako brak danych.
                  </span>
                </label>
                <div className="fuel-action-grid mt-3">
                  <button
                    className="fuel-secondary"
                    disabled={!portionConfirmed || !validPortion}
                    onClick={() => onLog(product, portion, unit, false)}
                  >
                    Wybieram na później
                  </button>
                  <button
                    className="fuel-primary"
                    disabled={!portionConfirmed || !validPortion}
                    onClick={() => onLog(product, portion, unit, true)}
                  >
                    Zjedzone
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <div className="mt-4">
          <p className="fuel-label mb-2">Moment posiłku</p>
          <FuelMomentPicker value={moment} onChange={onMomentChange} />
        </div>
        {loading && (
          <p role="status" className="fuel-note flex items-center gap-2">
            <LoaderCircle size={16} className="animate-spin" />
            Sprawdzam produkt…
          </p>
        )}
        {onLabelProduct && (
          <details
            open={labelOpen}
            onToggle={(e) => {
              setLabelOpen(e.currentTarget.open);
              if (e.currentTarget.open && product?.nutriments) {
                setCarbs(String(product.nutriments.carbohydrates100g ?? ""));
                setProtein(String(product.nutriments.protein100g ?? ""));
                setFat(String(product.nutriments.fat100g ?? ""));
                setEnergy(String(product.nutriments.energyKcal100g ?? ""));
                setIngredients(product.ingredientsText ?? "");
                setLabelUnit(product.nutritionUnit ?? unit);
              }
            }}
            className="fuel-panel mt-4"
          >
            <summary className="fuel-text-button">Wpisz / popraw wartości z etykiety</summary>
            <form onSubmit={fromLabel} className="mt-3">
              <p className="fuel-note">
                Przepisz wartości na 100 g lub 100 ml. Skan zdjęcia etykiety nie jest wymagany.
              </p>
              <label className="fuel-label">
                Podstawa wartości na etykiecie
                <select
                  className="fuel-input"
                  value={labelUnit}
                  onChange={(e) => setLabelUnit(e.target.value as "g" | "ml")}
                >
                  <option value="g">Na 100 g</option>
                  <option value="ml">Na 100 ml</option>
                </select>
              </label>
              <label className="fuel-label mt-3">
                Nazwa
                <input
                  className="fuel-input"
                  value={productName}
                  onChange={(e) => onProductNameChange(e.target.value)}
                  required
                />
              </label>
              <div className="fuel-manual-grid mt-3">
                {[
                  ["Węglowodany (g)", carbs, setCarbs],
                  ["Białko (g)", protein, setProtein],
                  ["Tłuszcz (g)", fat, setFat],
                  ["Energia (kcal, opcjonalnie)", energy, setEnergy],
                ].map(([label, value, setter]) => (
                  <label className="fuel-label" key={String(label)}>
                    {String(label)}
                    <input
                      className="fuel-input"
                      inputMode="decimal"
                      value={String(value)}
                      onChange={(e) => (setter as (s: string) => void)(e.target.value)}
                      required={label !== "Energia (kcal, opcjonalnie)"}
                    />
                  </label>
                ))}
              </div>
              <label className="fuel-label mt-3">
                Skład i alergeny z etykiety (opcjonalnie)
                <textarea
                  className="fuel-input"
                  value={ingredients}
                  onChange={(e) => setIngredients(e.target.value)}
                />
              </label>
              {formError && (
                <p className="fuel-note" role="alert">
                  {formError}
                </p>
              )}
              <button className="fuel-primary mt-3" type="submit">
                Użyj danych z etykiety
              </button>
            </form>
          </details>
        )}
        <p className="fuel-note">
          Fuel ocenia dopasowanie do aktywności. Zawsze sprawdź skład, alergeny i ilość na
          opakowaniu.
        </p>
      </SheetContent>
    </Sheet>
  );
}
