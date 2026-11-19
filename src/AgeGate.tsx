import { useState } from "react";
import { AGE_BLOCK_MESSAGE, MIN_AGE, type AgeStatus } from "./lib/age";
import { deleteLocalData } from "./legal/account";
import { localISO } from "./engine";

/**
 * Blokada korzystania przez osoby poniżej progu wieku (także po zmianie daty urodzenia) albo przy niejednoznacznym samym roczniku.
 * To samodeklaracja – nie weryfikujemy tożsamości i nie zbieramy skanów dokumentów.
 */
export function AgeGate({ reason, onBirthDate }: { reason: Exclude<AgeStatus, "ok">; onBirthDate: (isoDate: string) => void }) {
  const [date, setDate] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <main className="mx-auto max-w-md px-5 pt-24">
      <h1 className="text-[28px] font-semibold tracking-tight">{reason === "under_min" ? "Aplikacja jest od 16 lat" : "Potwierdź wiek"}</h1>
      <p className="mb-5 mt-2 text-[15px] leading-relaxed text-ink/80">{AGE_BLOCK_MESSAGE[reason]}</p>
      {reason !== "under_min" && (
        <>
          <input type="date" max={localISO()} min="1900-01-01" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data urodzenia" className="mb-3 w-full rounded-2xl bg-canvas px-4 py-3 text-base" />
          <button disabled={!date} onClick={() => onBirthDate(date)} className="bw-grad mb-2 w-full rounded-2xl py-4 text-base font-medium disabled:opacity-40">Potwierdź</button>
          <p className="text-xs text-muted">Data zostaje na tym urządzeniu i nie jest wysyłana do chmury.</p>
        </>
      )}
      {reason === "under_min" && (
        <p className="rounded-2xl bg-lemon px-4 py-3 text-sm text-lemon-ink">Dane na tym urządzeniu nie będą wysyłane ani używane. Możesz je usunąć – po ukończeniu {MIN_AGE} lat wróć do aplikacji.</p>
      )}
      <div className="mt-6">
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="text-sm text-muted underline">Usuń dane z tego urządzenia</button>
        ) : (
          <button onClick={() => { deleteLocalData(); window.location.reload(); }} className="w-full rounded-2xl bg-pink py-3.5 text-sm font-semibold text-pink-ink">Na pewno usunąć dane lokalne</button>
        )}
      </div>
    </main>
  );
}
