import { useRef, useState } from "react";
import { Check, Clock3 } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useLoadwise } from "@/lib/loadwise/store";
import type { SessionDay } from "@/lib/loadwise/types";
import {
  prepareTodayTimeChoice,
  todayTimeChoiceModification,
  todayTimeChoiceSession,
  TODAY_TIME_CHOICE_REASON,
  type TodayTimeChoiceProposal,
} from "@/lib/loadwise/todaySessionTimeChoice";
import "./today-session-choice.css";

interface TodaySessionChoiceProps {
  plan: readonly SessionDay[];
  todayIso: string;
  onOpenPlan: () => void;
}
type Preview = TodayTimeChoiceProposal & { context: string };

/** A planning choice, independent of the optional health check-in. */
export function TodaySessionChoiceCard(props: TodaySessionChoiceProps) {
  return <TodaySessionChoiceEditor key={props.todayIso} {...props} />;
}

function TodaySessionChoiceEditor({ plan, todayIso, onOpenPlan }: TodaySessionChoiceProps) {
  const { state, applyModification, undoModification } = useLoadwise();
  const day = plan.find((item) => item.date === todayIso);
  const session = todayTimeChoiceSession(day, state.completions);
  const modifications = state.modifications[todayIso] ?? [];
  const ownChoice = todayTimeChoiceModification(modifications);
  const full = session?.engineV2?.sessionDurationMode === "full";
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(45);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  // A preview is valid only while its exact source plan and observed context stay current.
  const context = JSON.stringify([
    todayIso,
    plan,
    state.profile,
    state.completions,
    state.readiness[todayIso],
    modifications,
  ]);
  const latest = useRef(context);
  latest.current = context;
  if (!session || !day || !state.profile) return null;
  const blockedByOtherChange = modifications.length > 0 && !ownChoice;
  const canPreview = !blockedByOtherChange && !ownChoice && !!session.dbId && !!day.dayDbId;
  const choices = [20, 30, 45, 60, 75, 90, 120].filter((value) => value < session.durationMin);
  const showPreview = () => {
    if (!canPreview || !state.profile || !session.dbId) return;
    const result = prepareTodayTimeChoice({
      profile: state.profile,
      plan,
      completions: state.completions,
      readiness: state.readiness,
      date: todayIso,
      sessionId: session.dbId,
      minutes,
    });
    if ("error" in result) {
      setPreview(null);
      setError(result.error);
    } else {
      setPreview({ ...result.proposal, context });
      setError(null);
    }
  };
  async function apply() {
    if (!preview || !canPreview || flight.current) return;
    if (preview.context !== latest.current) {
      setPreview(null);
      setError("Plan zmienił się. Sprawdź wariant ponownie.");
      return;
    }
    flight.current = true;
    setBusy(true);
    setError(null);
    try {
      await applyModification(
        todayIso,
        "swap",
        preview.day,
        day!,
        `${TODAY_TIME_CHOICE_REASON} Świadomy limit na dziś: ${preview.minutes} min.`,
      );
      setOpen(false);
      setPreview(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się zapisać wariantu.");
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  async function restoreFull() {
    if (!ownChoice || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError(null);
    try {
      await undoModification(todayIso, ownChoice.id);
      setOpen(false);
      setPreview(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się przywrócić jednostki.");
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  const close = () => {
    if (flight.current) return;
    setOpen(false);
    setPreview(null);
    setError(null);
  };
  return (
    <section className="bw-today-choice" aria-label="Czas na dzisiejszy trening">
      <div className="bw-today-choice-row">
        <button
          type="button"
          className="bw-today-choice-current"
          aria-pressed={full}
          disabled={busy || (full && !ownChoice)}
          onClick={() => (ownChoice ? void restoreFull() : onOpenPlan())}
        >
          <span className="bw-today-choice-mark" aria-hidden="true">
            {full ? <Check size={16} /> : <Clock3 size={16} />}
          </span>
          <span>
            <strong>
              {full ? "Pełna sesja" : ownChoice ? "Limit czasu na dziś" : "Zapisana jednostka"}
            </strong>
            <small>
              {session.durationMin} min · {full ? "Zgodnie z planem" : "Według zapisanego planu"}
            </small>
          </span>
        </button>
        <button
          type="button"
          className="bw-today-choice-edit"
          disabled={busy}
          onClick={() => {
            setMinutes(choices.includes(45) ? 45 : (choices.at(-1) ?? 20));
            setPreview(null);
            setError(null);
            setOpen(true);
          }}
        >
          Zmień
        </button>
      </div>
      {error && !open ? <p role="alert">{error}</p> : null}
      <Drawer
        open={open}
        onOpenChange={(value) => {
          if (!value) close();
        }}
        initialDetent="large"
      >
        <DrawerContent aria-describedby={undefined} className="bw-today-choice-sheet">
          <DrawerTitle>Czas na trening</DrawerTitle>
          <div className="bw-today-choice-body" aria-busy={busy}>
            {ownChoice ? (
              <>
                <p>
                  Dzisiejsza jednostka ma Twój limit{" "}
                  {day.checkinTimeBudgetMin ?? session.checkinTimeBudgetMin} min.
                </p>
                <p>Aby wybrać inny czas, najpierw przywróć jednostkę sprzed zmiany.</p>
                <button type="button" disabled={busy} onClick={() => void restoreFull()}>
                  Przywróć jednostkę z planu
                </button>
              </>
            ) : blockedByOtherChange ? (
              <>
                <p>Ten dzień ma już zapisaną zmianę. Zarządzaj nią w planie.</p>
                <button type="button" onClick={onOpenPlan}>
                  Otwórz plan
                </button>
              </>
            ) : (
              <>
                <p>
                  Domyślnie wykonujesz całą jednostkę. Jeśli dziś masz mniej czasu, sprawdź wariant
                  przed zapisaniem.
                </p>
                <fieldset disabled={busy || !canPreview || !choices.length}>
                  <legend>Mam mniej czasu</legend>
                  <div className="bw-today-choice-times">
                    {choices.map((value) => (
                      <label key={value}>
                        <input
                          type="radio"
                          name="today-session-time"
                          value={value}
                          checked={minutes === value}
                          onChange={() => {
                            setMinutes(value);
                            setPreview(null);
                            setError(null);
                          }}
                        />
                        <span>{value} min</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {!canPreview ? (
                  <p>Najpierw zapisz aktualny plan.</p>
                ) : !choices.length ? (
                  <p>Ta jednostka jest już krótsza niż dostępne limity.</p>
                ) : (
                  <button type="button" disabled={busy} onClick={showPreview}>
                    Sprawdź wariant
                  </button>
                )}
                {preview ? (
                  <div className="bw-today-choice-preview" aria-label="Podgląd zmiany">
                    <h3>
                      {preview.beforeMinutes} → {preview.afterMinutes} min
                    </h3>
                    <p>Zmiana dotyczy tej jednostki dzisiaj.</p>
                    {preview.context !== context ? (
                      <p role="status">Plan zmienił się. Sprawdź wariant ponownie.</p>
                    ) : null}
                    {preview.changes.length ? (
                      <ul>
                        {preview.changes.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy || preview.context !== context}
                      onClick={() => void apply()}
                    >
                      {busy ? "Zapisywanie…" : "Zastosuj na dziś"}
                    </button>
                  </div>
                ) : null}
              </>
            )}
            {error ? <p role="alert">{error}</p> : null}
            <button
              type="button"
              className="bw-today-choice-cancel"
              disabled={busy}
              onClick={close}
            >
              Zostaw plan
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
