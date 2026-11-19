import { describe, expect, it } from "vitest";
import { clubDomainSkipped, clubName, cityInText, contextQuote, extractEmails, findContactLinks, findRecruitmentLink, isOrganizationalEmail, looksLikeDirectory } from "../../supabase/functions/_shared/radar/clubs.ts";
import { buildInquiry, mailtoUrl } from "../../supabase/functions/_shared/radar/inquiry.ts";
import { clubQueriesFor } from "../../supabase/functions/_shared/radar/queries.ts";

describe("adresy organizacyjne a osobiste", () => {
  it("organizacyjne: biuro@, nabor@, nazwa klubu; osobiste imie.nazwisko@ są pomijane", () => {
    for (const e of ["biuro@klub.pl", "nabor@akademia.pl", "kontakt@orly.pl", "ksorly@gmail.com", "ks.orly@wp.pl", "info@uks-lotnik.pl", "nabor.2012@klub.pl", "sekretariat.klubu@klub.pl"]) expect(isOrganizationalEmail(e), e).toBe(true);
    for (const e of ["jan.kowalski@gmail.com", "anna_nowak@klub.pl", "piotr-wisniewski@wp.pl", "noreply@klub.pl", "rodo@klub.pl", "webmaster@klub.pl", "logo@2x.png", "nie-adres", "a@b"]) expect(isOrganizationalEmail(e), e).toBe(false);
  });
});

describe("wyciąganie adresów ze strony", () => {
  const page = `<html><head><title>KS Orły Kraków | Kontakt</title></head><body>
    <h1>Kontakt</h1><p>Biuro klubu: <a href="mailto:biuro@orly-krakow.pl">biuro@orly-krakow.pl</a></p>
    <p>Nabór do grup młodzieżowych: nabor [at] orly-krakow.pl, tel. 600 000 000</p>
    <p>Trener Jan Kowalski: jan.kowalski@gmail.com</p>
    <a href="mailto:zarzad@orly-krakow.pl?subject=Pytanie">Zarząd</a></body></html>`;
  it("znajduje adresy z tekstu, z zapisu [at] i z mailto; każdy z cytatem; osobiste oznacza jako nieorganizacyjne", () => {
    const found = extractEmails(page);
    const by = Object.fromEntries(found.map((f) => [f.email, f]));
    expect(Object.keys(by).sort()).toEqual(["biuro@orly-krakow.pl", "jan.kowalski@gmail.com", "nabor@orly-krakow.pl", "zarzad@orly-krakow.pl"]);
    expect(by["biuro@orly-krakow.pl"]!.quote).toContain("Biuro klubu");
    expect(by["nabor@orly-krakow.pl"]).toMatchObject({ organizational: true, recruitment: true });
    expect(by["jan.kowalski@gmail.com"]!.organizational).toBe(false);
    expect(by["zarzad@orly-krakow.pl"]).toMatchObject({ viaMailto: true, organizational: true });
  });
  it("cytat faktycznie zawiera adres i mieści się w jednym wierszu", () => {
    const text = "Pierwszy wiersz\nZadzwoń lub napisz: kontakt@klub.pl – odpowiadamy w dni robocze\nTrzeci wiersz";
    expect(contextQuote(text, "kontakt@klub.pl")).toBe("Zadzwoń lub napisz: kontakt@klub.pl – odpowiadamy w dni robocze");
    expect(contextQuote(text, "nie@ma.pl")).toBeNull();
  });
  it("strona z wieloma adresami to katalog, a nie klub", () => {
    const many = Array.from({ length: 7 }, (_, i) => `<p>k${i}@klub${i}.pl</p>`).join("");
    expect(looksLikeDirectory(extractEmails(many))).toBe(true);
    expect(looksLikeDirectory(extractEmails(page))).toBe(false);
  });
});

describe("strony klubu", () => {
  const home = `<html><head><title>KS Orły Kraków | Oficjalna strona</title><meta property="og:site_name" content="KS Orły Kraków"></head><body>
    <nav><a href="/kontakt">Kontakt</a><a href="/aktualnosci">Aktualności</a><a href="/nabor-2026">Nabór do akademii</a><a href="/sklep">Sklep</a><a href="https://facebook.com/orly">FB</a><a href="/o-klubie">O klubie</a><a href="/galeria.pdf">Pobierz</a></nav></body></html>`;
  it("podstrony kontaktowe: ta sama witryna, kontakt najpierw, bez plików i sklepu, maks. 3", () => {
    expect(findContactLinks(home, "https://orly.pl/")).toEqual(["https://orly.pl/kontakt", "https://orly.pl/nabor-2026", "https://orly.pl/o-klubie"]);
  });
  it("link do podstrony o naborze (tylko adres, bez treści)", () => {
    expect(findRecruitmentLink(home, "https://orly.pl/")).toBe("https://orly.pl/nabor-2026");
    expect(findRecruitmentLink("<a href='/aktualnosci'>Aktualności</a>", "https://orly.pl/")).toBeNull();
  });
  it("nazwa klubu: og:site_name, potem tytuł, na końcu domena", () => {
    expect(clubName(home, "orly.pl")).toBe("KS Orły Kraków");
    expect(clubName("<title>UKS Lotnik – Aktualności</title>", "lotnik.pl")).toBe("UKS Lotnik");
    expect(clubName("<p>nic</p>", "lotnik.pl")).toBe("lotnik.pl");
  });
  it("miejscowość musi występować w tekście jako osobne słowo (bez Krakowiaka i Łódzkiego)", () => {
    expect(cityInText("KS Orły – klub z Krakowa, ul. Sportowa 1, Kraków", "Kraków")).toBe(true);
    expect(cityInText("Krakowiak Brzesko", "Kraków")).toBe(false);
    expect(cityInText("Region łódzki", "Łódź")).toBe(false);
    expect(cityInText("Hala w Łodzi", "Łódź")).toBe(false); // odmiana nie jest potwierdzeniem – wymagamy formy podstawowej
    expect(cityInText("Siedziba: Łódź, ul. Piotrkowska", "Łódź")).toBe(true);
  });
  it("portale, media społecznościowe i serwisy sportowe nie są klubami", () => {
    for (const d of ["facebook.com", "m.facebook.com", "pzpn.pl", "sportowefakty.pl", "olx.pl", "wikipedia.org"]) expect(clubDomainSkipped(d), d).toBe(true);
    for (const d of ["orly.pl", "ks-lotnik.com.pl", "akademia-pilkarska.pl"]) expect(clubDomainSkipped(d), d).toBe(false);
  });
});

describe("zapytania o kluby", () => {
  it("rotują po miejscowościach i hasłach, są ogólne i powtarzalne", () => {
    const cities = ["Kraków", "Łódź", "Gdańsk", "Lublin"];
    const a = clubQueriesFor(cities, new Date("2026-11-19T06:00:00Z"), 5);
    expect(a).toHaveLength(5);
    expect(a.every((x) => /klub|akademia|szkółka/.test(x.q) && cities.includes(x.city) && x.q.includes(x.city))).toBe(true);
    expect(a).toEqual(clubQueriesFor(cities, new Date("2026-11-19T06:00:00Z"), 5));
    expect(a.map((x) => x.q)).not.toEqual(clubQueriesFor(cities, new Date("2026-11-19T18:00:00Z"), 5).map((x) => x.q));
    expect(clubQueriesFor(cities, new Date(), 0)).toEqual([]);
  });
});

describe("wiadomość do klubu", () => {
  const base = { clubName: "KS Orły Kraków", fullName: "Jan Kowalski", birthYear: 2008, position: "pomocnik" as const, city: "Kraków", minor: false, purpose: "oba" as const };
  it("zawiera prośbę o terminy, rocznik, miejsce, koszt i co zabrać; domyślnie tylko rok urodzenia", () => {
    const m = buildInquiry({ ...base, currentClub: "" }); // interfejs przekazuje birthDate tylko po jawnym wyborze zawodnika
    expect(m.body).toContain("Mam na imię Jan Kowalski");
    expect(m.body).toContain("gram na pozycji pomocnika");
    expect(m.body).toContain("rocznik 2008");
    expect(m.body).not.toMatch(/\d{2}\.\d{2}\.\d{4}/); // bez pełnej daty, jeśli zawodnik jej nie dodał
    expect(m.body).toMatch(/terminach.*roczniku.*miejscu.*kosztach.*zabrać/s);
    expect(m.subject).toContain("rocznik 2008");
  });
  it("pełna data urodzenia pojawia się tylko, gdy przekażemy birthDate (decyzja zawodnika)", () => {
    const withDate = buildInquiry({ ...base, birthYear: null, birthDate: "2008-05-10" });
    expect(withDate.body).toContain("data urodzenia: 10.05.2008");
  });
  it("opcjonalne elementy: klub, doświadczenie, nagranie (tylko https/http), telefon, zdanie o opiekunie dla niepełnoletnich", () => {
    const m = buildInquiry({ ...base, currentClub: "LKS Wisła", experience: "3 sezony w lidze juniorów", videoUrl: "https://youtu.be/abc", phone: "600 100 200", minor: true });
    expect(m.body).toContain("obecnie gram w klubie LKS Wisła");
    expect(m.body).toContain("3 sezony w lidze juniorów");
    expect(m.body).toContain("Nagranie z moją grą: https://youtu.be/abc");
    expect(m.body).toContain("tel. 600 100 200");
    expect(m.body).toContain("niepełnoletni");
    expect(buildInquiry({ ...base, videoUrl: "javascript:alert(1)" }).body).not.toContain("javascript");
    expect(buildInquiry({ ...base, minor: false }).body).not.toContain("niepełnoletni");
  });
  it("zdanie z pytaniem jest poprawne gramatycznie dla każdego celu", () => {
    expect(buildInquiry({ ...base, purpose: "testy" }).body).toContain("planuje wkrótce testy lub nabór dla zawodników z mojego rocznika i czy mogę wziąć w tym udział.");
    expect(buildInquiry({ ...base, purpose: "trening" }).body).toContain("planuje wkrótce trening otwarty lub próbny dla");
    expect(buildInquiry({ ...base, purpose: "oba" }).body).toContain("planuje wkrótce nabór, testy albo trening otwarty/próbny dla");
  });
  it("bez form zależnych od płci i bez danych, których zawodnik nie podał", () => {
    const m = buildInquiry({ ...base, fullName: "", position: null, city: null, birthYear: null, purpose: "testy" });
    expect(m.body).not.toMatch(/chciał|wdzięczn|zainteresowan/i);
    expect(m.body).toContain("Piszę jako zawodnik");
    expect(m.body).not.toContain("undefined");
    expect(m.body).not.toContain("null");
  });
  it("mailto: kodowanie, poprawność adresu i limit długości", () => {
    const url = mailtoUrl("biuro@orly.pl", "Temat – ąę", "Wiersz 1\nWiersz 2 & znak");
    expect(url).toBe("mailto:biuro@orly.pl?subject=Temat%20%E2%80%93%20%C4%85%C4%99&body=Wiersz%201%0AWiersz%202%20%26%20znak");
    expect(mailtoUrl("nie-adres", "t", "b")).toBeNull();
    expect(mailtoUrl("biuro@orly.pl", "t", "x".repeat(3000))).toBeNull();
    expect(mailtoUrl("a@b.pl&bcc=zly@x.pl", "t", "b")).toBeNull(); // wstrzyknięcie dodatkowych pól
  });
});
