import { useState } from "react";
import { Flag, Clock3, Gauge, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import type { SessionDay } from "@/lib/loadwise/types";
import { useLoadwise } from "@/lib/loadwise/store";
import { parseCompletionNotes } from "@/lib/loadwise/sessionPresentation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/loadwise/auth";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import { trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import { measuredSessionMinutes } from "@/lib/loadwise/sessionExecution";
import { readPendingTrainingWrites } from "@/lib/loadwise/offlineTrainingQueue";
import { professionalSessionTitle } from "@/lib/loadwise/labels";
import {
  ACTIVITY_TAGS,
  ACTIVITY_TAG_LABELS,
  MATCH_MINUTES_MAX,
  activityTypeFromTags,
  clubDuration,
  effectiveActivityTags,
  normalizeActivityTags,
  isValidMatchMinutes,
} from "@/lib/loadwise/sessionFeedback";
import type { ActivityTag } from "@/lib/loadwise/types";

export function MatchStartPanel({ session, isToday }: { session: SessionDay; isToday: boolean }) {
  const { state, startSession } = useLoadwise();
  const existing = session.dbId ? state.completions[session.dbId] : undefined;
  const [starting, setStarting] = useState(false);

  if (!session.dbId || session.dayType !== "match" || existing?.completed) return null;

  if (!isToday && existing?.status !== "started") {
    return (
      <div className="soft-card p-4">
        <h3 className="text-sm font-semibold">Zaplanowany mecz</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Przycisk rozpoczęcia będzie dostępny w dniu meczu.
        </p>
      </div>
    );
  }

  if (existing?.status === "started") {
    return (
      <div className="soft-card border-primary/30 p-4">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Mecz rozpoczęty</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Po ostatnim gwizdku uzupełnij wynik obciążenia poniżej.
        </p>
      </div>
    );
  }

  async function start() {
    setStarting(true);
    try {
      await startSession(session);
      toast.success("Mecz rozpoczęty. Powodzenia!");
    } catch {
      toast.error("Nie udało się rozpocząć meczu. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="soft-card p-4">
      <h3 className="text-sm font-semibold">Gotowy do meczu?</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Start zapisze godzinę rozpoczęcia. Dane po meczu uzupełnisz po zakończeniu.
      </p>
      <Button className="mt-3 w-full" size="lg" disabled={starting} onClick={() => void start()}>
        <Flag className="mr-2 h-4 w-4" />
        {starting ? "Rozpoczynanie…" : "Rozpocznij mecz"}
      </Button>
    </div>
  );
}

type CompletionProps = { session: SessionDay; onSaved?: () => void; suggestedDurationMin?: number };
export function CompletionPanel(props: CompletionProps) {
  return <CompletionContent key={props.session.dbId ?? props.session.date} {...props} />;
}
function CompletionContent({ session, onSaved, suggestedDurationMin }: CompletionProps) {
  const { state, completeSession } = useLoadwise();
  const { user } = useAuth();
  const existing = session.dbId ? state.completions[session.dbId] : undefined;
  const activity = session.dbId ? state.runningActivities?.[session.dbId] : undefined;
  const consent = state.profile?.healthPersonalizationEnabled === true;
  const parsed = parseCompletionNotes(existing?.notes ?? "");
  const initialMinutes =
    existing?.durationMin ??
    (suggestedDurationMin == null ? null : Math.max(1, Math.round(suggestedDurationMin))) ??
    (activity ? Math.max(1, Math.round(activity.durationSec / 60)) : null) ??
    measuredSessionMinutes(existing);
  const draft = useTrainingLocalState(
    trainingStorageKey("finish", user?.id, session.dbId ?? session.date),
    {
      rpe: existing?.rpe ?? null,
      minutes: initialMinutes == null ? "" : String(initialMinutes),
      later: false,
      tags: effectiveActivityTags(existing ?? {}) as ActivityTag[],
      matchMinutes: existing?.matchMinutesPlayed == null ? "" : String(existing.matchMinutesPlayed),
    },
    parseFinishDraft,
  );
  const [notes, setNotes] = useState(parsed.notes);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  const isClub = session.dayType === "club",
    isMatch = session.dayType === "match";
  const minutes = Number(draft.value.minutes),
    rpe = draft.value.rpe;
  const matchMinutes =
    draft.value.matchMinutes.trim() === "" ? null : Number(draft.value.matchMinutes);
  // Club time is an explicit product default (90 min) and a match is described by the minutes
  // actually played, so neither asks for the whole-session time.
  const timeless = isClub || isMatch;
  const minutesOk = timeless || (Number.isInteger(minutes) && minutes >= 1 && minutes <= 300);
  const matchOk = !isMatch || isValidMatchMinutes(matchMinutes);
  const valid = minutesOk && matchOk && (rpe !== null || draft.value.later);
  if (!session.dbId) return null;
  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const tags = draft.value.tags;
      await completeSession(session, rpe, consent ? notes.trim() : "", {
        ...(isClub
          ? clubDuration(existing)
          : isMatch
            ? {}
            : { durationMin: minutes, durationSource: existing?.durationSource ?? "user" }),
        ...(isClub || isMatch
          ? { activityTags: tags, activityType: activityTypeFromTags(tags) }
          : {}),
        ...(isMatch ? { matchMinutesPlayed: matchMinutes } : {}),
      });
      const pending =
        user &&
        readPendingTrainingWrites(user.id).some(
          (w) => "session_id" in w.payload && w.payload.session_id === session.dbId,
        );
      toast.success(
        pending
          ? "Zapisano na urządzeniu. Synchronizacja po połączeniu."
          : existing?.completed
            ? "Wpis został zaktualizowany."
            : "Trening zapisany w historii.",
      );
      draft.clear();
      onSaved?.();
    } catch {
      setError("Nie udało się zapisać. Twoje odpowiedzi pozostały w formularzu.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      id={`session-completion-${session.dbId}`}
      className="bw-finish-form"
      aria-label="Podsumowanie treningu"
    >
      <p className="bw-session-eyebrow">
        {existing?.completed ? "Zapisany trening" : "Podsumowanie"}
      </p>
      <h2>{professionalSessionTitle(session.title)}</h2>
      {activity && (
        <p className="bw-session-muted">
          Bieg: {Math.round(activity.durationSec / 60)} min ·{" "}
          {(activity.distanceM / 1000).toLocaleString("pl-PL", { maximumFractionDigits: 2 })} km
        </p>
      )}
      {!timeless && (
        <>
          <label className="bw-finish-duration">
            <span>Czas całej sesji</span>
            <span>
              <Input
                aria-label="Czas całej sesji w minutach"
                type="number"
                inputMode="numeric"
                min={1}
                max={300}
                value={draft.value.minutes}
                onChange={(e) => draft.setValue((v) => ({ ...v, minutes: e.target.value }))}
              />{" "}
              min
            </span>
          </label>
          <p className="bw-session-muted">
            Uwzględnij rozgrzewkę i przerwy. Plan: {session.durationMin} min.
          </p>
        </>
      )}
      {isMatch && (
        <label className="bw-finish-duration">
          <span>Ile minut zagrałeś?</span>
          <span>
            <Input
              aria-label="Rozegrane minuty meczu"
              type="number"
              inputMode="numeric"
              min={0}
              max={MATCH_MINUTES_MAX}
              value={draft.value.matchMinutes}
              onChange={(e) => draft.setValue((v) => ({ ...v, matchMinutes: e.target.value }))}
            />{" "}
            min
          </span>
        </label>
      )}
      <fieldset className="bw-rpe-field">
        <legend>Jak ciężki był trening?</legend>
        <p className="bw-session-muted">1 — bardzo lekko · 10 — maksymalnie ciężko</p>
        <div className="bw-rpe-options">
          {Array.from({ length: existing?.rpe === 0 ? 11 : 10 }, (_, i) =>
            existing?.rpe === 0 ? i : i + 1,
          ).map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`RPE ${n}`}
              aria-pressed={rpe === n}
              onClick={() => draft.setValue((v) => ({ ...v, rpe: n, later: false }))}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="bw-text-button"
          aria-pressed={draft.value.later}
          onClick={() => draft.setValue((v) => ({ ...v, rpe: null, later: !v.later }))}
        >
          {draft.value.later ? "RPE uzupełnię później ✓" : "Uzupełnię RPE później"}
        </button>
      </fieldset>
      {isClub && (
        <fieldset className="bw-rpe-field">
          <legend>Charakter treningu</legend>
          <p className="bw-session-muted">Możesz wybrać kilka. Bez wyboru — brak odpowiedzi.</p>
          <div className="bw-rpe-options">
            {ACTIVITY_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={draft.value.tags.includes(tag)}
                onClick={() =>
                  draft.setValue((v) => ({
                    ...v,
                    tags: v.tags.includes(tag)
                      ? v.tags.filter((t) => t !== tag)
                      : ACTIVITY_TAGS.filter((t) => t === tag || v.tags.includes(t)),
                  }))
                }
              >
                {ACTIVITY_TAG_LABELS[tag]}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {consent && (
        <details className="bw-session-extra">
          <summary>Dodatkowe informacje</summary>
          {consent && (
            <>
              <label className="block text-sm">
                Notatki po sesji
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </label>
            </>
          )}
        </details>
      )}
      {error && (
        <p role="alert" className="bw-training-error">
          {error}
        </p>
      )}
      {!valid && (
        <p className="bw-session-muted">
          Podaj rzeczywisty czas i wybierz RPE lub odłóż jego uzupełnienie.
        </p>
      )}
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !valid}
        className="bw-session-primary"
      >
        {saving ? "Zapisywanie…" : existing?.completed ? "Zaktualizuj wpis" : "Zapisz trening"}
      </button>
    </section>
  );
}
type FinishDraft = {
  rpe: number | null;
  minutes: string;
  later: boolean;
  tags: ActivityTag[];
  matchMinutes: string;
};
function parseFinishDraft(value: unknown): FinishDraft | undefined {
  if (!value || typeof value !== "object") return;
  const v = value as Record<string, unknown>;
  if (
    typeof v.minutes !== "string" ||
    v.minutes.length > 4 ||
    typeof v.later !== "boolean" ||
    !(
      v.rpe === null ||
      (typeof v.rpe === "number" && Number.isInteger(v.rpe) && v.rpe >= 0 && v.rpe <= 10)
    )
  )
    return;
  const tags = normalizeActivityTags(v.tags) ?? [];
  const matchMinutes =
    typeof v.matchMinutes === "string" && v.matchMinutes.length <= 3 ? v.matchMinutes : "";
  return { rpe: v.rpe as number | null, minutes: v.minutes, later: v.later, tags, matchMinutes };
}

export function ClubMonitoring({ session }: { session?: SessionDay }) {
  const { state } = useLoadwise();
  return (
    <details className="soft-card bw-club-summary" aria-label="Podsumowanie treningu klubowego">
      <summary>Po treningu: czas i RPE</summary>
      <h2>Twoja sesja</h2>
      <p>Zrób trening zgodnie z planem drużyny. Po zakończeniu zapisz wykonanie poniżej.</p>
      {session && (
        <dl>
          <div>
            <dt>Planowany czas</dt>
            <dd>{session.durationMin} min</dd>
          </div>
          <div>
            <dt>Rodzaj</dt>
            <dd>Trening z drużyną</dd>
          </div>
        </dl>
      )}
      <h2>Po treningu</h2>
      <ul>
        <li>
          <Clock3 aria-hidden="true" /> Rzeczywisty czas trwania
        </li>
        <li>
          <Gauge aria-hidden="true" /> Odczucie wysiłku · RPE
        </li>
        <li>
          <NotebookPen aria-hidden="true" /> Notatka · opcjonalnie
        </li>
      </ul>
      {state.profile?.healthPersonalizationEnabled === true && (
        <p className="mt-3">Ból i zmęczenie możesz zaznaczyć w zapisie wykonania.</p>
      )}
    </details>
  );
}
