import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLoadwise } from "@/lib/loadwise/store";
import type { SessionDay } from "@/lib/loadwise/types";

export type StartAvailability = "start" | "started" | "other-day" | "none";

/** An explicit start pins the selected prescription before exercise recording. */
export function useSessionStart(session: SessionDay, canStart: boolean) {
  const { state, startSession } = useLoadwise();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      await startSession(session);
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
  return { availability, busy, error, start };
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
  const { availability, busy, error, start } = useSessionStart(session, canStart);
  if (availability === "none" || availability === "started") return null;
  if (availability === "other-day")
    return (
      <p className="bw-session-preview">
        Podgląd. Start i zapis wykonania są dostępne w dniu treningu.
      </p>
    );
  return (
    <div className="bw-session-start space-y-3">
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
