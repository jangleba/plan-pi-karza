import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLoadwise } from "@/lib/loadwise/store";
import type { SessionDay } from "@/lib/loadwise/types";

/** An explicit start pins the selected prescription before exercise recording. */
export function SessionStartPanel({
  session,
  canStart,
}: {
  session: SessionDay;
  canStart: boolean;
}) {
  const { state, startSession } = useLoadwise();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completion = session.dbId ? state.completions[session.dbId] : undefined;
  if (!session.dbId || completion?.completed || session.isUnavailable || session.dayType === "rest")
    return null;
  if (completion?.status === "started")
    return (
      <p className="soft-card p-4 text-sm" role="status">
        Trening rozpoczęty.
      </p>
    );
  if (!canStart)
    return (
      <p className="soft-card p-4 text-sm text-muted-foreground">
        Podgląd jednostki z innego dnia.
      </p>
    );
  if (session.loadLabelOverride === "Wstrzymaj trening") return null;
  async function start() {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      await startSession(session);
    } catch {
      setError("Nie udało się rozpocząć sesji. Sprawdź połączenie i dostępną pamięć telefonu.");
    } finally {
      setStarting(false);
    }
  }
  return (
    <div className="soft-card space-y-3 p-4">
      <p className="text-sm text-muted-foreground">
        Rozpocznij, gdy jesteś gotowy do wykonania tej jednostki.
      </p>
      <Button className="w-full" disabled={starting} onClick={() => void start()}>
        {starting ? "Rozpoczynanie…" : "Rozpocznij trening"}
      </Button>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
