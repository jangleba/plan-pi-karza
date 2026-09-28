import {
  Barcode,
  Camera,
  Check,
  ChevronRight,
  Info,
  LoaderCircle,
  Mic,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { useRef } from "react";
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
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        className="z-[73] mx-auto max-h-[94dvh] w-full max-w-[30rem] overflow-y-auto rounded-t-[2rem] bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-border" />
        {!evaluation ? (
          <div className="fuel-enter pb-2">
            <div className="mt-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.17em] text-primary">
                  W sklepie
                </div>
                <SheetTitle className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.045em]">
                  Co chcesz kupić?
                </SheetTitle>
                <SheetDescription className="mt-1.5 text-sm leading-relaxed">
                  Zeskanuj kod albo powiedz nazwę produktu.
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
              onClick={() => cameraRef.current?.click()}
              className="fuel-scan-frame relative mt-6 flex min-h-[10rem] w-full flex-col items-center justify-center overflow-hidden rounded-[1.65rem] border border-primary/20 bg-primary/[0.045] text-primary"
            >
              <Camera className="h-8 w-8" />
              <span className="mt-3 text-sm font-semibold">Zeskanuj kod ze zdjęcia</span>
              <span className="mt-1 text-[11px] text-muted-foreground">EAN-8, EAN-13, UPC</span>
              <span
                className="fuel-scan-line absolute left-6 right-6 h-px bg-sky-400/80"
                aria-hidden="true"
              />
            </button>
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

            <div className="mt-4 rounded-[1.4rem] border border-border/80 bg-card p-3 shadow-[var(--bw-shadow-card)]">
              <label
                htmlFor="store-product-name"
                className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground"
              >
                Nazwa produktu
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="store-product-name"
                  value={productName}
                  onChange={(event) => onProductNameChange(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && onCheckName()}
                  placeholder="Np. wrap z kurczakiem"
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                />
                <button
                  type="button"
                  onClick={onToggleVoice}
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${listening ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  aria-label={listening ? "Zatrzymaj nagrywanie" : "Powiedz nazwę"}
                >
                  {listening ? (
                    <Square className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={onCheckName}
                disabled={productName.trim().length < 3 || loading}
                className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-35"
              >
                Sprawdź nazwę
              </button>
            </div>

            <details className="mt-3 rounded-2xl border border-border/80 bg-card px-4 py-3">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                Mam numer kodu
              </summary>
              <div className="mt-3 flex gap-2">
                <input
                  inputMode="numeric"
                  value={barcode}
                  onChange={(event) =>
                    onBarcodeChange(event.target.value.replace(/\D/g, "").slice(0, 14))
                  }
                  placeholder="Wpisz EAN"
                  className="h-11 min-w-0 flex-1 rounded-xl bg-muted/65 px-3 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={onCheckBarcode}
                  disabled={barcode.length < 8 || loading}
                  className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-35"
                  aria-label="Sprawdź kod"
                >
                  <Barcode className="h-4 w-4" />
                </button>
              </div>
            </details>

            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold">Dopasuj do momentu:</div>
              <FuelMomentPicker value={moment} onChange={onMomentChange} />
            </div>
            {loading && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Sprawdzam produkt…
              </div>
            )}
            <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Dane kodów pochodzą z otwartej bazy
              Open Food Facts i mogą być niepełne. Zawsze sprawdź etykietę i alergeny.
            </p>
          </div>
        ) : (
          <StoreResult
            product={product}
            evaluation={evaluation}
            onReset={onReset}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function StoreResult({
  product,
  evaluation,
  onReset,
  onClose,
}: {
  product: StoreProduct | null;
  evaluation: StoreEvaluation;
  onReset: () => void;
  onClose: () => void;
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
    <div className="fuel-enter pb-2">
      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          <div
            className={`inline-flex rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] ${style}`}
          >
            {evaluation.label}
          </div>
          <SheetTitle className="mt-3 text-[25px] font-semibold leading-tight tracking-[-0.04em]">
            {product?.name ?? "Ocena produktu"}
          </SheetTitle>
          {product?.brand && (
            <div className="mt-1 text-xs text-muted-foreground">{product.brand}</div>
          )}
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
      {product?.imageUrl && (
        <img
          src={product.imageUrl}
          alt=""
          className="mx-auto mt-5 h-36 w-36 rounded-3xl object-contain"
          referrerPolicy="no-referrer"
        />
      )}
      <div className="mt-5 rounded-[1.65rem] border border-border/80 bg-card p-5 shadow-[var(--bw-shadow-card)]">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
          Dlaczego?
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{evaluation.reason}</p>
        {evaluation.addition && <ActionRow label="Dodaj" value={evaluation.addition} />}
        {evaluation.replacement && <ActionRow label="Zamiennik" value={evaluation.replacement} />}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-5 inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
      >
        <Check className="h-4 w-4" /> Rozumiem
      </button>
      <button
        type="button"
        onClick={onReset}
        className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 text-xs font-semibold text-muted-foreground"
      >
        <RefreshCw className="h-4 w-4" /> Sprawdź inny produkt
      </button>
      <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> To ocena dopasowania do dzisiejszej
        aktywności, nie ogólna ocena „zdrowości” produktu.
      </p>
    </div>
  );
}

function ActionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-primary/[0.065] px-4 py-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card text-primary">
        <ChevronRight className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="mt-0.5 block text-sm font-semibold">{value}</span>
      </span>
    </div>
  );
}
