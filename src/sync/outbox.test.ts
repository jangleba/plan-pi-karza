import { describe, expect, it } from "vitest";
import { EMPTY, backoff, dismissNotice, due, enqueue, markFailed, markSent, parseOutbox, retryNow, statusOf, type OutboxItem, type OutboxState } from "./outbox";
import { flush, type SendResult, type Store } from "./flush";

const mem = (init: OutboxState = EMPTY): Store & { s: OutboxState } => {
  const box = { s: init, read: () => box.s, write: (n: OutboxState) => { box.s = JSON.parse(JSON.stringify(n)); } };
  return box;
};
const item = (id: string, payload: unknown = { id }) => ({ id, kind: "session_log" as const, payload });

describe("kolejka zapisów offline", () => {
  it("ten sam identyfikator nie tworzy duplikatu – nowsza treść zastępuje starszą", () => {
    let s = enqueue(EMPTY, item("a", { v: 1 }), 1);
    s = enqueue(s, item("a", { v: 2 }), 2);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]?.payload).toEqual({ v: 2 });
  });
  it("potwierdzenie starszej wersji nie usuwa nowszej zmiany zrobionej w trakcie wysyłki", () => {
    let s = enqueue(EMPTY, item("a", { v: 1 }), 10);
    s = enqueue(s, item("a", { v: 2 }), 20); // zmiana w trakcie wysyłki wersji 10
    s = markSent(s, "a", 10, 30);
    expect(s.items).toHaveLength(1);
    s = markSent(s, "a", 20, 31);
    expect(s.items).toHaveLength(0);
    expect(s.lastSyncAt).toBe(31);
  });
  it("błędy: rosnące odstępy, limit 15 min; po odzyskaniu sieci próba od razu", () => {
    expect(backoff(1)).toBe(5_000);
    expect(backoff(3)).toBe(20_000);
    expect(backoff(20)).toBe(15 * 60_000);
    let s = enqueue(EMPTY, item("a"), 0);
    s = markFailed(s, "a", "Failed to fetch", true, 100);
    expect(due(s, 101)).toHaveLength(0);
    s = retryNow(s, 200);
    expect(due(s, 200)).toHaveLength(1);
  });
  it("status: wysłane / czeka (offline) / błąd po 3 próbach", () => {
    expect(statusOf({ ...EMPTY, lastSyncAt: 5 }, true)).toEqual({ kind: "synced", at: 5 });
    let s = enqueue(EMPTY, item("a"), 0);
    expect(statusOf(s, false)).toEqual({ kind: "pending", count: 1, offline: true });
    for (let i = 0; i < 3; i++) s = markFailed(s, "a", "500", true, i);
    expect(statusOf(s, true).kind).toBe("error");
  });
  it("uszkodzony zapis kolejki = pusta kolejka, nie wyjątek", () => {
    expect(parseOutbox("x")).toEqual(EMPTY);
    const s = enqueue(EMPTY, item("a"), 1);
    expect(parseOutbox(JSON.stringify(s)).items).toHaveLength(1);
  });
});

describe("wysyłka kolejki", () => {
  it("brak sieci przerywa rundę i niczego nie gubi; po powrocie sieci wszystko trafia na serwer raz", async () => {
    const st = mem(enqueue(enqueue(EMPTY, item("a"), 1), item("b"), 2));
    let online = false;
    const server = new Map<string, number>();
    const send = async (i: OutboxItem): Promise<SendResult> => {
      if (!online) return { ok: false, retryable: true, offline: true, error: "offline" };
      server.set(i.id, (server.get(i.id) ?? 0) + 1);
      return { ok: true, outcome: server.get(i.id)! > 1 ? "duplicate" : "inserted" };
    };
    const r1 = await flush(st, send, () => 10);
    expect(r1).toMatchObject({ sent: 0, offline: true });
    expect(st.s.items).toHaveLength(2);
    online = true;
    st.write(retryNow(st.s, 20));
    const r2 = await flush(st, send, () => 20);
    expect(r2.sent).toBe(2);
    expect(st.s.items).toHaveLength(0);
    expect([...server.values()]).toEqual([1, 1]);
  });
  it("utracona odpowiedź serwera (zapis doszedł, potwierdzenie nie) – ponowna wysyłka jest bezpieczna", async () => {
    const st = mem(enqueue(EMPTY, item("a"), 1));
    const server = new Set<string>();
    let lose = true;
    const send = async (i: OutboxItem): Promise<SendResult> => {
      const dup = server.has(i.id); server.add(i.id);
      if (lose) { lose = false; throw new Error("network lost after write"); }
      return { ok: true, outcome: dup ? "duplicate" : "inserted" };
    };
    await flush(st, send, () => 5);
    expect(st.s.items).toHaveLength(1);
    st.write(retryNow(st.s, 6));
    await flush(st, send, () => 6);
    expect(st.s.items).toHaveLength(0);
    expect(server.size).toBe(1);
  });
  it("konflikt z innym urządzeniem: zawodnik dostaje jasny komunikat, który można zamknąć", async () => {
    const st = mem(enqueue(EMPTY, item("a"), 1));
    await flush(st, async () => ({ ok: true, outcome: "kept_server" }), () => 2);
    expect(st.s.notices).toHaveLength(1);
    expect(st.s.notices[0]?.text).toMatch(/innym urządzeniu/);
    expect(dismissNotice(st.s, st.s.notices[0]!.id).notices).toHaveLength(0);
  });
  it("element wysłany w międzyczasie przez drugą kartę nie jest liczony podwójnie", async () => {
    const st = mem(enqueue(EMPTY, item("a"), 1));
    const r = await flush(st, async () => { st.write({ ...st.s, items: [] }); return { ok: true, outcome: "inserted" }; }, () => 2);
    expect(r.sent).toBe(0);
  });
});
