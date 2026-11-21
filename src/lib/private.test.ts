import { beforeEach, describe, expect, it } from "vitest";
import { loadPrivate, saveHeight, savePrivate } from "./private";
import { setScope } from "./store";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
} as Storage;
beforeEach(() => { mem.clear(); setScope({ kind: "guest" }); });

describe("dane prywatne: wzrost", () => {
  it("zapis i odczyt wzrostu, zaokrąglenie do cm", () => {
    saveHeight(178.4);
    expect(loadPrivate().heightCm).toBe(178);
  });
  it("zmiana daty urodzenia nie kasuje wzrostu i odwrotnie", () => {
    saveHeight(180);
    savePrivate({ birthDate: "2008-05-01" });
    expect(loadPrivate()).toEqual({ birthDate: "2008-05-01", heightCm: 180 });
    saveHeight(182);
    expect(loadPrivate()).toEqual({ birthDate: "2008-05-01", heightCm: 182 });
  });
  it("wzrost można usunąć, a wartości spoza zakresu nie są zapisywane", () => {
    saveHeight(180);
    saveHeight(undefined);
    expect(loadPrivate().heightCm).toBeUndefined();
    saveHeight(90);
    saveHeight(260);
    expect(loadPrivate().heightCm).toBeUndefined();
  });
});
