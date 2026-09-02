import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FolderOpen, CheckCircle2, Loader2, Info } from "lucide-react";
import { VisionHeader } from "./visionUi";
import { requiredRecordingOrientation, VisionRecorder } from "./VisionRecorder";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/loadwise/auth";
import type { VisionTest } from "@/lib/vision/types";
import { getFlow, updateFlow } from "@/lib/vision/visionFlow";
import { clearVisionSessionVideo, saveVisionSessionVideo } from "@/lib/vision/visionSessionVideo";
import { getTestProtocol } from "@/features/vision-analysis/testProtocols";
import type { TestType } from "@/features/vision-analysis/types";

type Status = "idle" | "preparing" | "done";

export function VisionUpload({ test }: { test: VisionTest }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectionTokenRef = useRef(0);
  const flow = getFlow(test.id);
  const protocol = getTestProtocol(test.id as TestType);
  const isSprintScan = ["sprint_20m", "sprint_30m", "flying_sprint"].includes(test.id);
  const recordingOrientation = requiredRecordingOrientation(test.id as TestType);
  const [fileName, setFileName] = useState<string | null>(flow.fileName);
  const [selectedFile, setSelectedFile] = useState<File | null>(flow.file);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(flow.file ? "done" : "idle");
  const [sessionProtected, setSessionProtected] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [selectedFile]);

  async function onFile(file: File, detectedFps?: number | null) {
    const selectionToken = ++selectionTokenRef.current;
    setFileName(file.name);
    setSelectedFile(file);
    setStatus("preparing");
    setSessionProtected(null);
    // Dla pliku z galerii nie dziedziczymy domyślnego/starego FPS sprintu.
    // Pipeline zmierzy go z timestampów klatek albo oznaczy źródło jako niewiarygodne.
    const fps = detectedFps === undefined && isSprintScan ? null : (detectedFps ?? flow.fps);
    // Film pozostaje wyłącznie w pamięci bieżącej sesji. Do Supabase zapisuje
    // się później wynik pomiaru, nigdy automatycznie plik wideo.
    updateFlow(test.id, {
      file,
      fileName: file.name,
      videoUrl: null,
      uploaded: false,
      fps,
    });
    // Plik jest już gotowy w pamięci i może od razu przejść do analizy.
    // Lokalna kopia bezpieczeństwa nie może blokować interfejsu na iOS.
    setStatus("done");
    // Kopia pozostaje wyłącznie na tym urządzeniu. Chroni retry przed utratą
    // File po przeładowaniu Lovable Preview lub odzyskaniu karty przez iOS.
    // Najpierw usuń poprzedni film tego testu. Jeśli zapis nowego przekroczy
    // limit pamięci, reload nie może przywrócić starszego, niewłaściwego pliku.
    void (async () => {
      await clearVisionSessionVideo(test.id);
      const protectedLocally = await saveVisionSessionVideo(test.id, file);
      if (selectionTokenRef.current !== selectionToken) return;
      setSessionProtected(protectedLocally);
    })();
  }

  async function submitForAnalysis() {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    setSubmitting(true);
    // Realna analiza klatka po klatce uruchamia się na urządzeniu zawodnika.
    navigate({ to: "/vision-lab/analyze/$testId", params: { testId: test.id } });
  }

  async function onCameraRecorded(file: File, detectedFps: number | null) {
    await onFile(file, detectedFps);
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    setSubmitting(true);
    navigate({ to: "/vision-lab/analyze/$testId", params: { testId: test.id } });
  }

  return (
    <div className="pb-28">
      <VisionHeader
        title="Nagraj test"
        subtitle={`${test.name} · kamera BallWise`}
        backTo="/vision-lab"
      />

      <div className="space-y-4 px-5">
        <VisionRecorder
          minimumFps={protocol.minimumFps}
          testType={test.id as TestType}
          buttonLabel={selectedFile ? "Nagraj ponownie" : "Nagraj test w BallWise"}
          onRecorded={onCameraRecorded}
        />

        {previewUrl && (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <video
              key={previewUrl}
              src={previewUrl}
              controls
              muted
              playsInline
              preload="metadata"
              className="aspect-video w-full bg-black object-contain"
            />
            <div className="flex items-center gap-3 px-4 py-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  status === "done"
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-blue-500/10 text-blue-600"
                }`}
              >
                {status === "done" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin" />
                )}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  {status === "done" ? "Nagranie gotowe" : "Przygotowywanie nagrania…"}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {sessionProtected === false
                    ? "Gotowe w tej karcie — nie odświeżaj przed analizą"
                    : fileName}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> albo wybierz gotowy film{" "}
          <span className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left active:scale-[0.99]"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-brand">
            <FolderOpen className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-foreground">Wybierz film z galerii</div>
            <div className="mt-1 text-xs text-muted-foreground">Opcja zapasowa · MP4 / MOV</div>
          </div>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.currentTarget.value = "";
          }}
        />

        <p className="rounded-2xl bg-accent px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          Film nie jest wysyłany do chmury. Analiza klatek odbywa się na tym urządzeniu; do konta
          zapisuje się wyłącznie wynik pomiaru i informacje o jakości nagrania.
        </p>

        <div className="soft-card space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Info className="h-4 w-4 text-brand" />
            Jak nagrać ten test
          </div>
          <ul className="space-y-1.5 text-xs leading-relaxed text-foreground">
            {(protocol.recordingInstructions ?? []).map((tip, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-brand">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 text-[11px] font-medium text-muted-foreground">
            <span className="rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand">
              Telefon: {recordingOrientation === "landscape" ? "poziomo" : "pionowo"}
            </span>
            <span className="rounded-full bg-accent px-2 py-0.5">
              Jakość aparatu dobierana i sprawdzana automatycznie
            </span>
            <span className="rounded-full bg-accent px-2 py-0.5">
              Zapas: {protocol.leadingMarginSeconds ?? 2}s / {protocol.trailingMarginSeconds ?? 2}s
            </span>
            <span className="rounded-full bg-accent px-2 py-0.5">
              Kamera: {protocol.requiredCameraSetup}
            </span>
          </div>
        </div>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-5 py-3 backdrop-blur"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
      >
        <div className="mx-auto w-full max-w-[30rem]">
          <Button
            className="w-full"
            size="lg"
            disabled={status !== "done" || submitting}
            onClick={submitForAnalysis}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Otwieranie analizy…
              </>
            ) : (
              "Analizuj próbę"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
