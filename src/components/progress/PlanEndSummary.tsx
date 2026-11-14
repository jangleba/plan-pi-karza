import { useMemo, useState } from "react";
import type { PlanSummary } from "@/lib/loadwise/planSummary";
import {
  BARRIER_LABELS,
  DAY_LABELS,
  MINUTE_STEPS,
  draftNextPlan,
  emptyAnswers,
  ownedEquipment,
  type Barrier,
  type InterviewAnswers,
  type NextPlanDraft,
  type NoteTopic,
} from "@/lib/loadwise/nextPlanInterview";
import { GOAL_LABELS } from "@/lib/loadwise/labels";
import type { Goal, Profile } from "@/lib/loadwise/types";

const GOALS = Object.keys(GOAL_LABELS) as Goal[];
const BARRIERS = Object.keys(BARRIER_LABELS) as Barrier[];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))}.${iso.slice(5, 7)}`;

function SummaryBody({ summary }: { summary: PlanSummary }) {
  const { own, club, targets, credits } = summary;
  return (
    <div className="space-y-3 text-sm">
      <p>
        Własne sesje: wykonane <strong>{own.done}</strong> z {own.planned}
        {own.missed > 0 ? `, pominięte ${own.missed}` : ""}.
      </p>
      <ul className="space-y-1">
        {targets
          .filter((t) => t.planned + t.external + t.notPlanned > 0)
          .map((t) => (
            <li key={t.target}>
              <strong>{t.label}:</strong> wykonane {t.done}/{t.planned}
              {t.missed ? ` · pominięte ${t.missed}` : ""}
              {t.external ? ` · zgłoszone z klubu ${t.external}` : ""}
              {t.notPlanned
                ? ` · nie zaplanowano (kalendarz, sprzęt lub czas) ${t.notPlanned}`
                : ""}
            </li>
          ))}
      </ul>
      {(club.sessions > 0 || club.matches > 0) && (
        <p>
          Klub i mecze: treningi {club.completed}/{club.sessions}
          {club.matches > 0
            ? `, mecze ${club.matchesCompleted}/${club.matches}${club.matchMinutesPlayed ? ` (${club.matchMinutesPlayed} min gry)` : ""}`
            : ""}
          {club.loadAu > 0 ? `. Szacowane obciążenie ≈ ${club.loadAu} j.` : ""}
          {club.loadUsesAssumedMinutes ? " (czas treningów klubowych przyjęty jako 90 min)" : ""}
          {club.withoutLoad > 0
            ? `. Bez wyniku (brak RPE lub minut gry): ${club.withoutLoad}.`
            : ""}
        </p>
      )}
      {credits.length > 0 && (
        <p>
          Cele pokryte zgłoszoną pracą w klubie (nie jako wykonana sesja własna):{" "}
          {credits.map((c) => `${c.replacedTitle} (${shortDate(c.sourceDate)})`).join(", ")}.
        </p>
      )}
      {summary.comparable.map((line) => (
        <p key={line} className="text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  );
}

/**
 * End of a saved plan: summary, a three-step interview, the list of what changes and one
 * button that prepares a preview. Nothing is saved to the plan here.
 */
export function PlanEndSummary({
  summary,
  profile,
  currentMinutes,
  onPrepare,
}: {
  summary: PlanSummary;
  profile: Profile;
  currentMinutes: number;
  onPrepare: (draft: NextPlanDraft) => Promise<void>;
}) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [answers, setAnswers] = useState<InterviewAnswers>(emptyAnswers);
  const [stepNotes, setStepNotes] = useState<[string, string, string]>(["", "", ""]);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owned = useMemo(() => ownedEquipment(profile), [profile]);
  const merged: InterviewAnswers = {
    ...answers,
    notes: stepNotes.filter(Boolean).join(". "),
  };
  const everything = draftNextPlan(
    profile,
    currentMinutes,
    merged,
    new Set(["goal", "days", "minutes", "equipment", "gym", "fatigue"]),
  );
  const confirmed = new Set(
    everything.changes.filter((c) => overrides[c.id] ?? c.defaultConfirmed).map((c) => c.id),
  );
  const draft = draftNextPlan(profile, currentMinutes, merged, confirmed);
  const set = (patch: Partial<InterviewAnswers>) => setAnswers((a) => ({ ...a, ...patch }));
  const days = answers.days ?? profile.individualTrainingDays;
  const minutes = answers.minutes ?? currentMinutes;
  const noteBox = (index: 0 | 1 | 2, label: string) => (
    <label className="block text-xs text-muted-foreground">
      {label}
      <textarea
        className="mt-1 w-full rounded-lg border p-2 text-sm text-foreground"
        rows={2}
        value={stepNotes[index]}
        onChange={(e) =>
          setStepNotes((n) => n.map((v, i) => (i === index ? e.target.value : v)) as typeof n)
        }
      />
    </label>
  );
  async function prepare() {
    if (busy || draft.clarification) return;
    setBusy(true);
    setError(null);
    try {
      await onPrepare(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się przygotować podglądu.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="soft-card space-y-4 p-4" aria-label="Podsumowanie zakończonego planu">
      <header>
        <h2 className="text-base font-semibold">Podsumowanie planu</h2>
        <p className="text-xs text-muted-foreground">
          {shortDate(summary.startDate)}–{shortDate(summary.endDate)}
        </p>
      </header>
      <SummaryBody summary={summary} />
      {step === 0 ? (
        <button
          type="button"
          className="min-h-11 w-full rounded-xl bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => setStep(1)}
        >
          Przygotuj kolejny plan
        </button>
      ) : (
        <div className="space-y-3" role="group" aria-label={`Krok ${step} z 3`}>
          <p className="text-xs font-medium text-muted-foreground">Krok {step} z 3</p>
          {step === 1 && (
            <>
              <h3 className="text-sm font-semibold">Cel kolejnego planu</h3>
              <div className="flex flex-wrap gap-2">
                {GOALS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className="min-h-11 rounded-lg border px-3 text-sm"
                    aria-pressed={(answers.goal ?? profile.goal) === g}
                    onClick={() => set({ goal: g })}
                  >
                    {GOAL_LABELS[g]}
                    {g === profile.goal ? " (obecny)" : ""}
                  </button>
                ))}
              </div>
              {noteBox(0, "Uwagi do celu (opcjonalnie)")}
            </>
          )}
          {step === 2 && (
            <>
              <h3 className="text-sm font-semibold">Co utrudniało realizację?</h3>
              <div className="flex flex-wrap gap-2">
                {BARRIERS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    className="min-h-11 rounded-lg border px-3 text-sm"
                    aria-pressed={answers.barriers.includes(b)}
                    onClick={() =>
                      set({
                        barriers: answers.barriers.includes(b)
                          ? answers.barriers.filter((x) => x !== b)
                          : b === "none"
                            ? ["none"]
                            : [...answers.barriers.filter((x) => x !== "none"), b],
                      })
                    }
                  >
                    {BARRIER_LABELS[b]}
                  </button>
                ))}
              </div>
              {noteBox(1, "Uwagi (opcjonalnie)")}
            </>
          )}
          {step === 3 && (
            <>
              <h3 className="text-sm font-semibold">Dni, czas i sprzęt</h3>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Dni własnych treningów"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="min-h-11 min-w-11 rounded-lg border px-2 text-sm"
                    aria-pressed={days.includes(d)}
                    onClick={() => {
                      const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
                      if (next.length > 0) set({ days: next });
                    }}
                  >
                    {DAY_LABELS[d]}
                  </button>
                ))}
              </div>
              <label className="block text-sm">
                Czas na jednostkę
                <select
                  aria-label="Czas na jednostkę w kolejnym planie"
                  className="ml-2 rounded border p-1"
                  value={minutes}
                  onChange={(e) => set({ minutes: Number(e.target.value) })}
                >
                  {[...new Set<number>([...MINUTE_STEPS, currentMinutes])]
                    .sort((a, b) => a - b)
                    .map((m) => (
                      <option key={m} value={m}>
                        {m} minut
                      </option>
                    ))}
                </select>
              </label>
              {owned.length > 0 && (
                <fieldset className="text-sm">
                  <legend className="mb-1">Czego brakuje?</legend>
                  <div className="flex flex-wrap gap-2">
                    {owned.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className="min-h-11 rounded-lg border px-3"
                        aria-pressed={answers.unavailableEquipment.includes(e.id)}
                        onClick={() =>
                          set({
                            unavailableEquipment: answers.unavailableEquipment.includes(e.id)
                              ? answers.unavailableEquipment.filter((x) => x !== e.id)
                              : [...answers.unavailableEquipment, e.id],
                          })
                        }
                      >
                        {e.displayName}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              {noteBox(2, "Uwagi o dniach, czasie lub sprzęcie (opcjonalnie)")}
            </>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg border px-4"
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2) : 0))}
            >
              Wstecz
            </button>
            {step < 3 && (
              <button
                type="button"
                className="min-h-11 rounded-lg bg-primary px-4 text-primary-foreground"
                onClick={() => setStep((s) => (s + 1) as 2 | 3)}
              >
                Dalej
              </button>
            )}
          </div>
          {step === 3 && (
            <div className="space-y-3 border-t pt-3">
              <h3 className="text-sm font-semibold">Co zmieniamy w kolejnym planie</h3>
              {draft.changes.length === 0 ? (
                <p className="text-sm">Bez zmian ustawień. Plan będzie kontynuował bieżący cykl.</p>
              ) : (
                <ul className="space-y-2">
                  {everything.changes.map((c) => (
                    <li key={c.id}>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={confirmed.has(c.id)}
                          onChange={(e) =>
                            setOverrides((o) => ({ ...o, [c.id]: e.target.checked }))
                          }
                        />
                        <span>{c.text}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {draft.notes.map((n) => (
                <p key={n} className="text-xs text-muted-foreground">
                  {n}
                </p>
              ))}
              {draft.clarification && (
                <fieldset className="text-sm" aria-label="Doprecyzowanie">
                  <legend className="mb-1 font-medium">{draft.clarification.question}</legend>
                  <div className="flex flex-wrap gap-2">
                    {draft.clarification.options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="min-h-11 rounded-lg border px-3"
                        onClick={() => set({ noteTopic: o.id as NoteTopic })}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              <p className="text-xs text-muted-foreground">
                Uwagi nie są zapisywane. Zapisujemy tylko potwierdzone zmiany powyżej, a plan
                zapiszesz dopiero po obejrzeniu podglądu.
              </p>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="min-h-11 w-full rounded-xl bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60"
                disabled={busy || !!draft.clarification}
                onClick={() => void prepare()}
              >
                {busy ? "Przygotowywanie…" : "Przygotuj podgląd planu"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
