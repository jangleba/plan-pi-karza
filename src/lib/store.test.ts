import { beforeEach, describe, expect, it } from "vitest";
import { clearAllLocal, clearScope, copyScope, exportScope, getScope, hasData, listKeys, migrateLegacy, purgeRemovedFeatures, scoped, setScope, type Scope } from "./store";

const mem = new Map<string, string>();
const ls = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
} as Storage;
(globalThis as unknown as { localStorage: Storage }).localStorage = ls;

const A: Scope = { kind: "user", id: "aaa" }, B: Scope = { kind: "user", id: "bbb" }, G: Scope = { kind: "guest" };
beforeEach(() => { mem.clear(); setScope(G); });

describe("przestrzenie danych", () => {
  it("konto A → konto B → konto A: bez wycieku i bez kopiowania", () => {
    setScope(A); scoped.setItem("profile", '{"name":"Ala"}'); scoped.setItem("weightLog", '{"sq":1}'); scoped.setItem("checkIn:2026-11-19", '{"sleep":1}');
    setScope(B);
    expect(scoped.getItem("profile")).toBeNull();
    expect(scoped.getItem("weightLog")).toBeNull();
    expect(listKeys(B)).toEqual([]);
    scoped.setItem("profile", '{"name":"Bartek"}');
    setScope(A);
    expect(scoped.getItem("profile")).toBe('{"name":"Ala"}');
    expect(scoped.getItem("weightLog")).toBe('{"sq":1}');
    setScope(B);
    expect(scoped.getItem("profile")).toBe('{"name":"Bartek"}');
    expect(scoped.getItem("checkIn:2026-11-19")).toBeNull();
    setScope(G);
    expect(scoped.getItem("profile")).toBeNull(); // gość nie widzi danych kont
  });

  it("wylogowanie (zmiana przestrzeni) nie daje dostępu do stanu poprzedniego konta", () => {
    setScope(A); scoped.setItem("meals", "[1]");
    setScope(G);
    expect(scoped.getItem("meals")).toBeNull();
    expect(getScope()).toEqual(G);
  });

  it("usunięcie przestrzeni nie rusza innych; „usuń wszystko lokalnie” zostawia klucze sesji Supabase", () => {
    setScope(A); scoped.setItem("profile", "1"); setScope(B); scoped.setItem("profile", "2"); setScope(G); scoped.setItem("profile", "3");
    mem.set("sb-proj-auth-token", "token");
    expect(clearScope(A)).toBe(1);
    expect(hasData(A)).toBe(false);
    expect(hasData(B) && hasData(G)).toBe(true);
    clearAllLocal();
    expect(hasData(B) || hasData(G)).toBe(false);
    expect(mem.get("sb-proj-auth-token")).toBe("token");
  });
});

describe("migracja starych kluczy", () => {
  it("stare wspólne klucze trafiają do GOŚCIA, nie do bieżącego konta; migracja jest jednorazowa", () => {
    mem.set("profile", '{"name":"Stary"}'); mem.set("history", "[1]"); mem.set("checkIn:2026-11-18", "{}"); mem.set("niezwiazany-klucz", "x"); mem.set("sb-proj-auth-token", "t");
    setScope(A); // użytkownik jest już zalogowany jako A w chwili migracji
    const r = migrateLegacy();
    expect(r.moved.sort()).toEqual(["checkIn:2026-11-18", "history", "profile"]);
    expect(scoped.getItem("profile")).toBeNull(); // konto A nie dostało cudzych danych
    expect(listKeys(A)).toEqual([]);
    expect(listKeys(G)).toEqual(["checkIn:2026-11-18", "history", "profile"]);
    expect(mem.has("profile")).toBe(false);
    expect(mem.get("niezwiazany-klucz")).toBe("x");
    expect(mem.get("sb-proj-auth-token")).toBe("t");
    mem.set("profile", "nowy-stary"); // po migracji ponowne uruchomienie nic nie rusza
    expect(migrateLegacy().alreadyDone).toBe(true);
    expect(mem.get("profile")).toBe("nowy-stary");
  });

  it("nie nadpisuje danych gościa, jeśli już istnieją", () => {
    setScope(G); scoped.setItem("profile", "gosc");
    mem.set("profile", "stary");
    const r = migrateLegacy();
    expect(r.dropped).toEqual(["profile"]);
    expect(scoped.getItem("profile")).toBe("gosc");
  });
});

describe("jawny import danych gościa do konta", () => {
  it("kopiuje tylko po wywołaniu, bez nadpisywania i bez kluczy uzgodnień", () => {
    setScope(G); scoped.setItem("profile", "gp"); scoped.setItem("weightLog", "gw"); scoped.setItem("consentX", "nie-kopiuj");
    setScope(A); scoped.setItem("profile", "konto");
    expect(listKeys(A)).toEqual(["profile"]); // sama zmiana przestrzeni niczego nie kopiuje
    const r = copyScope(G, A);
    expect(r.copied).toEqual(["weightLog"]);
    expect(r.skipped.sort()).toEqual(["consentX", "profile"]);
    expect(scoped.getItem("profile")).toBe("konto");
    expect(copyScope(G, A, { overwrite: true }).copied).toContain("profile");
    expect(scoped.getItem("profile")).toBe("gp");
    expect(copyScope(A, A).copied).toEqual([]);
  });

  it("eksport zwraca dane wyłącznie wskazanej przestrzeni", () => {
    setScope(A); scoped.setItem("profile", '{"name":"Ala"}'); scoped.setItem("txt", "tekst");
    setScope(B); scoped.setItem("profile", '{"name":"Bartek"}');
    expect(exportScope(A)).toEqual({ profile: { name: "Ala" }, txt: "tekst" });
  });
});

describe("usunięte moduły: dane lokalne radaru są kasowane", () => {
  it("kasuje klucze radaru ze wszystkich przestrzeni i ze starych kluczy; resztę zostawia; wykonuje się raz", () => {
    setScope(A); scoped.setItem("radarInquiry", '{"fullName":"Jan","phone":"600"}'); scoped.setItem("radarSaved", "[1]"); scoped.setItem("profile", '{"name":"Ala"}');
    setScope(G); scoped.setItem("radarPrefs", "{}"); scoped.setItem("radarSent", "{}"); scoped.setItem("meals", "[]");
    mem.set("radarPrefs", "{}"); mem.set("radarInquiry", "{}"); // stare, nieprzestrzenne klucze
    mem.set("sb-token", "x");
    const r = purgeRemovedFeatures();
    expect(r.alreadyDone).toBe(false);
    expect(r.removed.length).toBe(6);
    expect([...mem.keys()].some((k) => /radar[A-Z]/.test(k))).toBe(false);
    expect(listKeys(A)).toEqual(["profile"]);
    expect(listKeys(G)).toEqual(["meals"]);
    expect(mem.get("sb-token")).toBe("x");
    scoped.setItem("radarSaved", "znów"); // po wykonaniu czyszczenie nie rusza nowych danych (znacznik)
    expect(purgeRemovedFeatures().alreadyDone).toBe(true);
  });
  it("migracja starych kluczy nie przenosi już danych radaru do gościa", () => {
    mem.set("radarPrefs", "{}"); mem.set("profile", "{}");
    const r = migrateLegacy();
    expect(r.moved).toEqual(["profile"]);
    expect(mem.has("radarPrefs")).toBe(true); // zostaje do usunięcia przez purge, nigdy nie trafia do konta ani gościa
    purgeRemovedFeatures();
    expect(mem.has("radarPrefs")).toBe(false);
  });
});

describe("dostępność zapisu w przeglądarce", () => {
  it("wykrywa blokadę zapisu (np. Safari w trybie prywatnym) i działa przy zwykłym zapisie", async () => {
    const { storageAvailable } = await import("./store");
    expect(storageAvailable()).toBe(true);
    const real = (globalThis as unknown as { localStorage: Storage }).localStorage;
    (globalThis as unknown as { localStorage: Storage }).localStorage = { ...real, setItem: () => { throw new Error("QuotaExceededError"); } } as unknown as Storage;
    expect(storageAvailable()).toBe(false);
    (globalThis as unknown as { localStorage: Storage }).localStorage = real;
    expect(storageAvailable()).toBe(true);
  });
});
