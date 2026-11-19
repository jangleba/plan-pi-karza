import { describe, expect, it } from "vitest";
import { runDiscover } from "../../supabase/functions/_shared/radar/jobs.ts";
import { fetchSafe } from "../../supabase/functions/_shared/radar/fetcher.ts";
import { robotsAllows } from "../../supabase/functions/_shared/radar/robots.ts";
import { freshDb } from "./pg.ts";
import { deps, Web } from "./world.ts";

/**
 * TEST NA ŻYWO (wyłączony domyślnie): przepuszcza prawdziwe serwisy przez prawdziwy fetcher, robots.txt i parsery.
 * Uruchomienie:  RADAR_LIVE=1 NODE_USE_ENV_PROXY=1 npx vitest run src/radar/live.test.ts
 * Opcjonalnie:   RADAR_LIVE_SOURCES="https://www.mzpn.pl/feed,https://www.pzpn.pl/sitemap.xml"
 *
 * To NIE jest autoryzowany import: baza jest tymczasowa (pamięć), nic nie jest publikowane ani zapisywane trwale,
 * AI i wyszukiwarka są wyłączone. Służy wyłącznie do sprawdzenia techniki (SSRF, robots, przekierowania, RSS/mapy witryn).
 * Podstawa dopuszczenia źródła (licencja/zgoda) musi być ustalona osobno przez administratora.
 */
const LIVE = process.env.RADAR_LIVE === "1";
const SOURCES = (process.env.RADAR_LIVE_SOURCES ?? "https://www.mzpn.pl/feed,https://www.pzpn.pl/sitemap.xml").split(",");

describe.skipIf(!LIVE)("na żywo: oficjalne serwisy piłkarskie (tylko technika, bez publikacji)", () => {
  for (const entry of SOURCES) {
    it(`${new URL(entry).hostname}: robots.txt, przekierowania i odkrywanie adresów`, async () => {
      const host = new URL(entry).hostname;
      const db = await freshDb();
      await db.query(
        `insert into radar_sources (domain, name, status, license_basis, allowed_scope, entry_urls, crawl_delay_seconds)
         values ($1, $1, 'approved', 'TYLKO TEST TECHNICZNY w tymczasowej bazie – brak realnej zgody', '{"fetch": true, "publish_facts": false, "images": false}', $2, 1)`,
        [host.replace(/^www\./, ""), [entry]]);
      const d = deps(new Web(), db);
      d.fetchDeps = { fetch, userAgent: "BallwiseRadar/1.0 (+test techniczny)", resolve: undefined };
      d.extractor = null;
      d.brave = null;
      d.sleep = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 1200)));

      const robots = await fetchSafe(`https://${host}/robots.txt`, d.fetchDeps, { types: /^text\//i });
      expect(robots.ok, JSON.stringify(robots)).toBe(true);
      const txt = robots.ok ? robots.body : "";
      const entryAllowed = robotsAllows(txt, new URL(entry).pathname);

      const r = await runDiscover({ ...d, deadlineMs: Date.now() + 90_000 });
      const urls = (await db.query<{ state: string; url: string }>("select state, url from radar_urls order by url limit 5")).rows;
      const checks = (await db.query<{ outcome: string; n: number }>("select outcome, count(*)::int as n from radar_checks group by outcome order by outcome")).rows;
      process.stdout.write(`LIVE ${host}: robots ${txt.length} B, wejście dozwolone=${entryAllowed}; status=${r.status}; ${JSON.stringify(r.stats)}\n  adresy: ${JSON.stringify(urls.slice(0, 3))}\n  sprawdzenia: ${JSON.stringify(checks)}\n`);
      expect(["ok", "partial"]).toContain(r.status);
      expect((await db.query("select 1 from radar_listings")).rows).toHaveLength(0); // nic nie zostało opublikowane
    }, 150_000);
  }
});
