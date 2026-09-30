import { Barcode, Camera, LoaderCircle, Mic, RefreshCw, Square } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/app-ui";
import { Input } from "@/components/ui/input";
import type { FuelMoment } from "@/lib/fuel/assistant";
import type { StoreEvaluation, StoreProduct } from "@/lib/fuel/storeCheck";
import { FuelMomentPicker } from "./FuelMomentPicker";

export function StoreCheck({
  productName,
  barcode,
  product,
  evaluation,
  moment,
  listening,
  loading,
  onProductNameChange,
  onBarcodeChange,
  onMomentChange,
  onToggleVoice,
  onImage,
  onCheckName,
  onCheckBarcode,
  onReset,
}: {
  productName: string;
  barcode: string;
  product: StoreProduct | null;
  evaluation: StoreEvaluation | null;
  moment: FuelMoment;
  listening: boolean;
  loading: boolean;
  onProductNameChange: (value: string) => void;
  onBarcodeChange: (value: string) => void;
  onMomentChange: (value: FuelMoment) => void;
  onToggleVoice: () => void;
  onImage: (file: File | undefined) => void;
  onCheckName: () => void;
  onCheckBarcode: () => void;
  onReset: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  return (
    <div className="bw-columns fuel-layout">
      <section className="bw-section space-y-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            onCheckName();
          }}
        >
          <label htmlFor="store-product-name" className="bw-field-label">
            Nazwa produktu
          </label>
          <div className="flex gap-2">
            <Input
              id="store-product-name"
              value={productName}
              onChange={(event) => onProductNameChange(event.target.value)}
              placeholder="Np. wrap z kurczakiem"
            />
            <Button
              type="button"
              variant={listening ? "default" : "secondary"}
              className={listening ? undefined : "bg-muted text-muted-foreground"}
              size="icon"
              onClick={onToggleVoice}
              aria-label={listening ? "Zatrzymaj nagrywanie" : "Powiedz nazwę produktu"}
              aria-pressed={listening}
            >
              {listening ? <Square className="fill-current" /> : <Mic />}
            </Button>
          </div>
          {listening && (
            <p role="status" className="text-sm text-primary">
              Słucham…
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={productName.trim().length < 3 || loading}>
              Sprawdź produkt
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="bg-primary/[0.045] text-primary"
              disabled={loading}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera />
              Zdjęcie kodu
            </Button>
          </div>
        </form>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            onImage(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        <Disclosure title="Wpisz kod kreskowy">
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onCheckBarcode();
            }}
          >
            <label htmlFor="store-barcode" className="sr-only">
              Kod EAN lub UPC
            </label>
            <Input
              id="store-barcode"
              inputMode="numeric"
              value={barcode}
              onChange={(event) =>
                onBarcodeChange(event.target.value.replace(/\D/g, "").slice(0, 14))
              }
              placeholder="EAN lub UPC"
            />
            <Button
              type="submit"
              size="icon"
              disabled={barcode.length < 8 || loading}
              aria-label="Sprawdź kod"
            >
              <Barcode />
            </Button>
          </form>
        </Disclosure>
        <div className="space-y-3">
          <FuelMomentPicker value={moment} onChange={onMomentChange} />
        </div>
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Sprawdzanie produktu…
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Dane Open Food Facts mogą być niepełne. Sprawdź etykietę i alergeny.
        </p>
      </section>
      {evaluation && <StoreResult product={product} evaluation={evaluation} onReset={onReset} />}
    </div>
  );
}

function StoreResult({
  product,
  evaluation,
  onReset,
}: {
  product: StoreProduct | null;
  evaluation: StoreEvaluation;
  onReset: () => void;
}) {
  const style =
    evaluation.verdict === "add"
      ? "bg-amber-100 text-amber-900"
      : evaluation.verdict === "swap"
        ? "bg-muted text-foreground"
        : evaluation.verdict === "good"
          ? "bg-primary/[0.1] text-primary"
          : "bg-muted text-muted-foreground";
  return (
    <section
      className="bw-section space-y-4 fuel-result"
      aria-live="polite"
      aria-label="Dopasowanie produktu"
    >
      <span className={`w-fit rounded-md px-3 py-2 text-sm font-semibold ${style}`}>
        {evaluation.label}
      </span>
      <div>
        <h2>{product?.name ?? "Ocena produktu"}</h2>
        {product?.brand && <p className="text-sm text-muted-foreground">{product.brand}</p>}
      </div>
      {product?.imageUrl && (
        <img
          src={product.imageUrl}
          alt={product.name}
          className="h-32 w-32 object-contain"
          referrerPolicy="no-referrer"
        />
      )}
      <p className="text-muted-foreground">{evaluation.reason}</p>
      {evaluation.addition && (
        <p>
          <span className="font-semibold text-primary">Dodaj: </span>
          {evaluation.addition}
        </p>
      )}
      {evaluation.replacement && (
        <p>
          <span className="font-semibold text-primary">Zamiennik: </span>
          {evaluation.replacement}
        </p>
      )}
      <Button
        type="button"
        variant="ghost"
        className="w-fit text-muted-foreground"
        onClick={onReset}
      >
        <RefreshCw />
        Sprawdź inny produkt
      </Button>
      <p className="text-sm text-muted-foreground">
        Dopasowanie do aktywności, nie ogólna ocena zdrowotna produktu.
      </p>
    </section>
  );
}
