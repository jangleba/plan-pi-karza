import { afterEach, describe, expect, it } from "vitest";
import { initials, tintOf } from "./viz";
import { EMPTY_FORM, bestContact, clubsForPlayer, loadForm, loadSent, markSent, saveForm, type Club } from "./clubs";

const club = (id: string, name: string, lat: number | null, lon: number | null, email = "biuro@k.pl"): Club => ({
  id, name, city: null, lat, lon, website: "https://k.pl/", recruitmentUrl: null, checkedAt: null,
  contacts: [{ email, kind: "general", evidenceUrl: "https://k.pl/kontakt", evidenceQuote: "q", checkedAt: "2026-11-19T10:00:00Z" }],
});
const KRK = { name: "Kraków", lat: 50.061, lon: 19.937 };

describe("radar: kolory i inicjały", () => {
  it("odcień zależy tylko od identyfikatora (stały) i mieści się w 6 pastelach", () => {
    expect(tintOf("abc")).toBe(tintOf("abc"));
    const seen = new Set(Array.from({ length: 60 }, (_, i) => tintOf(`klub-${i}`)));
    expect(seen.size).toBe(6);
    for (const t of seen) expect(t).toBeGreaterThanOrEqual(0);
  });
  it("inicjały pomijają KS/UKS/LKS…, a jedno słowo daje dwie litery", () => {
    expect(initials("KS Orły Kraków")).toBe("OK");
    expect(initials("UKS Wieliczka")).toBe("Wi");
    expect(initials("MKS Myślenice")).toBe("My");
    expect(initials("Unia Tarnów")).toBe("UT");
    expect(initials("Akademia Piłkarska Gwiazda")).toBe("AP");
    expect(initials("KS")).toBe("KS");
  });
});

describe("kluby dla zawodnika", () => {
  it("promień, brak współrzędnych, sortowanie po odległości, kluby bez adresu pomijane", () => {
    const near = club("n", "Bliski", 50.1, 19.95), far = club("f", "Daleki", 54.352, 18.649), none = club("x", "Bez współrzędnych", null, null);
    const noMail: Club = { ...club("m", "Bez adresu", 50.07, 19.94), contacts: [] };
    expect(clubsForPlayer([far, near, none, noMail], { place: KRK, radiusKm: 100 }).map((v) => v.club.id)).toEqual(["n"]);
    const all = clubsForPlayer([far, near, none, noMail], { place: KRK, radiusKm: null });
    expect(all.map((v) => v.club.id)).toEqual(["n", "f", "x"]); // bez współrzędnych na końcu, odległość nieznana
    expect(all[2]!.distanceKm).toBeNull();
    expect(all[0]!.distanceKm).toBeGreaterThan(0);
  });
  it("najlepszy adres: przeznaczony na nabór przed ogólnym", () => {
    const c = club("a", "A", 1, 1);
    c.contacts = [{ ...c.contacts[0]!, email: "biuro@k.pl" }, { ...c.contacts[0]!, email: "nabor@k.pl", kind: "recruitment" }];
    expect(bestContact(c)!.email).toBe("nabor@k.pl");
  });
});

describe("zapamiętana wizytówka i dziennik wysłanych (na urządzeniu)", () => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(), key: () => null, length: 0,
  } as Storage;
  afterEach(() => store.clear());

  it("raz zapisane dane wracają przy kolejnym otwarciu; imię z profilu tylko jako podpowiedź", () => {
    expect(loadForm("Kuba")).toEqual({ ...EMPTY_FORM, fullName: "Kuba" });
    saveForm({ ...EMPTY_FORM, fullName: "Jan Kowalski", currentClub: "LKS Test", phone: "600 100 200", purpose: "testy" });
    expect(loadForm("Kuba")).toMatchObject({ fullName: "Jan Kowalski", currentClub: "LKS Test", phone: "600 100 200", purpose: "testy" });
  });
  it("uszkodzony zapis nie psuje aplikacji", () => {
    store.set("radarInquiry", "{nie json");
    expect(loadForm("Kuba").fullName).toBe("Kuba");
    store.set("radarSent", "[1,2");
    expect(loadSent()).toEqual({});
  });
  it("dziennik wysłanych zapamiętuje datę dla klubu", () => {
    markSent("orly", "2026-11-19T10:00:00.000Z");
    markSent("wieliczka", "2026-11-19T11:00:00.000Z");
    expect(loadSent()).toEqual({ orly: "2026-11-19T10:00:00.000Z", wieliczka: "2026-11-19T11:00:00.000Z" });
  });
});
