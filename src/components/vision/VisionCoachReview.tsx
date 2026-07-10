import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Calculator,
  MessageSquarePlus,
  PencilRuler,
  Info,
} from "lucide-react";
import { VisionHeader, ConfidenceBadge, ReviewStatusBadge } from "./visionUi";
import { VisionCalculationBasis } from "./VisionCalculationBasis";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/loadwise/auth";
import {
  getVisionResult,
  isCoach,
  coachVerify,
  coachInvalidate,
  coachAddFeedback,
  coachCorrectFrames,
  coachManualOverride,
} from "@/lib/vision/visionRepo";
import { getVisionTest } from "@/lib/vision/visionTests";
import { recomputeMainValue } from "@/lib/vision/visionCalc";
import {
  COACH_REVIEW_DISCLAIMER,
  INVALID_REASON_LABELS,
  type CoachFrames,
  type VisionTestResult,
} from "@/lib/vision/types";

const FRAME_FIELDS: { key: keyof CoachFrames; label: string }[] = [
  { key: "start_frame", label: "start_frame" },
  { key: "end_frame", label: "end_frame" },
  { key: "takeoff_frame", label: "takeoff_frame" },
  { key: "landing_frame", label: "landing_frame" },
  { key: "first_contact_frame", label: "first_contact_frame" },
  { key: "last_contact_frame", label: "last_contact_frame" },
  { key: "finish_frame", label: "finish_frame" },
];

export function VisionCoachReview({ resultId }: { resultId: string }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [coach, setCoach] = useState<boolean | null>(null);
  const [result, setResult] = useState<VisionTestResult | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading || !user) return;
    isCoach(user.id).then(async (c) => {
      setCoach(c);
      if (c) {
        try {
          setResult(await getVisionResult(resultId));
        } catch {
          setResult(null);
        }
      }
      setBusy(false);
    });
  }, [user, loading, resultId]);

  if (busy || coach === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ładowanie…
      </div>
    );
  }

  if (!coach) {
    return (
      <div>
        <VisionHeader title="Coach Review" backTo="/vision-lab/coach" />
        <p className="px-5 text-sm text-muted-foreground">
          Sekcja dostępna tylko dla trenerów.
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div>
        <VisionHeader title="Coach Review" backTo="/vision-lab/coach" />
        <p className="px-5 text-sm text-muted-foreground">Nie znaleziono testu.</p>
      </div>
    );
  }

  return (
    <ReviewBody
      result={result}
      coachId={user!.id}
      onUpdated={(r) => setResult(r)}
      onDone={() => navigate({ to: "/vision-lab/coach" })}
    />
  );
}

function ReviewBody({
  result,
  coachId,
  onUpdated,
  onDone,
}: {
  result: VisionTestResult;
  coachId: string;
  onUpdated: (r: VisionTestResult) => void;
  onDone: () => void;
}) {
  const test = getVisionTest(result.testType);
  const [note, setNote] = useState(result.coachNote ?? "");
  const [saving, setSaving] = useState(false);

  // Coach feedback
  const [summary, setSummary] = useState(result.coachFeedback?.techniqueSummary ?? "");
  const [errors, setErrors] = useState((result.coachFeedback?.errors ?? []).join("\n"));
  const [recs, setRecs] = useState((result.coachFeedback?.recommendations ?? []).join("\n"));
  const [nextNote, setNextNote] = useState(result.coachFeedback?.nextSessionNote ?? "");

  // Frames
  const initialFrames =
    result.coachCorrectedFrames ?? (result.calculationBasis ? {} : {});
  const [frames, setFrames] = useState<CoachFrames>(initialFrames as CoachFrames);

  // Manual override
  const [overrideOn, setOverrideOn] = useState(false);
  const [overrideVal, setOverrideVal] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const recomputed = useMemo(() => {
    if (!test || result.fps == null) return null;
    return recomputeMainValue(test, result.fps, frames);
  }, [test, result.fps, frames]);

  async function run(fn: () => Promise<VisionTestResult>, ok: string) {
    setSaving(true);
    try {
      onUpdated(await fn());
      toast.success(ok);
    } catch {
      toast.error("Nie udało się zapisać.");
    } finally {
      setSaving(false);
    }
  }

  const flags = result.validityFlags;
  const flagRows: { label: string; ok: boolean }[] = [
    { label: "FPS OK", ok: flags.fpsOk },
    { label: "Oświetlenie", ok: flags.lightingOk },
    { label: "Kamera stabilna", ok: flags.cameraStable },
    { label: "Zawodnik w kadrze", ok: flags.athleteInFrame },
    { label: "Stopy widoczne", ok: flags.feetVisible },
    { label: "Linia widoczna", ok: flags.lineVisible },
    { label: "Kąt kamery", ok: flags.angleOk },
    { label: "Kontakt z podłożem", ok: flags.groundContactClear },
  ];

  return (
    <div className="space-y-4 pb-24">
      <VisionHeader
        title={result.testName}
        subtitle={`Zawodnik ${result.userId.slice(0, 8)}… · FPS ${result.fps ?? "—"}`}
        backTo="/vision-lab/coach"
      />

      <div className="space-y-4 px-5">
        <div className="soft-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <ReviewStatusBadge status={result.reviewStatus} />
            <ConfidenceBadge level={result.confidenceScore} />
          </div>
          <div className="mt-3 text-3xl font-bold text-foreground">
            {result.mainResultValue ?? "—"}
            <span className="ml-1 text-lg text-muted-foreground">{result.mainResultUnit}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Wynik AI. Zweryfikuj poprawność testu i technikę — nie zgaduj wartości.
          </p>
        </div>

        {result.videoUrl && !result.videoUrl.startsWith("placeholder://") && (
          <div className="soft-card p-4 text-xs text-muted-foreground">
            Film w archiwum: {result.videoUrl}
          </div>
        )}

        <VisionCalculationBasis basis={result.calculationBasis} />

        {/* Validity flags */}
        <div className="soft-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Flagi jakości nagrania</h2>
          <div className="grid grid-cols-2 gap-2">
            {flagRows.map((f) => (
              <div key={f.label} className="flex items-center gap-1.5 text-xs">
                {f.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                )}
                <span className="text-muted-foreground">{f.label}</span>
              </div>
            ))}
          </div>
          {flags.reasons.length > 0 && (
            <ul className="mt-2 space-y-1">
              {flags.reasons.map((r) => (
                <li key={r} className="text-[11px] text-amber-600">
                  • {INVALID_REASON_LABELS[r]}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* AI feedback */}
        <div className="soft-card p-4 text-sm">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Feedback AI</h2>
          <p className="text-muted-foreground">Dobre: {result.aiFeedback.good}</p>
          <p className="text-muted-foreground">Ogranicza: {result.aiFeedback.limitingFactor}</p>
          <p className="text-muted-foreground">Do poprawy: {result.aiFeedback.improve}</p>
        </div>

        {/* Manual Frame Correction */}
        <div className="soft-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <PencilRuler className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Manual Frame Correction</h2>
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Popraw kluczowe klatki — system przeliczy wynik automatycznie.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {FRAME_FIELDS.map((f) => (
              <div key={f.key}>
                <Label className="text-[11px]">{f.label}</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={frames[f.key] ?? ""}
                  onChange={(e) =>
                    setFrames((prev) => ({
                      ...prev,
                      [f.key]: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-secondary p-3 text-xs">
            <Calculator className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">
              Przeliczony wynik:{" "}
              <span className="font-semibold text-foreground">
                {recomputed != null ? `${recomputed} ${result.mainResultUnit ?? ""}` : "—"}
              </span>
            </span>
          </div>
          <Button
            className="mt-3 w-full"
            disabled={saving || recomputed == null}
            onClick={() =>
              run(
                () => coachCorrectFrames(result, coachId, frames, note || null),
                "Wynik przeliczony (Coach Corrected).",
              )
            }
          >
            Zapisz korektę klatek i przelicz
          </Button>
        </div>

        {/* Manual override */}
        <div className="soft-card p-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <input
              type="checkbox"
              checked={overrideOn}
              onChange={(e) => setOverrideOn(e.target.checked)}
            />
            Ręczna korekta wyniku (manual override)
          </label>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Używaj tylko wyjątkowo. Wymaga uzasadnienia.
          </p>
          {overrideOn && (
            <div className="mt-3 space-y-2">
              <Input
                type="number"
                placeholder={`Wynik (${result.mainResultUnit ?? ""})`}
                value={overrideVal}
                onChange={(e) => setOverrideVal(e.target.value)}
              />
              <Textarea
                placeholder="Uzasadnienie ręcznej korekty"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
              <Button
                variant="secondary"
                className="w-full"
                disabled={saving || overrideVal === "" || overrideReason.trim().length < 4}
                onClick={() =>
                  run(
                    () =>
                      coachManualOverride(
                        result.id,
                        coachId,
                        Number(overrideVal),
                        overrideReason.trim(),
                      ),
                    "Zapisano ręczną korektę.",
                  )
                }
              >
                Zapisz ręczną korektę
              </Button>
            </div>
          )}
        </div>

        {/* Coach feedback (technique) */}
        <div className="soft-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Analiza techniki</h2>
          </div>
          <div className="space-y-2">
            <Textarea
              placeholder="Ocena techniki ruchu"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            <Textarea
              placeholder="Błędy (jeden na linię, 1–3)"
              value={errors}
              onChange={(e) => setErrors(e.target.value)}
            />
            <Textarea
              placeholder="Zalecenia (jedno na linię)"
              value={recs}
              onChange={(e) => setRecs(e.target.value)}
            />
            <Textarea
              placeholder="Notatka na kolejny trening"
              value={nextNote}
              onChange={(e) => setNextNote(e.target.value)}
            />
          </div>
          <Button
            className="mt-3 w-full"
            disabled={saving || summary.trim().length < 3}
            onClick={() =>
              run(
                () =>
                  coachAddFeedback(
                    result.id,
                    coachId,
                    {
                      techniqueSummary: summary.trim(),
                      errors: errors.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 3),
                      recommendations: recs.split("\n").map((s) => s.trim()).filter(Boolean),
                      nextSessionNote: nextNote.trim() || undefined,
                    },
                    note || null,
                  ),
                "Dodano feedback trenera.",
              )
            }
          >
            Zapisz analizę techniki
          </Button>
        </div>

        {/* Coach note + verdict */}
        <div className="soft-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Notatka trenerska</h2>
          <Textarea
            placeholder="Krótka notatka trenera"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Button
              disabled={saving}
              onClick={() =>
                run(() => coachVerify(result.id, coachId, note || null), "Test zatwierdzony.")
              }
            >
              <CheckCircle2 className="mr-1 h-4 w-4" /> Coach Verified
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() =>
                run(
                  () => coachInvalidate(result.id, coachId, note || null),
                  "Oznaczono jako nieważny.",
                )
              }
            >
              <XCircle className="mr-1 h-4 w-4" /> Invalid by Coach
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{COACH_REVIEW_DISCLAIMER}</span>
        </div>

        <Button variant="outline" className="w-full" onClick={onDone}>
          Wróć do kolejki
        </Button>
      </div>
    </div>
  );
}
