import { useEffect, useState } from "react";
import { useAuth } from "@/lib/loadwise/auth";
import {
  trainingQueueStatus,
  retryFailedTrainingWrites,
  recoverTrainingQueue,
} from "@/lib/loadwise/offlineTrainingQueue";

export function TrainingSyncStatus() {
  const { user, offlineIdentity } = useAuth();
  const userId = user?.id;
  const [status, setStatus] = useState(() => trainingQueueStatus(userId ?? ""));
  useEffect(() => {
    const refresh = () => setStatus(trainingQueueStatus(userId ?? ""));
    if (userId) void recoverTrainingQueue(userId).then(refresh);
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("ballwise:training-queue-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("ballwise:training-queue-changed", refresh);
    };
  }, [userId]);
  if (
    !userId ||
    (!status.pending &&
      !status.failed &&
      !status.conflicts &&
      !status.recoveryRequired &&
      !status.storageWarning &&
      !offlineIdentity)
  )
    return null;
  return (
    <div role="status" className="bg-primary/10 px-5 py-2 text-center text-xs text-foreground">
      {offlineIdentity && (
        <p>
          Tryb offline — korzystasz z danych z tego telefonu. Po połączeniu potwierdzimy sesję
          konta.{" "}
          <a href="/data-rights" className="underline">
            Pobierz kopię wyników
          </a>
        </p>
      )}
      {status.pending > 0 && (
        <p>Zapisy na tym telefonie oczekujące na synchronizację: {status.pending}.</p>
      )}
      {(status.failed > 0 || status.conflicts > 0) && (
        <p>
          Zapisy wymagające sprawdzenia: {status.failed + status.conflicts}. {status.error}
        </p>
      )}
      {status.recoveryRequired && (
        <p>Nie udało się odczytać części kolejki. Oryginał zachowano w eksporcie danych.</p>
      )}
      {status.storageWarning && <p>{status.storageWarning}</p>}
      {status.failed > 0 && (
        <button
          type="button"
          className="min-h-11 underline"
          onClick={() => void retryFailedTrainingWrites(userId)}
        >
          Ponów odrzucone zapisy
        </button>
      )}
      {(status.failed > 0 || status.conflicts > 0 || status.recoveryRequired) && (
        <a className="block min-h-11 pt-3 underline" href="/data-rights">
          Eksportuj kopię wyników i dane do odzyskania
        </a>
      )}
    </div>
  );
}
