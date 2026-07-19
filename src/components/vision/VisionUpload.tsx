import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { UploadCloud, FileVideo, CheckCircle2, Loader2, Info } from "lucide-react";
import { VisionHeader } from "./visionUi";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/loadwise/auth";
import type { VisionTest } from "@/lib/vision/types";
import { getFlow, updateFlow } from "@/lib/vision/visionFlow";
import { uploadVisionVideo } from "@/lib/vision/visionRepo";
import { getTestProtocol } from "@/features/vision-analysis/testProtocols";
import type { TestType } from "@/features/vision-analysis/types";

type Status = "idle" | "selected" | "uploading" | "done";

export function VisionUpload({ test }: { test: VisionTest }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const flow = getFlow(test.id);
  const protocol = getTestProtocol(test.id as TestType);
  const [fileName, setFileName] = useState<string | null>(flow.fileName);
  const [status, setStatus] = useState<Status>(flow.videoUrl ? "done" : "idle");
  const [uploaded, setUploaded] = useState(flow.uploaded);
  const [submitting, setSubmitting] = useState(false);

  async function onFile(file: File) {
    setFileName(file.name);
    setStatus("uploading");
    const res = user
      ? await uploadVisionVideo(user.id, test.id, file)
      : { url: `placeholder://${test.id}/${file.name}`, uploaded: false };
    updateFlow(test.id, {
      file,
      fileName: file.name,
      videoUrl: res.url,
      uploaded: res.uploaded,
    });
    setUploaded(res.uploaded);
    setStatus("done");
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

  return (
    <div className="pb-28">
      <VisionHeader
        title="Wgraj film"
        subtitle={`${test.name} · tryb: upload`}
        backTo="/vision-lab"
      />

      <div className="space-y-4 px-5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border bg-card p-8 text-center active:scale-[0.99]"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-brand">
            <UploadCloud className="h-7 w-7" />
          </span>
          <div>
            <div className="text-sm font-semibold text-foreground">
              Dotknij, aby wybrać film
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              MP4 / MOV · zalecane {test.recommendedFps} FPS
            </div>
          </div>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />

        {fileName && (
          <div className="soft-card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-brand">
              <FileVideo className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{fileName}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                {status === "uploading" && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Wgrywanie…
                  </span>
                )}
                {status === "done" && (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {uploaded ? "Wgrano do chmury" : "Zapisano lokalnie (placeholder)"}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

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
            <span className="rounded-full bg-accent px-2 py-0.5">
              Zalecane {protocol.preferredFps} FPS (min. {protocol.minimumFps})
            </span>
            <span className="rounded-full bg-accent px-2 py-0.5">
              Zapas: {protocol.leadingMarginSeconds ?? 2}s / {protocol.trailingMarginSeconds ?? 2}s
            </span>
            <span className="rounded-full bg-accent px-2 py-0.5">Kamera: {protocol.requiredCameraSetup}</span>
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Wysyłanie…
              </>
            ) : (
              "Wyślij film do analizy"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
