import { addNotice, due, markFailed, markSent, type OutboxItem, type OutboxState } from "./outbox";

/**
 * Wysyłka kolejki. Każdy element jest wysyłany osobno i w kolejności; błąd jednego nie zatrzymuje pozostałych,
 * a brak sieci przerywa rundę (nie ma sensu próbować dalej). Wynik serwera rozstrzyga konflikty.
 */
export type SendResult =
  | { ok: true; outcome: "inserted" | "duplicate" | "updated" | "kept_server" | "replaced" }
  | { ok: false; retryable: boolean; offline?: boolean; error: string };

export interface Store {
  read(): OutboxState;
  write(s: OutboxState): void;
}

export const CONFLICT_TEXT = {
  kept_server: "Ten trening był już zapisany na innym urządzeniu z pełniejszym wykonaniem – zostawiliśmy tamten zapis.",
  replaced: "Ten trening był zapisany na innym urządzeniu; zastąpiliśmy go pełniejszym zapisem z tego telefonu.",
} as const;

/**
 * Jedna runda synchronizacji. Stan czytany jest na nowo przed każdym zapisem, bo w trakcie wysyłki zawodnik mógł
 * dodać kolejny wpis (np. zakończył trening), a druga karta mogła już coś wysłać.
 */
export async function flush(store: Store, send: (item: OutboxItem) => Promise<SendResult>, now: () => number): Promise<{ sent: number; failed: number; offline: boolean }> {
  let sent = 0, failed = 0;
  for (const item of due(store.read(), now())) {
    const version = item.updatedAt;
    let r: SendResult;
    try { r = await send(item); } catch (e) { r = { ok: false, retryable: true, error: e instanceof Error ? e.message : String(e) }; }
    let s = store.read();
    if (!s.items.some((i) => i.id === item.id)) continue; // wysłane już przez inną kartę
    if (r.ok) {
      s = markSent(s, item.id, version, now());
      if (r.outcome === "kept_server" || r.outcome === "replaced") s = addNotice(s, { id: `${item.id}:${r.outcome}`, at: now(), text: CONFLICT_TEXT[r.outcome] });
      sent++;
      store.write(s);
    } else {
      store.write(markFailed(s, item.id, r.error, r.retryable, now()));
      failed++;
      if (r.offline) return { sent, failed, offline: true };
    }
  }
  return { sent, failed, offline: false };
}
