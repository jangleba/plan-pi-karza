import { describe, expect, it } from "vitest";
import { canonicalUrl, dedupeSessions, eligibilityKey, hashText, sameSession } from "../../supabase/functions/_shared/radar/dedup.ts";
import { allQueries, queriesForRun, searchPeriods, BASE_TERMS } from "../../supabase/functions/_shared/radar/queries.ts";
import { checkUrl, isPublicIp } from "../../supabase/functions/_shared/radar/urlsafe.ts";
import { robotsAllows, robotsCrawlDelay, robotsFromResponse } from "../../supabase/functions/_shared/radar/robots.ts";
import { classifyPage, extractLinks, findNextPage, htmlToText, parseFeed, parseSitemap } from "../../supabase/functions/_shared/radar/html.ts";
import { fetchSafe, type FetchDeps } from "../../supabase/functions/_shared/radar/fetcher.ts";
import { lookupPlace, searchPlaces, haversineKm } from "../../supabase/functions/_shared/radar/geo.ts";
import { years } from "./fixtures.ts";

describe("deduplikacja", () => {
  it("kanoniczny adres usuwa śledzenie, fragment, www i końcowy ukośnik", () => {
    expect(canonicalUrl("https://WWW.Klub.pl/Nabor/?utm_source=fb&b=2&a=1#x")).toBe("https://klub.pl/Nabor?a=1&b=2");
    expect(canonicalUrl("https://klub.pl/nabor/")).toBe(canonicalUrl("https://klub.pl/nabor?fbclid=abc"));
  });
  it("klucz zasad nie zależy od sposobu zapisu rocznika", () => {
    expect(eligibilityKey({ birthYears: [{ op: "range", from: 2012, to: 2013 }] })).toBe(eligibilityKey({ birthYears: [{ op: "in", years: [2013, 2012] }] }));
    expect(eligibilityKey(years(2012))).not.toBe(eligibilityKey(years(2013)));
  });
  const base = { organizer: "KS Przykład", city: "Kraków", date: "2026-11-24", eligibility: { birthYears: [{ op: "range" as const, from: 2012, to: 2013 }] } };
  it("ta sama sesja z dwóch publikacji to duplikat (także z różnym zapisem nazwy i godziną podaną tylko w jednej)", () => {
    expect(sameSession(base, { ...base, organizer: "ks przyklad", city: "Krakow", startTime: "17:00", eligibility: { birthYears: [{ op: "in", years: [2012, 2013] }] } })).toBe(true);
    expect(sameSession({ ...base, startTime: "17:00" }, { ...base, startTime: "18:30" })).toBe(false); // dwie godziny = dwie sesje
  });
  it("różne roczniki tego samego dnia i różne dni to odrębne sesje", () => {
    const list = [base, { ...base, eligibility: years(2014) }, { ...base, date: "2026-11-25" }, { ...base }];
    expect(dedupeSessions(list)).toHaveLength(3);
  });
  it("skrót tekstu jest stabilny i czuły na zmianę", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });
});

describe("rotacja zapytań", () => {
  const nov = new Date("2026-11-19T06:00:00Z");
  it("okresy pochodzą z bieżącej daty, a nie ze stałego roku", () => {
    expect(searchPeriods(nov)).toEqual(["listopad 2026", "grudzień 2026", "sezon 2026/2027", "runda jesienna 2026"]);
    expect(searchPeriods(new Date("2027-03-02T10:00:00Z"))).toEqual(["marzec 2027", "kwiecień 2027", "sezon 2026/2027", "runda wiosenna 2027"]);
    expect(searchPeriods(new Date("2027-12-31T10:00:00Z"))[1]).toBe("styczeń 2028");
    expect(allQueries(new Date("2031-05-05T00:00:00Z")).every((q) => !q.q.includes("2026"))).toBe(true);
  });
  it("zawiera wszystkie hasła, regiony i miasta, bez danych osobowych", () => {
    const all = allQueries(nov);
    for (const t of BASE_TERMS) expect(all.some((q) => q.term === t)).toBe(true);
    expect(all.some((q) => q.q.includes("województwo małopolskie"))).toBe(true);
    expect(all.some((q) => q.q.includes("Kraków"))).toBe(true);
  });
  it("kolejne uruchomienia przesuwają okno i w końcu obejmują całą listę; budżet jest przestrzegany", () => {
    const all = allQueries(nov).length;
    expect(queriesForRun(nov, 20)).toHaveLength(20);
    expect(queriesForRun(nov, 0)).toEqual([]);
    const seen = new Set<string>();
    for (let i = 0; i < Math.ceil(all / 20) + 2; i++) for (const q of queriesForRun(new Date(nov.getTime() + i * 12 * 3_600_000), 20)) seen.add(q.q);
    expect(seen.size).toBeGreaterThan(all * 0.9);
    expect(queriesForRun(nov, 20).map((q) => q.q)).not.toEqual(queriesForRun(new Date(nov.getTime() + 12 * 3_600_000), 20).map((q) => q.q));
    expect(queriesForRun(nov, 20)).toEqual(queriesForRun(nov, 20)); // powtarzalne
  });
});

describe("ochrona przed SSRF", () => {
  it("odrzuca adresy inne niż publiczny https", () => {
    const bad: Array<[string, string]> = [
      ["http://klub.pl/", "not_https"], ["https://user:pw@klub.pl/", "credentials"], ["https://klub.pl:8443/", "bad_port"],
      ["https://localhost/", "private_host"], ["https://intranet.local/", "private_host"], ["https://srv.internal/", "private_host"], ["https://nazwa/", "private_host"],
      ["https://127.0.0.1/", "ip_literal"], ["https://10.0.0.5/", "ip_literal"], ["https://169.254.169.254/latest/meta-data", "ip_literal"],
      ["https://2130706433/", "ip_literal"], ["https://0x7f.0.0.1/", "ip_literal"], ["https://[::1]/", "ip_literal"], ["file:///etc/passwd", "not_https"], ["to nie adres", "bad_url"],
    ];
    for (const [u, why] of bad) expect(checkUrl(u), u).toEqual({ ok: false, reason: why });
    expect(checkUrl("https://www.pzpn.pl/aktualnosci?page=2").ok).toBe(true);
  });
  it("adresy IP: prywatne, loopback, link-local, CGNAT, mapowane IPv6 są niepubliczne", () => {
    for (const ip of ["10.1.2.3", "127.0.0.1", "172.16.0.1", "172.31.255.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "2001:db8::1"]) expect(isPublicIp(ip), ip).toBe(false);
    for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111"]) expect(isPublicIp(ip), ip).toBe(true);
  });
});

const deps = (handler: (url: string) => Response | Promise<Response>, resolve?: FetchDeps["resolve"]): FetchDeps => ({
  fetch: ((url: string) => Promise.resolve(handler(String(url)))) as unknown as typeof fetch, resolve, userAgent: "BallwiseRadar/1.0",
});
const htmlRes = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });

describe("bezpieczne pobieranie", () => {
  it("pobiera stronę publiczną", async () => {
    const r = await fetchSafe("https://klub.pl/a", deps(() => htmlRes("<p>hej</p>"), async () => ["93.184.216.34"]));
    expect(r).toMatchObject({ ok: true, status: 200, body: "<p>hej</p>" });
  });
  it("blokuje DNS wskazujący adres prywatny", async () => {
    const r = await fetchSafe("https://zly.pl/", deps(() => htmlRes("x"), async () => ["93.184.216.34", "10.0.0.1"]));
    expect(r).toMatchObject({ ok: false, error: "dns_private" });
  });
  it("przekierowanie w obrębie witryny działa, poza witrynę jest odrzucone, a pętla kończy się błędem", async () => {
    const ok = await fetchSafe("https://klub.pl/a", deps((u) => (u.endsWith("/a") ? new Response(null, { status: 301, headers: { location: "https://www.klub.pl/b" } }) : htmlRes("<p>b</p>"))));
    expect(ok).toMatchObject({ ok: true, finalUrl: "https://www.klub.pl/b" });
    const off = await fetchSafe("https://klub.pl/a", deps(() => new Response(null, { status: 302, headers: { location: "https://zly.pl/x" } })));
    expect(off).toMatchObject({ ok: false, error: "redirect_offsite" });
    const toLocal = await fetchSafe("https://klub.pl/a", deps(() => new Response(null, { status: 302, headers: { location: "https://169.254.169.254/" } })));
    expect(toLocal.ok).toBe(false);
    const loop = await fetchSafe("https://klub.pl/a", deps(() => new Response(null, { status: 302, headers: { location: "https://klub.pl/a" } })));
    expect(loop).toMatchObject({ ok: false, error: "redirect_loop" });
  });
  it("odrzuca zbyt duże odpowiedzi, niedozwolone typy, błędy HTTP i przekroczenie czasu", async () => {
    expect(await fetchSafe("https://klub.pl/", deps(() => htmlRes("x".repeat(2000))), { maxBytes: 1000 })).toMatchObject({ ok: false, error: "too_large" });
    expect(await fetchSafe("https://klub.pl/", deps(() => htmlRes("x".repeat(500), { headers: { "content-type": "text/html", "content-length": "99999999" } }))))
      .toMatchObject({ ok: false, error: "too_large" });
    expect(await fetchSafe("https://klub.pl/", deps(() => new Response("MZ", { headers: { "content-type": "application/octet-stream" } })))).toMatchObject({ ok: false, error: "bad_type" });
    expect(await fetchSafe("https://klub.pl/", deps(() => new Response("no", { status: 503 })))).toMatchObject({ ok: false, error: "http_error", status: 503 });
    const slow: FetchDeps = { fetch: ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener("abort", () => rej(new DOMException("x", "AbortError"))))) as unknown as typeof fetch, userAgent: "x" };
    expect(await fetchSafe("https://klub.pl/", slow, { timeoutMs: 20 })).toMatchObject({ ok: false, error: "timeout" });
  });
});

describe("robots.txt", () => {
  const txt = ["User-agent: *", "Disallow: /admin", "Disallow: /*.pdf$", "Allow: /admin/public", "Crawl-delay: 5", "", "User-agent: BallwiseRadar", "Disallow: /prywatne", "Crawl-delay: 2"].join("\n");
  it("grupa dla naszego agenta ma pierwszeństwo przed „*”", () => {
    expect(robotsAllows(txt, "/prywatne/x")).toBe(false);
    expect(robotsAllows(txt, "/admin")).toBe(true); // reguły „*” nas nie dotyczą
    expect(robotsCrawlDelay(txt)).toBe(2);
  });
  it("najdłuższa reguła wygrywa, a wzorce z * i $ działają", () => {
    const t = ["User-agent: *", "Disallow: /admin", "Allow: /admin/public", "Disallow: /*.pdf$"].join("\n");
    expect(robotsAllows(t, "/admin/x")).toBe(false);
    expect(robotsAllows(t, "/admin/public/a")).toBe(true);
    expect(robotsAllows(t, "/pliki/a.pdf")).toBe(false);
    expect(robotsAllows(t, "/pliki/a.pdf.html")).toBe(true);
    expect(robotsAllows(t, "/nabor")).toBe(true);
  });
  it("odpowiedzi serwera: 404 = brak ograniczeń, 5xx = nie pobieramy, brak pliku w pamięci = wolno", () => {
    expect(robotsFromResponse(404, null)).toEqual({ txt: null, blockAll: false });
    expect(robotsFromResponse(503, null).blockAll).toBe(true);
    expect(robotsFromResponse(200, "User-agent: *\nDisallow: /")).toEqual({ txt: "User-agent: *\nDisallow: /", blockAll: false });
    expect(robotsAllows(null, "/x")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /", "/x")).toBe(false);
  });
});

describe("parsery treści", () => {
  it("HTML → tekst bez skryptów i stylów, z encjami", () => {
    expect(htmlToText("<style>x{}</style><h1>Nab&oacute;r</h1><p>Rocznik 2012&ndash;2013<br>24&nbsp;listopada</p><script>alert(1)</script>")).toBe("Nabór\nRocznik 2012–2013\n24 listopada");
  });
  it("linki: względne, tylko https, bez mailto i fragmentów", () => {
    const l = extractLinks('<a href="/a#x">A</a><a href="mailto:x@y.pl">M</a><a href="http://k.pl/h">H</a><a href=\'https://k.pl/b?x=1&amp;y=2\'>B <b>b</b></a>', "https://k.pl/news/");
    expect(l).toEqual([{ url: "https://k.pl/a", text: "A" }, { url: "https://k.pl/b?x=1&y=2", text: "B b" }]);
  });
  it("RSS i Atom", () => {
    const rss = "<rss><channel><item><title><![CDATA[Nabór 2012]]></title><link>https://k.pl/a</link><pubDate>Mon, 16 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>";
    expect(parseFeed(rss, "https://k.pl/feed")).toEqual([{ url: "https://k.pl/a", title: "Nabór 2012", date: "2026-11-16T10:00:00.000Z" }]);
    const atom = '<feed><entry><title>T</title><link href="/b" /><updated>2026-11-17T08:00:00Z</updated></entry></feed>';
    expect(parseFeed(atom, "https://k.pl/atom")).toEqual([{ url: "https://k.pl/b", title: "T", date: "2026-11-17T08:00:00.000Z" }]);
  });
  it("mapa witryny: urlset i indeks", () => {
    expect(parseSitemap("<urlset><url><loc>https://k.pl/a</loc><lastmod>2026-11-01</lastmod></url><url><loc>http://k.pl/x</loc></url></urlset>"))
      .toEqual({ kind: "urlset", urls: [{ url: "https://k.pl/a", lastmod: "2026-11-01T00:00:00.000Z" }] });
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://k.pl/s1.xml</loc></sitemap></sitemapindex>").kind).toBe("index");
  });
  it("paginacja: rel=next i link „Następna”", () => {
    expect(findNextPage('<link rel="next" href="?page=2">', "https://k.pl/aktualnosci")).toBe("https://k.pl/aktualnosci?page=2");
    expect(findNextPage('<a href="/n/3">Następna strona</a>', "https://k.pl/n/2")).toBe("https://k.pl/n/3");
    expect(findNextPage("<p>koniec</p>", "https://k.pl/n/9")).toBeNull();
  });
  it("HTTP 200 z CAPTCHA, ekranem logowania lub pustą stroną nie jest treścią", () => {
    const long = "Treść ogłoszenia o naborze. ".repeat(60);
    expect(classifyPage(`<html><body>${long}</body></html>`)).toBe("ok");
    expect(classifyPage('<html><body><div class="g-recaptcha"></div><p>Potwierdź</p></body></html>')).toBe("captcha");
    expect(classifyPage("<title>Just a moment...</title><p>Checking your browser</p>")).toBe("captcha");
    expect(classifyPage('<form><p>Zaloguj się</p><input type="password" name="p"></form>')).toBe("login_wall");
    expect(classifyPage("<body><div id=app></div></body>")).toBe("empty");
    expect(classifyPage(`<body>${long}<input type="password"> Zaloguj</body>`)).toBe("ok"); // długa treść z formularzem w stopce
  });
});

describe("miejscowości i odległości", () => {
  it("rozpoznaje nazwy bez polskich znaków i wielkości liter; nieznanej nie zgaduje", () => {
    expect(lookupPlace("krakow")).toMatchObject({ name: "Kraków" });
    expect(lookupPlace("WARSZAWA")?.lat).toBeCloseTo(52.23, 1);
    expect(lookupPlace("Bielsko-Biała")).not.toBeNull();
    expect(lookupPlace("Wieś Nieistniejąca")).toBeNull();
    expect(lookupPlace(null)).toBeNull();
  });
  it("podpowiedzi: najpierw początek nazwy, najludniejsze najpierw", () => {
    const r = searchPlaces("kra");
    expect(r[0]!.name).toBe("Kraków");
    expect(searchPlaces("k")).toEqual([]);
  });
  it("odległość Kraków–Katowice to ok. 70–80 km", () => {
    const d = haversineKm(lookupPlace("Kraków")!, lookupPlace("Katowice")!);
    expect(d).toBeGreaterThan(65);
    expect(d).toBeLessThan(85);
  });
});
