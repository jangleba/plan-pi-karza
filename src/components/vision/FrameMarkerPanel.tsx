import { Crosshair, X } from "lucide-react";
import type { FrameMarkerDef, FrameMarkerKey, FrameManualInputs, FrameQuality } from "@/lib/vision/types";
import { FRAME_QUALITY_LABELS } from "@/lib/vision/types";

interface Props {
  testId: string;
  markerDefs: FrameMarkerDef[];
  markers: Partial<Record<FrameMarkerKey, number>>;
  currentFrame: number;
  onMark: (key: FrameMarkerKey) => void;
  onClear: (key: FrameMarkerKey) => void;
  manual: FrameManualInputs;
  onManual: (patch: Partial<FrameManualInputs>) => void;
}

const QUALITIES: FrameQuality[] = ["good", "medium", "poor"];

/** Panel markerów klatkowych + ręcznych danych zależnych od testu. */
export function FrameMarkerPanel({
  testId,
  markerDefs,
  markers,
  currentFrame,
  onMark,
  onClear,
  manual,
  onManual,
}: Props) {
  return (
    <div className="space-y-3">
      {markerDefs.length > 0 && (
        <div className="soft-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Kluczowe klatki</h2>
          <div className="space-y-2.5">
            {markerDefs.map((def) => {
              const value = markers[def.key];
              return (
                <div key={def.key} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{def.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {value != null ? `Klatka ${value}` : "Nie zaznaczono"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {value != null && (
                      <button
                        type="button"
                        onClick={() => onClear(def.key)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground active:scale-95"
                        aria-label="Wyczyść"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onMark(def.key)}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground active:scale-95"
                    >
                      <Crosshair className="h-3.5 w-3.5" /> Ustaw ({currentFrame})
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Broad Jump — ręczny dystans */}
      {testId === "broad_jump" && (
        <div className="soft-card space-y-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">Pomiar ręczny</h2>
          <p className="text-xs text-muted-foreground">
            Odległość wymaga ręcznego pomiaru albo kalibracji skali.
          </p>
          <NumberField
            label="Odległość (cm)"
            value={manual.distance_cm ?? null}
            onChange={(v) => onManual({ distance_cm: v })}
          />
          <QualityField
            label="Jakość lądowania"
            value={manual.landing_quality ?? null}
            onChange={(v) => onManual({ landing_quality: v })}
          />
        </div>
      )}

      {/* Pogo — liczba kontaktów */}
      {testId === "pogo_jumps" && (
        <div className="soft-card space-y-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">Kontakty</h2>
          <NumberField
            label="Liczba kontaktów"
            value={manual.number_of_contacts ?? null}
            onChange={(v) => onManual({ number_of_contacts: v })}
          />
        </div>
      )}

      {/* COD — manualne oceny */}
      {(testId === "five_ten_five" || testId === "sprint_to_stop") && (
        <div className="soft-card space-y-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">Ocena manualna (bez udawania AI)</h2>
          <QualityField
            label="Kontrola kolana"
            value={manual.knee_control ?? null}
            onChange={(v) => onManual({ knee_control: v })}
          />
          <QualityField
            label="Kontrola tułowia"
            value={manual.trunk_control ?? null}
            onChange={(v) => onManual({ trunk_control: v })}
          />
          <QualityField
            label="Ustawienie stopy"
            value={manual.foot_placement ?? null}
            onChange={(v) => onManual({ foot_placement: v })}
          />
          <NumberField
            label="Liczba kroków hamowania"
            value={manual.braking_steps ?? null}
            onChange={(v) => onManual({ braking_steps: v })}
          />
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
    </label>
  );
}

function QualityField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FrameQuality | null;
  onChange: (v: FrameQuality) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        {QUALITIES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onChange(q)}
            className={`flex-1 rounded-xl px-2 py-2 text-xs font-semibold transition-all active:scale-95 ${
              value === q ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {FRAME_QUALITY_LABELS[q]}
          </button>
        ))}
      </div>
    </div>
  );
}
