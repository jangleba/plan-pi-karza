import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLoadwise } from "@/lib/loadwise/store";
import type { SessionDay } from "@/lib/loadwise/types";
import { isStrengthSession, type StrengthLoadPreference } from "@/lib/loadwise/strengthCheckIn";

export type StartAvailability = "start" | "started" | "other-day" | "none";

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
  const availability: StartAvailability =
    !session.dbId ||
    completion?.completed ||
    session.isUnavailable ||
    session.dayType === "rest" ||
    session.loadLabelOverride === "Wstrzymaj trening"
      ? "none"
      : completion?.status === "started"
        ? "started"
        : canStart
          ? "start"
          : "other-day";
  async function start() {
    if (busy || availability !== "start") return;
    setBusy(true);
    setError(null);
    try {
      if (isStrengthSession(session) && preference !== undefined)
        await startSession(session, preference);
      else await startSession(session);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.trim() : "";
      setError(
        message && message.length <= 300
          ? message
          : "Nie udało się rozpocząć sesji. Sprawdź połączenie i dostępną pamięć telefonu.",
      );
    } finally {
      setBusy(false);
    }
  }
  const checkIn =
    availability === "start" && isStrengthSession(session) ? (
      <fieldset className="space-y-2 text-sm" disabled={busy}>
        <legend className="mb-2 font-medium">Ciężar dziś · opcjonalnie</legend>
        {(
          [
            ["as_planned", "Zgodnie z planem"],
            ["lighter", "Dziś mniejszy ciężar"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2">
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
        <p className="text-xs text-muted-foreground">
          Wybór zapisze się przy rozpoczęciu. Ciężar sprawdzisz w seriach wprowadzających.
        </p>
      </fieldset>
    ) : null;
  return { availability, busy, error, start, checkIn };
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
  const { availability, busy, error, start, checkIn } = useSessionStart(session, canStart);
  if (availability === "none" || availability === "started") return null;
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
