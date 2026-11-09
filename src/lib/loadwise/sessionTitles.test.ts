import { describe, expect, it } from "vitest";
import { unifiedSessionTitle } from "./sessionTitles";

/** Titles the engines produce today (seeded scan of 400 profiles) and older saved ones. */
const CASES: Array<[string, string]> = [
  ["Trening klubowy", "Trening klubowy"],
  ["Odpoczynek", "Dzień wolny"],
  ["Dzień meczowy", "Mecz"],
  ["Aktywacja przedmeczowa (MD-1)", "Aktywacja przedmeczowa"],
  ["Regeneracja — tryb ostrożny", "Regeneracja"],
  ["Regeneracja i prehab", "Regeneracja"],
  ["Sesja kompensacyjna (MD+1)", "Regeneracja"],
  ["Sesja mobilności i techniki", "Mobilność"],
  ["Sprint: akceleracja", "Sprint: przyspieszenie"],
  ["Sprint — akceleracja", "Sprint: przyspieszenie"],
  ["Sprint: prędkość maksymalna", "Sprint: prędkość maksymalna"],
  ["Sprint — wejście w prędkość", "Sprint: prędkość maksymalna"],
  ["Sprint po łuku", "Sprint: po łuku"],
  ["Ekspozycja szybkościowa i technika biegu", "Sprint: technika biegu"],
  ["Technika i krótkie sprinty", "Sprint: technika biegu"],
  ["Hamowanie i zmiana kierunku", "Sprint: zmiana kierunku"],
  ["Zwinność, hamowanie i COD", "Sprint: zmiana kierunku"],
  ["Powtarzalne sprinty RSA", "Sprint: powtórzenia"],
  ["Siłownia: całe ciało A — podstawy", "Siła: całe ciało A"],
  ["Siłownia: całe ciało B — podstawy", "Siła: całe ciało B"],
  ["Siłownia: całe ciało — podstawy", "Siła: całe ciało"],
  ["Siła bazowa na siłowni", "Siła: całe ciało"],
  ["Siła (masa ciała / bez sprzętu)", "Siła: bez sprzętu"],
  ["Siła bazowa (masa ciała)", "Siła: bez sprzętu"],
  ["Siła w domu (własny sprzęt)", "Siła: w domu"],
  ["Lekki tułów i góra ciała", "Siła: góra ciała"],
  ["Primer siłowy (utrzymanie)", "Siła: podtrzymanie"],
  ["Siłownia: siła dolna", "Siła: nogi"],
  ["Spokojny bieg ciągły", "Bieg: spokojny"],
  ["Baza tlenowa i tempo", "Bieg: tempo"],
  ["Interwały biegowe kontrolowane", "Bieg: interwały"],
  ["Test biegowy 5 min", "Bieg: test 5 min"],
  ["Własna technika z piłką + reakcja", "Piłka: technika"],
  ["Własna technika z piłką", "Piłka: technika"],
  ["Technika i decyzje z piłką", "Piłka: technika"],
  ["Lekka technika piłkarska", "Piłka: lekka technika"],
  ["Piłka: bramkarz solo", "Piłka: bramkarz"],
  ["Piłka: zwód, obrót i wykończenie napastnika", "Piłka: wykończenie"],
  ["Piłka: orientacja i przyjęcie pomocnika", "Piłka: przyjęcie kierunkowe"],
  ["Piłka: przyjęcie i podanie obrońcy", "Piłka: przyjęcie i podanie"],
];

describe("one short naming scheme for every training unit", () => {
  it.each(CASES)("%s → %s", (raw, expected) => {
    expect(unifiedSessionTitle(raw)).toBe(expected);
  });

  it("keeps every name short and in the 'Kategoria: akcent' form", () => {
    const single = new Set([
      "Trening klubowy",
      "Dzień wolny",
      "Mecz",
      "Aktywacja przedmeczowa",
      "Regeneracja",
      "Mobilność",
    ]);
    for (const [raw] of CASES) {
      const name = unifiedSessionTitle(raw);
      expect(name.length, raw).toBeLessThanOrEqual(34);
      expect(name, raw).not.toMatch(/[—+()/]/);
      if (!single.has(name)) expect(name, raw).toMatch(/^(Sprint|Siła|Bieg|Piłka): \S/);
    }
  });

  it("marks a lightened session and keeps status titles", () => {
    expect(unifiedSessionTitle("Spokojny bieg ciągły — lżej")).toBe("Bieg: spokojny (lżej)");
    expect(unifiedSessionTitle("Szybkość wstrzymana")).toBe("Szybkość wstrzymana");
  });
});
