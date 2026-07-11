import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, RotateCcw, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildCalibrationRecord,
  buildKnownDistanceRecord,
  MAX_VIDEO_REPROJECTION_ERROR_PX,
  type CalibrationRecord,
  type CalibrationType,
  type ImagePointPx,
  type GroundPointMm,
} from "@/features/vision-analysis/videoCalibration";
import { saveVideoCalibration } from "@/lib/vision/videoCalibrationStore";

/** Szablon 4 rogów prostokąta referencyjnego (kolejność zaznaczania). */
const RECT_TEMPLATE: { label: string; world: (w: number, h: number) => GroundPointMm }[] = [
  { label: "Lewy bliższy róg", world: () => ({ x: 0, y: 0 }) },
  { label: "Prawy bliższy róg", world: (w) => ({ x: w, y: 0 }) },
  { label: "Prawy dalszy róg", world: (w, h) => ({ x: w, y: h }) },
  { label: "Lewy dalszy róg", world: (_w, h) => ({ x: 0, y: h }) },
];

const MODE_LABELS: Record<CalibrationType, string> = {
  MANUAL_GROUND_POINTS: "Punkty na podłożu",
  KNOWN_DISTANCE: "Znana odległość",
  AUTOMATIC_MARKERS: "Automatyczne markery",
};

export function VisionVideoCalibration({
  videoSrc,
  videoHash,
  fps,
  requiredAreaPx,
  onSaved,
  onCancel,
}: {
  videoSrc: string;
  videoHash: string;
  fps: number;
  /** Punkty (px) obszaru testu, które muszą znaleźć się w skalibrowanej strefie. */
  requiredAreaPx?: ImagePointPx[];
  onSaved: (record: CalibrationRecord) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<CalibrationType>("MANUAL_GROUND_POINTS");
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [timestampUs, setTimestampUs] = useState(0);

  const [widthCm, setWidthCm] = useState(200);
  const [heightCm, setHeightCm] = useState(100);
  const [taps, setTaps] = useState<ImagePointPx[]>([]);

  // KNOWN_DISTANCE: pary punktów + długość.
  const [kdLenCm, setKdLenCm] = useState(100);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CalibrationRecord | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Przechwyć klatkę referencyjną (środek filmu) do kalibracji.
  useEffect(() => {
    const v = document.createElement("video");
    videoRef.current = v;
    v.src = videoSrc;
    v.muted = true;
    v.crossOrigin = "anonymous";
    const capture = () => {
      const t = Math.min(v.duration / 2 || 0, v.duration || 0);
      const onSeeked = () => {
        const canvas = document.createElement("canvas");
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(v, 0, 0);
        try {
          setFrameUrl(canvas.toDataURL("image/jpeg", 0.9));
        } catch {
          setError("Nie udało się przechwycić klatki filmu do kalibracji.");
        }
        setNatural({ w: v.videoWidth, h: v.videoHeight });
        setTimestampUs(Math.round(v.currentTime * 1e6));
        v.removeEventListener("seeked", onSeeked);
      };
      v.addEventListener("seeked", onSeeked);
      v.currentTime = t;
    };
    v.addEventListener("loadedmetadata", capture, { once: true });
    return () => {
      v.removeAttribute("src");
      v.load();
    };
  }, [videoSrc]);

  const referenceFrameIndex = useMemo(
    () => Math.round((timestampUs / 1e6) * (fps || 30)),
    [timestampUs, fps],
  );

  function onImgClick(e: React.MouseEvent<HTMLImageElement>) {
    const el = imgRef.current;
    if (!el || !natural) return;
    const limit = mode === "KNOWN_DISTANCE" ? 6 : RECT_TEMPLATE.length;
    if (taps.length >= limit) return;
    const rect = el.getBoundingClientRect();
    const u = ((e.clientX - rect.left) / rect.width) * natural.w;
    const v = ((e.clientY - rect.top) / rect.height) * natural.h;
    setTaps((prev) => [...prev, { u, v }]);
  }

  function reset() {
    setTaps([]);
    setError(null);
    setSaved(null);
  }

  function compute() {
    setError(null);
    if (mode === "KNOWN_DISTANCE") {
      if (taps.length < 2 || taps.length % 2 !== 0) {
        setError("Zaznacz parę punktów (początek i koniec odcinka).");
        return;
      }
      const segments = [];
      for (let i = 0; i < taps.length; i += 2)
        segments.push({ a: taps[i], b: taps[i + 1], lengthMm: kdLenCm * 10 });
      const res = buildKnownDistanceRecord({
        videoHash,
        referenceFrameIndex,
        referenceTimestampUs: timestampUs,
        segments,
      });
      if (!res.ok) {
        setError(res.errors.join(" "));
        return;
      }
      finalize(res.record);
      return;
    }

    // MANUAL_GROUND_POINTS / AUTOMATIC_MARKERS → homografia z 4+ punktów podłoża.
    if (taps.length < 4) {
      setError("Zaznacz co najmniej 4 niewspółliniowe punkty na podłożu.");
      return;
    }
    const wMm = widthCm * 10;
    const hMm = heightCm * 10;
    const groundPointsMm: GroundPointMm[] = taps.map((_, i) => RECT_TEMPLATE[i].world(wMm, hMm));
    // Linia wybicia = krawędź prostokąta o stałym x=0 (lewy bliższy → lewy dalszy róg).
    // Strefa lądowania = cały skalibrowany prostokąt podłoża.
    const takeoffLinePx: [ImagePointPx, ImagePointPx] = [taps[0], taps[3]];
    const landingAreaPolygonPx: ImagePointPx[] = [taps[0], taps[1], taps[2], taps[3]];
    const res = buildCalibrationRecord({
      videoHash,
      calibrationType: mode,
      referenceFrameIndex,
      referenceTimestampUs: timestampUs,
      imagePointsPx: taps,
      groundPointsMm,
      takeoffLinePx,
      landingAreaPolygonPx,
    });
    if (!res.ok) {
      setError(res.errors.join(" "));
      return;
    }
    finalize(res.record);
  }

  function finalize(record: CalibrationRecord) {
    saveVideoCalibration(record);
    setSaved(record);
  }

  const tapHint =
    mode === "KNOWN_DISTANCE"
      ? `Zaznacz odcinek: punkt ${taps.length + 1}`
      : taps.length < RECT_TEMPLATE.length
        ? `Zaznacz: ${RECT_TEMPLATE[taps.length].label} (${taps.length + 1}/4)`
        : "Wszystkie punkty zaznaczone";

  return (
    <div className="soft-card space-y-4 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Crosshair className="h-5 w-5" />
        </div>
        <div>
          <div className="text-base font-semibold text-foreground">Skalibruj podłoże na tym filmie</div>
          <p className="text-sm text-muted-foreground">
            Kalibracja zostanie przypisana do tego nagrania i użyta ponownie po jego otwarciu.
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold text-foreground">Tryb kalibracji</h3>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MODE_LABELS) as CalibrationType[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                reset();
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                mode === m ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {mode === "AUTOMATIC_MARKERS" && (
        <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700">
          Automatyczne wykrycie markerów nie jest dostępne dla tego nagrania. Zaznacz ręcznie
          co najmniej 4 markery o znanych współrzędnych na podłożu.
        </p>
      )}

      {mode === "KNOWN_DISTANCE" ? (
        <div className="rounded-xl bg-accent/60 p-3">
          <NumberField label="Długość odcinka (cm)" value={kdLenCm} onChange={setKdLenCm} />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Znana odległość waliduje skalę, ale bez pełnej geometrii wynik pozostaje
            <strong> nieoficjalny</strong> (tylko technika).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Szerokość prostokąta (cm)" value={widthCm} onChange={setWidthCm} />
          <NumberField label="Głębokość prostokąta (cm)" value={heightCm} onChange={setHeightCm} />
        </div>
      )}

      {frameUrl ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">{tapHint}</p>
            <button
              type="button"
              onClick={() => setTaps((p) => p.slice(0, -1))}
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
              src={frameUrl}
              alt="Klatka referencyjna kalibracji filmu"
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
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Przechwytywanie klatki referencyjnej…</p>
      )}

      {error && <p className="text-xs font-medium text-destructive">{error}</p>}

      {saved ? (
        <SavedRecordView record={saved} requiredAreaPx={requiredAreaPx} onUse={() => onSaved(saved)} />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onCancel}>
            Anuluj
          </Button>
          <Button onClick={compute} disabled={!frameUrl}>
            Oblicz kalibrację
          </Button>
        </div>
      )}
    </div>
  );
}

function SavedRecordView({
  record,
  requiredAreaPx,
  onUse,
}: {
  record: CalibrationRecord;
  requiredAreaPx?: ImagePointPx[];
  onUse: () => void;
}) {
  const official = record.spatialResultStatus === "OFFICIAL";
  return (
    <div className="space-y-3">
      <div className="soft-card space-y-1.5 p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-600">
          <CheckCircle2 className="h-5 w-5" /> Zapisano kalibrację filmu
        </div>
        <Row label="calibrationId" value={record.calibrationId} mono />
        <Row label="calibrationHash" value={record.calibrationHash} mono />
        <Row label="Tryb" value={record.calibrationType} />
        <Row label="Klatka referencyjna" value={`${record.referenceFrameIndex}`} />
        <Row label="reprojectionError" value={`${record.reprojectionErrorPx} px · ${record.reprojectionErrorMm} mm`} />
        <Row label="Limit" value={`≤ ${MAX_VIDEO_REPROJECTION_ERROR_PX} px`} />
        <Row label="Punkty obszaru" value={`${record.calibratedAreaPolygonPx.length}`} />
        <Row label="Pewność" value={`${Math.round(record.calibrationConfidence * 100)}%`} />
        <Row label="Wynik" value={official ? "Oficjalny (cm/m/prędkość)" : "Tylko technika"} />
        {record.homographyMatrix && (
          <div className="pt-1">
            <div className="text-[11px] font-semibold text-muted-foreground">homographyMatrix</div>
            <div className="break-all font-mono text-[10px] text-foreground">
              {record.homographyMatrix.map((n) => Number(n).toPrecision(4)).join(", ")}
            </div>
          </div>
        )}
      </div>
      {requiredAreaPx && requiredAreaPx.length > 0 && !areaCovered(requiredAreaPx, record) && (
        <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700">
          Uwaga: część obszaru testu wychodzi poza skalibrowaną strefę. Rozszerz zaznaczenie.
        </p>
      )}
      <Button
        className="w-full"
        onClick={onUse}
        disabled={!official}
      >
        {official ? "Użyj kalibracji i policz wynik" : "Kalibracja nieoficjalna — popraw punkty"}
      </Button>
    </div>
  );
}

function areaCovered(required: ImagePointPx[], record: CalibrationRecord): boolean {
  // Prosty test: wszystkie punkty w bounding boxie wielokąta.
  const xs = record.calibratedAreaPolygonPx.map((p) => p.u);
  const ys = record.calibratedAreaPolygonPx.map((p) => p.v);
  const minU = Math.min(...xs);
  const maxU = Math.max(...xs);
  const minV = Math.min(...ys);
  const maxV = Math.max(...ys);
  return required.every((p) => p.u >= minU && p.u <= maxU && p.v >= minV && p.v <= maxV);
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`truncate text-right font-medium text-foreground ${mono ? "font-mono text-[11px]" : ""}`}>
        {value}
      </span>
    </div>
  );
}
