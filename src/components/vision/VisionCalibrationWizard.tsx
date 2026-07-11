import { useMemo, useRef, useState } from "react";
import { CheckCircle2, RotateCcw, Trash2, Upload } from "lucide-react";
import { VisionHeader } from "./visionUi";
import { Button } from "@/components/ui/button";
import {
  buildCalibrationProfile,
  fitHomography,
  isFitAcceptable,
  LENS_LABELS,
  ORIENTATION_LABELS,
  MAX_PROFILE_REPROJECTION_ERROR_PX,
  type CalibrationProfile,
  type CaptureOrientation,
  type CorrespondencePoint,
  type HomographyFit,
  type LensType,
} from "@/features/vision-analysis/calibrationProfiles";
import {
  detectDevice,
  loadCalibrationProfiles,
  saveCalibrationProfile,
  deleteCalibrationProfile,
} from "@/lib/vision/calibrationStore";

const LENS_OPTIONS: LensType[] = ["wide", "ultrawide", "tele", "external"];
const ORIENTATION_OPTIONS: CaptureOrientation[] = ["portrait", "landscape"];
const FPS_OPTIONS = [30, 60, 120, 240];
const ZOOM_OPTIONS = [0.5, 1, 2, 3];

/** Szablon 8 punktów prostokąta referencyjnego (kolejność zaznaczania). */
const TEMPLATE: { label: string; world: (w: number, h: number) => { x: number; y: number } }[] = [
  { label: "Lewy górny róg", world: () => ({ x: 0, y: 0 }) },
  { label: "Środek górnej krawędzi", world: (w) => ({ x: w / 2, y: 0 }) },
  { label: "Prawy górny róg", world: (w) => ({ x: w, y: 0 }) },
  { label: "Środek prawej krawędzi", world: (w, h) => ({ x: w, y: h / 2 }) },
  { label: "Prawy dolny róg", world: (w, h) => ({ x: w, y: h }) },
  { label: "Środek dolnej krawędzi", world: (w, h) => ({ x: w / 2, y: h }) },
  { label: "Lewy dolny róg", world: (_w, h) => ({ x: 0, y: h }) },
  { label: "Środek lewej krawędzi", world: (_w, h) => ({ x: 0, y: h / 2 }) },
];

type Step = "device" | "capture" | "result";

export function VisionCalibrationWizard() {
  const device = useMemo(() => detectDevice(), []);
  const [step, setStep] = useState<Step>("device");

  const [deviceLabel, setDeviceLabel] = useState(device.label);
  const [lens, setLens] = useState<LensType>("wide");
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [orientation, setOrientation] = useState<CaptureOrientation>("portrait");
  const [fps, setFps] = useState(120);
  const [zoom, setZoom] = useState(1);
  const [resolution, setResolution] = useState("1080x1920");

  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [widthCm, setWidthCm] = useState(100);
  const [heightCm, setHeightCm] = useState(100);
  const [taps, setTaps] = useState<{ u: number; v: number }[]>([]);

  const [fit, setFit] = useState<HomographyFit | null>(null);
  const [saved, setSaved] = useState<CalibrationProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<CalibrationProfile[]>(() => loadCalibrationProfiles());

  const imgRef = useRef<HTMLImageElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImgUrl(URL.createObjectURL(f));
    setTaps([]);
    setFit(null);
    setError(null);
  }

  function onImgLoad() {
    const el = imgRef.current;
    if (el) setNatural({ w: el.naturalWidth, h: el.naturalHeight });
  }

  function onImgClick(e: React.MouseEvent<HTMLImageElement>) {
    const el = imgRef.current;
    if (!el || !natural || taps.length >= TEMPLATE.length) return;
    const rect = el.getBoundingClientRect();
    const u = ((e.clientX - rect.left) / rect.width) * natural.w;
    const v = ((e.clientY - rect.top) / rect.height) * natural.h;
    setTaps((prev) => [...prev, { u, v }]);
  }

  function undoTap() {
    setTaps((prev) => prev.slice(0, -1));
  }

  function compute() {
    setError(null);
    if (taps.length < 4) {
      setError("Zaznacz co najmniej 4 punkty (najlepiej wszystkie 8).");
      return;
    }
    const wMm = widthCm * 10;
    const hMm = heightCm * 10;
    if (wMm <= 0 || hMm <= 0) {
      setError("Podaj poprawne wymiary prostokąta referencyjnego.");
      return;
    }
    const points: CorrespondencePoint[] = taps.map((t, i) => ({
      image: t,
      world: TEMPLATE[i].world(wMm, hMm),
    }));
    const result = fitHomography(points);
    if (!result) {
      setError("Nie udało się dopasować kalibracji. Zaznacz punkty dokładniej.");
      return;
    }
    setFit(result);
    setStep("result");
  }

  function save() {
    if (!fit) return;
    const profile = buildCalibrationProfile({
      parts: { deviceId: device.deviceId, lens, orientation, fps, zoom },
      deviceLabel,
      fit,
      worldWidthMm: widthCm * 10,
      worldHeightMm: heightCm * 10,
    });
    const next = saveCalibrationProfile(profile);
    setProfiles(next);
    setSaved(profile);
  }

  function removeProfile(key: string) {
    setProfiles(deleteCalibrationProfile(key));
  }

  const acceptable = fit ? isFitAcceptable(fit) : false;

  return (
    <div className="pb-28">
      <VisionHeader
        title="Kalibracja kamery"
        subtitle="Profil kalibracji osobno dla urządzenia, obiektywu, orientacji i FPS/zoomu."
        backTo="/vision-lab"
      />

      <div className="space-y-4 px-5">
        {step === "device" && (
          <>
            <div className="soft-card space-y-4 p-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-foreground">
                  Model urządzenia
                </label>
                <input
                  value={deviceLabel}
                  onChange={(e) => setDeviceLabel(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder="np. iPhone 14 Pro"
                />
              </div>

              <ChipRow
                title="Obiektyw"
                options={LENS_OPTIONS}
                value={lens}
                label={(o) => LENS_LABELS[o]}
                onSelect={setLens}
              />
              <ChipRow
                title="Orientacja"
                options={ORIENTATION_OPTIONS}
                value={orientation}
                label={(o) => ORIENTATION_LABELS[o]}
                onSelect={setOrientation}
              />
              <ChipRow
                title="FPS nagrania"
                options={FPS_OPTIONS}
                value={fps}
                label={(o) => `${o}`}
                onSelect={setFps}
              />
              <ChipRow
                title="Zoom"
                options={ZOOM_OPTIONS}
                value={zoom}
                label={(o) => `${o}x`}
                onSelect={setZoom}
              />
            </div>
            <Button className="w-full" size="lg" onClick={() => setStep("capture")}>
              Dalej: zdjęcie referencyjne
            </Button>
          </>
        )}

        {step === "capture" && (
          <>
            <div className="soft-card space-y-3 p-4">
              <p className="text-xs text-muted-foreground">
                Zrób zdjęcie/klatkę z <strong>tego samego ustawienia kamery</strong> zawierające
                płaski prostokąt o znanych wymiarach (np. mata, kartka, bramka treningowa). Podaj
                wymiary i zaznacz punkty w kolejności.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Szerokość (cm)" value={widthCm} onChange={setWidthCm} />
                <NumberField label="Wysokość (cm)" value={heightCm} onChange={setHeightCm} />
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onFile}
              />
              <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Wybierz zdjęcie referencyjne
              </Button>
            </div>

            {imgUrl && (
              <div className="soft-card space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">
                    {taps.length < TEMPLATE.length
                      ? `Zaznacz: ${TEMPLATE[taps.length].label} (${taps.length + 1}/${TEMPLATE.length})`
                      : "Wszystkie punkty zaznaczone"}
                  </p>
                  <button
                    type="button"
                    onClick={undoTap}
                    disabled={taps.length === 0}
                    className="flex items-center gap-1 text-xs text-muted-foreground disabled:opacity-40"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Cofnij
                  </button>
                </div>
                <div className="relative">
                  {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
                  <img
                    ref={imgRef}
                    src={imgUrl}
                    alt="Zdjęcie referencyjne kalibracji"
                    onLoad={onImgLoad}
                    onClick={onImgClick}
                    className="w-full cursor-crosshair rounded-xl"
                  />
                  {natural &&
                    taps.map((t, i) => (
                      <span
                        key={i}
                        className="pointer-events-none absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
                        style={{ left: `${(t.u / natural.w) * 100}%`, top: `${(t.v / natural.h) * 100}%` }}
                      >
                        {i + 1}
                      </span>
                    ))}
                </div>
                <Button className="w-full" onClick={compute} disabled={taps.length < 4}>
                  Oblicz kalibrację
                </Button>
              </div>
            )}
            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          </>
        )}

        {step === "result" && fit && (
          <>
            <div className="soft-card space-y-2 p-4">
              <Row label="Błąd reprojekcji (RMS)" value={`${fit.reprojectionErrorPx} px`} />
              <Row label="Maks. błąd punktu" value={`${fit.maxResidualPx} px`} />
              <Row label="Limit akceptacji" value={`≤ ${MAX_PROFILE_REPROJECTION_ERROR_PX} px`} />
              <Row label="Liczba punktów" value={`${fit.pointCount}`} />
              <div
                className={`mt-2 rounded-xl p-3 text-sm font-medium ${
                  acceptable
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {acceptable
                  ? "Kalibracja spełnia wymóg reprojectionError. Można zapisać profil."
                  : "Błąd reprojekcji zbyt wysoki. Powtórz zaznaczenie punktów lub użyj większego prostokąta."}
              </div>
            </div>

            {saved ? (
              <div className="soft-card flex items-center gap-2 p-4 text-sm text-emerald-600">
                <CheckCircle2 className="h-5 w-5" /> Zapisano profil:
                <span className="font-mono text-xs text-foreground">{saved.key}</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setStep("capture")}>
                  Popraw punkty
                </Button>
                <Button onClick={save} disabled={!acceptable}>
                  Zapisz profil
                </Button>
              </div>
            )}
          </>
        )}

        {profiles.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Zapisane profile ({profiles.length})
            </h2>
            {profiles.map((p) => (
              <div key={p.key} className="soft-card flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{p.deviceLabel}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">{p.key}</div>
                  <div className="text-[11px] text-muted-foreground">
                    reproj {p.reprojectionErrorPx}px · {p.mmPerPixel} mm/px
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeProfile(p.key)}
                  className="shrink-0 text-muted-foreground"
                  aria-label="Usuń profil"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChipRow<T extends string | number>({
  title,
  options,
  value,
  label,
  onSelect,
}: {
  title: string;
  options: T[];
  value: T;
  label: (o: T) => string;
  onSelect: (o: T) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-foreground">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            onClick={() => onSelect(o)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
              value === o
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {label(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-foreground">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
