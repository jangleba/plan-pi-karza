import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Camera, Check, CheckCircle2, ScanLine, Volume2 } from "lucide-react";
import { VisionHeader } from "./visionUi";
import { Button } from "@/components/ui/button";
import { CAMERA_VIEW_LABELS, type VisionTest, type VisionCameraView } from "@/lib/vision/types";
import { getFlow, updateFlow } from "@/lib/vision/visionFlow";

const CHECK_ITEMS: {
  key:
    | "lightingOk"
    | "cameraStable"
    | "athleteInFrame"
    | "feetVisible"
    | "lineVisible"
    | "angleOk"
    | "groundContactClear";
  label: string;
  desc: string;
}[] = [
  { key: "lightingOk", label: "Dobre oświetlenie", desc: "Brak cieni na podłożu, jasny obraz." },
  { key: "cameraStable", label: "Stabilna kamera", desc: "Statyw lub stabilne oparcie." },
  {
    key: "athleteInFrame",
    label: "Zawodnik w kadrze",
    desc: "Cała sylwetka widoczna przez cały ruch.",
  },
  { key: "feetVisible", label: "Stopy widoczne", desc: "Kontakt stóp z podłożem jest widoczny." },
  { key: "lineVisible", label: "Linie widoczne", desc: "Linie startu/mety lub pachołki w kadrze." },
  { key: "angleOk", label: "Prawidłowy kąt", desc: "Kamera zgodna z zalecanym ujęciem." },
  {
    key: "groundContactClear",
    label: "Wyraźny kontakt z podłożem",
    desc: "Widać moment kontaktu i odbicia.",
  },
];

const FPS_OPTIONS = [30, 60, 120, 240];
const VIEW_OPTIONS: VisionCameraView[] = ["side", "front", "back", "45deg", "top"];

export function VisionSetupCheck({ test }: { test: VisionTest }) {
  const navigate = useNavigate();
  const flow = getFlow(test.id);
  const isSprintTest = ["sprint_20m", "sprint_30m", "flying_sprint"].includes(test.id);
  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const item of CHECK_ITEMS) init[item.key] = flow.setup[item.key] ?? false;
    return init;
  });
  const [fps, setFps] = useState<number>(flow.fps || test.recommendedFps);
  const [view, setView] = useState<VisionCameraView>(flow.cameraView || test.cameraView);

  function toggle(key: string) {
    setChecks((p) => ({ ...p, [key]: !p[key] }));
  }

  function proceed() {
    updateFlow(test.id, { setup: { ...checks }, fps, cameraView: view });
    navigate({ to: "/vision-lab/test/$testId/upload", params: { testId: test.id } });
  }

  const fpsWarn = fps < test.minimumFps;
  const allChecksConfirmed = CHECK_ITEMS.every((item) => checks[item.key]);

  if (isSprintTest) {
    return (
      <div className="pb-28">
        <VisionHeader
          title="Przygotuj test"
          subtitle={`${test.name} · inteligentna kamera BallWise`}
          backTo="/vision-lab"
        />

        <div className="space-y-4 px-5">
          <div className="soft-card space-y-4 p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Camera className="h-6 w-6" />
              </span>
              <div>
                <h2 className="font-semibold text-foreground">Nie musisz zgadywać ustawień</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Po otwarciu kamery zobaczysz prawdziwy podgląd. BallWise wykryje zawodnika i
                  sprawdzi kadr na żywo.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {[
                "dokładnie jedna osoba w kadrze",
                "widoczna głowa, tułów, nogi i stopy",
                "właściwa wielkość sylwetki dla pomiaru czasu",
                "rzeczywisty FPS udostępniony przez kamerę",
              ].map((label) => (
                <div key={label} className="flex items-center gap-2 text-sm text-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="soft-card p-4">
              <ScanLine className="mb-2 h-5 w-5 text-primary" />
              <div className="text-sm font-semibold text-foreground">Szkielet live</div>
              <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Stawy i linie pojawią się bezpośrednio na obrazie.
              </div>
            </div>
            <div className="soft-card p-4">
              <Volume2 className="mb-2 h-5 w-5 text-primary" />
              <div className="text-sm font-semibold text-foreground">Tryb solo</div>
              <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Aplikacja potwierdzi ustawienie i odliczy start.
              </div>
            </div>
          </div>

          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            Dokładne linie pomiarowe START, splitów i META nadal wymagają kalibracji sceny. Zwykłe
            prowadnice w kamerze służą tylko do ustawienia kadru.
          </p>
        </div>

        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-5 py-3 backdrop-blur"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
        >
          <div className="mx-auto w-full max-w-[30rem]">
            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                updateFlow(test.id, { cameraView: test.cameraView });
                navigate({ to: "/vision-lab/test/$testId/upload", params: { testId: test.id } });
              }}
            >
              <Camera className="mr-2 h-5 w-5" /> Otwórz kamerę BallWise
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28">
      <VisionHeader
        title="Setup check"
        subtitle={`${test.name} · zalecane ${test.recommendedFps} FPS, ${CAMERA_VIEW_LABELS[test.cameraView]}`}
        backTo="/vision-lab"
      />

      <div className="space-y-4 px-5">
        <div className="soft-card p-4">
          <h2 className="mb-1 text-sm font-semibold text-foreground">FPS nagrania</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Poniżej {test.minimumFps} FPS wynik będzie oznaczony jako estymowany lub nieważny.
          </p>
          <div className="grid grid-cols-4 gap-2">
            {FPS_OPTIONS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFps(f)}
                className={`rounded-xl py-2 text-sm font-semibold transition-all active:scale-95 ${
                  fps === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          {fpsWarn && (
            <p className="mt-2 text-xs font-medium text-amber-600">
              Uwaga: {fps} FPS jest poniżej minimum ({test.minimumFps}) dla tego testu.
            </p>
          )}
        </div>

        <div className="soft-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Ujęcie kamery</h2>
          <div className="flex flex-wrap gap-2">
            {VIEW_OPTIONS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {CAMERA_VIEW_LABELS[v]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Potwierdź warunki nagrania
          </h2>
          {CHECK_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => toggle(item.key)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left active:scale-[0.99]"
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors ${
                  checks[item.key]
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background"
                }`}
              >
                {checks[item.key] && <Check className="h-4 w-4" strokeWidth={3} />}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-5 py-3 backdrop-blur"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
      >
        <div className="mx-auto w-full max-w-[30rem]">
          <Button className="w-full" size="lg" onClick={proceed} disabled={!allChecksConfirmed}>
            Przejdź do uploadu
          </Button>
        </div>
      </div>
    </div>
  );
}
