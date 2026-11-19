import { describe, expect, it } from "vitest";
import { missingSecrets, parseDohAnswers, readConfig, timingSafeEqual } from "../../supabase/functions/_shared/radar/edgeutil.ts";

describe("pomocnicze funkcji Edge", () => {
  it("porównanie sekretów w stałym czasie", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "x")).toBe(false);
  });
  it("odpowiedź DNS-over-HTTPS: tylko rekordy A i AAAA", () => {
    expect(parseDohAnswers({ Answer: [{ type: 5, data: "cname.example." }, { type: 1, data: "93.184.216.34" }, { type: 28, data: "2606:2800::1" }] })).toEqual(["93.184.216.34", "2606:2800::1"]);
    expect(parseDohAnswers(null)).toEqual([]);
    expect(parseDohAnswers({})).toEqual([]);
  });
  it("konfiguracja z sekretów: wartości domyślne, brak kluczy opcjonalnych, limity czasu", () => {
    const env = (m: Record<string, string>) => (k: string) => m[k];
    const c = readConfig(env({ RADAR_CRON_SECRET: "s" }));
    expect(c).toMatchObject({ cronSecret: "s", anthropicKey: null, braveKey: null, model: "claude-haiku-5-5", runtimeMs: 100_000, alertWebhook: null });
    expect(c.userAgent).toBe("BallwiseRadar/1.0");
    expect(readConfig(env({ RADAR_CRON_SECRET: "s", RADAR_CONTACT_URL: "https://ballwise.pl/radar", RADAR_RUNTIME_MS: "999999" })).userAgent).toContain("+https://ballwise.pl/radar");
    expect(readConfig(env({ RADAR_RUNTIME_MS: "999999" })).runtimeMs).toBe(140_000);
    expect(missingSecrets(readConfig(env({})))).toEqual(["RADAR_CRON_SECRET"]);
    expect(missingSecrets(c)).toEqual([]);
  });
});
