import { beforeEach, describe, expect, it } from "vitest";
import { assessAge } from "./age";
import { changeBirth, finalizeNewProfile, loadGuardedProfile, sanitizeStoredProfile, saveProfile } from "./profileGuard";
import { loadPrivate } from "./private";
import { REMOTE_PROFILE_FIELDS, FORBIDDEN_REMOTE_KEYS, parseProfile, toRemoteProfile } from "./sync-map";
import { scoped, setScope } from "./store";
import type { Profile } from "../engine";
import { validateProfile } from "../engine/profile";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
} as Storage;
beforeEach(() => { mem.clear(); setScope({ kind: "guest" }); });

const prof = (over: Partial<Profile> = {}): Profile => ({
  name: "Kuba", age: 18, ageAsOf: "2026-11-19", strengthYears: 2, weightKg: 75, position: "pomocnik", equipment: ["gym"], clubWeekdays: [1], matchWeekdays: [5], limitedGymAccess: false, startDate: "2026-09-01", ...over,
});

describe("wiek 16+: granice (jedna funkcja)", () => {
  const a = (birthDate: string, today: string) => assessAge({ birthDate }, today);
  it("dzień przed 16. urodzinami: poniżej progu; w dzień 16. urodzin: dozwolone; 17 i 18 lat: właściwe grupy", () => {
    expect(a("2010-11-20", "2026-11-19").status).toBe("under_min"); // jutro skończy 16
    expect(a("2010-11-19", "2026-11-19")).toMatchObject({ status: "ok", band: "16-17", currentAge: 16 });
    expect(a("2009-11-19", "2026-11-19")).toMatchObject({ status: "ok", band: "16-17", currentAge: 17 });
    expect(a("2009-11-20", "2026-11-19")).toMatchObject({ status: "ok", band: "16-17", currentAge: 16 });
    expect(a("2008-11-20", "2026-11-19")).toMatchObject({ band: "16-17", currentAge: 17 }); // dzień przed 18.
    expect(a("2008-11-19", "2026-11-19")).toMatchObject({ band: "18+", currentAge: 18 });
    expect(a("1990-01-01", "2026-11-19")).toMatchObject({ band: "18+" });
  });
  it("sam rocznik nie jest dowodem, jeśli wynik zależy od urodzin; nie podstawiamy 1 stycznia", () => {
    expect(assessAge({ birthYear: 2010 }, "2026-11-19").status).toBe("needs_birth_date"); // 15 albo 16
    expect(assessAge({ birthYear: 2010 }, "2026-12-31").status).toBe("ok"); // wszyscy z rocznika 2010 mają już 16 lat
    expect(assessAge({ birthYear: 2011 }, "2026-11-19").status).toBe("under_min"); // 14–15
    expect(assessAge({ birthYear: 2008 }, "2026-11-19").status).toBe("ok");
    expect(assessAge({ birthYear: 2009 }, "2026-11-19")).toMatchObject({ status: "ok", band: "16-17" });
    expect(assessAge({ birthYear: 2008 }, "2026-11-19").band).toBe("16-17"); // 17–18 → ostrożnie jako niepełnoletni
  });
  it("sprzeczności: deklarowany wiek obok daty urodzenia wskazującej poniżej progu → blokada; rozbieżne pola są zgłaszane", () => {
    const r = assessAge({ birthDate: "2014-05-01", declaredAge: 18, declaredOn: "2026-11-01" }, "2026-11-19");
    expect(r.status).toBe("under_min");
    expect(r.contradictions).toContain("declared_age_mismatch");
    expect(assessAge({ birthDate: "2000-05-01", birthYear: 2001 }, "2026-11-19").contradictions).toContain("birth_year_mismatch");
    expect(assessAge({ birthDate: "2999-01-01" }, "2026-11-19").contradictions).toContain("birth_date_invalid");
    expect(assessAge({ declaredAge: 200 }, "2026-11-19").contradictions).toContain("declared_age_invalid");
  });
  it("deklarowany wiek „starzeje się” z czasem, ale nigdy nie młodnieje; poniżej progu zostaje zablokowany", () => {
    expect(assessAge({ declaredAge: 17, declaredOn: "2024-11-19" }, "2026-11-19")).toMatchObject({ status: "ok", currentAge: 19, band: "18+" });
    expect(assessAge({ declaredAge: 17, declaredOn: "2026-11-01" }, "2026-11-19")).toMatchObject({ currentAge: 17, band: "16-17" });
    expect(assessAge({ declaredAge: 15, declaredOn: "2026-11-01" }, "2026-11-19").status).toBe("under_min");
    expect(assessAge({}, "2026-11-19").status).toBe("unknown");
  });
  it("urodzeni 29 lutego: w roku niewysokosowym grupa wieku bywa niejednoznaczna (28.02 vs 1.03) – wybieramy ostrożnie „16-17”", () => {
    // 16. urodziny osoby urodzonej 29.02 zawsze wypadają w roku przestępnym, więc próg 16 jest jednoznaczny; niejednoznaczna bywa granica 18 lat
    const a = assessAge({ birthDate: "2008-02-29" }, "2026-02-28");
    expect([a.min, a.max, a.status, a.band]).toEqual([17, 18, "ok", "16-17"]);
    expect(assessAge({ birthDate: "2008-02-29" }, "2026-03-01")).toMatchObject({ currentAge: 18, band: "18+" });
    expect(assessAge({ birthDate: "2010-02-29" }, "2026-03-01").contradictions).toContain("birth_date_invalid"); // 2010 nie jest rokiem przestępnym
  });
  it("walidacja profilu w onboardingu używa tej samej funkcji", () => {
    const base = { age: 18, ageAsOf: "2026-11-19", strengthYears: 1, weightKg: 70, position: "pomocnik" as const, equipment: ["gym" as const], matchWeekdays: [5], season: "inseason" as const };
    expect(validateProfile({ ...base, age: 15 })).toContain("Aplikacja jest dla osób, które ukończyły 16 lat.");
    expect(validateProfile({ ...base, age: 16 }).some((e) => /16 lat/.test(e))).toBe(false);
  });
});

describe("bramka wieku wokół zapisanego profilu", () => {
  it("stary, sprzeczny profil: age=18 obok daty wskazującej 12 lat → blokada (także po zmianie daty w radarze)", () => {
    saveProfile(prof({ age: 18 }));
    const ok = loadGuardedProfile("2026-11-19");
    expect(ok.kind).toBe("ok");
    const r = changeBirth({ birthDate: "2014-06-01" }, prof({ age: 18 }), "2026-11-19"); // 12 lat
    expect(r).toMatchObject({ kind: "blocked", reason: "under_min" });
    expect(loadGuardedProfile("2026-11-19")).toMatchObject({ kind: "blocked", reason: "under_min" }); // blokada trwa po ponownym wczytaniu
  });
  it("dawny profil z birthDate: data trafia do magazynu prywatnego, a zapis profilu jest oczyszczony", () => {
    scoped.setItem("profile", JSON.stringify({ ...prof(), birthDate: "2005-03-03", sekret: "x" }));
    const r = loadGuardedProfile("2026-11-19");
    expect(r.kind).toBe("ok");
    expect(loadPrivate()).toEqual({ birthDate: "2005-03-03" });
    const stored = JSON.parse(scoped.getItem("profile")!);
    expect(stored.birthDate).toBeUndefined();
    expect(stored.sekret).toBeUndefined();
    if (r.kind === "ok") expect(r.profile.age).toBe(21); // wiek wyliczony z daty, sprzeczność z deklaracją naprawiona
  });
  it("wiek w profilu rośnie z upływem czasu", () => {
    saveProfile(prof({ age: 17, ageAsOf: "2024-11-19" }));
    const r = loadGuardedProfile("2026-11-19");
    expect(r.kind === "ok" && r.profile.age).toBe(19);
    expect(JSON.parse(scoped.getItem("profile")!).ageAsOf).toBe("2026-11-19");
  });
  it("sam rocznik w sprzeczności/niejednoznaczny: wymagana pełna data; po jej podaniu dostęp wraca", () => {
    saveProfile(prof({ age: 16 }));
    const r = changeBirth({ birthYear: 2010 }, prof({ age: 16 }), "2026-11-19");
    expect(r).toMatchObject({ kind: "blocked", reason: "needs_birth_date" });
    const fixed = changeBirth({ birthDate: "2010-02-01" }, prof({ age: 16 }), "2026-11-19");
    expect(fixed.kind).toBe("ok");
  });
  it("nowy profil z onboardingu przechodzi tę samą bramkę", () => {
    expect(finalizeNewProfile({ ...prof(), age: 15, ageAsOf: undefined }, "2026-11-19")).toMatchObject({ kind: "blocked", reason: "under_min" });
    expect(mem.size).toBe(0); // osoba poniżej progu: nic nie zostało zapisane
    const ok = finalizeNewProfile({ ...prof(), age: 16, ageAsOf: undefined }, "2026-11-19");
    expect(ok.kind).toBe("ok");
    expect(JSON.parse(scoped.getItem("profile")!).ageAsOf).toBe("2026-11-19");
  });
});

describe("kontrakt synchronizacji: data urodzenia nigdy na serwer", () => {
  it("do backendu trafiają tylko pola kontraktu; pola dodane przypadkowo i daty urodzenia są odrzucane", () => {
    const dirty = { ...prof(), birthDate: "2005-03-03", birthYear: 2005, dob: "x", nowePole: "przypadkowe", email: "a@b.pl" } as unknown as Profile;
    const remote = toRemoteProfile(dirty, "2026-11-19")!;
    expect(Object.keys(remote).every((k) => (REMOTE_PROFILE_FIELDS as readonly string[]).includes(k))).toBe(true);
    for (const k of FORBIDDEN_REMOTE_KEYS) expect(k in remote).toBe(false);
    expect("nowePole" in remote || "email" in remote).toBe(false);
    expect(JSON.stringify(remote)).not.toMatch(/2005-03-03|birth|dob/i);
  });
  it("dni z siłownią są w kontrakcie: trafiają na serwer i wracają z niego (pole opcjonalne dla starszych profili)", () => {
    const withGym = prof({ limitedGymAccess: true, gymWeekdays: [1, 3] });
    expect(toRemoteProfile(withGym, "2026-11-19")).toMatchObject({ limitedGymAccess: true, gymWeekdays: [1, 3] });
    expect(parseProfile(toRemoteProfile(withGym, "2026-11-19"), "2026-11-19")).toMatchObject({ gymWeekdays: [1, 3] });
    expect("gymWeekdays" in toRemoteProfile(prof(), "2026-11-19")!).toBe(false);
    expect((REMOTE_PROFILE_FIELDS as readonly string[]).includes("gymWeekdays")).toBe(true);
  });
  it("osoba poniżej progu nie jest synchronizowana; profil z serwera poniżej progu nie jest przyjmowany", () => {
    expect(toRemoteProfile(prof({ age: 15, ageAsOf: "2026-11-19" }), "2026-11-19")).toBeNull();
    expect(parseProfile({ ...prof({ age: 15 }) }, "2026-11-19")).toBeNull();
    expect(parseProfile({ ...prof(), birthDate: "2005-03-03" }, "2026-11-19")).not.toHaveProperty("birthDate");
  });
  it("sanityzacja zapisu lokalnego usuwa nieznane pola", () => {
    expect(sanitizeStoredProfile({ ...prof(), birthYear: 2005, x: 1 }).profile).not.toHaveProperty("x");
  });
});
