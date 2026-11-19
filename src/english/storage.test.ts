import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { user_id: string; item: string; data: Record<string, unknown> };
const srv = vi.hoisted(() => ({
  rows: [] as Row[], authUser: "u-1" as string | null, failSelect: false, failUpsert: false, dropRows: false, upserts: 0, selects: 0,
  gate: null as null | Promise<void>,
}));
vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: srv.authUser ? { id: srv.authUser } : null } }) },
    from: () => ({
      select: () => ({
        eq: async (_c: string, userId: string) => {
          srv.selects++;
          if (srv.gate) await srv.gate;
          if (srv.failSelect) return { data: null, error: { message: "baza niedostępna" } };
          return { data: srv.rows.filter((r) => r.user_id === userId).map((r) => ({ item: r.item, data: r.data })), error: null };
        },
      }),
      upsert: (rows: Row[]) => ({
        select: async () => {
          srv.upserts++;
          if (srv.failUpsert) return { data: null, error: { message: "zapis odrzucony" } };
          const stored = srv.dropRows ? rows.slice(0, rows.length - 1) : rows;
          for (const r of stored) { srv.rows = srv.rows.filter((x) => !(x.user_id === r.user_id && x.item === r.item)); srv.rows.push(r); }
          return { data: stored.map((r) => ({ item: r.item })), error: null };
        },
      }),
    }),
  },
}));

import { commit, commitAndConfirm, getStatus, loadDoc, resetStatus, saveDoc, syncCloud } from "./storage";
import { emptyDoc, recordAnswer, setLevel } from "./progress";
import { setScope } from "../lib/store";

const mem = new Map<string, string>();
let dropWrites = false;
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { if (!dropWrites) mem.set(k, v); }, removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
} as Storage;

const D0 = "2026-11-19";
let t = 1000;
const sample = () => setLevel(recordAnswer(emptyDoc(), "partners-01", true, D0, ++t), 2, ++t);

beforeEach(() => {
  mem.clear(); dropWrites = false; resetStatus(); setScope({ kind: "user", id: "u-1" });
  Object.assign(srv, { rows: [], authUser: "u-1", failSelect: false, failUpsert: false, dropRows: false, upserts: 0, selects: 0, gate: null });
});

describe("zapis lokalny: potwierdzany odczytem", () => {
  it("udany zapis jest odczytywalny; zapis odrzucony po cichu przez przeglądarkę jest wykrywany i NIE jest pokazywany jako sukces", () => {
    expect(saveDoc(sample())).toBe(true);
    expect(loadDoc().phrases["partners-01"]).toBeDefined();
    dropWrites = true;
    expect(saveDoc(setLevel(emptyDoc(), 1, ++t))).toBe(false);
    expect(commit(setLevel(emptyDoc(), 1, ++t))).toBe(false);
    expect(getStatus().local).toBe("failed");
    dropWrites = false;
    expect(commit(sample())).toBe(true); // ponowienie
    expect(getStatus().local).toBe("ok");
  });
  it("uszkodzony zapis lokalny nie przerywa działania: zaczynamy od pustego postępu", () => {
    mem.set("bw:u:u-1:english", "{nie json");
    expect(loadDoc()).toEqual(emptyDoc());
  });
});

describe("izolacja danych użytkowników", () => {
  it("konto A → konto B → konto A: postęp się nie miesza; gość ma własną przestrzeń", () => {
    saveDoc(setLevel(emptyDoc(), 3, ++t));
    setScope({ kind: "user", id: "u-2" });
    expect(loadDoc().level).toBeNull();
    saveDoc(setLevel(emptyDoc(), 1, ++t));
    setScope({ kind: "guest" });
    expect(loadDoc().level).toBeNull();
    setScope({ kind: "user", id: "u-1" });
    expect(loadDoc().level?.value).toBe(3);
    setScope({ kind: "user", id: "u-2" });
    expect(loadDoc().level?.value).toBe(1);
  });
  it("gość: zapis lokalny potwierdzony, konto wyłączone, nic nie trafia do serwera", async () => {
    setScope({ kind: "guest" });
    const r = await commitAndConfirm(sample());
    expect(r).toEqual({ local: true, cloud: "off" });
    expect(srv.upserts + srv.selects).toBe(0);
  });
  it("sesja Supabase innego użytkownika niż bieżąca przestrzeń danych: nic nie jest wysyłane ani pobierane", async () => {
    srv.authUser = "u-OTHER";
    saveDoc(sample());
    expect(await syncCloud()).toEqual({ state: "off" });
    expect(srv.upserts + srv.selects).toBe(0);
    srv.authUser = null; // wylogowany
    expect(await syncCloud()).toEqual({ state: "off" });
  });
});

describe("zapis na koncie: sukces dopiero po potwierdzeniu serwera", () => {
  it("udana synchronizacja wysyła tylko zmienione elementy z identyfikatorem użytkownika, potwierdza i czyści oczekujące", async () => {
    const doc = sample();
    saveDoc(doc);
    expect(doc.dirty.sort()).toEqual(["level", "phrase:partners-01"]);
    const r = await commitAndConfirm(doc);
    expect(r).toEqual({ local: true, cloud: "ok" });
    expect(srv.rows.map((x) => [x.user_id, x.item]).sort()).toEqual([["u-1", "level"], ["u-1", "phrase:partners-01"]]);
    expect(loadDoc().dirty).toEqual([]);
    expect(getStatus()).toMatchObject({ cloud: "ok", pending: 0, local: "ok" });
    const before = srv.upserts;
    await syncCloud(); // nic do wysłania
    expect(srv.upserts).toBe(before);
  });
  it("błąd zapisu na koncie: wynik „error” z komunikatem, zmiany zostają oczekujące, ponowienie kończy się sukcesem", async () => {
    srv.failUpsert = true;
    const r = await commitAndConfirm(sample());
    expect(r).toEqual({ local: true, cloud: "error" });
    expect(getStatus()).toMatchObject({ cloud: "error", message: "zapis odrzucony" });
    expect(loadDoc().dirty.length).toBe(2); // nic nie zostało „po cichu” uznane za zapisane
    srv.failUpsert = false;
    expect(await syncCloud()).toEqual({ state: "ok", pushed: 2 });
    expect(loadDoc().dirty).toEqual([]);
    expect(srv.rows).toHaveLength(2);
  });
  it("serwer nie potwierdza wszystkich wierszy: to błąd, a nie sukces", async () => {
    srv.dropRows = true;
    const r = await commitAndConfirm(sample());
    expect(r.cloud).toBe("error");
    expect(getStatus().cloud).toBe("error");
    expect(loadDoc().dirty.length).toBeGreaterThan(0);
  });
  it("błąd pobierania: brak sukcesu, dane lokalne nienaruszone", async () => {
    srv.failSelect = true;
    const doc = sample(); saveDoc(doc);
    expect((await syncCloud()).state).toBe("error");
    expect(loadDoc()).toEqual(doc);
  });
  it("nowsze dane z konta (inne urządzenie) trafiają do postępu lokalnego; nowsze lokalne nie są nadpisywane", async () => {
    saveDoc(sample());
    srv.rows = [
      { user_id: "u-1", item: "phrase:coach-01", data: { stage: 3, due: "2026-11-30", lastDay: "2026-11-23", dayOk: true, seen: 5, correct: 5, wrong: 0, ts: 5000 } },
      { user_id: "u-1", item: "level", data: { value: 3, ts: 1 } }, // starsze niż lokalne
      { user_id: "u-2", item: "phrase:coach-02", data: { stage: 1, due: "2026-11-30", lastDay: "2026-11-23", dayOk: true, seen: 1, correct: 1, wrong: 0, ts: 9999 } }, // cudze
    ];
    await syncCloud();
    const d = loadDoc();
    expect(d.phrases["coach-01"]?.stage).toBe(3);
    expect(d.level?.value).toBe(2);
    expect(d.phrases["coach-02"]).toBeUndefined();
  });
  it("równoległe wywołania synchronizacji współdzielą jedno żądanie", async () => {
    saveDoc(sample());
    await Promise.all([syncCloud(), syncCloud(), syncCloud()]);
    expect(srv.selects).toBe(1);
    expect(srv.upserts).toBe(1);
  });
  it("zmiana konta w trakcie synchronizacji: dane nie trafiają do nowej przestrzeni", async () => {
    saveDoc(sample());
    let release!: () => void;
    srv.gate = new Promise<void>((r) => { release = r; });
    srv.rows = [{ user_id: "u-1", item: "phrase:coach-01", data: { stage: 2, due: "2026-11-30", lastDay: "2026-11-23", dayOk: true, seen: 2, correct: 2, wrong: 0, ts: 7777 } }];
    const p = syncCloud();
    await Promise.resolve(); await Promise.resolve();
    setScope({ kind: "user", id: "u-2" });
    release();
    expect((await p).state).toBe("off");
    expect(loadDoc().phrases["coach-01"]).toBeUndefined();
    expect(srv.upserts).toBe(0);
  });
});
