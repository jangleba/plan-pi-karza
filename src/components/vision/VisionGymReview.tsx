import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  UploadCloud,
  FileVideo,
  Loader2,
  Info,
  Dumbbell,
  CheckCircle2,
} from "lucide-react";
import { VisionHeader } from "./visionUi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/loadwise/auth";
import { getSelectedGymExercise } from "@/lib/vision/gymFlow";
import { uploadVisionVideo, saveGymReview } from "@/lib/vision/visionRepo";
import {
  GYM_TECHNIQUE_MESSAGE,
  type TechniqueReview,
  type GymTechniqueSignal,
} from "@/lib/vision/types";

const TEXT_FIELDS: { key: keyof TechniqueReview; label: string }[] = [
  { key: "trunk_position", label: "Pozycja tułowia" },
  { key: "knee_control", label: "Kontrola kolana" },
  { key: "hip_control", label: "Kontrola biodra" },
  { key: "foot_position", label: "Ustawienie stopy" },
  { key: "range_of_motion", label: "Zakres ruchu" },
  { key: "tempo_control", label: "Tempo ruchu" },
  { key: "stability", label: "Stabilność" },
];

const SIGNALS: { value: GymTechniqueSignal; label: string }[] = [
  { value: "good_execution", label: "Dobre wykonanie" },
  { value: "technique_issue", label: "Problem techniczny" },
  { value: "invalid_execution", label: "Nieprawidłowe wykonanie" },
];

export function VisionGymReview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const exercise = getSelectedGymExercise();

  const [fileName, setFileName] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [review, setReview] = useState<TechniqueReview>({});
  const [signal, setSignal] = useState<GymTechniqueSignal>("good_execution");
  const [requestCoach, setRequestCoach] = useState(false);
  const [invalidVideo, setInvalidVideo] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!exercise) {
    return (
      <div className="pb-16">
        <VisionHeader title="Analiza ćwiczenia" backTo="/vision-lab" />
        <div className="px-5">
          <div className="soft-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Nie wybrano ćwiczenia z planu.
            </p>
            <Button
              className="mt-4"
              onClick={() => navigate({ to: "/vision-lab/gym" })}
            >
              Wybierz ćwiczenie
            </Button>
          </div>
        </div>
      </div>
    );
  }

  async function onFile(file: File) {
    if (!exercise) return;
    setFileName(file.name);
    setUploading(true);
    const res = user
      ? await uploadVisionVideo(user.id, "gym", file)
      : { url: `placeholder://gym/${file.name}`, uploaded: false };
    setVideoUrl(res.url);
    setUploaded(res.uploaded);
    setUploading(false);
  }

  function setField(key: keyof TechniqueReview, value: string) {
    setReview((r) => ({ ...r, [key]: value }));
  }

  async function save() {
    if (!user) {
      toast.error("Musisz być zalogowany, aby zapisać analizę.");
      return;
    }
    if (!exercise) return;
    setSaving(true);
    try {
      const saved = await saveGymReview({
        userId: user.id,
        exerciseKey: exercise.key,
        exerciseName: exercise.exerciseName,
        trainingDayLabel: exercise.trainingDayLabel,
        exerciseCategory: exercise.category,
        planDate: exercise.date,
        videoUrl,
        videoUploaded: uploaded,
        captureMode: "upload",
        reviewMode: requestCoach ? "coach_review" : "self_review",
        techniqueReview: { ...review, signal },
        requestCoach,
        invalidVideo,
      });
      toast.success("Zapisano analizę techniki.");
      navigate({ to: "/vision-lab/result/$resultId", params: { resultId: saved.id } });
    } catch {
      toast.error("Nie udało się zapisać analizy.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-28">
      <VisionHeader
        title={exercise.exerciseName}
        subtitle={`${exercise.trainingDayLabel} · ${exercise.sessionTitle}`}
        backTo="/vision-lab/gym"
      />

      <div className="space-y-4 px-5">
        {/* Uczciwy komunikat o braku AI */}
        <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-[11px] leading-snug text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{GYM_TECHNIQUE_MESSAGE}</span>
        </div>

        <div className="soft-card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-brand">
            <Dumbbell className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">
              {exercise.exerciseName}
            </div>
            <div className="text-xs text-muted-foreground">
              {exercise.category}
              {exercise.prescription ? ` · ${exercise.prescription}` : ""}
            </div>
          </div>
        </div>

        {/* Upload */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-border bg-card p-6 text-center active:scale-[0.99]"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-brand">
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : uploaded || videoUrl ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            ) : (
              <UploadCloud className="h-6 w-6" />
            )}
          </span>
          <div className="text-sm font-semibold text-foreground">
            {fileName ? "Zmień film" : "Załącz film ćwiczenia"}
          </div>
          <div className="text-xs text-muted-foreground">MP4 / MOV · opcjonalnie</div>
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
          <div className="soft-card flex items-center gap-3 p-3 text-sm">
            <FileVideo className="h-5 w-5 shrink-0 text-brand" />
            <span className="truncate text-foreground">{fileName}</span>
          </div>
        )}

        {/* Formularz oceny techniki */}
        <div className="soft-card space-y-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">Ocena techniki</h2>
          {TEXT_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              <Input
                value={(review[f.key] as string) ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder="Opis / ocena"
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Główny błąd techniczny
            </Label>
            <Textarea
              value={review.main_issue ?? ""}
              onChange={(e) => setField("main_issue", e.target.value)}
              placeholder="Największy problem w wykonaniu"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Jedna wskazówka do poprawy
            </Label>
            <Textarea
              value={review.coaching_cue ?? ""}
              onChange={(e) => setField("coaching_cue", e.target.value)}
              placeholder="Konkretna wskazówka"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notatka trenera</Label>
            <Textarea
              value={review.coach_note ?? ""}
              onChange={(e) => setField("coach_note", e.target.value)}
              placeholder="Opcjonalna notatka"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Ocena wykonania</Label>
            <Select
              value={signal}
              onValueChange={(v) => setSignal(v as GymTechniqueSignal)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIGNALS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Opcje */}
        <div className="soft-card space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-foreground">
                Poproś o Coach Review
              </div>
              <p className="text-xs text-muted-foreground">
                Trener zweryfikuje technikę na podstawie nagrania.
              </p>
            </div>
            <Switch checked={requestCoach} onCheckedChange={setRequestCoach} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-foreground">
                Oznacz jako Invalid Video
              </div>
              <p className="text-xs text-muted-foreground">
                Nagranie nie nadaje się do analizy.
              </p>
            </div>
            <Switch checked={invalidVideo} onCheckedChange={setInvalidVideo} />
          </div>
        </div>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-5 py-3 backdrop-blur"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
      >
        <div className="mx-auto w-full max-w-[30rem]">
          <Button className="w-full" size="lg" disabled={saving} onClick={save}>
            {saving ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Zapisywanie…
              </>
            ) : (
              "Zapisz analizę techniki"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
