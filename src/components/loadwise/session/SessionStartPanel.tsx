import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useLoadwise } from "@/lib/loadwise/store";
import { planTimeBudget, sessionPlanUpdateReason } from "@/lib/loadwise/engineV2/planStatus";
import type { SessionDay } from "@/lib/loadwise/types";
import { isStrengthSession, type StrengthLoadPreference } from "@/lib/loadwise/strengthCheckIn";

export type StartAvailability =
  | "start"
  | "started"
  | "missed"
  | "other-day"
  /** The saved plan is out of date for a new start: show "Zaktualizuj plan", not Start. */
  | "update"
  | "none";
export const MISSED_SESSION_NOTE =
  "Sesja opuszczona. Nie przenosimy jej automatycznie na inny dzień. Plan ćwiczeń pozostaje do wglądu.";

/** An explicit start pins the selected prescription before exercise recording. */
export function useSessionStart(session: SessionDay, canStart: boolean) {
  const { state, startSession } = useLoadwise();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ session: string; value: StrengthLoadPreference } | null>(
    null,
  );
  const choiceKey = `${session.dbId}:${session.date}`;
  const preference = choice?.session === choiceKey ? choice.value : undefined;
  const completion = session.dbId ? state.completions[session.dbId] : undefined;
  const baseAvailability: StartAvailability =
    !session.dbId ||
    completion?.completed ||
    session.isUnavailable ||
    session.dayType === "rest" ||
    session.loadLabelOverride === "Wstrzymaj trening"
      ? "none"
      : completion?.status === "missed"
        ? "missed"
        : completion?.status === "started"
          ? "started"
          : canStart
            ? "start"
            : "other-day";
  // A new start that is known to be refused (older generator, changed setup, outdated recipe)
  // becomes "Zaktualizuj plan". A started session never does: continuing stays possible.
  const updateReason =
    baseAvailability === "start"
      ? sessionPlanUpdateReason({
          session,
          profile: state.profile ?? null,
          readiness: state.readiness?.[session.date],
          minutesPerSession: planTimeBudget(state.plan ?? []),
        })
      : null;
  const availability: StartAvailability = updateReason ? "update" : baseAvailability;
  /** Resolves true when the session is started (or already was); false when it could not be. */
  async function start(): Promise<boolean> {
    if (availability === "started") return true;
    if (busy || availability !== "start") return false;
    setBusy(true);
    setError(null);
    try {
      if (isStrengthSession(session) && preference !== undefined)
        await startSession(session, preference);
      else await startSession(session);
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.trim() : "";
      setError(
        message && message.length <= 300
          ? message
          : "Nie udało się rozpocząć sesji. Sprawdź połączenie i dostępną pamięć telefonu.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const checkIn =
    availability === "start" && isStrengthSession(session) ? (
      <fieldset className="bw-load-choice" disabled={busy}>
        <legend>Ciężar dziś · opcjonalnie</legend>
        <div className="bw-load-segments">
          {(
            [
              ["as_planned", "Zgodnie z planem"],
              ["lighter", "Dziś mniejszy ciężar"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} data-checked={preference === value || undefined}>
              <input
                type="radio"
                name={`strength-load-${choiceKey}`}
                value={value}
                checked={preference === value}
                onChange={() => setChoice({ session: choiceKey, value })}
              />
              {label}
            </label>
          ))}
        </div>
        <p>Wybór zapisze się przy rozpoczęciu. Ciężar sprawdzisz w seriach wprowadzających.</p>
      </fieldset>
    ) : null;
  return { availability, busy, error, start, checkIn, updateReason };
}

/** Start control for sessions without the exercise runner (runs, recovery). */
export function SessionStartPanel({
  session,
  canStart,
  label = "Rozpocznij trening",
}: {
  session: SessionDay;
  canStart: boolean;
  label?: string;
}) {
  const { availability, busy, error, start, checkIn, updateReason } = useSessionStart(
    session,
    canStart,
  );
  if (availability === "none" || availability === "started") return null;
  if (availability === "update") return <PlanUpdateNotice reason={updateReason} />;
  if (availability === "missed")
    return (
      <p className="bw-session-preview" role="status">
        {MISSED_SESSION_NOTE}
      </p>
    );
  if (availability === "other-day")
    return (
      <p className="bw-session-preview">
        Podgląd. Start i zapis wykonania są dostępne w dniu treningu.
      </p>
    );
  return (
    <div className="bw-session-start space-y-3">
      {checkIn}
      <Button className="min-h-12 w-full" disabled={busy} onClick={() => void start()}>
        {busy ? "Rozpoczynanie…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Shown instead of Start when the saved plan is out of date. The link opens the plan with the
 * preview of the updated plan; saving it there is the activation. Started and completed
 * sessions, their sets, weights and history are kept.
 */
export function PlanUpdateNotice({ reason }: { reason: string | null }) {
  return (
    <div className="bw-session-update soft-card space-y-3 p-4" role="status">
      <p className="text-sm">
        {reason ?? "Plan wymaga aktualizacji przed rozpoczęciem tej sesji."}
      </p>
      <Link
        to="/plan"
        search={{ aktualizuj: "1" }}
        className="bw-session-update-link inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        Zaktualizuj plan
      </Link>
      <p className="text-xs text-muted-foreground">
        Zobaczysz podgląd zmian przed zapisem. Rozpoczęte i ukończone treningi oraz historia zostają
        bez zmian.
      </p>
    </div>
  );
}
